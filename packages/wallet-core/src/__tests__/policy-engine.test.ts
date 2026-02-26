import { describe, it, expect, beforeEach } from "vitest";
import { PolicyEngine, type Policy } from "../guardrails/policy-engine.js";
import {
  Transaction,
  SystemProgram,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";

function buildTransferTx(lamports: number): Transaction {
  const from = Keypair.generate().publicKey;
  const to = Keypair.generate().publicKey;
  return new Transaction().add(
    SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports }),
  );
}

describe("PolicyEngine", () => {
  let engine: PolicyEngine;

  beforeEach(() => {
    engine = new PolicyEngine();
  });

  describe("attachPolicy / getPolicy", () => {
    it("should attach and retrieve a policy", () => {
      const policy = PolicyEngine.createDevnetPolicy();
      engine.attachPolicy("wallet-1", policy);
      expect(engine.getPolicy("wallet-1")).toBeDefined();
      expect(engine.getPolicy("wallet-1")!.name).toBe("devnet-safety");
    });

    it("should return undefined for wallets without policy", () => {
      expect(engine.getPolicy("nonexistent")).toBeUndefined();
    });
  });

  describe("removePolicy", () => {
    it("should remove a policy so checks pass", () => {
      const policy = PolicyEngine.createDevnetPolicy();
      engine.attachPolicy("w1", policy);
      engine.removePolicy("w1");
      expect(engine.getPolicy("w1")).toBeUndefined();
    });
  });

  describe("checkTransaction — spending limits", () => {
    it("should allow transactions under the limit", () => {
      const policy: Policy = {
        id: "p1",
        name: "test",
        rules: [{ name: "limit", maxLamportsPerTx: LAMPORTS_PER_SOL }],
        createdAt: new Date().toISOString(),
      };
      engine.attachPolicy("w1", policy);
      const tx = buildTransferTx(0.5 * LAMPORTS_PER_SOL);
      const violation = engine.checkTransaction("w1", tx, {
        action: "test",
      });
      expect(violation).toBeNull();
    });

    it("should reject transactions over the limit", () => {
      const policy: Policy = {
        id: "p2",
        name: "test",
        rules: [{ name: "limit", maxLamportsPerTx: LAMPORTS_PER_SOL }],
        createdAt: new Date().toISOString(),
      };
      engine.attachPolicy("w2", policy);
      const tx = buildTransferTx(2 * LAMPORTS_PER_SOL);
      const violation = engine.checkTransaction("w2", tx, {
        action: "test",
      });
      expect(violation).toContain("exceeds max");
    });
  });

  describe("checkTransaction — rate limits", () => {
    it("should enforce maxTxPerHour", () => {
      const policy: Policy = {
        id: "p3",
        name: "rate-test",
        rules: [{ name: "rate", maxTxPerHour: 2 }],
        createdAt: new Date().toISOString(),
      };
      engine.attachPolicy("w3", policy);

      // Record 2 transactions
      engine.recordTransaction("w3");
      engine.recordTransaction("w3");

      const tx = buildTransferTx(1000);
      const violation = engine.checkTransaction("w3", tx, {
        action: "test",
      });
      expect(violation).toContain("Rate limit exceeded");
    });
  });

  describe("checkTransaction — program allowlist", () => {
    it("should block programs not in allowlist", () => {
      const policy: Policy = {
        id: "p4",
        name: "allowlist-test",
        rules: [
          {
            name: "programs",
            allowedPrograms: ["11111111111111111111111111111111"],
          },
        ],
        createdAt: new Date().toISOString(),
      };
      engine.attachPolicy("w4", policy);

      const tx = new Transaction().add({
        keys: [],
        programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
        data: Buffer.alloc(0),
      });
      const violation = engine.checkTransaction("w4", tx, {
        action: "test",
      });
      expect(violation).toContain("not in allowlist");
    });

    it("should allow programs in allowlist", () => {
      const policy: Policy = {
        id: "p5",
        name: "allowlist-ok",
        rules: [
          {
            name: "programs",
            allowedPrograms: ["11111111111111111111111111111111"],
          },
        ],
        createdAt: new Date().toISOString(),
      };
      engine.attachPolicy("w5", policy);

      const tx = buildTransferTx(1000); // Uses SystemProgram
      const violation = engine.checkTransaction("w5", tx, {
        action: "test",
      });
      expect(violation).toBeNull();
    });
  });

  describe("checkTransaction — blocked programs", () => {
    it("should block programs in blocklist", () => {
      const policy: Policy = {
        id: "p6",
        name: "blocklist-test",
        rules: [
          {
            name: "blocked",
            blockedPrograms: ["11111111111111111111111111111111"],
          },
        ],
        createdAt: new Date().toISOString(),
      };
      engine.attachPolicy("w6", policy);

      const tx = buildTransferTx(1000);
      const violation = engine.checkTransaction("w6", tx, {
        action: "test",
      });
      expect(violation).toContain("is blocked");
    });
  });

  describe("checkTransaction — no policy", () => {
    it("should allow any transaction if no policy attached", () => {
      const tx = buildTransferTx(100 * LAMPORTS_PER_SOL);
      const violation = engine.checkTransaction("no-policy", tx, {
        action: "test",
      });
      expect(violation).toBeNull();
    });
  });

  describe("checkTransaction — cooldown", () => {
    it("should enforce cooldown between transactions", () => {
      const policy: Policy = {
        id: "p7",
        name: "cooldown-test",
        rules: [{ name: "cooldown", cooldownMs: 60_000 }],
        createdAt: new Date().toISOString(),
      };
      engine.attachPolicy("w7", policy);
      engine.recordTransaction("w7");

      const tx = buildTransferTx(1000);
      const violation = engine.checkTransaction("w7", tx, {
        action: "test",
      });
      expect(violation).toContain("Cooldown active");
    });
  });

  describe("getTransactionStats", () => {
    it("should return correct stats", () => {
      engine.recordTransaction("w8", 1000);
      engine.recordTransaction("w8", 2000);

      const stats = engine.getTransactionStats("w8");
      expect(stats.txLastHour).toBe(2);
      expect(stats.txLastDay).toBe(2);
      expect(stats.spendLastDay).toBe(3000);
      expect(stats.lastTxTime).toBeGreaterThan(0);
    });

    it("should return zero stats for unknown wallet", () => {
      const stats = engine.getTransactionStats("unknown");
      expect(stats.txLastHour).toBe(0);
      expect(stats.txLastDay).toBe(0);
      expect(stats.spendLastDay).toBe(0);
      expect(stats.lastTxTime).toBeNull();
    });
  });

  describe("createDevnetPolicy", () => {
    it("should create a valid devnet policy with sensible defaults", () => {
      const policy = PolicyEngine.createDevnetPolicy();
      expect(policy.name).toBe("devnet-safety");
      expect(policy.rules).toHaveLength(1);

      const rule = policy.rules[0];
      expect(rule.maxLamportsPerTx).toBe(2 * LAMPORTS_PER_SOL);
      expect(rule.maxTxPerHour).toBe(30);
      expect(rule.maxTxPerDay).toBe(200);
      expect(rule.cooldownMs).toBe(2000);
      expect(rule.maxDailySpendLamports).toBe(10 * LAMPORTS_PER_SOL);
      expect(rule.allowedPrograms).toContain(
        "11111111111111111111111111111111",
      );
    });
  });

  describe("checkLimits — versioned transaction guardrails", () => {
    it("should allow transactions under the per-tx lamport cap", () => {
      const policy: Policy = {
        id: "p-vt1",
        name: "test",
        rules: [{ name: "cap", maxLamportsPerTx: LAMPORTS_PER_SOL }],
        createdAt: new Date().toISOString(),
      };
      engine.attachPolicy("vt1", policy);
      expect(engine.checkLimits("vt1", 0.5 * LAMPORTS_PER_SOL)).toBeNull();
    });

    it("should block transactions over the per-tx lamport cap", () => {
      const policy: Policy = {
        id: "p-vt2",
        name: "test",
        rules: [{ name: "cap", maxLamportsPerTx: LAMPORTS_PER_SOL }],
        createdAt: new Date().toISOString(),
      };
      engine.attachPolicy("vt2", policy);
      const violation = engine.checkLimits("vt2", 3 * LAMPORTS_PER_SOL);
      expect(violation).toContain("exceeds max");
    });

    it("should enforce rate limits for versioned transactions", () => {
      const policy: Policy = {
        id: "p-vt3",
        name: "test",
        rules: [{ name: "rate", maxTxPerHour: 2 }],
        createdAt: new Date().toISOString(),
      };
      engine.attachPolicy("vt3", policy);
      engine.recordTransaction("vt3");
      engine.recordTransaction("vt3");
      const violation = engine.checkLimits("vt3", 0);
      expect(violation).toContain("Rate limit exceeded");
    });

    it("should enforce cooldown for versioned transactions", () => {
      const policy: Policy = {
        id: "p-vt4",
        name: "test",
        rules: [{ name: "cool", cooldownMs: 60_000 }],
        createdAt: new Date().toISOString(),
      };
      engine.attachPolicy("vt4", policy);
      engine.recordTransaction("vt4");
      const violation = engine.checkLimits("vt4", 0);
      expect(violation).toContain("Cooldown active");
    });

    it("should enforce daily spend cap for versioned transactions", () => {
      const policy: Policy = {
        id: "p-vt5",
        name: "test",
        rules: [{ name: "daily", maxDailySpendLamports: 2 * LAMPORTS_PER_SOL }],
        createdAt: new Date().toISOString(),
      };
      engine.attachPolicy("vt5", policy);
      engine.recordTransaction("vt5", 1.5 * LAMPORTS_PER_SOL);
      const violation = engine.checkLimits("vt5", LAMPORTS_PER_SOL);
      expect(violation).toContain("Daily spend limit");
    });

    it("should allow when no policy is attached", () => {
      expect(
        engine.checkLimits("no-policy-wallet", 999 * LAMPORTS_PER_SOL),
      ).toBeNull();
    });

    it("should skip per-tx cap when estimatedLamports is 0", () => {
      const policy: Policy = {
        id: "p-vt6",
        name: "test",
        rules: [{ name: "cap", maxLamportsPerTx: LAMPORTS_PER_SOL }],
        createdAt: new Date().toISOString(),
      };
      engine.attachPolicy("vt6", policy);
      // 0 means unknown amount — should not trigger amount cap
      expect(engine.checkLimits("vt6", 0)).toBeNull();
    });
  });
});
