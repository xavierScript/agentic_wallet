/**
 * @agentic-wallet/core
 * Solana wallet SDK for autonomous AI agents.
 * Provides keypair generation, encrypted storage, transaction signing,
 * policy enforcement, and audit logging.
 */

export { KeyManager, type KeystoreEntry } from "./core/key-manager.js";
export {
  WalletService,
  type WalletInfo,
  type TransactionResult,
} from "./core/wallet-service.js";
export {
  PolicyEngine,
  type Policy,
  type PolicyRule,
  HUMAN_ONLY,
  type HumanOnlyOpts,
} from "./guardrails/index.js";
export { AuditLogger, type AuditLogEntry } from "./core/audit-logger.js";
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
  X402Client,
  type PaymentRequirements,
  type PaymentRequired,
  type PaymentPayload,
  type SettlementResponse,
  type X402PaymentResult,
  type X402ClientConfig,
} from "./protocols/index.js";
export { SolanaConnection } from "./core/connection.js";
export { type AgentWalletConfig, getDefaultConfig } from "./core/config.js";
export {
  createCoreServices,
  type CoreServices,
} from "./core/service-factory.js";
export { MasterFunder, type MasterFunderConfig } from "./core/master-funder.js";
export {
  KoraService,
  type KoraServiceConfig,
  type KoraPayerInfo,
  type KoraNodeConfig,
  type KoraSignAndSendResult,
  type KoraSignResult,
} from "./protocols/kora-service.js";
