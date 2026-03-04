# Setup Reference

> Environment configuration, prerequisites, and connection options for the Agentic Wallet system.

---

## Prerequisites

### For the MCP Server and CLI

| Requirement | Version    | Purpose                  |
| ----------- | ---------- | ------------------------ |
| Node.js     | 18+        | Runtime                  |
| pnpm        | 8+         | Package manager          |
| Solana CLI  | (optional) | Airdrops, key inspection |

### For the Bash Scripts (`skills/scripts/`)

| Requirement | Notes                                                |
| ----------- | ---------------------------------------------------- |
| `bash`      | Any modern version. On Windows, use WSL or Git Bash. |
| `curl`      | For RPC calls and API requests                       |
| `bc`        | For lamport ↔ SOL arithmetic                         |

No Node.js or pnpm needed to run the scripts — they call the Solana RPC directly.

---

## Environment Variables

Set these in the root `.env` file:

### Required

| Variable            | Description                                                                    |
| ------------------- | ------------------------------------------------------------------------------ |
| `WALLET_PASSPHRASE` | Encrypts all private keys. Min 12 characters. Use a strong, unique passphrase. |

### Optional (with defaults)

| Variable         | Default                         | Description                                              |
| ---------------- | ------------------------------- | -------------------------------------------------------- |
| `SOLANA_RPC_URL` | `https://api.devnet.solana.com` | Solana RPC endpoint                                      |
| `SOLANA_CLUSTER` | `devnet`                        | Cluster: `devnet`, `testnet`, or `mainnet-beta`          |
| `LOG_LEVEL`      | `info`                          | Logging: `debug`, `info`, `warn`, `error`                |
| `AGENT_SEED_SOL` | `0.05`                          | SOL to auto-fund new wallets (when master wallet is set) |

### Optional (no default)

| Variable                   | Description                                                  |
| -------------------------- | ------------------------------------------------------------ |
| `OWNER_ADDRESS`            | Receives swept SOL when a wallet is closed                   |
| `MASTER_WALLET_SECRET_KEY` | Base58 secret key — auto-funds new agent wallets on creation |
| `KORA_RPC_URL`             | Kora gasless relay URL (e.g., `http://localhost:8080`)       |
| `KORA_API_KEY`             | API key for Kora (if the node requires auth)                 |

---

## Build

```bash
pnpm install
pnpm build          # builds: wallet-core → cli → mcp-server
```

Or with Make:

```bash
make install
make build
```

---

## Running the MCP Server

The MCP server communicates over **stdio** (stdin/stdout). It is started by an MCP client, not manually.

### Claude Desktop

Config location:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "agentic-wallet": {
      "command": "node",
      "args": ["<absolute-path>/packages/mcp-server/dist/index.js"],
      "env": {
        "WALLET_PASSPHRASE": "your-strong-passphrase-here",
        "SOLANA_CLUSTER": "devnet"
      }
    }
  }
}
```

### VS Code (Copilot / MCP extension)

Add `.vscode/mcp.json` to your workspace:

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

### Cursor / Other MCP Clients

Same `command` + `args` pattern. No network port needed.

---

## Running the TUI (CLI)

The TUI is for human operators — it shows live wallet state and is the only place to close wallets.

```bash
pnpm cli                    # interactive TUI
pnpm cli wallet list        # non-interactive: list wallets
pnpm cli wallet balance ID  # non-interactive: check balance
pnpm cli status             # non-interactive: system status
pnpm cli logs               # non-interactive: recent audit logs
```

---

## Data Directories

| Directory                                  | Purpose                                   |
| ------------------------------------------ | ----------------------------------------- |
| `~/.agentic-wallet/keys/`                  | Encrypted keystore files (one per wallet) |
| `~/.agentic-wallet/logs/`                  | Audit log files (JSONL, one per day)      |
| `~/.agentic-wallet/keys/policy-state.json` | Policy engine state (rate limit counters) |

On Windows, `~` = `%USERPROFILE%` (e.g., `C:\Users\YourName`).

---

## Kora Gasless Setup (Optional)

Kora is a Solana paymaster relay. When configured, agent wallets don't pay network fees.

1. Set up a Kora node (see `kora/README.md`)
2. Set `KORA_RPC_URL=http://localhost:8080` in `.env`
3. Optionally set `KORA_API_KEY` if the node requires authentication
4. Rebuild: `pnpm build`

If Kora is unavailable at runtime, the system automatically falls back to standard fee payment.

---

## x402 Local Server Setup (for prompts 15 & 16)

The `https://x402.org/protected` endpoint runs on Base (EVM) and is not compatible with Solana transactions. To demo the x402 payment tools you need a local Solana x402 server:

```bash
git clone https://github.com/Woody4618/x402-solana-examples
cd x402-solana-examples && npm install
```

**Fund a payer keypair with devnet USDC:**

1. Generate or reuse a keypair and save it as `./pay-in-usdc/client.json` (array of bytes)
2. Get devnet USDC (mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`) from <https://faucet.circle.com/>
3. The agent wallet paying through the MCP server also needs devnet USDC at that same mint

**Start the server:**

```bash
npm run usdc:server   # Terminal 1 — starts on http://localhost:3001
```

**Demo prompts (send to your MCP agent):**

Probe (no payment):

```
Check whether http://localhost:3001/premium requires x402 payment. If a payment
is required, report the price, accepted payment token, and target network.
Do not submit any payment at this stage.
```

Pay and retrieve:

```
Access http://localhost:3001/premium using wallet [WALLET_ID]. Handle the full
x402 payment flow autonomously — discover the price, execute the payment,
and return the resource content along with the payment transaction signature.
```

---

## Verification

### MCP path

1. Connect your MCP client to the server
2. Ask the agent: _"Read the wallet system status and tell me how many wallets exist."_
3. The agent should call `wallet://system/status` and return live data
4. If no wallets exist yet, ask: _"Create a new wallet labeled 'test-agent' and show me its balance."_

### Bash script path (no MCP client needed)

```bash
# Check the overall system state (requires wallets to have been created first)
bash skills/scripts/health-check.sh

# Request devnet SOL for a public key shown after create_wallet
bash skills/scripts/airdrop.sh <public-key> 1

# Confirm the airdrop arrived
bash skills/scripts/check-balance.sh <public-key>
```

All scripts output JSON. A successful `health-check.sh` confirms the wallet directory exists and RPC is reachable.
