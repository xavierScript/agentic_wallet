/**
 * service-factory.ts
 *
 * Single-source-of-truth factory for all wallet-core services.
 * Both the CLI and MCP server import from here to avoid duplication.
 */

import { KeyManager } from "./key-manager.js";
import { WalletService } from "./wallet-service.js";
import { PolicyEngine } from "./guardrails/policy-engine.js";
import { AuditLogger } from "./audit-logger.js";
import { SolanaConnection } from "./connection.js";
import { TransactionBuilder } from "./protocols/transaction-builder.js";
import { SplTokenService } from "./protocols/spl-token.js";
import { getDefaultConfig, type AgentWalletConfig } from "./config.js";

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Core services shared by every consumer (CLI, MCP, tests, etc.).
 */
export interface CoreServices {
  config: AgentWalletConfig;
  connection: SolanaConnection;
  keyManager: KeyManager;
  policyEngine: PolicyEngine;
  auditLogger: AuditLogger;
  walletService: WalletService;
  txBuilder: TransactionBuilder;
  splTokenService: SplTokenService;
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create and return every core wallet service.
 * Called once at startup so all consumers share the same instances.
 */
export function createCoreServices(): CoreServices {
  const config = getDefaultConfig();
  const connection = new SolanaConnection(config.rpcUrl, config.cluster);
  const keyManager = new KeyManager(config.keystoreDir, config.passphrase);

  const home = process.env.HOME || process.env.USERPROFILE || ".";
  const policyEngine = new PolicyEngine(`${home}/.agentic-wallet/policies`);

  const auditLogger = new AuditLogger(config.logDir);
  const walletService = new WalletService(
    keyManager,
    policyEngine,
    auditLogger,
    connection,
  );

  const txBuilder = new TransactionBuilder(connection);
  const splTokenService = new SplTokenService(connection);

  return {
    config,
    connection,
    keyManager,
    policyEngine,
    auditLogger,
    walletService,
    txBuilder,
    splTokenService,
  };
}
