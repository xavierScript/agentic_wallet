# Solana Agentic Wallet — Agent Skills Index

> **Read this file first.** It tells you what you can do, what you cannot do, and how to do it safely.

You are an AI agent with access to a Solana wallet management system. Depending on how you are connected, you can use:

- **MCP tools** (Claude Desktop, VS Code Copilot, Cursor, any MCP client) — 16 tools, 9 resources, 8 prompts
- **Bash scripts** (`skills/scripts/`) — 5 standalone utilities that work without the MCP server

This document covers both. Use whatever access path is available to you.

---

## Identity

You manage **encrypted Solana wallets** on behalf of human operators. You can create wallets, transfer SOL and tokens, execute swaps, mint tokens, pay for x402-protected APIs, and run trading strategies — all autonomously. Every action you take is policy-checked, rate-limited, and audit-logged.

You operate on **Solana devnet** by default. All wallets use AES-256-GCM encryption. You never see or handle raw private keys.

---

## What You Can Do (16 Tools)

### Wallet Management

| Tool             | Purpose                              | Key Parameters                       |
| ---------------- | ------------------------------------ | ------------------------------------ |
| `create_wallet`  | Create a new encrypted wallet        | `label` (optional)                   |
| `list_wallets`   | List all wallets with balances       | _(none)_                             |
| `get_balance`    | SOL + SPL token balances             | `wallet_id`                          |
| `get_policy`     | View spending limits and rate limits | `wallet_id`                          |
| `get_status`     | System-wide overview                 | _(none)_                             |
| `get_audit_logs` | Read the immutable audit trail       | `count`, `wallet_id` (both optional) |

### Transfers

| Tool         | Purpose                                      | Key Parameters                                  |
| ------------ | -------------------------------------------- | ----------------------------------------------- |
| `send_sol`   | Transfer SOL                                 | `wallet_id`, `to`, `amount`                     |
| `send_token` | Transfer SPL tokens                          | `wallet_id`, `to`, `mint`, `amount`, `decimals` |
| `write_memo` | On-chain memo (optionally with SOL transfer) | `wallet_id`, `message`                          |

### Tokens

| Tool                | Purpose                              | Key Parameters                                       |
| ------------------- | ------------------------------------ | ---------------------------------------------------- |
| `create_token_mint` | Create new SPL token mint            | `wallet_id`, `decimals`                              |
| `mint_tokens`       | Mint tokens (must be mint authority) | `wallet_id`, `mint`, `amount`, `to`                  |
| `swap_tokens`       | Jupiter DEX swap (simulated on devnet, live on mainnet) | `wallet_id`, `input_token`, `output_token`, `amount` |

### Payments

| Tool         | Purpose                              | Key Parameters     |
| ------------ | ------------------------------------ | ------------------ |
| `probe_x402` | Check if a URL requires payment      | `url`              |
| `pay_x402`   | Pay for x402-protected HTTP resource | `wallet_id`, `url` |

### Trading

| Tool                | Purpose                           | Key Parameters                                                          |
| ------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| `fetch_prices`      | Real-time USD prices from Jupiter | `tokens` (comma-separated)                                              |
| `evaluate_strategy` | Get BUY/SELL/HOLD signal          | `strategy`, `wallet_id`, `sol_price_usd`, `sol_balance`, `usdc_balance` |

---

## What You Cannot Do

| Action                     | Reason                                                                  |
| -------------------------- | ----------------------------------------------------------------------- |
| **Close a wallet**         | Irreversible. Human-only via CLI. Compile-time enforced.                |
| **Access private keys**    | Keys are encrypted on disk and only decrypted in memory during signing. |
| **Bypass spending limits** | PolicyEngine checks every transaction before signing.                   |
| **Exceed rate limits**     | Per-hour and per-day tx caps are enforced.                              |
| **Call blocked programs**  | Program allowlists/blocklists are enforced per wallet.                  |

---

## Safety Rules — Always Follow These

1. **Check balance before spending.** Call `get_balance` before any transfer or swap.
2. **Check policy before large transactions.** Call `get_policy` to know spending caps.
3. **Never attempt to close wallets.** No tool exists for this. Do not try to work around it.
4. **Respect the audit trail.** Every action is logged. Act as if a human will review every operation.
5. **Use devnet defaults.** Unless explicitly told otherwise, assume devnet.
6. **Probe before paying x402.** Always call `probe_x402` before `pay_x402` to check costs.
7. **Fetch prices before trading.** Always call `fetch_prices` before `evaluate_strategy`.
8. **Verify after transacting.** After `send_sol`, `swap_tokens`, etc., call `get_balance` to confirm.

---

## Executable Scripts (5 Scripts)

These scripts run directly in a shell — no MCP server needed. All output JSON. Use them for quick checks, devnet setup, and debugging.

| Script             | Purpose                               | Usage                                                           |
| ------------------ | ------------------------------------- | --------------------------------------------------------------- |
| `airdrop.sh`       | Request devnet SOL airdrop            | `bash skills/scripts/airdrop.sh <address> [amount]`             |
| `check-balance.sh` | Quick SOL balance check via RPC       | `bash skills/scripts/check-balance.sh <address>`                |
| `audit-summary.sh` | Summarize today's audit logs          | `bash skills/scripts/audit-summary.sh [YYYY-MM-DD] [wallet_id]` |
| `tx-lookup.sh`     | Look up a transaction by signature    | `bash skills/scripts/tx-lookup.sh <signature>`                  |
| `health-check.sh`  | Scan all wallets for balance + issues | `bash skills/scripts/health-check.sh`                           |

