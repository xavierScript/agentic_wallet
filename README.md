# Solana Agentic Wallet

> **Autonomous AI agents with secure Solana wallets** — encrypted key management, policy-enforced transaction signing, and a full Model Context Protocol (MCP) server that any AI agent can connect to.

[![Solana](https://img.shields.io/badge/Solana-Devnet-14F195?style=flat-square&logo=solana)](https://solana.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?style=flat-square&logo=typescript)](https://typescriptlang.org)
[![MCP](https://img.shields.io/badge/MCP-1.12-purple?style=flat-square)](https://modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

---

## What is this?

A complete toolkit for running autonomous AI agents on Solana. Each agent gets its own AES-256-GCM encrypted wallet, operates within configurable safety guardrails (spend caps, rate limits, program allowlists), and every action is written to an immutable audit trail.

The primary agent interface is an **MCP server** — meaning any MCP-compatible AI (Claude Desktop, VS Code Copilot, Cursor, or any custom agent) can connect and immediately gain the ability to create wallets, sign transactions, execute Jupiter swaps, mint tokens, and more — without touching private keys directly.

A **TUI (terminal UI)** lets human operators observe all wallet state and audit logs in real time, and is the only place wallet closure can be initiated (a human-only operation by design).

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    AI Agent Layer                                  │
│   Claude Desktop │ VS Code Copilot │ Cursor │ Custom MCP Client  │
└──────────────────────────┬───────────────────────────────────────┘
                           │  Model Context Protocol (stdio)
┌──────────────────────────▼───────────────────────────────────────┐
│                    MCP Server  (@agentic-wallet/mcp-server)        │
│                                                                    │
│  Tools (16)              Resources (9)         Prompts (8)        │
│  ─────────────────────   ─────────────────     ───────────────    │
│  create_wallet           wallet://wallets       wallet-setup      │
│  list_wallets            wallet://wallets/{id}  trading-strategy  │
│  get_balance             wallet://…/policy      portfolio-        │
│  send_sol                wallet://audit-logs      rebalance       │
│  send_token              wallet://…/audit-logs  autonomous-       │
│  swap_tokens             wallet://system/status   trading ← NEW  │
│  write_memo              wallet://system/config risk-assessment   │
│  create_token_mint       wallet://x402/config   daily-report      │
│  mint_tokens             trading://strategies   security-audit    │
│  get_audit_logs            ← NEW                x402-payment      │
│  get_status                                                        │
│  get_policy                                                        │
│  pay_x402                                                          │
│  probe_x402                                                        │
│  fetch_prices ← NEW                                                │
│  evaluate_strategy ← NEW                                           │
│                                                                    │
│  ✗ close_wallet — human-only, CLI only                            │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│               Wallet Core  (@agentic-wallet/core)                  │
│                                                                    │
│  KeyManager          AES-256-GCM encrypted keystores on disk      │
│  WalletService       Sign & send (legacy + versioned txs)         │
│  PolicyEngine        Spend caps, rate limits, program allowlists  │
│  AuditLogger         Append-only JSONL audit trail                │
│  TransactionBuilder  SOL + SPL token transfer construction        │
│  SplTokenService     Mint creation, token account management      │
│  JupiterService      DEX aggregator — quote + swap                │
│  X402Client          x402 HTTP payment protocol client            │
│  SolanaConnection    RPC wrapper with blockhash caching           │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│               Solana Blockchain (devnet by default)                │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│          CLI / TUI  (@agentic-wallet/cli)  — human operator       │
│  Dashboard │ Wallet list │ Logs view │ Close wallet (human-only)  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

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
MASTER_WALLET_SECRET_KEY=<base58-secret-key>
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
      "args": ["<absolute-path-to-repo>/packages/mcp-server/dist/index.js"],
      "env": {
        "WALLET_PASSPHRASE": "your-strong-passphrase-here",
        "SOLANA_CLUSTER": "devnet"
      }
    }
  }
}
```

Restart Claude Desktop. The wallet tools will appear in the tool list.

### VS Code (GitHub Copilot / MCP extension)

Add to `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "agentic-wallet": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/packages/mcp-server/dist/index.js"],
      "env": {
        "WALLET_PASSPHRASE": "your-strong-passphrase-here",
        "SOLANA_CLUSTER": "devnet"
      }
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

## MCP Capabilities

### Tools — agent-callable actions

| Tool                | Description                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------- | --- | -------------- | ------------------------------------------------------------------------------------------ |
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
| `probe_x402`        | Check if a URL requires x402 payment and discover pricing — no funds spent                        |     | `fetch_prices` | Fetch real-time USD prices from Jupiter Price API v2 (SOL, USDC, USDT, BONK, JUP, or mint) |
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
│   └── references/                     # security, setup, transactions, wallets
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

The wallet integrates [x402](https://github.com/coinbase/x402) — Coinbase's open standard for HTTP-native payments. This lets AI agents **autonomously pay for x402-protected APIs** using their managed Solana wallets.

### How it works

1. Agent calls `pay_x402` with a URL and wallet ID
2. The tool makes an HTTP request to the URL
3. If the server responds `402 Payment Required`, the tool:
   - Parses the `PAYMENT-REQUIRED` header
   - Selects a compatible Solana (SVM) payment option
   - Builds a `TransferChecked` transaction per the x402 exact scheme
   - Signs via `WalletService` (policy checks enforced)
   - Retries the request with the `PAYMENT-SIGNATURE` header
4. The facilitator verifies and settles the payment on-chain
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
User: "Access the weather data at https://api.example.com/weather"

Agent: Let me check if this requires payment...
       [calls probe_x402(url: "https://api.example.com/weather")]

       This URL requires a payment of 0.001 SOL via x402.
       I'll use wallet abc-123 which has 1.5 SOL.
       [calls pay_x402(wallet_id: "abc-123", url: "https://api.example.com/weather")]

       Here's the weather data: { temp: 72, conditions: "sunny" }
       Payment of 0.001 SOL settled. Tx: 5vGk...
```

---

## Security Model

See [DEEP-DIVE.md](DEEP-DIVE.md) for the full explanation. Summary:

| Concern           | Approach                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| Key storage       | AES-256-GCM, PBKDF2 (210,000 iterations, SHA-512), random salt/IV per key                                     |
| Key in memory     | Unlocked only during signing, never written to disk in plaintext                                              |
| Spend limits      | Per-tx cap, daily cap, enforced before signing in `PolicyEngine`                                              |
| Rate limits       | Per-hour and per-day tx counts, configurable cooldown between txs                                             |
| Program allowlist | Optionally restrict which on-chain programs a wallet may call                                                 |
| Audit trail       | Append-only JSONL, every operation logged regardless of success/failure                                       |
| Human-only ops    | `closeWallet` requires `HumanOnlyOpts` — a compile-time type guard that prevents any MCP tool from calling it |
| Gasless relay     | Kora optional — if node is down, `WalletService` falls back to standard path automatically                    |
| MCP agents        | No tool exposes raw keypairs or passphrase; agents operate through policy-checked `WalletService` only        |

---

## Environment Variables

| Variable                   | Default                         | Description                                                             |
| -------------------------- | ------------------------------- | ----------------------------------------------------------------------- |
| `WALLET_PASSPHRASE`        | _(required)_                    | Encrypts all keystores on disk                                          |
| `SOLANA_RPC_URL`           | `https://api.devnet.solana.com` | RPC endpoint                                                            |
| `SOLANA_CLUSTER`           | `devnet`                        | `devnet` / `testnet` / `mainnet-beta`                                   |
| `OWNER_ADDRESS`            | _(optional)_                    | Receives swept SOL when a wallet is closed                              |
| `LOG_LEVEL`                | `info`                          | `debug` / `info` / `warn` / `error`                                     |
| `KORA_RPC_URL`             | _(optional)_                    | Kora paymaster URL — enables gasless txs; omit to use standard fee path |
| `KORA_API_KEY`             | _(optional)_                    | API key for authenticated Kora nodes                                    |
| `MASTER_WALLET_SECRET_KEY` | _(optional)_                    | Base58 secret key — auto-funds new agent wallets on creation            |
| `AGENT_SEED_SOL`           | `0.05`                          | SOL seeded to each new agent wallet from master wallet                  |

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
