import {
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
  type TransactionSignature,
} from "@solana/web3.js";
import { KeyManager, type KeystoreEntry } from "./key-manager.js";
import { PolicyEngine, type Policy } from "./guardrails/policy-engine.js";
import { AuditLogger } from "./audit-logger.js";
import { SolanaConnection } from "./connection.js";

export interface WalletInfo {
  id: string;
  label: string;
  publicKey: string;
  balanceSol: number;
  balanceLamports: number;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface TokenBalance {
  mint: string;
  symbol?: string;
  amount: number;
  decimals: number;
  uiAmount: number;
}

/**
 * WalletService is the primary interface for wallet operations.
 * Agent logic calls this service — raw private keys are never exposed.
 *
 * Responsibilities:
 * - Create/load wallets via KeyManager
 * - Sign transactions (legacy + versioned)
 * - Query balances (SOL + SPL tokens)
 * - Enforce policies before signing
 * - Log all operations via AuditLogger
 */
export class WalletService {
  private keyManager: KeyManager;
  private policyEngine: PolicyEngine;
  private auditLogger: AuditLogger;
  private connection: SolanaConnection;

  constructor(
    keyManager: KeyManager,
    policyEngine: PolicyEngine,
    auditLogger: AuditLogger,
    connection: SolanaConnection,
  ) {
    this.keyManager = keyManager;
    this.policyEngine = policyEngine;
    this.auditLogger = auditLogger;
    this.connection = connection;
  }

  /**
   * Create a new agent wallet with an optional policy.
   */
  async createWallet(
    label: string = "agent-wallet",
    policy?: Policy,
    metadata: Record<string, unknown> = {},
  ): Promise<WalletInfo> {
    const entry = this.keyManager.createWallet(label, metadata);

    if (policy) {
      this.policyEngine.attachPolicy(entry.id, policy);
    }

    this.auditLogger.log({
      action: "wallet:created",
      walletId: entry.id,
      publicKey: entry.publicKey,
      success: true,
      details: { label },
    });

    return {
      id: entry.id,
      label: entry.label,
      publicKey: entry.publicKey,
      balanceSol: 0,
      balanceLamports: 0,
      createdAt: entry.createdAt,
      metadata: entry.metadata,
    };
  }

  /**
   * Get wallet info including current balance.
   */
  async getWalletInfo(walletId: string): Promise<WalletInfo> {
    const entry = this.keyManager.loadKeystore(walletId);
    const balanceLamports = await this.connection.getBalance(entry.publicKey);

    return {
      id: entry.id,
      label: entry.label,
      publicKey: entry.publicKey,
      balanceSol: balanceLamports / LAMPORTS_PER_SOL,
      balanceLamports,
      createdAt: entry.createdAt,
      metadata: entry.metadata,
    };
  }

  /**
   * List all wallets with their balances.
   */
  async listWallets(): Promise<WalletInfo[]> {
    const entries = this.keyManager.listWallets();
    const wallets: WalletInfo[] = [];

    for (const entry of entries) {
      try {
        const balanceLamports = await this.connection.getBalance(
          entry.publicKey,
        );
        wallets.push({
          id: entry.id,
          label: entry.label,
          publicKey: entry.publicKey,
          balanceSol: balanceLamports / LAMPORTS_PER_SOL,
          balanceLamports,
          createdAt: entry.createdAt,
          metadata: entry.metadata,
        });
      } catch {
        wallets.push({
          id: entry.id,
          label: entry.label,
          publicKey: entry.publicKey,
          balanceSol: 0,
          balanceLamports: 0,
          createdAt: entry.createdAt,
          metadata: entry.metadata,
        });
      }
    }

    return wallets;
  }

  /**
   * Get SOL balance for a wallet.
   */
  async getBalance(
    walletId: string,
  ): Promise<{ sol: number; lamports: number }> {
    const entry = this.keyManager.loadKeystore(walletId);
    const lamports = await this.connection.getBalance(entry.publicKey);
    return { sol: lamports / LAMPORTS_PER_SOL, lamports };
  }

  /**
   * Get SPL token balances for a wallet.
   */
  async getTokenBalances(walletId: string): Promise<TokenBalance[]> {
    const entry = this.keyManager.loadKeystore(walletId);
    const conn = this.connection.getConnection();
    const pk = new PublicKey(entry.publicKey);

    const tokenAccounts = await conn.getParsedTokenAccountsByOwner(pk, {
      programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    });

    return tokenAccounts.value.map((account) => {
      const parsed = account.account.data.parsed.info;
      return {
        mint: parsed.mint,
        amount: Number(parsed.tokenAmount.amount),
        decimals: parsed.tokenAmount.decimals,
        uiAmount: parsed.tokenAmount.uiAmount || 0,
      };
    });
  }

