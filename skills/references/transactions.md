# Transactions Reference

> How transactions are built, signed, sent, and verified in the Agentic Wallet system.

---

## Transaction Pipeline

Every transaction follows this pipeline:

```
Agent calls tool (e.g., send_sol)
    │
    ▼
Tool handler builds transaction
    │
    ▼
PolicyEngine.checkTransaction()
    ├── REJECT → log violation, return error
    └── ALLOW ↓
    │
    ▼
KeyManager.unlock(walletId, passphrase)
    → Decrypt private key in memory
    │
    ▼
Transaction.sign(keypair)
    │
    ▼
Send via Kora (gasless)?
    ├── Yes → KoraService.signAndSend() (Kora pays fees)
    │         └── Fallback to standard if Kora unavailable
    └── No  → connection.sendRawTransaction()
    │
    ▼
AuditLogger.log(action, details, success)
    │
    ▼
Return TransactionResult to agent
    { signature, gasless, network, explorerUrl }
```

---

## Transaction Types

### Legacy Transactions

Used for most operations: SOL transfers, token transfers, memos, mint creation, minting.

```
SystemProgram.transfer()     → send_sol
Token.transfer()             → send_token
MemoProgram.memo()           → write_memo
Token.createMint()           → create_token_mint
Token.mintTo()               → mint_tokens
```

### Versioned Transactions

Used for Jupiter swaps (required by Jupiter's routing engine):

```
Jupiter quote → swap transaction → VersionedTransaction
    → signAndSendVersionedTransaction()
```

Versioned transactions support address lookup tables (ALTs), which Jupiter uses to compress complex multi-hop routes into fewer bytes.

---

## Gasless Transactions (Kora)

When `KORA_RPC_URL` is configured, transactions are routed through the Kora gasless paymaster relay:

1. Transaction is built normally
2. Instead of the agent wallet paying network fees, Kora's signer pays
3. The agent wallet only needs SOL for the transfer amount itself
4. If Kora is unavailable, the system automatically falls back to standard fee payment

**Agent impact:** No code changes needed. The `gasless` field in `TransactionResult` indicates which path was used.

---

## Transaction Result Format

Every tool that sends a transaction returns:

```json
{
  "signature": "5vGk...",
  "gasless": true,
  "network": "devnet",
  "explorerUrl": "https://explorer.solana.com/tx/5vGk...?cluster=devnet"
}
```

| Field         | Description                                                  |
| ------------- | ------------------------------------------------------------ |
| `signature`   | Base58 transaction signature — unique on-chain identifier    |
| `gasless`     | `true` if Kora paid the fee, `false` if the agent wallet did |
| `network`     | Solana cluster (devnet, testnet, mainnet-beta)               |
| `explorerUrl` | Direct link to view the transaction on Solana Explorer       |

---

## SOL and Lamport Conversions

| SOL          | Lamports                        |
| ------------ | ------------------------------- |
| 1 SOL        | 1,000,000,000 lamports          |
| 0.1 SOL      | 100,000,000 lamports            |
| 0.01 SOL     | 10,000,000 lamports             |
| 0.001 SOL    | 1,000,000 lamports              |
| 0.000005 SOL | 5,000 lamports (typical tx fee) |

Policy limits are defined in **lamports**. Tool parameters use **SOL** (human-readable). The conversion is handled internally.

---

## Token Operations

### SPL Token Transfers

When sending SPL tokens via `send_token`:

1. The recipient's Associated Token Account (ATA) is checked
2. If the ATA doesn't exist, it is created automatically (costs ~0.002 SOL in rent)
3. The transfer is executed using `Token.transfer` or `Token.transferChecked`

### Token Decimals

| Token         | Decimals | 1 Token =                |
| ------------- | -------- | ------------------------ |
| SOL (wrapped) | 9        | 1,000,000,000 base units |
| USDC          | 6        | 1,000,000 base units     |
| USDT          | 6        | 1,000,000 base units     |
| BONK          | 5        | 100,000 base units       |
| Custom        | varies   | set at mint creation     |

Always pass the correct `decimals` when sending tokens. Default is 6 (USDC-like).

---

## Jupiter Swap Details

The `swap_tokens` tool uses Jupiter v6 aggregator:

1. **Quote:** Fetches best route across all DEXs (Raydium, Orca, Meteora, etc.)
2. **Route:** May involve multi-hop paths for better pricing
3. **Slippage:** Configurable (default 50 bps = 0.5%, max 300 bps = 3%)
4. **Price impact:** Jupiter calculates the impact; high impact swaps are warned but not blocked
5. **Signing:** Swap TX is a versioned transaction, signed by the wallet

### Well-Known Token Symbols

These symbols are resolved to mint addresses automatically:

| Symbol | Mint Address                                                |
| ------ | ----------------------------------------------------------- |
| SOL    | `So11111111111111111111111111111111111111112` (wrapped SOL) |
| USDC   | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`              |
| USDT   | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`              |
| BONK   | `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263`              |
| JUP    | `JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN`               |

Any string longer than 20 characters is treated as a mint address directly.

---

## x402 Payment Transactions

> **Prerequisite:** x402.org runs on Base (EVM). For Solana, you need a local server:
>
> ```bash
> git clone https://github.com/Woody4618/x402-solana-examples
> cd x402-solana-examples && npm install
> npm run usdc:server   # http://localhost:3001
> ```
>
> The wallet must hold devnet USDC (mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`).

x402 payments use a specialized flow:

1. Initial `GET` request to the URL
2. Server returns `402 Payment Required`; payment info is in the `X-PAYMENT-REQUIRED` header **or** the JSON response body (native servers use the body)
3. Body/header contains: amount (USDC smallest units), mint address, recipient ATA, network (`solana-devnet`), timeout
4. System checks whether the recipient Associated Token Account exists and creates it if not
5. System builds a plain SPL `Transfer` instruction (opcode 3) — what native servers validate
6. Transaction is signed by the wallet (fee payer = wallet, no external facilitator for native servers)
7. The signed transaction is sent back in the `X-Payment` header as `base64(JSON { serializedTransaction })`
8. The server verifies the transfer instruction, submits the transaction, and confirms on-chain
9. On success, the resource content is returned

**Key difference from normal transfers:** The tool signs but does not broadcast. The server verifies the instruction contents, submits the transaction, and only serves the resource after on-chain confirmation.
