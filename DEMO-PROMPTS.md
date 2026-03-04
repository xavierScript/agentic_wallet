# Agentic Wallet — Capability Demo Prompts

This document provides a complete set of prompts that demonstrate every capability of the Agentic Wallet system. Each prompt can be sent directly to any MCP-compatible AI agent (Claude Desktop, VS Code Copilot, Cursor, etc.) once the MCP server is connected.

The prompts are **copy-paste ready**. Replace `[WALLET_ID]`, `[RECIPIENT_ADDRESS]`, and `[MINT_ADDRESS]` with values returned by earlier steps — a wallet ID from prompt 2 carries through to all subsequent prompts.

---

## What This System Does

The Agentic Wallet is an MCP server that gives AI agents the ability to:

- Create and manage custodial Solana wallets with AES-256-GCM encrypted key storage
- Execute on-chain actions: SOL transfers, SPL token transfers, token swap pricing via Jupiter, on-chain memos
- **Gasless transactions via Kora** — agent wallets never need SOL for gas; a Kora paymaster node sponsors all network fees
- Create and mint custom SPL tokens
- Pay for HTTP resources protected by the [x402 payment protocol](https://x402.org)
- Enforce per-wallet spending policies and rate limits — agents are blocked, not just warned, when limits are exceeded
- Evaluate trading strategies (threshold-rebalance, SMA-crossover) and autonomously execute multi-tick trading loops
- Maintain a tamper-evident JSONL audit log of every action taken

Everything is exposed as standard MCP tools, resources, and prompts — no custom integration code required.

---

## Prerequisites

1. Complete the setup in [`skills/references/setup.md`](skills/references/setup.md)
2. Ensure `.env` contains `WALLET_PASSPHRASE`, `SOLANA_RPC_URL`, and `MASTER_WALLET_SECRET_KEY`
3. **For gasless demos (prompts 26–28):** start a local Kora node — see [`kora/README.md`](kora/README.md) for setup. Set `KORA_RPC_URL=http://localhost:8080` in `.env`
4. Run `pnpm build` and connect the MCP server to an AI agent client
5. The server targets **Solana devnet** by default — no real funds are at risk

---

## Recommended Demo Sequence

**1 → 2 → 5 → 7 → 13 → 20 → 21**

This sequence tells a complete story:
_System online → agent wallet created and auto-funded → policy inspected → agent blocked by guardrail → audit trail reviewed → security audit run → operator report generated_

**Gasless extension: 1 → 2 → 26 → 27 → 28 → 13**

_System online → wallet created → gasless SOL transfer via Kora → gasless memo → audit trail confirms Kora fee payer_

---

## 1. System Health Check

> **Demonstrates:** MCP resource layer (`system://status`, `system://config`), live cluster detection, master wallet configuration status.

```
Check the current system status of the Agentic Wallet MCP server and report:
- Which Solana cluster is active
- Whether a master funding wallet is configured and its public key
- How many agent wallets are currently registered
- The full system configuration
```

---

## 2. Create a Funded Agent Wallet

> **Demonstrates:** `create_wallet` tool, automatic SOL funding from the master wallet, devnet spending policy attached at creation time, Solana Explorer link for the funding transaction.

```
Create a new agent wallet with the label "demo-agent" and report:
- The wallet ID (UUID) and public key
- Whether the wallet was automatically funded from the master wallet and how much SOL it received
- The Solana Explorer link for the funding transaction
- Confirmation that a spending policy was attached at creation
```

---

## 3. List All Managed Wallets

> **Demonstrates:** `list_wallets` tool and `wallet://all-wallets` MCP resource, multi-wallet management overview.

```
List all wallets currently managed by this system. For each wallet, display
its ID, label, public key, current SOL balance, and creation date.
```

---

## 4. Inspect a Wallet Balance

> **Demonstrates:** `get_balance` tool, SOL balance and full SPL token holdings returned in a single call.

```
Retrieve the full balance breakdown for wallet [WALLET_ID]. Include the SOL
balance and every SPL token the wallet holds, with mint addresses and
human-readable amounts.
```

---

## 5. Inspect Wallet Policy and Usage

> **Demonstrates:** `wallet://detail` and `wallet://policy` MCP resources, policy parameter visibility, real-time usage counters.

```
Read the full details and active spending policy for wallet [WALLET_ID] and display:
- The per-transaction SOL limit
- The hourly transaction rate limit
- The daily SOL spending cap
- How many of today's transaction and SOL allowances have already been consumed
```

---

## 6. Send SOL

> **Demonstrates:** `send_sol` tool, policy check before signing, audit log entry written, on-chain transaction confirmed.

```
Send 0.01 SOL from wallet [WALLET_ID] to address [RECIPIENT_ADDRESS].
Return the transaction signature and Solana Explorer link for verification.
```

---

## 7. Guardrail Enforcement — Agent Blocked by Policy

> **Demonstrates:** The policy engine actively _blocking_ a transaction before it is signed or broadcast. The agent cannot override this constraint.

```
Attempt to send 5 SOL from wallet [WALLET_ID] to address [RECIPIENT_ADDRESS].
The wallet's policy enforces a 2 SOL per-transaction limit. Demonstrate whether
the transaction is blocked before it reaches the network and what error is returned.
```

---

## 8. Write an On-Chain Memo

> **Demonstrates:** `write_memo` tool, SPL Memo Program integration, permanent on-chain provenance for agent-initiated actions.

```
Write the following memo on-chain using wallet [WALLET_ID]:

"Agentic Wallet — autonomous on-chain action verified"

Return the transaction signature and Solana Explorer link.
```

---

## 9. Create an SPL Token Mint

> **Demonstrates:** `create_token_mint` tool, agent-controlled mint authority, start of the SPL token lifecycle.

```
Using wallet [WALLET_ID], create a new SPL token mint with 9 decimal places.
The wallet should be set as the mint authority. Return the mint address.
```

---

## 10. Mint Tokens

> **Demonstrates:** `mint_tokens` tool, token supply issuance into a wallet, balance verification after minting.

```
Mint 1,000,000 tokens from mint [MINT_ADDRESS] into wallet [WALLET_ID].
Retrieve the updated balance afterward and confirm the tokens were received.
```

---

## 11. Transfer SPL Tokens

> **Demonstrates:** `send_token` tool, SPL token transfer, associated token account creation if the recipient does not yet have one.

```
Transfer 100 tokens of mint [MINT_ADDRESS] from wallet [WALLET_ID] to
address [RECIPIENT_ADDRESS], using 9 decimals. Return the transaction signature.
```

---

## 12. Swap Tokens via Jupiter

> **Demonstrates:** `swap_tokens` tool, Jupiter DEX aggregator for best-route discovery, real mainnet pricing, slippage control, policy enforcement. On devnet, returns a simulated swap with accurate pricing (on-chain execution requires mainnet-beta).

```
Using wallet [WALLET_ID], swap 0.001 SOL to USDC via Jupiter aggregator
with 50 basis points of slippage tolerance. Report:
- The best route identified
- The expected USDC output amount
- Whether the swap was simulated (devnet) or executed on-chain (mainnet)
- The price impact percentage
```

---

## 13. Global Audit Log

> **Demonstrates:** `get_audit_logs` tool and `audit://logs` MCP resource, append-only JSONL audit trail spanning all wallets.

```
Retrieve the 20 most recent entries from the global audit log. For each entry,
display the timestamp, action type, wallet ID, and outcome (success or failure).
Highlight any policy violations or blocked transactions.
```

---

## 14. Per-Wallet Audit History

> **Demonstrates:** `audit://wallet-logs` MCP resource, scoped audit trail showing a single wallet's complete history.

```
Read the full audit history for wallet [WALLET_ID]. List every action it has
taken — SOL transfers, policy checks, failed or blocked attempts, and the
initial auto-funding event from the master wallet.
```

---

## 15. Probe an x402 Resource

> **Demonstrates:** `probe_x402` tool, payment-free cost discovery — an agent can inspect pricing before committing any funds.

```
Check whether https://x402.org/protected requires x402 payment. If a payment
is required, report the price, accepted payment token, and target network.
Do not submit any payment at this stage.
```

---

## 16. Autonomous x402 Payment

> **Demonstrates:** `pay_x402` tool — the complete autonomous payment loop: HTTP 402 received → payment requirements parsed → Solana transaction signed and sent → request retried with proof → resource content returned to the agent.

```
Access https://x402.org/protected using wallet [WALLET_ID]. Handle the full
x402 payment flow autonomously — discover the price, execute the payment,
and return the resource content along with the payment transaction signature.
```

---

## 17. Guided Setup Workflow (MCP Prompt)

> **Demonstrates:** `wallet_setup` built-in MCP prompt — a multi-step guided workflow taking an agent from zero to a funded, policy-protected, transaction-ready wallet.

```
Use the wallet_setup prompt to walk through a complete setup of a new AI
trading agent wallet. The walkthrough should: create the wallet, confirm it
was auto-funded, verify the spending policy is in place, and execute a small
test transaction to prove the full stack is functional end to end.
```

---

## 18. Autonomous Trading Strategy (MCP Prompt)

> **Demonstrates:** `trading_strategy` MCP prompt — an agent reasoning over on-chain balances and executing a strategy within its policy constraints.

```
Using wallet [WALLET_ID] and the trading_strategy prompt, propose and execute
a strategy that maintains an 80% SOL and 20% USDC allocation as a stable
reserve. The agent should explain its reasoning, check current holdings,
and execute the required swap (simulated on devnet with real pricing).
```

---

## 19. Portfolio Rebalance (MCP Prompt)

> **Demonstrates:** `portfolio_rebalance` MCP prompt — multi-step autonomous rebalancing with balance inspection and swap execution.

```
Using wallet [WALLET_ID] and the portfolio_rebalance prompt, rebalance the
portfolio to a 70% SOL / 30% USDC target allocation. The agent should inspect
the current balances, calculate the required trade, and execute it.
```

---

## 20. Security Audit (MCP Prompt)

> **Demonstrates:** `security_audit` MCP prompt — a compliance-style review of all wallets, audit logs, and transaction patterns.

```
Run a full security audit of this Agentic Wallet deployment using the
security_audit prompt. The audit should cover:
- Policy violations recorded in the audit logs
- Wallets exhibiting unusual transaction patterns
- A summary of blocked or failed transactions and their causes
- An overall security posture assessment
```

---

## 21. Daily Operations Report (MCP Prompt)

> **Demonstrates:** `daily_report` MCP prompt — an aggregated, operator-facing summary of all agent activity across all wallets.

```
Generate a full daily operations report using the daily_report prompt. Include:
- Total transactions executed
- Total SOL moved across all wallets
- Number of policy violations caught and blocked
- Most active wallets by transaction count
- Any anomalies or events that warrant human operator review
```

---

## 22. Risk Assessment (MCP Prompt)

> **Demonstrates:** `risk_assessment` MCP prompt — wallet-level exposure analysis and policy headroom calculation.

```
Run a risk assessment on wallet [WALLET_ID] using the risk_assessment prompt.
Evaluate the current balance against the active policy limits, calculate
remaining daily and per-transaction headroom, and recommend whether the wallet
requires refunding or a policy adjustment before continuing operations.
```

---

## 23. Fetch Live Token Prices

> **Demonstrates:** `fetch_prices` MCP tool — real-time Jupiter Price API v2 integration, well-known token resolution.

```
Fetch the current USD prices for SOL, USDC, USDT, BONK, and JUP using the
fetch_prices tool. Report each token's price and the data source.
```

---

## 24. Evaluate a Trading Strategy

> **Demonstrates:** `evaluate_strategy` MCP tool — strategy evaluation with threshold-rebalance or sma-crossover, signal generation.

```
First fetch prices for SOL and USDC, then check the balance of wallet
[WALLET_ID]. Use the evaluate_strategy tool with the threshold-rebalance
strategy (target_allocation 0.7, drift_threshold 0.05) and report the
resulting signal — should the wallet BUY, SELL, or HOLD? What trade
would bring the portfolio back to target?
```

---

## 25. Autonomous Trading Loop

> **Demonstrates:** `autonomous-trading` MCP prompt — multi-tick trading loop where the AI agent acts as an autonomous trading bot.

```
Using the autonomous-trading prompt, run a 5-tick trading bot on wallet
[WALLET_ID] with the threshold-rebalance strategy (target_allocation 0.7,
drift_threshold 0.05). Each tick should: fetch prices, check balances,
evaluate the strategy, and execute any recommended swap (simulated on devnet). Report a summary
table at the end showing each tick's price, signal, and action taken.
```

---

## 26. Gasless SOL Transfer via Kora

> **Demonstrates:** Kora paymaster integration — all five legacy transaction tools (`send_sol`, `send_token`, `write_memo`, `create_token_mint`, `mint_tokens`) are routed through Kora's `signAndSendTransaction` RPC so the agent wallet pays zero gas. The audit log records `gasless: true, feePayer: "kora"`. (Jupiter swaps use `VersionedTransaction` where Jupiter bakes the fee payer into the compiled message — Kora covers legacy transactions only.)

```
Send 0.005 SOL from wallet [WALLET_ID] to address [RECIPIENT_ADDRESS].
This transfer should be gasless — the Kora paymaster node should pay the
network fee, not the agent wallet. Confirm the transaction landed and
report:
- The transaction signature and Solana Explorer link
- Whether the agent wallet's SOL balance decreased by exactly 0.005 SOL
  (proving it did not pay gas)
- The audit log entry showing gasless: true and feePayer: kora
```

---

## 27. Gasless On-Chain Memo via Kora

> **Demonstrates:** Any legacy transaction (not just SOL transfers) is gasless when Kora is configured — the memo instruction is signed by the agent, Kora co-signs as fee payer.

```
Write the following memo on-chain using wallet [WALLET_ID]:

"Gasless memo — Kora paymaster sponsoring network fees"

Confirm the transaction was gasless (agent paid no SOL for gas) and return
the transaction signature.
```

---

## 28. Verify Kora Gasless Audit Trail

> **Demonstrates:** Audit log entries for gasless transactions include `gasless: true` and `feePayer: "kora"`, providing a clear forensic trail distinguishing Kora-sponsored transactions from self-paid ones.

```
Retrieve the most recent audit log entries for wallet [WALLET_ID].
Identify all entries where gasless is true and feePayer is "kora".
Summarise:
- How many transactions were gasless vs self-paid
- The total SOL moved in gasless transactions
- Whether any gasless transactions were blocked by policy
```

---

## Quick Reference

| #   | Capability            | MCP Tool / Resource                    | What It Proves                            |
| --- | --------------------- | -------------------------------------- | ----------------------------------------- |
| 1   | System health check   | `system://status`, `system://config`   | Resource layer, server liveness           |
| 2   | Create funded wallet  | `create_wallet`                        | Auto-funding, policy-at-creation          |
| 3   | List all wallets      | `list_wallets`, `wallet://all-wallets` | Multi-wallet management                   |
| 4   | Inspect balance       | `get_balance`                          | SOL + SPL multi-asset balances            |
| 5   | Wallet policy + usage | `wallet://detail`, `wallet://policy`   | Policy visibility, live counters          |
| 6   | Send SOL              | `send_sol`                             | Policy-enforced SOL transfer              |
| 7   | Blocked by guardrail  | `send_sol` (rejected)                  | Hard enforcement — no override            |
| 8   | On-chain memo         | `write_memo`                           | SPL Memo, immutable provenance            |
| 9   | Create token mint     | `create_token_mint`                    | Agent-controlled mint authority           |
| 10  | Mint tokens           | `mint_tokens`                          | SPL token supply issuance                 |
| 11  | Transfer SPL tokens   | `send_token`                           | SPL transfer, ATA handling                |
| 12  | Swap via Jupiter      | `swap_tokens`                          | DEX pricing, simulated on devnet          |
| 13  | Global audit log      | `get_audit_logs`, `audit://logs`       | Tamper-evident cross-wallet trail         |
| 14  | Per-wallet audit      | `audit://wallet-logs`                  | Scoped wallet history                     |
| 15  | Probe x402            | `probe_x402`                           | Cost discovery without payment            |
| 16  | Pay x402              | `pay_x402`                             | Autonomous HTTP micropayment loop         |
| 17  | Setup workflow        | `wallet_setup` prompt                  | End-to-end guided onboarding              |
| 18  | Trading strategy      | `trading_strategy` prompt              | Autonomous strategy reasoning + execution |
| 19  | Portfolio rebalance   | `portfolio_rebalance` prompt           | Multi-step autonomous rebalancing         |
| 20  | Security audit        | `security_audit` prompt                | Compliance-style cross-wallet review      |
| 21  | Daily report          | `daily_report` prompt                  | Operator reporting and observability      |
| 22  | Risk assessment       | `risk_assessment` prompt               | Exposure analysis, policy headroom        |
| 23  | Fetch live prices     | `fetch_prices`                         | Jupiter Price API, token resolution       |
| 24  | Evaluate strategy     | `evaluate_strategy`                    | Strategy signals, rebalance logic         |
| 25  | Autonomous trading    | `autonomous-trading` prompt            | Multi-tick bot loop, agent-as-trader      |
| 26  | Gasless SOL transfer  | `send_sol` + Kora                      | Kora pays gas, agent keeps all SOL        |
| 27  | Gasless memo          | `write_memo` + Kora                    | Any legacy tx is gasless with Kora        |
| 28  | Gasless audit trail   | `audit://wallet-logs`                  | Forensic gasless vs self-paid distinction |
