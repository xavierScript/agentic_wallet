# Solana Agentic Wallet

> **Autonomous AI agents with secure Solana wallets** — encrypted key management, policy-enforced transaction signing, a full MCP server, and agent skill scripts any AI can use.
>
> To prove the wallet can interact autonomously with the ecosystem, we integrated **Kora** for gasless transactions, **x402** for HTTP micropayments, **Jupiter** for DEX pricing and swap routing, and **SPL tokens** for minting and transfers — all working end-to-end on devnet.

[![Solana](https://img.shields.io/badge/Solana-Devnet-14F195?style=flat-square&logo=solana)](https://solana.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?style=flat-square&logo=typescript)](https://typescriptlang.org)
[![MCP](https://img.shields.io/badge/MCP-1.12-purple?style=flat-square)](https://modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

---

## Demo & Deep Dive

|                                |                                       |
| ------------------------------ | ------------------------------------- |
| 📹 **Video Demo**              | [Watch on YouTube](#) _(link coming)_ |
| 📝 **Written Deep Dive**       | [Read the article](#) _(link coming)_ |
| 🔍 **Architecture & Security** | [DEEP-DIVE.md](DEEP-DIVE.md)          |
| 🎮 **28 Copy-Paste Prompts**   | [DEMO-PROMPTS.md](DEMO-PROMPTS.md)    |
| 🤖 **Agent Skills Manual**     | [SKILLS.md](SKILLS.md)                |

---

## Bounty Requirements

| Requirement                                    | Status | Where                                                                                    |
| ---------------------------------------------- | :----: | ---------------------------------------------------------------------------------------- |
| Create a wallet programmatically               |   ✅   | `create_wallet` MCP tool → `KeyManager` + AES-256-GCM encrypted keystore                 |
| Sign transactions automatically                |   ✅   | `WalletService.signAndSend()` — zero human input required                                |
| Hold SOL and SPL tokens                        |   ✅   | Every wallet is a full Solana keypair; balances via `get_balance`                        |
| Interact with a test dApp / protocol           |   ✅   | Kora gasless relay · x402 HTTP payments · Jupiter pricing & simulated swaps · SPL token minting |
| Safe key management for autonomous agents      |   ✅   | AES-256-GCM + PBKDF2 (210 000 iterations, SHA-512) encrypted keystore                    |
| Automated signing without manual input         |   ✅   | Policy-gated auto-signing; `close_wallet` is the only human-required operation           |
| AI agent decision-making / simulation          |   ✅   | SMA-crossover + threshold-rebalance strategy engine; autonomous multi-tick trading loop  |
| Clear separation of agent logic and wallet ops |   ✅   | `mcp-server` (agent interface) and `wallet-core` (signing/storage) are separate packages |
| Open-source with clear README and setup        |   ✅   | This file · [DEEP-DIVE.md](DEEP-DIVE.md) · [DEMO-PROMPTS.md](DEMO-PROMPTS.md)            |
| `SKILLS.md` for agents to read                 |   ✅   | [SKILLS.md](SKILLS.md) · [skills/SKILL.md](skills/SKILL.md)                              |
| Working prototype on devnet                    |   ✅   | Docker one-liner **or** `pnpm install && pnpm build && pnpm cli`                         |
| Support multiple independent agents            |   ✅   | Each wallet has its own isolated policy, keystore, and audit trail                       |

---

## What's Built

A **production-grade autonomous wallet system** for Solana AI agents — not a toy prototype.

**Core wallet**

- Programmatic wallet creation with AES-256-GCM encrypted keystores (PBKDF2, 210k SHA-512 iterations)
- Automatic transaction signing — SOL transfers, SPL token transfers, versioned transactions — no human in the loop
- Policy engine: per-tx spend caps, daily caps, per-hour/day rate limits, program allowlists — all enforced before signing
- Append-only JSONL audit trail — every operation logged regardless of success or failure

**Protocol integrations**

- **Kora gasless relay** — agent wallets pay zero SOL network fees; the operator's Kora node covers them
- **x402 HTTP payments** — agents autonomously pay for API-protected resources via Coinbase's payment standard
- **Jupiter DEX** — real-time pricing via Jupiter Price API v2, best-route swap quotes, and full on-chain execution on mainnet-beta. On devnet the tool returns simulated swaps with real mainnet pricing (Jupiter liquidity pools don't exist on devnet)
- **SPL tokens** — mint creation, ATA management, token transfers

**Agent interfaces**

- **MCP server** with 16 tools, 9 resources, and 8 guided prompts — any MCP-compatible AI connects instantly
- **5 bash scripts** in `skills/scripts/` — shell-access agents work without MCP at all
- **SKILLS.md** — structured operating manual agents read before acting

**Safety by design**

- `close_wallet` cannot be called by any agent — a compile-time `HumanOnlyOpts` type guard prevents it entirely
- Agents never see raw private keys — all signing is delegated through `WalletService`
- Kora is optional — if the relay node is offline, `WalletService` falls back to the standard fee path automatically

---

## What is this?

A complete toolkit for running autonomous AI agents on Solana. Each agent gets its own AES-256-GCM encrypted wallet, operates within configurable safety guardrails (spend caps, rate limits, program allowlists), and every action is written to an immutable audit trail.

The primary agent interface is an **MCP server** — meaning any MCP-compatible AI (Claude Desktop, VS Code Copilot, Cursor, or any custom agent) can connect and immediately gain the ability to create wallets, sign transactions, execute Jupiter swaps, mint tokens, and more — without touching private keys directly.

For agents with shell access (Claude Code, Cursor terminal, any CLI agent), **5 standalone bash scripts** in `skills/scripts/` provide balance checks, devnet airdrops, audit log summaries, and transaction lookups — no MCP client required.

A **TUI (terminal UI)** lets human operators observe all wallet state and audit logs in real time, and is the only place wallet closure can be initiated (a human-only operation by design).

---

## Architecture

```
  AI Agent
  Claude Desktop · VS Code Copilot · Cursor · Custom MCP Client
        │ MCP (stdio)                              │ bash
        ▼                                          ▼
  ┌─────────────────────────────┐     ┌────────────────────────┐
  │  MCP Server                 │     │  Bash Scripts (5)      │
  │  16 Tools                   │     │  skills/scripts/       │
  │  9 Resources                │     │  (read-only, no keys)  │
  │  8 Prompts                  │     └────────────────────────┘
  │  ✗ close_wallet (human only)│
  └──────────────┬──────────────┘
                 │
        ▼
  ┌─────────────────────────────────────────────────────────────┐
  │  Wallet Core                                                │
  │  KeyManager     — AES-256-GCM encrypted keystores on disk  │
  │  WalletService  — sign & send (legacy + versioned txs)     │
  │  PolicyEngine   — spend caps, rate limits, allowlists      │
  │  AuditLogger    — append-only JSONL audit trail            │
  │  Jupiter        — DEX quote + swap                         │
  │  Kora           — optional gasless fee relay               │
  │  x402Client     — HTTP micropayment protocol               │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
                                 ▼
                    Solana (devnet / mainnet-beta)

  CLI / TUI — human operator
  Dashboard · Wallet list · Logs · Close wallet (human-only)
```

---

## Quick Start

### Option A — Docker (fastest, zero local setup)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose).

```bash
git clone https://github.com/xavierScript/agentic_wallet.git
cd agentic_wallet

# 1. Create your .env — only WALLET_PASSPHRASE is required
cp .env.example .env

# 2. Build the image and launch the TUI
docker compose up cli
```

The first run compiles the full monorepo inside the builder stage (~60 s). Subsequent runs reuse the cached image.

**Wallet data** (keystores, audit logs, policy state) is stored in a named Docker volume (`agentic-wallet_wallet-data`) and persists between `docker compose down` / `up` cycles.

#### Connect an MCP client to the Docker container

Claude Desktop, VS Code Copilot, Cursor, and any other MCP client can connect to the containerised MCP server over stdio using `docker run`:

```json
{
  "mcpServers": {
    "agentic-wallet": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "-v",
        "agentic-wallet_wallet-data:/root/.agentic-wallet",
        "--env-file",
        "/absolute/path/to/.env",
        "agentic-wallet:latest",
        "node",
        "packages/mcp-server/dist/index.js"
      ]
    }
  }
}
```

> The `-i` flag keeps stdin open for the stdio transport. The named volume ensures the MCP container shares the same wallet state as the TUI container.

---

### Option B — Manual (Node.js + pnpm)

### Prerequisites

- Node.js 18+
- pnpm 8+

### 1. Install and build

```bash
git clone https://github.com/xavierScript/agentic_wallet.git
cd agentic_wallet

pnpm install
pnpm build          # builds core → cli → mcp-server in dependency order
```

Or with Make:

```bash
make install
make build
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# Required — encrypts all private keys on disk
WALLET_PASSPHRASE=your-strong-passphrase-here   # min 12 chars

# Optional — defaults work for devnet out of the box
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_CLUSTER=devnet

# Optional — agent-created wallets sweep remaining SOL here on close
OWNER_ADDRESS=<your-solana-address>

# Optional — Kora gasless paymaster relay (see kora/README.md)
# When set, agent wallets never pay SOL network fees — the Kora node covers them
# Without this the system works normally: agent wallet pays its own fees
KORA_RPC_URL=http://localhost:8080

# Optional — auto-fund newly created agent wallets from a master wallet
# See "Secure Key Storage" section below — use `pnpm key:import` instead of
# storing the raw key here.
MASTER_WALLET_KEY_LABEL=master-funder   # label assigned during pnpm key:import
AGENT_SEED_SOL=0.05
```

### 3. Launch the TUI (human operator view)

```bash
make start
# or
pnpm cli
```

The TUI shows live wallet balances, recent audit log entries, and lets you close wallets safely (human-only operation).

---

## Connecting an AI Agent (MCP)

The MCP server speaks the [Model Context Protocol](https://modelcontextprotocol.io) over stdio. Build it once, then point any compatible client at it.

```bash
make build   # ensures packages/mcp-server/dist/index.js exists
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "agentic-wallet": {
      "command": "node",
      "args": ["<absolute-path-to-repo>/packages/mcp-server/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. The wallet tools will appear in the tool list.

### VS Code (GitHub Copilot / MCP extension)

Add `.vscode/mcp.json` to your workspace:

```json
{
  "servers": {
    "agentic-wallet": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/packages/mcp-server/dist/index.js"]
    }
  }
}
```

### Cursor / other MCP clients

Use the same `command` + `args` pattern above. The server communicates over stdin/stdout and requires no network port.

### Verify connection

Once connected, ask your agent:

> "Read the wallet system status and tell me how many wallets exist."

The agent will call the `wallet://system/status` resource and respond with live data.

### Demo Prompts

For 28 copy-paste prompts covering every capability — from wallet creation and gasless transfers through autonomous multi-tick trading — see **[DEMO-PROMPTS.md](DEMO-PROMPTS.md)**.

---

## Agent Skills

**[SKILLS.md](SKILLS.md)** is the agent operating manual — read it first before any wallet operation.

It covers what the agent can and cannot do, safety rules, common workflows, and the executable script interface. Point any agent at it:

> "Read SKILLS.md and then create a wallet."

### Bash Scripts — No MCP Required

Agents with shell access can use the standalone scripts in `skills/scripts/` without the MCP server:

| Script             | Purpose                             |
| ------------------ | ----------------------------------- |
| `airdrop.sh`       | Request devnet SOL for a wallet     |
| `check-balance.sh` | Quick SOL balance via RPC           |
| `audit-summary.sh` | Summarize today's audit log entries |
| `tx-lookup.sh`     | Transaction details by signature    |
| `health-check.sh`  | Scan all wallets for issues         |

All scripts output JSON. Requirements: `bash`, `curl`, `bc`. On Windows use WSL or Git Bash.

```bash
bash skills/scripts/health-check.sh
bash skills/scripts/check-balance.sh <wallet-public-key>
bash skills/scripts/airdrop.sh <wallet-public-key> 1
```

See [skills/SKILL.md](skills/SKILL.md) for full docs, response formats, and agent trigger phrases.

---

## MCP Capabilities

### Tools — agent-callable actions

| Tool                | Description                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| `create_wallet`     | Create wallet with AES-256-GCM encrypted key storage. Devnet safety policy always attached.       |
| `list_wallets`      | List all wallets with current SOL balances                                                        |
| `get_balance`       | SOL + SPL token balances for a wallet                                                             |
| `send_sol`          | Transfer SOL — policy-checked before signing                                                      |
| `send_token`        | Transfer SPL tokens — creates recipient ATA if needed                                             |
| `swap_tokens`       | Jupiter DEX swap — best route across all Solana liquidity                                         |
| `write_memo`        | Write an on-chain memo (SPL Memo Program)                                                         |
| `create_token_mint` | Create a new SPL token mint                                                                       |
| `mint_tokens`       | Mint tokens to any wallet (must be mint authority)                                                |
| `get_audit_logs`    | Read the immutable audit trail                                                                    |
| `get_status`        | System-wide status: wallets, balances, recent activity                                            |
| `get_policy`        | Wallet policy configuration + transaction stats                                                   |
| `pay_x402`          | Pay for an x402-protected HTTP resource using a managed wallet (Solana SVM exact scheme)          |
| `probe_x402`        | Check if a URL requires x402 payment and discover pricing — no funds spent                        |
| `fetch_prices`      | Fetch real-time USD prices from Jupiter Price API v2 (SOL, USDC, USDT, BONK, JUP, or mint)        |
| `evaluate_strategy` | Evaluate a trading strategy (threshold-rebalance or sma-crossover) and get a BUY/SELL/HOLD signal |

> `close_wallet` is intentionally absent. Wallet closure is irreversible and must be initiated by a human via the CLI.

### Resources — readable context

| URI                                | Description                                                  |
| ---------------------------------- | ------------------------------------------------------------ |
| `wallet://wallets`                 | All wallets with balances                                    |
| `wallet://wallets/{id}`            | Single wallet detail                                         |
| `wallet://wallets/{id}/policy`     | Policy rules + current spend/rate stats                      |
| `wallet://audit-logs`              | Recent global audit log entries                              |
| `wallet://wallets/{id}/audit-logs` | Per-wallet audit history                                     |
| `wallet://system/status`           | Cluster, RPC, aggregate balances, recent activity            |
| `wallet://system/config`           | Active configuration (passphrase redacted)                   |
| `wallet://x402/config`             | x402 payment protocol config + supported networks            |
| `trading://strategies`             | Available trading strategies, parameters, and usage workflow |

### Prompts — guided agent workflows

| Prompt                | Description                                                                |
| --------------------- | -------------------------------------------------------------------------- |
| `wallet-setup`        | Walk through creating and funding a wallet                                 |
| `trading-strategy`    | Execute a buy/sell with pre-trade checks and post-trade verification       |
| `portfolio-rebalance` | Rebalance SOL across multiple wallets to target allocations                |
| `risk-assessment`     | Analyze wallet risk: policies, balances, recent failures                   |
| `daily-report`        | Full daily ops report: balances, tx counts, success rates, recommendations |
| `security-audit`      | Comprehensive security review: missing policies, anomalies, config gaps    |
| `x402-payment`        | Step-by-step guide for paying x402-protected HTTP resources                |
| `autonomous-trading`  | Turn the agent into a trading bot — multi-tick price→strategy→swap loop    |

---

## CLI Usage

The TUI is the human operator view — use it to monitor agent activity and manage wallet lifecycle.

```bash
pnpm cli          # launch TUI (dashboard → wallets → logs, navigate with Tab)
```

Direct commands (non-interactive):

```bash
# Wallet management
pnpm cli wallet create --label "my-agent"
pnpm cli wallet list
pnpm cli wallet balance <walletId>

# Transfers
pnpm cli send sol <walletId> <recipient> 0.5
pnpm cli send token <walletId> <recipient> <mint> 10 6

# Observability
pnpm cli status
pnpm cli logs
pnpm cli logs --wallet <walletId>
```

---

## Project Structure

```
agentic-wallet/
├── packages/
│   ├── wallet-core/               # Core SDK — published as @agentic-wallet/core
│   │   └── src/
│   │       ├── key-manager.ts          # AES-256-GCM encrypted keystore
│   │       ├── wallet-service.ts       # Sign, send, balance operations
│   │       ├── audit-logger.ts         # Append-only JSONL audit trail
│   │       ├── connection.ts           # Solana RPC wrapper
│   │       ├── config.ts               # Environment-based configuration
│   │       ├── service-factory.ts      # Dependency injection bootstrap
│   │       ├── guardrails/
│   │       │   ├── policy-engine.ts    # Spend caps, rate limits, allowlists
│   │       │   └── human-only.ts       # Compile-time human-only guard type
│   │       └── protocols/
│   │           ├── transaction-builder.ts  # SOL + SPL transfer construction
│   │           ├── spl-token.ts            # Mint + ATA management
│   │           ├── jupiter-service.ts      # Jupiter v6 DEX aggregator
│   │           ├── kora-service.ts         # Kora gasless paymaster relay
│   │           └── x402-client.ts          # x402 HTTP micropayment protocol
│   │
│   ├── mcp-server/                # MCP server — agent interface
│   │   └── src/
│   │       ├── index.ts                # Server bootstrap (stdio transport)
│   │       ├── services.ts             # Service wiring for tool handlers
│   │       ├── tools/                  # 16 agent-callable tools
│   │       ├── resources/              # 9 readable data resources
│   │       └── prompts/                # 8 guided workflow prompts
│   │
│   └── cli/                       # TUI — human operator view
│       └── src/
│           ├── index.tsx               # Entry point + navigation
│           ├── views/                  # Dashboard, Wallets, Logs
│           ├── components/             # Reusable Ink components
│           └── hooks/                  # useWallets, useLogs
│
├── skills/                        # Agent skill reference docs
│   ├── SKILL.md                        # Structured agent instructions
│   ├── references/                     # security, setup, transactions, wallets
│   └── scripts/                        # Executable scripts agents can run directly
│       ├── airdrop.sh                  # Request devnet SOL airdrop
│       ├── check-balance.sh            # Quick RPC balance check
│       ├── audit-summary.sh            # Audit log summary report
│       ├── tx-lookup.sh                # Transaction details by signature
│       └── health-check.sh             # All-wallet health scan
│
├── kora/                          # Kora paymaster node config (optional)
│   ├── kora.toml                       # Kora node configuration
│   ├── signers.toml                    # Kora signer keypair config
│   └── README.md                       # Kora setup guide & troubleshooting
│
├── DEEP-DIVE.md                   # Architecture + security deep dive
├── DEMO-PROMPTS.md                # 28 copy-paste demo prompts
├── SKILLS.md                      # Top-level agent skills index
├── Makefile                       # Build, dev, test, run shortcuts
└── README.md                      # This file
```

---

## x402 Payment Protocol Integration

The wallet integrates the x402 HTTP payment protocol for Solana — an open standard where a server returns `402 Payment Required`, the client pays on-chain and retries, the server verifies the transaction, and the resource is returned.

> **Note:** `https://x402.org/protected` is Coinbase's Base/EVM reference server — it is **not** compatible with Solana transactions. For a Solana-native x402 demo you need a local server (see setup below).

### Prerequisite — run a local Solana x402 server

```bash
git clone https://github.com/Woody4618/x402-solana-examples
cd x402-solana-examples && npm install
# Fund ./pay-in-usdc/client.json with devnet USDC
# (mint: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU — use https://faucet.circle.com/)
npm run usdc:server   # Terminal 1 — starts on http://localhost:3001
```

The wallet being used to pay must also hold devnet USDC at that mint.

### How it works

1. Agent calls `pay_x402` with a URL and wallet ID
2. The tool makes an HTTP `GET` request to the URL
3. If the server responds `402 Payment Required`, the tool:
   - Parses the `X-PAYMENT-REQUIRED` header **or** the JSON response body (native servers embed payment info in the body)
   - Selects a compatible Solana (`solana-devnet` / `solana-mainnet` / CAIP-2) payment option
   - Checks whether the recipient Associated Token Account exists; creates it if not
   - Builds a plain SPL `Transfer` instruction (opcode 3) — what native servers validate
   - Signs via `WalletService` (policy checks enforced)
   - Retries the request with the `X-Payment` header (base64-encoded JSON payload containing `serializedTransaction`)
4. The server verifies and submits the transaction on-chain
5. The resource content is returned to the agent

### Agent-callable tools

| Tool         | Description                                          |
| ------------ | ---------------------------------------------------- |
| `pay_x402`   | Pay for and retrieve an x402-protected HTTP resource |
| `probe_x402` | Check if a URL requires payment and discover pricing |

### Safety

- Payments go through the **PolicyEngine** — spend caps, rate limits, and cooldowns all apply
- A configurable **max payment amount** (default: 1 SOL) prevents overspending
- Every payment is logged to the **audit trail** (`x402:payment_signed`, `x402:payment_success`, etc.)
- The agent never handles raw private keys — signing is delegated to `WalletService`

### Example agent conversation

```
User: "Access the premium content at http://localhost:3001/premium"

Agent: Let me check if this requires payment...
       [calls probe_x402(url: "http://localhost:3001/premium")]

       This URL requires a payment of 0.0001 USDC via x402 on solana-devnet.
       I'll use wallet abc-123.
       [calls pay_x402(wallet_id: "abc-123", url: "http://localhost:3001/premium")]

       Here's the premium content: { data: "Premium content - USDC payment verified!" }
       Payment settled. Explorer: https://explorer.solana.com/tx/5vGk...?cluster=devnet
```

---

## Security Model

See [DEEP-DIVE.md](DEEP-DIVE.md) for the full explanation. Summary:

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

| Concern           | Approach                                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Key storage       | AES-256-GCM, PBKDF2 (210,000 iterations, SHA-512), random salt/IV per key                                               |
| Key in memory     | Unlocked only during signing, never written to disk in plaintext                                                        |
| Spend limits      | Per-tx cap, daily cap, enforced before signing in `PolicyEngine`                                                        |
| Rate limits       | Per-hour and per-day tx counts, configurable cooldown between txs                                                       |
| Program allowlist | Optionally restrict which on-chain programs a wallet may call                                                           |
| Audit trail       | Append-only JSONL, every operation logged regardless of success/failure                                                 |
| Human-only ops    | `closeWallet` requires `HumanOnlyOpts` — a compile-time type guard that prevents any MCP tool or script from calling it |
| Gasless relay     | Kora optional — if node is down, `WalletService` falls back to standard path automatically                              |
| MCP agents        | No tool exposes raw keypairs or passphrase; agents operate through policy-checked `WalletService` only                  |
| Bash scripts      | Read-only (balance, logs, tx lookup); `airdrop.sh` only requests devnet SOL — no signing, no key access                 |

---

## Environment Variables

| Variable                   | Default                         | Description                                                                                               |
| -------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `WALLET_PASSPHRASE`        | _(required)_                    | Encrypts all keystores on disk                                                                            |
| `SOLANA_RPC_URL`           | `https://api.devnet.solana.com` | RPC endpoint                                                                                              |
| `SOLANA_CLUSTER`           | `devnet`                        | `devnet` / `testnet` / `mainnet-beta`                                                                     |
| `OWNER_ADDRESS`            | _(optional)_                    | Receives swept SOL when a wallet is closed                                                                |
| `LOG_LEVEL`                | `info`                          | `debug` / `info` / `warn` / `error`                                                                       |
| `KORA_RPC_URL`             | _(optional)_                    | Kora paymaster URL — enables gasless txs; omit to use standard fee path                                   |
| `KORA_API_KEY`             | _(optional)_                    | API key for authenticated Kora nodes                                                                      |
| `MASTER_WALLET_KEY_LABEL`  | _(optional)_                    | Keystore label for master wallet — set after running `pnpm key:import`                                    |
| `MASTER_WALLET_SECRET_KEY` | _(optional, legacy)_            | Raw base58 key — used as fallback if `MASTER_WALLET_KEY_LABEL` not set                                    |
| `AGENT_SEED_SOL`           | `0.05`                          | SOL seeded to each new agent wallet from master wallet                                                    |
| `KORA_SIGNER_PRIVATE_KEY`  | _(optional)_                    | Path to `kora/kora-signer.json` (recommended) or raw base58 key. Required when running a local Kora node. |

---

## Secure Key Storage

Raw Solana base58 private keys should **not** live in `.env` on disk. This project ships a one-time import script that encrypts your operator keys into the same AES-256-GCM keystore used for all agent wallets — so the raw secret is never written to disk.

### Why bother?

| Storage method                         | Raw key on disk? | Encrypted at rest?     | Recommended   |
| -------------------------------------- | ---------------- | ---------------------- | ------------- |
| `MASTER_WALLET_SECRET_KEY=…` in `.env` | ✓ plaintext      | ✗                      | dev/test only |
| `pnpm key:import` → encrypted keystore | ✗                | ✓ AES-256-GCM + PBKDF2 | ✓             |

The keystore encryption uses `WALLET_PASSPHRASE`, which **is** fine to keep in `.env` because it is a passphrase, not a private key.

### One-time import

```bash
# 1. Add your raw key temporarily to .env
MASTER_WALLET_SECRET_KEY=<your-base58-key>

# 2. Run the import script (builds wallet-core first, then imports)
pnpm key:import

# 3. Follow the printed instructions:
#    - Remove MASTER_WALLET_SECRET_KEY from .env
#    - Add:  MASTER_WALLET_KEY_LABEL=master-funder
#    - Clear your shell history
```

Sample output:

```
Agentic Wallet — System Key Import

1. Master Funder Wallet (MASTER_WALLET_SECRET_KEY)
✔  Encrypted and stored as "master-funder"
   Keystore ID : 4a7f1c3e-…
   Public key  : 55czFRi1…
   Stored at   : ~/.agentic-wallet/keys/4a7f1c3e-….json

Done
✔  1 key(s) imported into the encrypted keystore.

Next steps — update your .env:
  # Remove this line:
  MASTER_WALLET_SECRET_KEY=<your-raw-key>

  # Add this line instead:
  MASTER_WALLET_KEY_LABEL=master-funder
```

### How it works at runtime

When `MASTER_WALLET_KEY_LABEL` is set, `service-factory.ts` calls `KeyManager.unlockByLabel(label)` at startup — the key is decrypted in memory using `WALLET_PASSPHRASE` and immediately used to construct the `MasterFunder` instance. The raw secret never touches disk or logs.

`MASTER_WALLET_SECRET_KEY` remains supported as a fallback (for CI, Docker secrets, or existing setups), but `MASTER_WALLET_KEY_LABEL` takes precedence when both are present.

---

## Development

```bash
make dev        # watch all packages in parallel
make test       # run vitest test suite
make rebuild    # clean + full build
make mcp        # build + run MCP server directly (for testing)
```

---

## License

MIT
