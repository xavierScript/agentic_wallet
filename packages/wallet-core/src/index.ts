/**
 * @agentic-wallet/core
 * Solana wallet SDK for autonomous AI agents.
 * Provides keypair generation, encrypted storage, transaction signing,
 * policy enforcement, and audit logging.
 */

export { KeyManager, type KeystoreEntry } from "./key-manager.js";
export { WalletService, type WalletInfo } from "./wallet-service.js";
export {
  PolicyEngine,
  type Policy,
  type PolicyRule,
} from "./guardrails/index.js";
export { AuditLogger, type AuditLogEntry } from "./audit-logger.js";
export {
  TransactionBuilder,
  SplTokenService,
  type TokenAccountInfo,
  JupiterService,
  type JupiterQuote,
  type SwapResult,
  type JupiterTokenInfo,
  type JupiterServiceConfig,
  WELL_KNOWN_TOKENS,
} from "./protocols/index.js";
export { SolanaConnection } from "./connection.js";
export { type AgentWalletConfig, getDefaultConfig } from "./config.js";
export { createCoreServices, type CoreServices } from "./service-factory.js";