  /**
   * Sign and send a legacy transaction.
   * Policy checks are enforced BEFORE signing.
   * Additional signers (e.g. mint keypairs) can be provided when the
   * transaction requires more than one signer.
   */
  async signAndSendTransaction(
    walletId: string,
    transaction: Transaction,
    context: { action: string; details?: Record<string, unknown> } = {
      action: "transaction",
    },
    additionalSigners: Keypair[] = [],
  ): Promise<TransactionSignature> {
    // Policy check
    const violation = this.policyEngine.checkTransaction(
      walletId,
      transaction,
      context,
    );
    if (violation) {
      this.auditLogger.log({
        action: context.action,
        walletId,
        success: false,
        error: `Policy violation: ${violation}`,
        details: context.details,
      });
      throw new Error(`Policy violation: ${violation}`);
    }

    // Unlock keypair (in memory only)
    const keypair = this.keyManager.unlockWallet(walletId);

    try {
      const conn = this.connection.getConnection();
      const { blockhash, lastValidBlockHeight } =
        await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = keypair.publicKey;

      // Sign (wallet keypair + any additional signers)
      transaction.sign(keypair, ...additionalSigners);

      // Send
      const rawTx = transaction.serialize();
      const signature = await conn.sendRawTransaction(rawTx, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      // Confirm
      await conn.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );

      this.auditLogger.log({
        action: context.action,
        walletId,
        publicKey: keypair.publicKey.toBase58(),
        txSignature: signature,
        success: true,
        details: context.details,
      });

      // Record for rate limiting
      this.policyEngine.recordTransaction(walletId);

      return signature;
    } catch (error: any) {
      this.auditLogger.log({
        action: context.action,
        walletId,
        success: false,
        error: error.message,
        details: context.details,
      });
      throw error;
    }
  }

  /**
   * Sign and send a versioned transaction (used by Jupiter, etc.)
   *
   * Policy rate limits and spend caps are enforced before signing.
   * Program allowlist checks are skipped since VersionedTransaction
   * instruction decoding requires the on-chain lookup tables.
   *
   * @param estimatedLamports - Best-effort spend amount used for daily-cap
   *   enforcement. Pass the raw SOL input amount (in lamports) when the input
   *   token is SOL; pass 0 for non-SOL swaps (rate/cooldown still enforced).
   */
  async signAndSendVersionedTransaction(
    walletId: string,
    transaction: VersionedTransaction,
    context: { action: string; details?: Record<string, unknown> } = {
      action: "versioned-transaction",
    },
    estimatedLamports: number = 0,
  ): Promise<TransactionSignature> {
    // Policy check — rate limits, cooldown, and spend cap (no program checks)
    const violation = this.policyEngine.checkLimits(
      walletId,
      estimatedLamports,
    );
    if (violation) {
      this.auditLogger.log({
        action: context.action,
        walletId,
        success: false,
        error: `Policy violation: ${violation}`,
        details: context.details,
      });
      throw new Error(`Policy violation: ${violation}`);
    }

    const keypair = this.keyManager.unlockWallet(walletId);

    try {
      // Sign
      transaction.sign([keypair]);

      const conn = this.connection.getConnection();
      const rawTx = transaction.serialize();
      const signature = await conn.sendRawTransaction(rawTx, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      const { blockhash, lastValidBlockHeight } =
        await this.connection.getLatestBlockhash();
      await conn.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );

      this.auditLogger.log({
        action: context.action,
        walletId,
        publicKey: keypair.publicKey.toBase58(),
        txSignature: signature,
        success: true,
        details: context.details,
      });

      this.policyEngine.recordTransaction(walletId, estimatedLamports);

      return signature;
    } catch (error: any) {
      this.auditLogger.log({
        action: context.action,
        walletId,
        success: false,
        error: error.message,
        details: context.details,
      });
      throw error;
    }
  }

  /**
   * Get public key for a wallet (safe to expose).
   */
  getPublicKey(walletId: string): string {
    const entry = this.keyManager.loadKeystore(walletId);
    return entry.publicKey;
  }
}
