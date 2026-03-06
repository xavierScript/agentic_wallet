# Agentic Wallet — Architecture & Security Deep Dive

This document covers the design decisions, security model, and technical architecture behind the Solana Agentic Wallet.

The document is structured in three parts. **Sections 1–6** cover the foundation: the problem space, the MCP architecture choice, and the four security layers (key storage, policy engine, human-only guardrails, and audit trail). **Sections 7–11** cover what the system does: the transaction pipeline and each protocol integration (Jupiter, Kora, x402, and autonomous trading). **Sections 12–14** cover system-level properties: multi-agent isolation, the full capability surface, and the threat model that ties everything together.

---

## Table of Contents

1. [Core Problem: Agents Need Wallets, Wallets Need Safety](#1-core-problem)
2. [Why MCP Instead of a Raw SDK](#2-why-mcp)
3. [Security Model: Key Storage](#3-key-storage)
4. [Security Model: Policy Engine](#4-policy-engine)
5. [Security Model: Human-Only Guardrail](#5-human-only-guardrail)
6. [Audit Trail](#6-audit-trail)
7. [Transaction Pipeline](#7-transaction-pipeline)
8. [Jupiter Integration](#8-jupiter-integration)
9. [Kora Gasless Relay](#9-kora-gasless-relay)
10. [x402 HTTP Payment Protocol](#10-x402-http-payment-protocol)
11. [Autonomous Trading Strategy Engine](#11-autonomous-trading-strategy-engine)
12. [Multi-Agent Architecture](#12-multi-agent-architecture)
13. [What Agents Can and Cannot Do](#13-agent-capabilities)
14. [Threat Model](#14-threat-model)

---

## 1. Core Problem

AI agents that act on Solana need wallets. But a wallet designed for human use is dangerous in agent hands:

- Humans confirm transactions visually. Agents do not.
- Humans notice when something is wrong. Agents may loop.
- Humans have intent. Agents follow instructions that can be injected.

The goal was to build a wallet that is genuinely useful to agents (autonomous, fast, protocol-capable) while being safe by design — not by hope.

Given these dangers, the first architectural decision was how agents would interact with the wallet at all.

---

## 2. Why MCP Instead of a Raw SDK

The obvious approach is to give an agent a TypeScript SDK and let it call `walletService.sendSol(...)` directly. We chose Model Context Protocol (MCP) instead for five reasons:

### 2.1 Separation of concerns

With a raw SDK, the agent has direct in-process access to the `WalletService` and could, in theory, call any method — including ones that aren't safe for agent use. MCP creates a **hard process boundary**: the agent calls a named tool with a JSON schema; a separate server process validates, executes, and returns a structured response. The agent never holds a reference to the wallet objects.

### 2.2 Universal agent compatibility

MCP is supported by Claude Desktop, VS Code Copilot, Cursor, and any custom agent built with the MCP SDK. Writing one MCP server means zero integration work per agent framework. A raw SDK would require a custom integration for every framework.

### 2.3 Schema-enforced inputs

Every tool's input is validated by a Zod schema before the handler runs. An agent cannot pass a malformed `wallet_id`, a negative `amount`, or an out-of-range `slippage_bps`. With a raw SDK, input validation is the agent's problem.

### 2.4 Declarative capability surface

MCP tools, resources, and prompts are declared with titles, descriptions, and annotations (`readOnlyHint`, `destructiveHint`). Agents can read this metadata and reason about what they're allowed to do. A raw SDK exposes every public method equally.

### 2.5 Resources and prompts as first-class primitives

MCP resources let agents read live state (wallet balances, policies, audit logs) without calling a tool — they are read-only and have no side effects. MCP prompts provide pre-built multi-step workflows (`trading-strategy`, `portfolio-rebalance`, `security-audit`) that guide agents through complex operations with built-in safety checks baked in. Neither concept exists in a raw SDK pattern.

With the process boundary established, the next concern is what happens inside `wallet-core` — starting with the keys.

---

## 3. Key Storage

Private keys are the most sensitive asset in the system. The design principle is: **keys exist in plaintext only in memory, only during signing, and for the minimum possible duration.**

### Keystore format

Each wallet is stored as a JSON file: `~/.agentic-wallet/keys/<uuid>.json`. The format is inspired by Ethereum's Web3 Secret Storage Definition, adapted for Solana Ed25519 keys:

```
{
  id:         UUID (wallet identifier)
  label:      human-readable name
  publicKey:  base58 — safe to expose
  crypto: {
    cipher:   "aes-256-gcm"
    ciphertext: hex — the 64-byte Ed25519 private key, encrypted
    iv:       hex — 16-byte random initialization vector
    authTag:  hex — 16-byte GCM authentication tag
    kdf:      "pbkdf2"
    kdfparams: {
      iterations: 210,000    ← OWASP minimum for PBKDF2-HMAC-SHA512
      salt:       hex        ← 32 bytes, unique per keystore
      dklen:      32         ← 256-bit derived key
      digest:     "sha512"
    }
  }
}
```

### Key derivation

The AES encryption key is never stored. It is derived on demand from `WALLET_PASSPHRASE` using:

```
DerivedKey = PBKDF2(HMAC-SHA512, passphrase, salt, 210_000 iterations, 32 bytes)
```

210,000 iterations is the current OWASP recommendation for PBKDF2-HMAC-SHA512. Each keystore has its own random 32-byte salt, so compromising one keystore's password derivation does not affect others.

### GCM authentication

AES-256-GCM provides both confidentiality and integrity. The 16-byte auth tag prevents silent tampering — if someone modifies the ciphertext on disk, decryption will throw rather than return a corrupted key. For an autonomous system where nobody is watching, this "fail loudly" property is essential.

### File permissions

After writing a keystore, `chmod 0600` is applied so only the owner process can read it.

### In-memory lifetime

`KeyManager.unlockWallet()` decrypts the key, constructs the `Keypair`, signs the transaction, and returns. The plaintext key bytes are not cached. The GC reclaims them after the signing closure exits.

Encryption protects keys at rest. But the bigger risk with agent wallets is the agent using its legitimate signing authority to do something catastrophic — a compromised prompt, a hallucinated address, a runaway loop. That's where the Policy Engine comes in.

---

## 4. Policy Engine

The `PolicyEngine` is the first line of defense against runaway or compromised agents. Every transaction is checked **before** it is signed.

### What a policy contains

```typescript
interface PolicyRule {
  name: string;
  maxLamportsPerTx?: number; // per-transaction spend cap
  maxTxPerHour?: number; // rate limit (hourly)
  maxTxPerDay?: number; // rate limit (daily)
  cooldownMs?: number; // minimum gap between transactions
  maxDailySpendLamports?: number; // rolling 24h spend cap
  allowedPrograms?: string[]; // program allowlist (whitelist)
  blockedPrograms?: string[]; // program blocklist (blacklist)
}
```

Each wallet can have one policy with multiple rules. All rules must pass.

### Default devnet policy

Every wallet created through the MCP server receives this policy automatically — it cannot be skipped:

- Max 2 SOL per transaction
- Max 30 transactions per hour
- Max 200 transactions per day
- 2-second cooldown between transactions
- Max 10 SOL daily spend

### Check flow

```
signAndSendTransaction(walletId, tx, context)
        │
        ▼
PolicyEngine.checkTransaction(walletId, tx, context)
        │
        ├── [no policy attached] → allow, log warning
        │
        ├── [rule: maxLamportsPerTx] → parse SystemProgram transfers, sum lamports
        │
        ├── [rule: maxTxPerHour/Day] → count tx history in rolling window
        │
        ├── [rule: cooldownMs] → compare now vs last tx timestamp
        │
        ├── [rule: maxDailySpendLamports] → sum lamports in last 24h + this tx
        │
        ├── [rule: allowedPrograms] → check each instruction's programId
        │
        └── [rule: blockedPrograms] → check each instruction's programId
                │
                ├── violation → AuditLogger.log(action, success=false, error=violation)
                │               throw new Error(`Policy violation: ${violation}`)
                │
                └── all pass → sign + send
```

### Versioned transactions (Jupiter)

Jupiter swaps use `VersionedTransaction` with address lookup tables (ALTs). Decoding all instructions from a versioned tx requires resolving the ALTs on-chain, which is expensive and adds latency. For versioned transactions we use `PolicyEngine.checkLimits()` instead — this enforces rate limits, cooldowns, and the daily spend cap using the caller-provided `estimatedLamports`, but skips program allowlist checks. This is an acceptable tradeoff for DEX swaps since slippage and price impact are already bounded separately.

### State persistence

Policy state (attached policies + transaction history) is persisted to `~/.agentic-wallet/policy-state.json`. Rate limit counters survive server restarts — an agent cannot bypass the hourly limit by restarting the MCP server.

The Policy Engine bounds what agents can do within allowed operations. But some operations — like closing a wallet — should be off-limits to agents entirely, regardless of policy.

---

## 5. Human-Only Guardrail

Closing a wallet is **irreversible**: the encrypted keystore is permanently deleted and any remaining balance is swept. This is not a decision that should be delegated to an AI agent.

### The technique

`walletService.closeWallet()` requires a third parameter typed as `{ humanInitiated: true }` — not `boolean`, but the **literal type** `true`:

```typescript
async closeWallet(
  walletId: string,
  sweepToAddress: string | undefined,
  opts: HumanOnlyOpts,   // { humanInitiated: true }
): Promise<...>
```

This is a compile-time barrier. MCP tool handlers receive their arguments from a Zod schema. Zod's `z.boolean()` produces the type `boolean` — which does not satisfy `{ humanInitiated: true }`. TypeScript will refuse to compile any tool handler that tries to call `closeWallet`.

The CLI passes `HUMAN_ONLY` explicitly:

```typescript
import { HUMAN_ONLY } from "@agentic-wallet/core";
walletService.closeWallet(id, ownerAddress, HUMAN_ONLY);
```

The `close_wallet` tool file is kept in the repo with a prominent warning header but is **not registered** in `tools/index.ts`. The comment block in that file explains exactly why it must never be re-added.

### Scope of the pattern

The `HumanOnlyOpts` type and `HUMAN_ONLY` constant are exported from `@agentic-wallet/core` (via `guardrails/human-only.ts`) so they can be applied to any future operations that need the same protection — for example, a future `update_policy` tool that could allow an agent to loosen its own spending limits.

These guardrails prevent bad actions. But for forensics and accountability, every action — allowed or denied — needs to be recorded.

---

## 6. Audit Trail

Every operation — success or failure — is written to an append-only JSONL file:

```
~/.agentic-wallet/logs/audit-YYYY-MM-DD.jsonl
```

Each line is a JSON object:

```json
{
  "timestamp": "2026-03-01T12:34:56.789Z",
  "action": "swap:jupiter",
  "walletId": "a1b2c3d4-...",
  "publicKey": "7xKXtg...",
  "txSignature": "5vGk...",
  "success": true,
  "details": {
    "inputToken": "SOL",
    "outputToken": "USDC",
    "inputAmount": 0.1,
    "slippageBps": 50
  }
}
```

The logger uses `appendFileSync` — it cannot overwrite existing entries. Actions logged include:

| Action                         | When                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------- |
| `wallet:created`               | New wallet keypair generated                                                       |
| `wallet:closed`                | Keystore deleted                                                                   |
| `wallet:sweep`                 | SOL swept before close                                                             |
| `sol:transfer`                 | SOL sent                                                                           |
| `spl-token:transfer`           | SPL tokens sent                                                                    |
| `spl-token:create-mint`        | New token mint created                                                             |
| `spl-token:mint`               | Tokens minted                                                                      |
| `swap:jupiter`                 | Jupiter swap executed                                                              |
| `memo:write`                   | On-chain memo written                                                              |
| `master-fund:sent`             | Agent wallet auto-funded from master wallet                                        |
| `master-fund:failed`           | Master wallet funding failed (e.g. insufficient balance)                           |
| `x402:payment_signed`          | x402 payment transaction signed (pre-broadcast)                                    |
| `x402:payment_success`         | x402 payment settled, resource returned                                            |
| `x402:payment_failed`          | x402 payment or resource fetch failed                                              |
| _(any action)_ — failed        | Policy violation or RPC error logged with `success: false`                         |
| _(any action)_ — Kora fallback | Kora unavailable — logged with `koraFallback: true`, fell through to standard path |

The `AuditLogger` supports real-time event listeners, which the CLI TUI uses to stream new entries into the logs view without polling.

With the security layers described — key encryption, policy enforcement, human-only guardrails, and audit logging — here's how they compose in the actual transaction flow.

---

## 7. Transaction Pipeline

The wallet supports four distinct transaction paths. Each path goes through the same security layers described above but differs in how the transaction is constructed and submitted.

### Legacy transactions — standard path (agent pays fees)

```
Tool handler
  → TransactionBuilder / SplTokenService builds Transaction
  → WalletService.signAndSendTransaction()
      → PolicyEngine.checkTransaction()        [reject if violation]
      → KeyManager.unlockWallet()              [decrypt key]
      → get latest blockhash
      → [KoraService null OR Kora unavailable]
      → transaction.feePayer = agent keypair
      → transaction.sign(keypair)
      → conn.sendRawTransaction()
      → conn.confirmTransaction('confirmed')
      → AuditLogger.log(success=true, gasless=false)
      → PolicyEngine.recordTransaction()
  → return TransactionResult { signature, gasless: false, explorerUrl }
```

### Legacy transactions — Kora gasless path (Kora pays fees)

When a Kora paymaster node is configured, the wallet can submit transactions where a third party pays the network fees (see [Section 9](#9-kora-gasless-relay) for the full Kora architecture):

```
Tool handler
  → TransactionBuilder / SplTokenService builds Transaction
  → WalletService.signAndSendTransaction()
      → PolicyEngine.checkTransaction()        [reject if violation]
      → KeyManager.unlockWallet()              [decrypt key]
      → get latest blockhash
      → [KoraService configured]
      → try:
          → KoraService.getPayerSigner()        [cached — Kora signer pubkey]
          → transaction.feePayer = koraSignerPubkey
          → transaction.partialSign(agentKeypair)
          → serialize(requireAllSignatures: false)
          → KoraService.signAndSendTransaction(base64Tx)
                [Kora co-signs as feePayer + broadcasts]
          → AuditLogger.log(success=true, gasless=true, feePayer='kora')
          → PolicyEngine.recordTransaction()
          → return TransactionResult { signature, gasless: true, explorerUrl }
      → catch (KoraError):
          → AuditLogger.log(koraFallback=true, error=...)
          → fall through to standard path above
```

### Versioned transactions (Jupiter swaps)

Jupiter swaps produce `VersionedTransaction` objects with address lookup table compression. These follow a different path because the transaction is pre-built by Jupiter's API (see [Section 8](#8-jupiter-integration) for full details):

```
Tool handler
  → JupiterService.getQuote()                 [Jupiter v6 API]
  → validate priceImpactPct < maxPriceImpactPct
  → JupiterService.buildSwapTransaction()     [Jupiter v6 API → VersionedTransaction]
  → WalletService.signAndSendVersionedTransaction()
      → PolicyEngine.checkLimits()             [rate limits + daily cap]
      → KeyManager.unlockWallet()
      → transaction.sign([keypair])
      → conn.sendRawTransaction()
      → conn.confirmTransaction('confirmed')
      → AuditLogger.log(success=true)
      → PolicyEngine.recordTransaction(estimatedLamports)
  → return txSignature
```

### Simulated swaps (Jupiter quotes — devnet / testnet)

On non-mainnet clusters, Jupiter quotes are fetched for real pricing data, but no transaction is built or sent:

```
Tool handler
  → JupiterService.simulateSwap()
      → JupiterService.getQuote()             [real mainnet pricing]
      → validate priceImpactPct < maxPriceImpactPct
      → format amounts + route labels
  → return SimulatedSwapResult { simulated: true, quote, route, pricing }
```

The agent receives accurate pricing and routing information it can use for strategy evaluation without any on-chain execution.

### Sweep-and-close (human-initiated only)

This path is only reachable from the CLI — see [Section 5](#5-human-only-guardrail) for the compile-time barrier that prevents agent access:

```
CLI confirms 'y' from human
  → walletService.closeWallet(id, ownerAddress, HUMAN_ONLY)
      → get current balance
      → build fee-calculation transaction (getFeeForMessage)
      → send sweepAmount = balance - exactFee to ownerAddress
      → confirmTransaction
      → AuditLogger.log('wallet:sweep')
      → PolicyEngine.removePolicy(walletId)    [policy cleared]
      → KeyManager.deleteWallet(walletId)      [keystore file deleted]
      → AuditLogger.log('wallet:closed')
```

The transaction pipeline above handles generic Solana transactions. The following sections cover each protocol-specific integration in detail, starting with Jupiter for DEX trading.

---

## 8. Jupiter Integration

Jupiter is Solana's primary DEX aggregator — it routes swaps across Raydium, Orca, Meteora, and other liquidity sources to find the best price. The integration uses Jupiter's v6 REST API.

### Devnet vs Mainnet

Jupiter's **quote API** returns real pricing regardless of what cluster the caller is on — quotes reflect live mainnet liquidity. However, Jupiter's **swap transactions** reference mainnet AMM pools, Address Lookup Tables, and program accounts that do not exist on devnet or testnet.

To handle this cleanly:

- **On mainnet-beta:** `swap_tokens` fetches a quote, builds a `VersionedTransaction`, signs it via `WalletService` (policy-enforced), and sends it on-chain.
- **On devnet / testnet:** `swap_tokens` fetches a **real Jupiter quote** (accurate mainnet pricing and routing) and returns a **simulated result**. No transaction is built or sent. The agent still sees the full pricing pipeline — route labels, price impact, expected output, slippage — it just doesn't execute on-chain.

This means the full trading loop (`fetch_prices` → `evaluate_strategy` → `swap_tokens`) works end-to-end on devnet with real market data. The only thing missing is the on-chain settlement.

### Flow (mainnet)

1. **Quote** — `GET /quote?inputMint=...&outputMint=...&amount=...&slippageBps=...`  
   Returns best route, expected output, price impact, and route labels.

2. **Validate** — price impact is checked against `maxPriceImpactPct` (default 5%). Swaps with higher impact are rejected before any transaction is built.

3. **Build** — `POST /swap` with the quote + wallet public key.  
   Jupiter returns a base64-encoded `VersionedTransaction` with ALT-compressed instructions.

4. **Sign + send** — via `signAndSendVersionedTransaction` with rate/spend limits enforced.

### Safety parameters

| Parameter            | Default   | Purpose                                    |
| -------------------- | --------- | ------------------------------------------ |
| `defaultSlippageBps` | 50 (0.5%) | Default slippage tolerance                 |
| `maxSlippageBps`     | 300 (3%)  | Agent cannot request more than this        |
| `maxPriceImpactPct`  | 5%        | Rejects swaps with excessive market impact |

Jupiter swaps always require the agent to hold SOL for fees — the fee payer is baked into Jupiter's compiled transaction. The Kora integration addresses this limitation for non-Jupiter transactions.

---

## 9. Kora Gasless Relay

[Kora](https://github.com/solana-foundation/kora) is a Solana Foundation paymaster node referenced directly in this bounty's resource links. It allows a third-party signer to pay network fees on behalf of other wallets. This project integrates Kora as an optional gasless relay, proven end-to-end on devnet.

### Why this matters for agents

Agents optimally hold only the tokens they work with — not SOL for gas. Without Kora every agent wallet needs a SOL balance maintained just for fees. With Kora the agent wallet can hold 0 SOL and still transact freely.

### Architecture

```
 Agent wallet                 WalletService              Kora node
     │                           │                         │
     │  signAndSendTransaction()  │                         │
     ├───────────────────────────►│                         │
     │   build tx, set feePayer   │   getPayerSigner()     │
     │   = Kora signer address    ├────────────────────────►│
     │   partialSign(agentKey)    │   signerAddress         │
     │   serialize(partial)       │◄────────────────────────┤
     │                            │                         │
     │                            │  signAndSendTransaction(base64)
     │                            ├────────────────────────►│
     │                            │  Kora: co-signs as      │
     │                            │  feePayer, validates     │
     │                            │  allowlist, broadcasts   │
     │                            │◄────────────────────────┤
     │  { signature, gasless: true, explorerUrl }           │
     │◄───────────────────────────┤                         │
```

### Configuration (`kora/kora.toml`)

The Kora node is configured with a free pricing model and a tight `fee_payer_policy` (all false — the paymaster pays unconditionally within the allowed program list):

```toml
[pricing]
type = "free"   # no per-transaction charge to the agent

[fee_payer_policy]
allow_all_dapps = false
ignore_limits = false

[validation]
allowed_programs = [
  "11111111111111111111111111111111",   # System
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss4R8nZBvtyVRWPrNh",  # SPL Token
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",          # SPL Memo
  # ... (see kora/kora.toml for full list)
]
```

### Coverage

Kora covers all five **legacy** transaction tools (`Transaction` class). Jupiter swaps and x402 payments cannot use Kora for architectural reasons:

| MCP Tool            | Transaction type        | Kora                                                                                                                                                                           |
| ------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `send_sol`          | Legacy — System Program | ✅                                                                                                                                                                             |
| `send_token`        | Legacy — SPL Token      | ✅                                                                                                                                                                             |
| `write_memo`        | Legacy — SPL Memo       | ✅                                                                                                                                                                             |
| `create_token_mint` | Legacy — SPL Token      | ✅                                                                                                                                                                             |
| `mint_tokens`       | Legacy — SPL Token      | ✅                                                                                                                                                                             |
| `swap_tokens`       | `VersionedTransaction`  | ❌ Jupiter v6 `/swap` bakes `userPublicKey` as fee payer into the compiled `MessageV0` — there is no `feePayerPublicKey` parameter; the fee payer cannot be swapped post-build |
| `pay_x402`          | x402 server relay       | ❌ The x402 server broadcasts the transaction after verifying the `X-Payment` header; `WalletService.signAndSendTransaction` is not in the path                                |

### Graceful fallback

Kora is **optional**. If `KORA_RPC_URL` is not set, `KoraService.create()` returns `null` and the standard path runs. If it _is_ set but the node is unreachable at runtime, `WalletService` catches the error, logs a `koraFallback: true` audit entry, and falls through to the standard path — the agent keeps working without interruption.

### On-chain proof

When Kora is active, `TransactionResult.gasless` is `true` and the audit log records `feePayer: "kora"`. The Kora signer address appears as `accountKeys[0]` (fee payer) in the on-chain transaction, proving the agent wallet paid zero fees.

While Kora removes the gas burden for standard transactions, agents also need to interact with paid external services. The x402 integration enables HTTP-native payments for exactly this purpose.

---

## 10. x402 HTTP Payment Protocol

[x402](https://github.com/coinbase/x402) is Coinbase's open standard for HTTP-native payments. A server responds `402 Payment Required`; the client pays on-chain and retries with an `X-Payment` header.

> **Important:** `https://x402.org/protected` runs on Base (EVM). For Solana demos, run a local server:
>
> ```bash
> git clone https://github.com/Woody4618/x402-solana-examples
> cd x402-solana-examples && npm install
> npm run usdc:server   # http://localhost:3001
> ```
>
> The paying wallet must hold devnet USDC (mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`).

### Flow

```
Agent  →  pay_x402(url, wallet_id)
  →  GET url
  ←  HTTP 402 + X-PAYMENT-REQUIRED header  (or JSON body for native servers)
        { amount, asset (USDC mint), payTo (recipient ATA), network: "solana-devnet" }
  →  parse PaymentRequirements
  →  check recipient ATA exists; create inline if not
  →  build SPL Transfer tx  (opcode 3 — plain Transfer, not TransferChecked)
  →  WalletService signs (PolicyEngine checks apply)
  →  GET url, headers: { X-Payment: base64(JSON { serializedTransaction }) }
  ←  HTTP 200 + resource content
  →  AuditLogger.log(x402:payment_success)
  →  return { body, amountPaid, settlement }
```

### Safety integration

- Payment signing goes through `PolicyEngine` — spend caps and rate limits apply to x402 payments the same as any transfer
- A configurable `maxPaymentLamports` cap (default 1 SOL) prevents unexpected large payments
- The `probe_x402` tool lets an agent discover pricing before committing funds
- Every payment stage is audit-logged: `x402:payment_signed`, `x402:payment_success`, `x402:payment_failed`

With the foundational protocols in place — Jupiter for DEX access, Kora for gas abstraction, and x402 for paid services — the trading engine combines them into autonomous strategies.

---

## 11. Autonomous Trading Strategy Engine

Instead of a separate trading bot process, trading capability is exposed as MCP tools so any connected AI agent can act as its own trading bot — using the same policy engine, audit trail, and guardrails as every other wallet operation.

### Tools

| Tool                | Description                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| `fetch_prices`      | Jupiter Price API v2 — real-time USD prices for SOL, USDC, USDT, BONK, JUP, or any mint                 |
| `evaluate_strategy` | Run a named strategy against current prices + wallet balances; returns BUY/SELL/HOLD with exact amounts |
| `swap_tokens`       | Execute the signal (existing tool — policy-checked, slippage-bounded)                                   |

### Strategies

**`threshold-rebalance`** — stateless.
Calculates current SOL allocation. If drift from target exceeds a configurable threshold, returns BUY or SELL for the delta amount. Each call is independent.

**`sma-crossover`** — stateful within a server session.
Maintains a rolling price history per wallet. Computes fast SMA (e.g. 5-period) and slow SMA (e.g. 20-period). Returns BUY when fast crosses above slow, SELL when it crosses below, HOLD while the window is filling or no crossover has occurred. Accuracy improves as the price window fills across successive `evaluate_strategy` calls.

### Multi-tick loop (`autonomous-trading` prompt)

```
for tick in 1..N:
  prices  = fetch_prices([SOL, USDC])
  signal  = evaluate_strategy(strategy, wallet_id, prices)
  if signal != HOLD:
    swap_tokens(wallet_id, signal.inputMint, signal.outputMint, signal.amount)
  sleep(interval)
agent reports: tick-by-tick table of prices, signals, and executed swaps
```

All swaps in the loop still go through `PolicyEngine` — a runaway strategy cannot exceed daily spend caps or hourly rate limits regardless of how many ticks it runs. The `trading://strategies` resource lets agents self-discover available strategies before starting a session.

### Key design choices

- **No separate process** — the AI agent IS the bot during a prompted session
- **Same guardrails** — all swaps go through PolicyEngine with spend caps, rate limits, and slippage bounds
- **Full audit trail** — every tick is traceable in the JSONL log
- **Devnet-compatible** — the loop runs end-to-end on devnet with real pricing; only on-chain settlement is simulated

All of these capabilities — trading, payments, transfers — are designed to work across multiple independent agents simultaneously.

---

## 12. Multi-Agent Architecture

The system is designed for multiple independent agents, each with their own wallet:

- **Independent keystores** — each wallet is a separate encrypted file with its own salt/IV
- **Independent policies** — each wallet has its own spend cap, rate limits, and program allowlist
- **Independent audit trails** — log entries include `walletId` so per-agent activity is filterable
- **Shared MCP server** — one server instance manages all wallets; agents are differentiated by the `wallet_id` they supply

There is no shared state between wallets beyond the server process. If wallet A gets compromised through prompt injection, wallet B's funds and limits are completely unaffected.

The `portfolio-rebalance` prompt demonstrates multi-wallet coordination: it reads all wallet balances, calculates target allocations, and orchestrates `send_sol` calls between wallets — each transfer individually policy-checked.

With the architecture and all integrations described, here is the complete picture of what agents can and cannot do.

---

## 13. What Agents Can and Cannot Do

### Can do (via MCP tools)

- Create wallets (always with devnet safety policy — cannot be skipped)
- Query balances and wallet state
- Send SOL and SPL tokens (policy-checked)
  - With Kora configured: gasless — zero SOL spent on fees by the agent wallet
  - Without Kora or when Kora is unavailable: standard path, agent pays fees
- Execute Jupiter swaps (policy-checked, slippage/impact bounded on mainnet; simulated with real pricing on devnet)
- Write on-chain memos (gasless-capable via Kora)
- Create and mint SPL tokens
- Pay for x402-protected HTTP resources using managed wallets
- Evaluate trading strategies and execute autonomous multi-tick trading loops
- Read audit logs, system status, policies

### Cannot do

- **Close wallets** — `closeWallet` requires `{ humanInitiated: true }` literal type; no MCP tool can satisfy this
- **Bypass policies** — policy checks happen inside `WalletService` before signing; tool handlers have no way to skip them
- **Access raw keypairs** — `KeyManager.unlockWallet()` is not exposed via any tool
- **Read the passphrase** — `system/config` resource redacts it
- **Create policy-free wallets** — `create_wallet` always attaches the devnet safety policy; `attach_policy` flag was removed from the MCP tool

These capability boundaries map directly to the threat model the system is designed to defend against.

---

## 14. Threat Model

| Threat                                   | Mitigation                                                                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Compromised agent / prompt injection** | Policy engine blocks out-of-limit transactions regardless of what the agent was instructed to do                                 |
| **Runaway agent loop**                   | Rate limits (30 tx/hr, 200 tx/day) and cooldown (2s) halt runaway execution before significant damage                            |
| **Large single transaction**             | Per-tx cap (2 SOL default) prevents draining in one call                                                                         |
| **Gradual drain over time**              | Daily spend cap (10 SOL default) bounds 24h exposure                                                                             |
| **Agent closing wallets**                | Compile-time `HumanOnlyOpts` guard; `close_wallet` not registered on MCP server                                                  |
| **Agent loosening its own policy**       | No `update_policy` tool exists; policy changes require direct code access                                                        |
| **Keystore file exfiltration**           | Keys are AES-256-GCM encrypted; attacker needs the passphrase to decrypt                                                         |
| **Passphrase brute force**               | PBKDF2 at 210,000 iterations makes brute force computationally expensive                                                         |
| **Keystore tampering**                   | GCM auth tag detects modification; decryption throws on tampered ciphertext                                                      |
| **Multiple agents racing**               | Each wallet has its own policy state; per-wallet rate limit tracking prevents cross-wallet interference                          |
| **Devnet vs mainnet confusion**          | `SOLANA_CLUSTER` defaults to `devnet`; mainnet requires explicit opt-in                                                          |
| **x402 overspend**                       | Configurable `maxPaymentLamports`; PolicyEngine rate/spend limits enforced before signing x402 payments                          |
| **Kora node unavailable**                | `WalletService` catches Kora errors and falls through to the standard fee-payer path automatically; no agent downtime            |
| **Kora signer compromised**              | Kora only co-signs as fee payer; it cannot construct arbitrary instructions — the agent wallet's keypair still signs the payload |

Every layer — encryption, policy enforcement, type-level guardrails, audit logging, schema validation, process isolation — independently limits the blast radius. The system does not rely on any single defense holding; it is designed so that any one layer can fail and the remaining layers still contain the damage.
