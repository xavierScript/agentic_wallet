/**
 * master-funder.ts
 *
 * Funds newly created agent wallets from a master (operator) wallet.
 *
 * Replaces the unreliable devnet airdrop flow with a deterministic
 * SOL transfer from the operator's own wallet. The transfer is a plain
 * `SystemProgram.transfer` — it bypasses the agent's PolicyEngine because
 * **this is the operator's wallet**, not the agent's.
 *
 * The master keypair is loaded from the `MASTER_WALLET_SECRET_KEY` env var
 * (base58-encoded). When the env var is absent the funder is a no-op.
 *
 * Security notes:
 * - The master wallet secret key lives only in the env / process memory.
 *   It is NEVER written to the keystore or audit logs.
 * - All funding operations ARE logged to the audit trail (without the key).
 * - For mainnet, replace this with a dedicated treasury sub-wallet.
 */

import {
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import bs58 from "bs58";
import { SolanaConnection } from "./connection.js";
import { AuditLogger } from "./audit-logger.js";

export interface MasterFunderConfig {
  /** Base58-encoded secret key of the master wallet */
  masterSecretKey: string;
  /** Amount of SOL to send to each new agent wallet */
  seedSol: number;
}

/**
 * MasterFunder sends an initial SOL balance to newly created agent wallets.
 *
 * Usage:
 * ```ts
 * const funder = MasterFunder.fromEnv(config, connection, auditLogger);
 * if (funder) {
 *   await funder.fundWallet(agentPublicKey, walletId);
 * }
 * ```
 */
export class MasterFunder {
  private masterKeypair: Keypair;
  private seedLamports: number;
  private connection: SolanaConnection;
  private auditLogger: AuditLogger;

  constructor(
    masterKeypair: Keypair,
    seedSol: number,
    connection: SolanaConnection,
    auditLogger: AuditLogger,
  ) {
    this.masterKeypair = masterKeypair;
    this.seedLamports = Math.round(seedSol * LAMPORTS_PER_SOL);
    this.connection = connection;
    this.auditLogger = auditLogger;
  }

  // ── Factory ──────────────────────────────────────────────────────────────

  /**
   * Create a MasterFunder from config fields.
   * Returns `null` when the master key is not configured (backward-compatible).
   */
  /**
   * Create a MasterFunder directly from a Keypair (e.g. unlocked from KeyManager).
   * Use this when the master key is stored in the encrypted keystore rather than in env.
   */
  static fromKeypair(
    keypair: Keypair,
    seedSol: number,
    connection: SolanaConnection,
    auditLogger: AuditLogger,
  ): MasterFunder {
    return new MasterFunder(keypair, seedSol, connection, auditLogger);
  }

  static create(
    masterSecretKey: string | undefined,
    seedSol: number,
    connection: SolanaConnection,
    auditLogger: AuditLogger,
  ): MasterFunder | null {
    if (!masterSecretKey) return null;

    try {
      const secretBytes = bs58.decode(masterSecretKey);
      const keypair = Keypair.fromSecretKey(secretBytes);
      return new MasterFunder(keypair, seedSol, connection, auditLogger);
    } catch (err: any) {
      console.warn(
        `\x1b[33m⚠  MASTER_WALLET_SECRET_KEY is invalid (${err.message}). Auto-funding disabled.\x1b[0m`,
      );
      return null;
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /** Master wallet public key (safe to expose). */
  get publicKey(): string {
    return this.masterKeypair.publicKey.toBase58();
  }

  /** Seed amount in SOL. */
  get seedSol(): number {
    return this.seedLamports / LAMPORTS_PER_SOL;
  }

  /** Whether the funder is configured and ready. */
  get isConfigured(): boolean {
    return true; // if instance exists, it's configured
  }

  /**
   * Fund an agent wallet with the configured seed amount.
   *
   * @param agentPublicKey  Base58 public key of the agent wallet to fund.
   * @param walletId        Wallet UUID (for audit logging).
   * @returns Transaction signature.
   * @throws If the master wallet has insufficient balance or the tx fails.
   */
  async fundWallet(agentPublicKey: string, walletId: string): Promise<string> {
    const toPk = new PublicKey(agentPublicKey);
    const conn = this.connection.getConnection();

    // Pre-flight: ensure master wallet has enough
    const masterBalance = await conn.getBalance(this.masterKeypair.publicKey);
    const estimatedFee = 5_000; // base fee in lamports
    const required = this.seedLamports + estimatedFee;

    if (masterBalance < required) {
      const error =
        `Master wallet has ${masterBalance / LAMPORTS_PER_SOL} SOL but needs ` +
        `${required / LAMPORTS_PER_SOL} SOL to fund agent wallet.`;

      this.auditLogger.log({
        action: "master-fund:failed",
        walletId,
        publicKey: agentPublicKey,
        success: false,
        error,
        details: {
          masterPublicKey: this.publicKey,
          masterBalanceSol: masterBalance / LAMPORTS_PER_SOL,
          seedSol: this.seedLamports / LAMPORTS_PER_SOL,
        },
      });

      throw new Error(error);
    }

    // Build transfer
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: this.masterKeypair.publicKey,
        toPubkey: toPk,
        lamports: this.seedLamports,
      }),
    );

    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = this.masterKeypair.publicKey;
    tx.sign(this.masterKeypair);

    // Send and confirm
    const signature = await conn.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    await conn.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed",
    );

    this.auditLogger.log({
      action: "master-fund:sent",
      walletId,
      publicKey: agentPublicKey,
      txSignature: signature,
      success: true,
      details: {
        masterPublicKey: this.publicKey,
        seedSol: this.seedLamports / LAMPORTS_PER_SOL,
        seedLamports: this.seedLamports,
      },
    });

    return signature;
  }

  /**
   * Check the master wallet's current SOL balance.
   */
  async getBalance(): Promise<{ sol: number; lamports: number }> {
    const lamports = await this.connection
      .getConnection()
      .getBalance(this.masterKeypair.publicKey);
    return { sol: lamports / LAMPORTS_PER_SOL, lamports };
  }
}
