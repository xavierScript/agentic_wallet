import { resolve } from "node:path";
import type { Cluster } from "@solana/web3.js";
import { config as loadEnv } from "dotenv";

// Load .env — walk up from sub-packages so the root .env is always found.
loadEnv();
loadEnv({ path: resolve(process.cwd(), "..", ".env") });
loadEnv({ path: resolve(process.cwd(), "..", "..", ".env") });

export interface AgentWalletConfig {
  /** Solana cluster: devnet | testnet | mainnet-beta */
  cluster: Cluster;
  /** Solana RPC URL override */
  rpcUrl?: string;
  /** Directory to store encrypted keystores */
  keystoreDir: string;
  /** Directory to store audit logs */
  logDir: string;
  /** Passphrase for encrypting/decrypting private keys */
  passphrase: string;
  /** Logging level */
  logLevel: "debug" | "info" | "warn" | "error";
  /**
   * Owner / operator wallet address (base58 public key).
   * When set, closing a wallet automatically sweeps any remaining SOL
   * balance to this address before deleting the keystore.
   * Set via OWNER_ADDRESS env var.
   */
  ownerAddress?: string;
  /**
   * Base58-encoded secret key of the master (funding) wallet.
   * When set, newly created agent wallets are automatically funded
   * from this wallet instead of relying on devnet faucets.
   * Set via MASTER_WALLET_SECRET_KEY env var.
   *
   * ⚠️  For devnet/testnet only. On mainnet use a dedicated treasury
   * wallet with its own spending limits rather than your primary wallet.
   */
  masterWalletSecretKey?: string;
  /**
   * Amount of SOL to seed each newly created agent wallet with.
   * Only used when masterWalletSecretKey is configured.
   * Defaults to 0.05 SOL — enough for ~100 simple transfers on devnet.
   * Set via AGENT_SEED_SOL env var.
   */
  agentSeedSol: number;

  /**
   * Kora gasless relay RPC URL (e.g. http://localhost:8080).
   * When set, agent transactions are routed through Kora — the Kora
   * node's signer pays SOL network fees so agent wallets never need SOL.
   * Set via KORA_RPC_URL env var.
   */
  koraRpcUrl?: string;
  /**
   * API key for the Kora node (optional — depends on node's auth config).
   * Set via KORA_API_KEY env var.
   */
  koraApiKey?: string;
}

function getPassphrase(): string {
  const passphrase = process.env.WALLET_PASSPHRASE;
  if (!passphrase) {
    if (process.env.NODE_ENV === "test") return "test-passphrase";
    console.warn(
      "\x1b[33m⚠  WALLET_PASSPHRASE not set. Using dev-only default. Set it in .env for production.\x1b[0m",
    );
    return "default-dev-passphrase";
  }
  if (passphrase.length < 12) {
    console.warn(
      "\x1b[33m⚠  WALLET_PASSPHRASE is weak (< 12 chars). Use a stronger passphrase.\x1b[0m",
    );
  }
  return passphrase;
}

export function getDefaultConfig(): AgentWalletConfig {
  const home = process.env.HOME || process.env.USERPROFILE || ".";
  return {
    cluster: (process.env.SOLANA_CLUSTER as Cluster) || "devnet",
    rpcUrl: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
    keystoreDir: `${home}/.agentic-wallet/keys`,
    logDir: `${home}/.agentic-wallet/logs`,
    passphrase: getPassphrase(),
    logLevel:
      (process.env.LOG_LEVEL as AgentWalletConfig["logLevel"]) || "info",
    ownerAddress: process.env.OWNER_ADDRESS || undefined,
    masterWalletSecretKey: process.env.MASTER_WALLET_SECRET_KEY || undefined,
    agentSeedSol: Number(process.env.AGENT_SEED_SOL) || 0.05,
    koraRpcUrl: process.env.KORA_RPC_URL || undefined,
    koraApiKey: process.env.KORA_API_KEY || undefined,
  };
}