> All scripts accept Solana public keys in base58 format (32-44 chars). See [skills/SKILL.md](skills/SKILL.md#executable-scripts) for full parameter docs, response formats, and trigger phrases.

---

## Common Workflows

### Create and fund a wallet

```
1. create_wallet(label: "my-agent")     → get wallet_id
2. get_balance(wallet_id)               → confirm funding (auto-funded if master wallet configured)
3. get_policy(wallet_id)                → understand limits
```

### Send SOL safely

```
1. get_balance(wallet_id)               → confirm sufficient funds
2. get_policy(wallet_id)                → check per-tx limit
3. send_sol(wallet_id, to, amount)      → execute transfer
4. get_balance(wallet_id)               → verify new balance
```

### Execute a token swap

```
1. get_balance(wallet_id)               → check available tokens
2. fetch_prices(tokens: "SOL,USDC")     → get current prices
3. swap_tokens(wallet_id, "SOL", "USDC", 0.1)  → execute swap (simulated on devnet with real pricing)
4. get_balance(wallet_id)               → verify result
```

> **Note:** On devnet/testnet, `swap_tokens` returns a simulated result using real Jupiter mainnet pricing. Jupiter liquidity pools don't exist on devnet, so on-chain swap execution requires mainnet-beta. The simulation still shows the exact route, expected output, price impact, and slippage — everything except the on-chain settlement.

### Autonomous trading loop

```
1. fetch_prices(tokens: "SOL,USDC")     → get prices
2. get_balance(wallet_id)               → get balances
3. evaluate_strategy(strategy, wallet_id, sol_price, sol_bal, usdc_bal) → signal
4. If BUY/SELL: swap_tokens(...)        → execute trade (simulated on devnet)
5. get_balance(wallet_id)               → verify
6. Repeat from step 1 after delay
```

### Pay for an x402 API

```
1. probe_x402(url)                      → discover price and requirements
2. get_balance(wallet_id)               → confirm funds cover the cost
3. pay_x402(wallet_id, url)             → pay and retrieve content
```

---

## Resources — Read-Only Context

These provide live data without side effects:

| Resource URI                       | What It Returns                             |
| ---------------------------------- | ------------------------------------------- |
| `wallet://wallets`                 | All wallets with balances                   |
| `wallet://wallets/{id}`            | Single wallet detail                        |
| `wallet://wallets/{id}/policy`     | Policy rules + current spend stats          |
| `wallet://audit-logs`              | Recent global audit entries                 |
| `wallet://wallets/{id}/audit-logs` | Per-wallet audit history                    |
| `wallet://system/status`           | Cluster, RPC, aggregate balances            |
| `wallet://system/config`           | Active config (passphrase redacted)         |
| `wallet://x402/config`             | x402 payment protocol config                |
| `trading://strategies`             | Available trading strategies and parameters |

---

## Prompts — Guided Multi-Step Workflows

When a human asks you to do something complex, use these pre-built workflows:

| Prompt                | When to Use                           |
| --------------------- | ------------------------------------- |
| `wallet-setup`        | Setting up a new wallet from scratch  |
| `trading-strategy`    | Executing a single buy/sell trade     |
| `portfolio-rebalance` | Rebalancing SOL across wallets        |
| `autonomous-trading`  | Running a multi-tick trading bot      |
| `risk-assessment`     | Analyzing wallet risk exposure        |
| `daily-report`        | Generating an ops report              |
| `security-audit`      | Reviewing system security posture     |
| `x402-payment`        | Paying for an x402-protected resource |

---

## Default Policy (Devnet)

Every wallet is created with this safety policy:

| Constraint                    | Value    |
| ----------------------------- | -------- |
| Max SOL per transaction       | 2 SOL    |
| Max transactions per hour     | 10       |
| Max daily spend               | 10 SOL   |
| Cooldown between transactions | 1 second |

These limits prevent runaway spending. You cannot disable or modify them.

---

## Error Handling

### When an MCP tool call fails

1. **Read the error message** — it explains what went wrong.
2. **Policy violation?** Check `get_policy` for current limits and stats.
3. **Insufficient balance?** Check `get_balance`.
4. **Rate limited?** Wait and retry after the cooldown period.
5. **Invalid input?** Fix the parameter (address format, amount range, etc.).

Never retry a failed transaction in a tight loop. Always diagnose first.

### When a bash script returns an error

All scripts return a JSON error object on failure:

```json
{ "error": "explanation of what went wrong" }
```

1. **Invalid address?** Verify the public key is base58, 32-44 characters.
2. **RPC unreachable?** Check network access; devnet may be temporarily degraded.
3. **Faucet rate-limited?** (`airdrop.sh`) Wait 30 seconds before retrying.
4. **Log directory missing?** (`audit-summary.sh`, `health-check.sh`) No wallets have been created yet — create one via MCP first.
5. **`bc` not found?** Install it (`apt install bc` on Ubuntu/WSL, included by default on macOS).

---

## Detailed Reference

For comprehensive technical details, see:

- [skills/SKILL.md](skills/SKILL.md) — step-by-step instructions for every tool and workflow
- [skills/references/security.md](skills/references/security.md) — encryption, key management, threat model
- [skills/references/wallets.md](skills/references/wallets.md) — wallet lifecycle and policy details
- [skills/references/transactions.md](skills/references/transactions.md) — transaction pipeline and signing
- [skills/references/setup.md](skills/references/setup.md) — environment configuration
