# Kora Node Setup for Agentic Wallet

## Quick Start (Devnet)

### 1. Install Kora CLI

```bash
cargo install kora-cli
```

### 2. Generate a Kora signer keypair

```bash
solana-keygen new --outfile kora/kora-signer.json --no-bip39-passphrase
```

Note the public key — this is the address that needs SOL to pay gas fees.

### 3. Fund the signer with devnet SOL

```bash
solana airdrop 2 $(solana-keygen pubkey kora/kora-signer.json) --url devnet
```

> **How much SOL?** Each simple transaction costs ~5,000 lamports (0.000005 SOL).
> 2 SOL covers ~400,000 transactions on devnet. Repeat airdrops as needed.

### 4. Set the signer key in `.env`

Add the base58 private key OR the file path to your root `.env`:

```bash
# Option A: file path
KORA_SIGNER_PRIVATE_KEY=kora/kora-signer.json

# Option B: base58 string (copy from `solana-keygen` output)
# KORA_SIGNER_PRIVATE_KEY=5KKsLVU6TcbVDK4BS6K1DGDxnh4Q9xjYJ8XaDCG5t8ht...
```

### 5. Start the Kora node

```bash
cd kora
kora --config kora.toml --rpc-url https://api.devnet.solana.com rpc start --signers-config signers.toml
```

You should see:

```
INFO kora_lib::rpc_server::server: RPC server started on 0.0.0.0:8080
```

### 6. Verify it works

```bash
curl -s -X POST http://localhost:8080 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getConfig","params":[]}' | jq .
```

### 7. Run the agentic wallet

In another terminal, start your MCP server / CLI as usual. The codebase auto-detects
`KORA_RPC_URL` in `.env` and routes all five legacy transaction tools through Kora gaslessly:

| MCP Tool            | Transaction type       | Kora covered?                                                 |
| ------------------- | ---------------------- | ------------------------------------------------------------- |
| `send_sol`          | Legacy (System)        | ✅ Yes                                                        |
| `send_token`        | Legacy (SPL Token)     | ✅ Yes                                                        |
| `write_memo`        | Legacy (SPL Memo)      | ✅ Yes                                                        |
| `create_token_mint` | Legacy (SPL Token)     | ✅ Yes                                                        |
| `mint_tokens`       | Legacy (SPL Token)     | ✅ Yes                                                        |
| `swap_tokens`       | VersionedTransaction   | ❌ No — Jupiter bakes the fee payer into the compiled message |
| `pay_x402`          | x402 facilitator relay | ❌ No — x402 facilitator broadcasts; different signing path   |

---

## What Gets Funded?

| Account                                        | What it pays                                                        | How to fund                                         |
| ---------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------- |
| **Kora signer** (`kora-signer.json`)           | SOL network fees for every agent transaction                        | `solana airdrop` (devnet) or transfer SOL (mainnet) |
| **Agent wallets**                              | Nothing (that's the point!)                                         | No SOL needed — Kora pays gas                       |
| **Master wallet** (`MASTER_WALLET_SECRET_KEY`) | Still seeds agent wallets with SOL for rent-exempt account creation | Already configured in `.env`                        |

> **Note:** With Kora paying gas, agent wallets still need SOL only if they need to
> create new accounts (e.g., new SPL token ATAs cost ~0.002 SOL rent). For simple
> SOL/token transfers to existing accounts, agents need zero SOL.

---

## Mainnet Considerations

1. **Fund the Kora signer** with real SOL (not airdrops)
2. Change `price_source = "Jupiter"` in `kora.toml` and set `JUPITER_API_KEY` env var
3. Update `allowed_tokens` with mainnet token mints (e.g., USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`)
4. Enable authentication in `[kora.auth]` to prevent unauthorized use
5. Monitor signer balance — set up alerts when it drops below 0.1 SOL

## Troubleshooting

| Symptom                                    | Fix                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| `kora: command not found`                  | Add `~/.cargo/bin` to PATH                                                |
| `connection refused` on port 8080          | Kora node not running — start it first                                    |
| `"At least one signer must be configured"` | `KORA_SIGNER_PRIVATE_KEY` env var not set                                 |
| Transactions fail with policy error        | Check `allowed_programs` in `kora.toml` includes the program your tx uses |
| `signAndSendTransaction` returns error     | Kora signer may be out of SOL — airdrop more                              |
