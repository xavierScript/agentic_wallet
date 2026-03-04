# Building an Agentic Wallet: How We Gave AI Agents Autonomous Control of a Solana Wallet Without Losing Our Minds

AI agents are becoming first-class participants on Solana. They execute trades, manage liquidity, mint tokens, and interact with dApps — all without a human clicking "Approve" in Phantom. But for an agent to do any of this, it needs a wallet. Not a human wallet. A wallet designed from the ground up for autonomous software that doesn't confirm anything visually, doesn't notice when something goes wrong, and will happily drain itself to zero if nothing stops it.

This article is the story of building that wallet — the architecture, the security model, the mistakes we nearly made, and the tradeoffs we chose. The [full source is on GitHub](https://github.com/xavierScript/agentic_wallet), running on Solana devnet today.

> **To prove the wallet can interact autonomously with the ecosystem, we integrated Jupiter for DEX routing, Kora for gasless transactions, and x402 for HTTP micropayments.**

---

## The Core Problem: Human Wallets Are Dangerous in Agent Hands

A wallet designed for a human assumes three things:

1. **The user confirms transactions visually.** They see "Send 2 SOL to 7xKX…" and click Approve.
2. **The user notices when something is wrong.** A sudden large transfer, a suspicious program interaction — a human pauses.
3. **The user has intent.** They chose to make this transfer. Nobody injected this decision through a prompt.

AI agents break all three assumptions. An LLM-based agent doesn't "see" a confirmation dialog. It processes structured inputs and produces structured outputs. If a prompt injection tells it to send all funds to an attacker address, there is no moment of visual hesitation. If a loop goes haywire and fires 500 transactions in 10 minutes, there is no gut feeling that says "wait, this is wrong."

So the question isn't "can we give an agent a Solana keypair?" — of course we can. The question is: **can we give an agent signing authority and still sleep at night?**

Our answer was to build a wallet where safety isn't a feature you opt into — it's a property of the architecture itself.

---

## Architecture Overview

The system is a TypeScript monorepo with three packages:

```
  AI Agent (Claude, Copilot, Cursor, any MCP client)
        │
        │ MCP (stdio)
        ▼
  ┌─────────────────────────────┐
  │  MCP Server                 │
  │  16 Tools · 9 Resources     │
  │  8 Prompted Workflows       │
  │  ✗ close_wallet (blocked)   │
  └──────────────┬──────────────┘
                 │
                 ▼
  ┌─────────────────────────────────────────────────┐
  │  Wallet Core                                    │
  │  KeyManager      AES-256-GCM encrypted keys     │
  │  WalletService   sign & send (legacy+versioned) │
  │  PolicyEngine    spend caps, rate limits         │
  │  AuditLogger     append-only JSONL               │
  │  Jupiter         DEX aggregation                 │
  │  Kora            optional gasless relay          │
  │  x402Client      HTTP micropayments              │
  └─────────────────────────┬───────────────────────┘
                            │
                            ▼
                   Solana (devnet)
```

The agent never imports `wallet-core` directly. It talks through MCP — a process boundary that acts as a hard trust barrier. More on that choice later.

---

## Key Storage: Private Keys Should Hurt to Misuse

The first thing we built was the `KeyManager`, because everything else depends on it. The design principle was simple: **keys exist in plaintext only in memory, only during signing, and for the minimum possible duration.**

### The Keystore Format

Each wallet is a JSON file at `~/.agentic-wallet/keys/<uuid>.json`. The format borrows from Ethereum's Web3 Secret Storage Definition, adapted for Solana's Ed25519 keys:

```json
{
  "id": "a1b2c3d4-...",
  "label": "trading-agent",
  "publicKey": "7xKXtg...",
  "crypto": {
    "cipher": "aes-256-gcm",
    "ciphertext": "...",
    "iv": "...",
    "authTag": "...",
    "kdf": "pbkdf2",
    "kdfparams": {
      "iterations": 210000,
      "salt": "...",
      "dklen": 32,
      "digest": "sha512"
    }
  }
}
```

The AES encryption key is never stored anywhere. It's derived on demand from a passphrase using PBKDF2:

```
DerivedKey = PBKDF2(HMAC-SHA512, passphrase, salt, 210,000 iterations, 32 bytes)
```

210,000 iterations is the current OWASP recommendation for PBKDF2-HMAC-SHA512. Each keystore gets its own random 32-byte salt, so compromising one key's derivation doesn't affect others.

Here's how the two stages compose end-to-end:

```
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│         KEY DERIVATION          │       │      ENCRYPTION (AES-GCM)       │
├─────────────────────────────────┤       ├─────────────────────────────────┤
│                                 │       │                                 │
│  Passphrase       Random Salt   │       │   Plaintext Keypair    Random IV│
│      │                 │        │       │           │                 │   │
│      └───────┐ ┌───────┘        │       │           ▼                 ▼   │
│              ▼ ▼                │       │     ┌─────────────────────┐     │
│       ┌───────────────┐         │       │     │                     │     │
│       │    PBKDF2     │         │   ┌───┼────▶│     AES-256-GCM     │     │
│       │ (210k rounds, │         │   │   │     │                     │     │
│       │  HMAC-SHA512) │         │   │   │     └──────────┬──────────┘     │
│       └───────┬───────┘         │   │   │                │                │
│               │                 │   │   │        ┌───────┴───────┐        │
│               ▼                 │   │   │        ▼               ▼        │
│          Derived Key ───────────┼───┘   │   Ciphertext        Auth Tag    │
│          (32 Bytes)             │       │                     (16 Bytes)  │
└─────────────────────────────────┘       └─────────────────────────────────┘
                                                       │            │
                                                       ▼            ▼
                                             ┌────────────────────────────┐
                                             │  Saved to keystore JSON    │
                                             │  (Integrity protected!)    │
                                             └────────────────────────────┘
```

### Why GCM Matters

AES-256-GCM gives us both confidentiality _and_ integrity. The 16-byte authentication tag means that if someone tampers with the ciphertext on disk — even flipping a single bit — decryption throws an error instead of silently returning a corrupted key. For an autonomous system where nobody is watching, this distinction between "fail loudly" and "fail silently" is critical.

### In-Memory Lifetime

When a transaction needs signing, `KeyManager.unlockWallet()` decrypts the key, constructs the `Keypair`, signs the transaction, and returns. The plaintext bytes aren't cached anywhere. The garbage collector reclaims them after the signing closure exits. Is this perfect? No — a sophisticated memory dump could theoretically capture the key during signing. But it means the window of exposure is milliseconds rather than the entire process lifetime.

After writing a keystore file, we `chmod 0600` it so only the owner process can read it. Belt and suspenders.

---

## The Policy Engine: An Immune System for Agent Wallets

Encryption protects the key at rest. But the real danger with agent wallets isn't someone stealing the key file — it's the agent _using the key correctly_ to do something catastrophic. A compromised prompt, a hallucinated address, a runaway loop — these are all situations where the agent has legitimate signing access and still causes harm.

The `PolicyEngine` is a pre-signing check that runs on every transaction. The agent cannot bypass it, because it's enforced inside `WalletService`, not in the tool handler layer.

### What a Policy Contains

```typescript
interface PolicyRule {
  maxLamportsPerTx?: number; // per-transaction spend cap
  maxTxPerHour?: number; // rate limit (hourly)
  maxTxPerDay?: number; // rate limit (daily)
  cooldownMs?: number; // minimum gap between transactions
  maxDailySpendLamports?: number; // rolling 24h spend cap
  allowedPrograms?: string[]; // program whitelist
  blockedPrograms?: string[]; // program blacklist
}
```

Every wallet created through the MCP server receives a default devnet safety policy — it cannot be skipped:

- **Max 2 SOL per transaction** — no single call can drain the wallet
- **Max 10 transactions per hour** — limits velocity
- **Max 50 transactions per day** — limits volume
- **2-second cooldown** between transactions — prevents rapid-fire loops
- **Max 10 SOL daily spend** — hard cap on 24-hour exposure

### The Check Flow

The check happens before signing, in this order:

1. Parse the transaction to extract transfer amounts
2. Check per-transaction spend cap
3. Count recent transactions in rolling hour/day windows for rate limits
4. Compare timestamps for cooldown enforcement
5. Sum 24-hour spend including the current transaction for the daily cap
6. Verify each instruction's program ID against the allow/block lists

If any rule fails, the transaction is rejected, the policy violation is logged to the audit trail with `success: false`, and an error is thrown back to the agent. The agent can retry, but the policy state hasn't changed — it'll fail again until the rate limit window rolls over or the spend amount is within bounds.

### State Persistence

Here's a detail that matters: policy state is persisted to `~/.agentic-wallet/policy-state.json`. Rate limit counters survive server restarts. An agent cannot bypass the hourly limit by crashing and restarting the MCP server. This was a mistake we caught early — our first implementation kept rate counts in memory only, which meant a restart was a free reset.

---

## Why MCP Instead of a Raw SDK

The obvious approach to giving an AI agent wallet access is to hand it a TypeScript SDK: `import { walletService } from './core'`. We chose Model Context Protocol (MCP) instead, and it was one of our better decisions. Here's why.

### 1. Hard Process Boundary

With a raw SDK, the agent has in-process access to the `WalletService` and could, in theory, call any method — including ones that aren't safe for agents. MCP creates a separate server process. The agent sends a tool name and JSON arguments over stdio; the server validates, executes, and returns structured results. The agent never holds a reference to the wallet objects, the `KeyManager`, or any internal state.

### 2. Schema-Enforced Inputs

Every MCP tool input is validated by a Zod schema before the handler runs. An agent cannot pass a malformed `wallet_id`, a negative `amount`, or an out-of-range `slippage_bps`. With a raw SDK, this validation would be incumbent on the agent — which means it wouldn't happen.

### 3. Universal Agent Compatibility

MCP is supported by Claude Desktop, VS Code Copilot, Cursor, and any agent built with the MCP SDK. One server, zero integration work per framework. A raw SDK would need a new wrapper for every agent framework we wanted to support.

### 4. Declarative Capability Surface

MCP tools are declared with descriptions and annotations like `readOnlyHint` and `destructiveHint`. Agents can read this metadata and reason about what they're allowed to do. A raw SDK exposes every public method equally — there's no semantic distinction between "this is a read" and "this will spend money."

### 5. Resources and Prompts

MCP resources let agents read live state (wallet balances, policies, audit logs) without calling a tool — they're read-only with no side effects. MCP prompts provide pre-built multi-step workflows (`trading-strategy`, `portfolio-rebalance`, `security-audit`) that guide agents through complex operations. Neither concept has a natural analog in a plain SDK.

---

## The Human-Only Guardrail: A Type-Level Lock

Closing a wallet is irreversible. The encrypted keystore is permanently deleted and any remaining SOL is swept. This should never be an agent decision.

We briefly considered a runtime flag — check `if (opts.humanInitiated)` before executing. But a runtime check can be fooled. An agent could theoretically construct the right JSON payload. Instead, we used TypeScript's type system to create a compile-time barrier.

`closeWallet()` requires a parameter typed as `{ humanInitiated: true }` — not `boolean`, but the **literal type** `true`:

```typescript
export type HumanOnlyOpts = { humanInitiated: true };

export const HUMAN_ONLY: HumanOnlyOpts = { humanInitiated: true };

async closeWallet(
  walletId: string,
  sweepToAddress: string | undefined,
  opts: HumanOnlyOpts,
): Promise<...>
```

Here's the trick: MCP tool handlers receive arguments from Zod schemas. Zod's `z.boolean()` produces the TypeScript type `boolean` (which includes both `true` and `false`), not the literal type `true`. Since `boolean` does not satisfy `{ humanInitiated: true }`, TypeScript will refuse to compile any MCP tool handler that tries to call `closeWallet`. It's not a check that runs and might fail — it's code that won't compile, period.

The CLI (the human operator view) passes `HUMAN_ONLY` as an explicit constant:

```typescript
import { HUMAN_ONLY } from "@agentic-wallet/core";
walletService.closeWallet(id, ownerAddress, HUMAN_ONLY);
```

Additionally, the `close_wallet` tool file exists in the repo (with a prominent warning header explaining why it must never be registered), but it is **not imported** in the MCP server's tool index. Two independent barriers — compile-time type guard and module exclusion — ensure no agent path leads to wallet deletion.

This pattern, `HumanOnlyOpts`, is exported from `@agentic-wallet/core` so it can be applied to any future operation that needs the same protection (like a hypothetical `update_policy` tool that could allow an agent to loosen its own spending limits).

---

## The Audit Trail: If You Can't Prove It, It Didn't Happen

Every operation — success or failure — is written to an append-only JSONL file:

```
~/.agentic-wallet/logs/audit-2026-03-04.jsonl
```

Each entry is a single JSON line:

```json
{
  "timestamp": "2026-03-04T12:34:56.789Z",
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

The logger uses `appendFileSync`, which means it can only add — it cannot overwrite or delete existing entries. Failed operations are logged with `success: false` and an error message. Policy violations are logged. Kora fallbacks are logged. x402 payment stages are logged. Everything leaves a trace.

Why does this matter for agents specifically? Because agents don't have observable intent. A human trader can tell you "I sold because I thought the price would drop." An agent does what it was told (or what it hallucinated it was told). The audit trail is the only source of truth for reconstructing what happened and why.

The `AuditLogger` also supports real-time event listeners, which the CLI TUI uses to stream new entries into the logs view without polling. This means a human operator can watch agent activity live.

---

## Protocol Integrations: What the Agent Can Actually Do

A wallet that can only send SOL isn't very useful for an autonomous agent. We integrated four protocols to give agents real capabilities.

### Jupiter DEX — Trading Across All Solana Liquidity

Jupiter is Solana's primary DEX aggregator. It routes swaps across Raydium, Orca, Meteora, and dozens of other pools to find the best price. Our integration uses Jupiter's v6 REST API:

1. **Quote** — get the best route, expected output, and price impact
2. **Validate** — reject if price impact exceeds 5% (configurable)
3. **Build** — Jupiter returns a `VersionedTransaction` with address lookup table compression
4. **Sign and send** — through `WalletService` with rate/spend limits enforced

Safety parameters are bounded: default slippage is 0.5%, the agent cannot request more than 3%, and swaps with more than 5% price impact are rejected before a transaction is ever built. These limits exist to prevent an agent from executing a swap in a thin pool and losing a significant portion of its value to slippage.

### Kora Gasless Relay — Agents Shouldn't Need SOL for Gas

Here's a practical problem: if an agent wallet needs SOL to pay transaction fees, someone has to keep that SOL topped up. This creates an operational burden and means agent wallets always hold a non-zero SOL balance even if they're working with SPL tokens.

[Kora](https://github.com/solana-foundation/kora) is a Solana Foundation paymaster node that allows a third party to pay network fees on behalf of other wallets. With Kora configured, agent wallets can hold zero SOL and still transact freely.

The flow works like this: `WalletService` sets the transaction's fee payer to the Kora signer address (fetched once and cached), partial-signs with the agent's keypair, then sends the partially-signed transaction to the Kora node. Kora co-signs as fee payer and broadcasts to Solana.

Critically, Kora is **optional and gracefully degrading**. If `KORA_RPC_URL` isn't set, the standard path runs. If it _is_ set but the node is unreachable at runtime, `WalletService` catches the error, logs a `koraFallback: true` audit entry, and falls through to the standard path where the agent pays its own fees. The agent never knows the difference — it keeps working.

Kora covers all five legacy transaction tools (`send_sol`, `send_token`, `write_memo`, `create_token_mint`, `mint_tokens`). Jupiter swaps can't use Kora because Jupiter v6's `/swap` endpoint bakes `userPublicKey` as fee payer into the compiled `MessageV0` — there's no way to swap the fee payer post-build.

### x402 HTTP Payments — Agents Pay for APIs

[x402](https://github.com/coinbase/x402) is Coinbase's open standard for HTTP-native payments. A server responds `402 Payment Required` with a header describing the payment terms; the client pays on-chain and retries with a payment signature.

This lets agents autonomously pay for API-protected resources — weather data, market feeds, compute services — using their managed wallets. The signing goes through `PolicyEngine`, so spend caps and rate limits apply to x402 payments the same as any transfer. A configurable `maxPaymentLamports` cap (default 1 SOL) adds an extra layer of protection against unexpected charges.

### SPL Token Operations

Agents can create new token mints, manage associated token accounts, and transfer SPL tokens. This isn't flashy, but it's necessary for any real DeFi interaction on Solana.

---

## Multi-Agent Architecture: Each Agent Is an Island

The system is designed for multiple independent agents, each managing their own wallet:

- **Independent keystores** — each wallet is a separate encrypted file with its own salt and IV
- **Independent policies** — each wallet has its own spend caps, rate limits, and program allowlists
- **Independent audit trails** — log entries include `walletId` so per-agent activity is filterable
- **Shared MCP server** — one server instance manages all wallets; agents are differentiated by the `wallet_id` they supply in tool calls

There's no shared state between wallets beyond the server process itself. An agent managing wallet A can't affect the rate limits or policy of wallet B. If wallet A gets compromised through prompt injection, wallet B's funds and limits are completely unaffected.

---

## The AI Agent as a Trading Bot

Instead of building a separate trading bot process, we exposed trading as MCP tools that let any connected AI agent _become_ its own trading bot. This is architecturally important: the agent uses the same policy engine, audit trail, and guardrails as any other wallet operation.

Three tools make up the pipeline:

1. **`fetch_prices`** — calls Jupiter Price API v2 for real-time USD prices
2. **`evaluate_strategy`** — runs a named strategy against current prices and wallet balances, returns a BUY/SELL/HOLD signal with exact amounts
3. **`swap_tokens`** — executes the trade (existing tool, policy-checked)

Two strategies are implemented:

- **`threshold-rebalance`** — maintains a target SOL allocation (e.g., 70%). When drift exceeds a threshold, it returns BUY or SELL for the delta. Stateless — each call is independent.
- **`sma-crossover`** — tracks fast and slow simple moving averages. Returns BUY when the fast SMA crosses above the slow, SELL when it crosses below, HOLD when the window is still filling. Stateful within a server session — accuracy improves as the price window fills.

The `autonomous-trading` prompt ties these together into a multi-tick loop:

```
for each tick:
  prices  = fetch_prices([SOL, USDC])
  signal  = evaluate_strategy(strategy, wallet_id, prices)
  if signal != HOLD:
    swap_tokens(wallet_id, signal.inputMint, signal.outputMint, signal.amount)
  sleep(interval)
```

Every swap still goes through the `PolicyEngine`. A runaway strategy cannot exceed daily spend caps or hourly rate limits regardless of how many ticks it runs. This is the same safety model as any other operation — no special cases for trading.

---

## Threat Model: What We Defend Against

Building for autonomous agents means thinking about threats that human-wallet systems don't consider:

| Threat                             | Mitigation                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| **Prompt injection**               | PolicyEngine blocks out-of-limit transactions regardless of what the agent was told to do    |
| **Runaway agent loop**             | Rate limits (10 tx/hr, 50 tx/day) and cooldown (2s) halt execution before significant damage |
| **Large single transaction**       | Per-tx cap (2 SOL) prevents draining in one call                                             |
| **Gradual drain over time**        | Daily spend cap (10 SOL) bounds 24h exposure                                                 |
| **Agent closing wallets**          | Compile-time `HumanOnlyOpts` guard + module exclusion — two independent barriers             |
| **Agent loosening its own policy** | No `update_policy` tool exists; policy changes require code access                           |
| **Keystore file exfiltration**     | AES-256-GCM encrypted; attacker needs the passphrase                                         |
| **Passphrase brute force**         | 210,000 PBKDF2 iterations makes brute force computationally expensive                        |
| **Keystore tampering**             | GCM auth tag detects modification; decryption throws on tampered ciphertext                  |
| **Devnet vs mainnet confusion**    | Defaults to devnet; mainnet requires explicit opt-in                                         |

Is this perfect? No. A determined attacker with process-level access could dump memory during signing. An operator who sets a weak passphrase undermines the entire key derivation scheme. But the goal isn't perfection — it's **defense in depth** where every layer independently limits the blast radius.

---

## Lessons Learned

### 1. Rate limits need to survive restarts

Our first implementation kept rate limit counters in memory. A crash-and-restart was a free reset — an agent (or attacker) could exploit this to exceed limits. Persisting policy state to disk was a simple fix with a big security impact.

### 2. The compile-time guard was worth the weirdness

The `HumanOnlyOpts` type trick feels unusual in TypeScript. We debated whether a simpler runtime check was "good enough." But runtime checks are one bug away from being bypassed. The type-level guard can't be defeated without modifying the source code — which transforms the threat from "agent tricks the system" to "someone with repo access modifies the security model," a fundamentally different (and much harder) attack vector.

### 3. Graceful degradation > hard dependency

Kora could have been a hard requirement. Instead, every code path that uses Kora wraps it in a try/catch and falls back to the standard fee path. The result: the system works identically whether Kora is configured, misconfigured, or absent. This reduced our deployment complexity dramatically and meant that reviewer testing doesn't require running a Kora node.

### 4. The MCP process boundary was more valuable than expected

Initially we chose MCP for ecosystem compatibility. But the hard process boundary turned out to be a significant security advantage. The agent can't reach into `WalletService` internals, can't call `KeyManager.unlockWallet()` directly, and can't access any method that isn't explicitly exposed as a tool. This "capability surface" approach — where the agent can only do what's declared in the tool registry — is a natural fit for autonomous systems where you want to minimize the API surface.

### 5. Agents need a manual, not just an API

We created `SKILLS.md` — a structured document that agents read before acting. It covers what they can do, what they can't do, safety rules, and common workflows. The difference in agent behavior between "here are 16 tools, figure it out" and "read this manual first" was significant. Agents that read the skills file made fewer errors, attempted fewer forbidden operations, and followed multi-step workflows more reliably.

---

## What's Next

This is a devnet prototype. To move toward production, several things need to happen:

- **Hardware-backed key storage** — HSMs or secure enclaves for key material instead of (or in addition to) encrypted files on disk
- **Multi-sig for high-value operations** — require multiple agent signatures or human co-signing above certain thresholds
- **On-chain policy enforcement** — move spending limits from off-chain (the PolicyEngine) to on-chain program guards, so they're tamper-proof even if the server is compromised
- **Cross-chain support** — agents that operate across Solana, Ethereum, Base, etc.
- **Agent identity and reputation** — on-chain attestation of which agent controls which wallet, enabling trust scoring

---

## Try It Yourself

The entire system is open source and runs on Solana devnet:

```bash
git clone https://github.com/xavierScript/agentic_wallet.git
cd agentic_wallet
pnpm install && pnpm build && pnpm cli
```

Or with Docker (fastest, zero local setup):

```bash
docker compose up cli
```

Connect any MCP-compatible AI (Claude Desktop, VS Code Copilot, Cursor) and tell it:

> "Read SKILLS.md, then create a wallet, airdrop 1 SOL, and send 0.01 SOL to yourself as a test."

It just works. That was the goal.

---

_Full source: [github.com/xavierScript/agentic_wallet](https://github.com/xavierScript/agentic_wallet)_
_Architecture deep dive: [DEEP-DIVE.md](https://github.com/xavierScript/agentic_wallet/blob/main/DEEP-DIVE.md)_
_28 demo prompts: [DEMO-PROMPTS.md](https://github.com/xavierScript/agentic_wallet/blob/main/DEMO-PROMPTS.md)_
