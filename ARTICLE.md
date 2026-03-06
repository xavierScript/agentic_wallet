# Building an Agentic Wallet: Wallet Design and Security for AI Agents on Solana

AI agents are becoming first-class participants on Solana. They execute trades, manage liquidity, mint tokens, and interact with dApps — all without a human clicking "Approve" in Phantom. But for an agent to do any of this, it needs a wallet. Not a human wallet. A wallet designed from the ground up for autonomous software that doesn't confirm anything visually, doesn't notice when something goes wrong, and will happily drain itself to zero if nothing stops it.

This article covers the wallet design and security model we built to solve this problem. The [full source is on GitHub](https://github.com/xavierScript/agentic_wallet), running on Solana devnet today.

---

## The Core Problem: Human Wallets Are Dangerous in Agent Hands

A wallet designed for a human assumes three things:

1. **The user confirms transactions visually.** They see "Send 2 SOL to 7xKX…" and click Approve.
2. **The user notices when something is wrong.** A sudden large transfer, a suspicious program interaction — a human pauses.
3. **The user has intent.** They chose to make this transfer. Nobody injected this decision through a prompt.

AI agents break all three assumptions. An LLM-based agent doesn't "see" a confirmation dialog. It processes structured inputs and produces structured outputs. If a prompt injection tells it to send all funds to an attacker address, there is no moment of visual hesitation. If a loop goes haywire and fires 500 transactions in 10 minutes, there is no gut feeling that says "wait, this is wrong."

So the question isn't "can we give an agent a Solana keypair?" — of course we can. The question is: **can we give an agent signing authority and still sleep at night?**

Our answer was to build a wallet where safety isn't a feature you opt into — it's a property of the architecture itself. That starts with how the agent talks to the wallet in the first place.

---

## Architecture: MCP as a Trust Barrier

The most natural thing would have been to hand agents a TypeScript SDK — `import { walletService } from './core'` — and let them call methods directly. We went with Model Context Protocol instead, and it turned out to be one of our better decisions, mostly for reasons we didn't anticipate.

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
  └─────────────────────────────┬───────────────────┘
                            │
                            ▼
                   Solana (devnet)
```

The agent never imports `wallet-core` directly. It talks through MCP — and that process boundary is doing more security work than it looks like.

With a raw SDK, the agent would have in-process access to every method on `WalletService`, including ones that aren't safe for agents. MCP creates a separate server process. The agent sends a tool name and JSON arguments over stdio; the server validates, executes, and returns structured results. The agent never holds a reference to the wallet objects, the `KeyManager`, or any internal state. It can't reach past the boundary.

On top of that, every MCP tool input is validated by a Zod schema before the handler runs. An agent can't pass a malformed `wallet_id`, a negative `amount`, or an out-of-range `slippage_bps` — the schema catches it. With a raw SDK, that validation would depend on the agent itself, which means it wouldn't happen. MCP tools also carry annotations like `readOnlyHint` and `destructiveHint`, so agents can reason about what they're allowed to do before trying. A raw SDK exposes every public method equally — no semantic distinction between "this reads a balance" and "this sends money."

There's a practical benefit too: MCP is supported by Claude Desktop, VS Code Copilot, Cursor, and anything built with the MCP SDK. One server, zero integration work per framework.

So MCP gives us the boundary. But what's inside the boundary still has to be safe. The first thing we built was the key manager, because everything else depends on it.

---

## Key Storage: Private Keys Should Hurt to Misuse

The design principle was simple: **keys exist in plaintext only in memory, only during signing, and for the minimum possible duration.**

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

We chose AES-256-GCM specifically because it gives us both confidentiality _and_ integrity. The 16-byte authentication tag means that if someone tampers with the ciphertext on disk — even flipping a single bit — decryption throws an error instead of silently returning a corrupted key. For an autonomous system where nobody is watching, this distinction between "fail loudly" and "fail silently" is everything.

### In-Memory Lifetime

When a transaction needs signing, `KeyManager.unlockWallet()` decrypts the key, constructs the `Keypair`, signs the transaction, and returns. The plaintext bytes aren't cached anywhere — the garbage collector reclaims them after the signing closure exits. Is this perfect? No — a sophisticated memory dump could theoretically capture the key during that window. But it means exposure lasts milliseconds rather than the entire process lifetime.

After writing a keystore file, we `chmod 0600` it so only the owner process can read it. Belt and suspenders.

Encryption handles the keys at rest. But here's the thing — the more realistic threat with agent wallets isn't someone stealing the key file off disk. It's the agent using its perfectly valid signing authority to do something catastrophic.

---

## The Policy Engine: An Immune System for Agent Wallets

A compromised prompt, a hallucinated address, a runaway loop — these are all situations where the agent has legitimate signing access and still causes harm. The key is right there in memory, correctly decrypted. The transaction is well-formed. And it's about to drain the wallet.

The `PolicyEngine` exists to catch exactly this. It's a pre-signing check that runs on every transaction, enforced inside `WalletService` itself — not in the tool handler layer. The agent can't bypass it because the check happens below the API surface it has access to.

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

Every wallet created through the MCP server receives a default devnet safety policy. It cannot be skipped:

- **Max 2 SOL per transaction** — no single call can drain the wallet
- **Max 30 transactions per hour** — limits velocity
- **Max 200 transactions per day** — limits volume
- **2-second cooldown** between transactions — prevents rapid-fire loops
- **Max 10 SOL daily spend** — hard cap on 24-hour exposure

### The Check Flow

Before every signature, the engine runs through checks in this order:

1. Parse the transaction to extract transfer amounts
2. Check per-transaction spend cap
3. Count recent transactions in rolling hour/day windows for rate limits
4. Compare timestamps for cooldown enforcement
5. Sum 24-hour spend including the current transaction for the daily cap
6. Verify each instruction's program ID against the allow/block lists

If any rule fails, the transaction is rejected, the violation is logged to the audit trail with `success: false`, and an error is thrown back to the agent. The agent can retry, but the policy state hasn't changed — it'll fail again until the rate limit window rolls over or the spend amount is within bounds.

### State Persistence

Here's a detail that bit us early: policy state is persisted to `~/.agentic-wallet/policy-state.json`. Rate limit counters survive server restarts. Our first version kept rate counts in memory only, which meant a restart was a free reset — an agent (or attacker) could blow through the hourly limit just by crashing the server. Simple fix, but it would have been a real hole.

The policy engine handles the broad strokes — capping spend, limiting velocity, restricting programs. But some operations are so dangerous that they shouldn't just be rate-limited. They should be completely off-limits to agents, full stop.

---

## The Human-Only Guardrail: A Type-Level Lock

Closing a wallet is irreversible. The encrypted keystore is permanently deleted and any remaining SOL is swept. This should never be an agent decision.

We briefly considered a runtime flag — check `if (opts.humanInitiated)` before executing. But a runtime check can be fooled. An agent could theoretically construct the right JSON payload. So instead, we used TypeScript's type system to create a compile-time barrier.

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

Here's what makes this work: MCP tool handlers receive arguments from Zod schemas. Zod's `z.boolean()` produces the TypeScript type `boolean` (which includes both `true` and `false`), not the literal type `true`. Since `boolean` does not satisfy `{ humanInitiated: true }`, TypeScript will refuse to compile any MCP tool handler that tries to call `closeWallet`. It's not a check that runs and might fail — it's code that literally won't compile.

The CLI (the human operator view) passes `HUMAN_ONLY` as an explicit constant:

```typescript
import { HUMAN_ONLY } from "@agentic-wallet/core";
walletService.closeWallet(id, ownerAddress, HUMAN_ONLY);
```

On top of the type guard, the `close_wallet` tool file exists in the repo (with a prominent warning header explaining why it must never be registered), but it is **not imported** in the MCP server's tool index. Two independent barriers — compile-time type guard and module exclusion — both have to fail before an agent could reach wallet deletion.

The `HumanOnlyOpts` pattern is exported from `@agentic-wallet/core` so it can be applied to any future operation that needs the same protection. The obvious candidate is a hypothetical `update_policy` tool — you really don't want an agent loosening its own spending limits.

So far we've covered how keys are protected, how transactions are bounded, and how destructive actions are blocked. But all of these defenses would be worth much less without a record of what actually happened. That brings us to the audit trail.

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

The logger uses `appendFileSync` — it can only add, never overwrite or delete. Failed operations, policy violations, fallbacks, payment stages — everything leaves a trace.

Why does this matter for agents specifically? Because humans have observable intent. A trader can tell you "I sold because I thought the price would drop." An agent does what it was told — or what it hallucinated it was told. When something goes wrong, the audit trail is the only source of truth for piecing together what happened.

With a single agent this is straightforward. But the system is designed for multiple agents, and isolation between them matters as much as any other security layer.

---

## Multi-Agent Isolation

Each wallet is an island:

- **Independent keystores** — separate encrypted files with their own salt and IV
- **Independent policies** — each wallet has its own spend caps, rate limits, and program allowlists
- **Independent audit trails** — log entries include `walletId` so per-agent activity is filterable

There's no shared state between wallets beyond the server process itself. If wallet A gets compromised through prompt injection, wallet B's funds and limits are completely unaffected. The blast radius of any single compromise is bounded to one wallet.

All of these layers — MCP isolation, key encryption, policy enforcement, human-only guardrails, append-only auditing, per-wallet isolation — form a defense-in-depth model. Here's how the full threat model maps out.

---

## Threat Model: What We Defend Against

Building for autonomous agents means thinking about threats that human-wallet systems don't face:

| Threat                             | Mitigation                                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| **Prompt injection**               | PolicyEngine blocks out-of-limit transactions regardless of what the agent was told to do     |
| **Runaway agent loop**             | Rate limits (30 tx/hr, 200 tx/day) and cooldown (2s) halt execution before significant damage |
| **Large single transaction**       | Per-tx cap (2 SOL) prevents draining in one call                                              |
| **Gradual drain over time**        | Daily spend cap (10 SOL) bounds 24h exposure                                                  |
| **Agent closing wallets**          | Compile-time `HumanOnlyOpts` guard + module exclusion — two independent barriers              |
| **Agent loosening its own policy** | No `update_policy` tool exists; policy changes require code access                            |
| **Keystore file exfiltration**     | AES-256-GCM encrypted; attacker needs the passphrase                                          |
| **Passphrase brute force**         | 210,000 PBKDF2 iterations makes brute force computationally expensive                         |
| **Keystore tampering**             | GCM auth tag detects modification; decryption throws on tampered ciphertext                   |
| **Devnet vs mainnet confusion**    | Defaults to devnet; mainnet requires explicit opt-in                                          |

Is this perfect? No. A determined attacker with process-level access could dump memory during signing. An operator who sets a weak passphrase undermines the entire key derivation scheme. But the goal was never perfection — it's **defense in depth**, where every layer independently limits the blast radius and no single failure takes everything down.

---

## What We Got Wrong First

A few things we'd do differently, or almost got wrong:

**Rate limits need to survive restarts.** Our first implementation kept counters in memory. A crash-and-restart was a free reset — an agent could blow through rate limits indefinitely. Persisting policy state to disk was a one-line fix with outsized security impact.

**The compile-time guard was worth the weirdness.** The `HumanOnlyOpts` trick feels unusual in TypeScript. We debated whether a runtime check was "good enough." But runtime checks are one bug away from bypass. The type-level guard can only be defeated by modifying source code — that's a fundamentally different attack vector than "agent constructs clever JSON."

**The MCP boundary paid off more than expected.** We originally chose MCP for ecosystem compatibility — write one server, support every agent framework. But the hard process boundary turned out to be the real win. The agent can't reach into `WalletService` internals, can't call `KeyManager.unlockWallet()` directly, and can't touch any method that isn't explicitly declared as a tool. We got a security boundary for free while solving a compatibility problem.

**Agents need a manual, not just an API.** We wrote `SKILLS.md` — a structured document that agents read before acting. It covers what they can do, what they can't, safety rules, and common workflows. The difference between "here are 16 tools, figure it out" and "read this manual first" was night and day. Fewer errors, fewer forbidden operations, more reliable multi-step workflows.
