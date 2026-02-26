import { Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

/**
 * A policy rule defines constraints on transactions.
 */
export interface PolicyRule {
  /** Rule identifier */
  name: string;
  /** Maximum lamports per transaction (undefined = unlimited) */
  maxLamportsPerTx?: number;
  /** Maximum transactions per hour */
  maxTxPerHour?: number;
  /** Maximum transactions per day */
  maxTxPerDay?: number;
  /** Cooldown between transactions in milliseconds */
  cooldownMs?: number;
  /** Allowed program IDs (whitelist). If empty, all programs allowed. */
  allowedPrograms?: string[];
  /** Blocked program IDs (blacklist) */
  blockedPrograms?: string[];
  /** Maximum total daily spend in lamports */
  maxDailySpendLamports?: number;
}

/**
 * A policy applied to a specific wallet.
 */
export interface Policy {
  /** Policy identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Policy rules */
  rules: PolicyRule[];
  /** Creation timestamp */
  createdAt: string;
}

interface TxRecord {
  timestamp: number;
  lamports: number;
}

/**
 * PolicyEngine enforces transaction limits, rate limiting, and program allowlists
 * for each wallet. Policies are the first line of defense against misuse.
 *
 * Architecture:
 * - Each wallet can have one policy attached
 * - Policies are checked BEFORE any transaction is signed
 * - Rate limits are tracked in-memory with window-based counting
 * - All violations are logged via AuditLogger
 */
export class PolicyEngine {
  private policies: Map<string, Policy> = new Map();
  private txHistory: Map<string, TxRecord[]> = new Map();
  private stateFile: string | null = null;

  /**
   * Create a PolicyEngine optionally backed by persistent state file.
   * @param stateDir Directory where policy state is persisted. If provided,
   *                 rate-limit counters and policies survive process restarts.
   */
  constructor(stateDir?: string) {
    if (stateDir) {
      mkdirSync(stateDir, { recursive: true });
      this.stateFile = join(stateDir, "policy-state.json");
      this.loadState();
    }
  }

  /**
   * Attach a policy to a wallet.
   */
  attachPolicy(walletId: string, policy: Policy): void {
    this.policies.set(walletId, policy);
    this.saveState();
  }

  /**
   * Get the policy for a wallet.
   */
  getPolicy(walletId: string): Policy | undefined {
    return this.policies.get(walletId);
  }

  /**
   * Remove a wallet's policy.
   */
  removePolicy(walletId: string): void {
    this.policies.delete(walletId);
    this.saveState();
  }

  /**
   * Check a transaction against a wallet's policy.
   * Returns null if allowed, or a string describing the violation.
   */
  checkTransaction(
    walletId: string,
    transaction: Transaction,
    context: { action: string; details?: Record<string, unknown> },
  ): string | null {
    const policy = this.policies.get(walletId);
    if (!policy) return null; // No policy = allow (but warned in logs)

    for (const rule of policy.rules) {
      // Check transfer amount
      if (rule.maxLamportsPerTx !== undefined) {
        const totalLamports = this.estimateTransferAmount(transaction);
        if (totalLamports > rule.maxLamportsPerTx) {
          return `Transaction value ${totalLamports} lamports exceeds max ${rule.maxLamportsPerTx} lamports (${rule.name})`;
        }
      }

      // Check rate limits
      const history = this.txHistory.get(walletId) || [];
      const now = Date.now();

      if (rule.maxTxPerHour !== undefined) {
        const hourAgo = now - 60 * 60 * 1000;
        const txInHour = history.filter((h) => h.timestamp > hourAgo).length;
        if (txInHour >= rule.maxTxPerHour) {
          return `Rate limit exceeded: ${txInHour}/${rule.maxTxPerHour} transactions per hour (${rule.name})`;
        }
      }

      if (rule.maxTxPerDay !== undefined) {
        const dayAgo = now - 24 * 60 * 60 * 1000;
        const txInDay = history.filter((h) => h.timestamp > dayAgo).length;
        if (txInDay >= rule.maxTxPerDay) {
          return `Rate limit exceeded: ${txInDay}/${rule.maxTxPerDay} transactions per day (${rule.name})`;
        }
      }

      if (rule.cooldownMs !== undefined && history.length > 0) {
        const lastTx = history[history.length - 1];
        const elapsed = now - lastTx.timestamp;
        if (elapsed < rule.cooldownMs) {
          const waitSec = Math.ceil((rule.cooldownMs - elapsed) / 1000);
          return `Cooldown active: wait ${waitSec}s between transactions (${rule.name})`;
        }
      }

      // Check daily spending cap
      if (rule.maxDailySpendLamports !== undefined) {
        const dayAgo = now - 24 * 60 * 60 * 1000;
        const dailySpend = history
          .filter((h) => h.timestamp > dayAgo)
          .reduce((sum, h) => sum + h.lamports, 0);
        const txAmount = this.estimateTransferAmount(transaction);
        if (dailySpend + txAmount > rule.maxDailySpendLamports) {
          return `Daily spend limit would be exceeded: ${(dailySpend + txAmount) / LAMPORTS_PER_SOL} SOL > ${rule.maxDailySpendLamports / LAMPORTS_PER_SOL} SOL (${rule.name})`;
        }
      }

      // Check allowed programs
      if (rule.allowedPrograms && rule.allowedPrograms.length > 0) {
        for (const ix of transaction.instructions) {
          const programId = ix.programId.toBase58();
          if (!rule.allowedPrograms.includes(programId)) {
            return `Program ${programId} not in allowlist (${rule.name})`;
          }
        }
      }

      // Check blocked programs
      if (rule.blockedPrograms && rule.blockedPrograms.length > 0) {
        for (const ix of transaction.instructions) {
          const programId = ix.programId.toBase58();
          if (rule.blockedPrograms.includes(programId)) {
            return `Program ${programId} is blocked (${rule.name})`;
          }
        }
      }
    }

    return null;
  }

  /**
   * Check rate limits, cooldown, and daily spend without parsing a Transaction.
   * Use this for VersionedTransaction (e.g. Jupiter swaps) where instruction
   * decoding is not available. Program allowlist/blocklist checks are skipped.
   *
   * @param walletId  - Wallet to check against
   * @param estimatedLamports - Best-effort spend amount (0 if unknown)
   * @returns null if allowed, or a string describing the violation
   */
  checkLimits(walletId: string, estimatedLamports: number = 0): string | null {
    const policy = this.policies.get(walletId);
    if (!policy) return null; // No policy — allow (same behaviour as checkTransaction)

    for (const rule of policy.rules) {
      // Per-transaction amount cap (only meaningful when estimatedLamports > 0)
      if (
        rule.maxLamportsPerTx !== undefined &&
        estimatedLamports > 0 &&
        estimatedLamports > rule.maxLamportsPerTx
      ) {
        return `Transaction value ${estimatedLamports} lamports exceeds max ${rule.maxLamportsPerTx} lamports (${rule.name})`;
      }

      const history = this.txHistory.get(walletId) || [];
      const now = Date.now();

      if (rule.maxTxPerHour !== undefined) {
        const hourAgo = now - 60 * 60 * 1000;
        const txInHour = history.filter((h) => h.timestamp > hourAgo).length;
        if (txInHour >= rule.maxTxPerHour) {
          return `Rate limit exceeded: ${txInHour}/${rule.maxTxPerHour} transactions per hour (${rule.name})`;
        }
      }

      if (rule.maxTxPerDay !== undefined) {
        const dayAgo = now - 24 * 60 * 60 * 1000;
        const txInDay = history.filter((h) => h.timestamp > dayAgo).length;
        if (txInDay >= rule.maxTxPerDay) {
          return `Rate limit exceeded: ${txInDay}/${rule.maxTxPerDay} transactions per day (${rule.name})`;
        }
      }

      if (rule.cooldownMs !== undefined && history.length > 0) {
        const lastTx = history[history.length - 1];
        const elapsed = now - lastTx.timestamp;
        if (elapsed < rule.cooldownMs) {
          const waitSec = Math.ceil((rule.cooldownMs - elapsed) / 1000);
          return `Cooldown active: wait ${waitSec}s between transactions (${rule.name})`;
        }
      }

      if (rule.maxDailySpendLamports !== undefined && estimatedLamports > 0) {
        const dayAgo = now - 24 * 60 * 60 * 1000;
        const dailySpend = history
          .filter((h) => h.timestamp > dayAgo)
          .reduce((sum, h) => sum + h.lamports, 0);
        if (dailySpend + estimatedLamports > rule.maxDailySpendLamports) {
          return `Daily spend limit would be exceeded: ${(dailySpend + estimatedLamports) / LAMPORTS_PER_SOL} SOL > ${rule.maxDailySpendLamports / LAMPORTS_PER_SOL} SOL (${rule.name})`;
        }
      }
    }

    return null;
  }

  /**
   * Record a completed transaction for rate limiting purposes.
   */
  recordTransaction(walletId: string, lamports: number = 0): void {
    if (!this.txHistory.has(walletId)) {
      this.txHistory.set(walletId, []);
    }
    this.txHistory.get(walletId)!.push({
      timestamp: Date.now(),
      lamports,
    });

    // Prune old entries (> 24h)
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const history = this.txHistory.get(walletId)!;
    const pruned = history.filter((h) => h.timestamp > dayAgo);
    this.txHistory.set(walletId, pruned);
    this.saveState();
  }

  /**
   * Get transaction history for rate limit display.
   */
  getTransactionStats(walletId: string): {
    txLastHour: number;
    txLastDay: number;
    spendLastDay: number;
    lastTxTime: number | null;
  } {
    const history = this.txHistory.get(walletId) || [];
    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;
    const dayAgo = now - 24 * 60 * 60 * 1000;

    return {
      txLastHour: history.filter((h) => h.timestamp > hourAgo).length,
      txLastDay: history.filter((h) => h.timestamp > dayAgo).length,
      spendLastDay: history
        .filter((h) => h.timestamp > dayAgo)
        .reduce((s, h) => s + h.lamports, 0),
      lastTxTime:
        history.length > 0 ? history[history.length - 1].timestamp : null,
    };
  }

  /**
   * Create a standard devnet policy with sensible defaults.
   */
  static createDevnetPolicy(name: string = "devnet-safety"): Policy {
    return {
      id: `policy-${Date.now()}`,
      name,
      rules: [
        {
          name: "devnet-limits",
          maxLamportsPerTx: 2 * LAMPORTS_PER_SOL, // 2 SOL max per tx
          maxTxPerHour: 30,
          maxTxPerDay: 200,
          cooldownMs: 2000, // 2 seconds between txs
          maxDailySpendLamports: 10 * LAMPORTS_PER_SOL, // 10 SOL daily cap
          allowedPrograms: [
            "11111111111111111111111111111111", // System Program
            "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // Token Program
            "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", // Associated Token Account
            "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", // Memo Program v2
            "ComputeBudget111111111111111111111111111111", // Compute Budget
            "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", // Jupiter v6
            "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", // Token-2022
          ],
        },
      ],
      createdAt: new Date().toISOString(),
    };
  }

  // --- Persistence ---

  /**
   * Save current policy state to disk (if stateDir was provided).
   */
  private saveState(): void {
    if (!this.stateFile) return;
    try {
      const state = {
        policies: Object.fromEntries(this.policies),
        txHistory: Object.fromEntries(this.txHistory),
        savedAt: new Date().toISOString(),
      };
      writeFileSync(this.stateFile, JSON.stringify(state, null, 2), "utf-8");
    } catch {
      // Non-critical — policy enforcement still works in-memory
    }
  }

  /**
   * Load policy state from disk (if stateDir was provided).
   */
  private loadState(): void {
    if (!this.stateFile || !existsSync(this.stateFile)) return;
    try {
      const raw = JSON.parse(readFileSync(this.stateFile, "utf-8"));
      if (raw.policies) {
        for (const [k, v] of Object.entries(raw.policies)) {
          this.policies.set(k, v as Policy);
        }
      }
      if (raw.txHistory) {
        for (const [k, v] of Object.entries(raw.txHistory)) {
          this.txHistory.set(k, v as TxRecord[]);
        }
      }
    } catch {
      // Corrupted state file — start fresh
    }
  }

  // --- Helpers ---

  private estimateTransferAmount(transaction: Transaction): number {
    let total = 0;
    for (const ix of transaction.instructions) {
      if (ix.programId.equals(SystemProgram.programId)) {
        // Try to decode transfer instruction
        try {
          if (ix.data.length >= 12) {
            // SystemProgram transfer: first 4 bytes = instruction index (2 = transfer)
            // next 8 bytes = lamport amount (little-endian u64)
            const instructionType = ix.data.readUInt32LE(0);
            if (instructionType === 2) {
              total += Number(ix.data.readBigUInt64LE(4));
            }
          }
        } catch {
          // Can't decode, skip
        }
      }
    }
    return total;
  }
}
