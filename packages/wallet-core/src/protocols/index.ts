/**
 * protocols/index.ts
 *
 * Barrel re-exports for all on-chain protocol integrations.
 * Includes SPL Token operations, Jupiter DEX swaps, and
 * high-level transaction builders.
 */

export { SplTokenService, type TokenAccountInfo } from "./spl-token.js";
export { TransactionBuilder } from "./transaction-builder.js";
export {
  JupiterService,
  type JupiterQuote,
  type SwapResult,
  type JupiterTokenInfo,
  type JupiterServiceConfig,
  WELL_KNOWN_TOKENS,
} from "./jupiter-service.js";
export {
  X402Client,
  type PaymentRequirements,
  type PaymentRequired,
  type PaymentPayload,
  type SettlementResponse,
  type X402PaymentResult,
  type X402ClientConfig,
} from "./x402-client.js";
export {
  KoraService,
  type KoraServiceConfig,
  type KoraPayerInfo,
  type KoraNodeConfig,
  type KoraSignAndSendResult,
  type KoraSignResult,
} from "./kora-service.js";
