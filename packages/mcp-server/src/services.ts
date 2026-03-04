/**
 * services.ts
 *
 * Extends the shared core service factory with MCP-specific services
 * (e.g. JupiterService).  Tool files receive this augmented bag.
 */

import {
  createCoreServices,
  type CoreServices,
  JupiterService,
  X402Client,
} from "@agentic-wallet/core";

// ── Types ────────────────────────────────────────────────────────────────────

export interface WalletServices extends CoreServices {
  jupiterService: JupiterService;
  x402Client: X402Client;
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

/**
 * Create core services + MCP-specific extras.
 * Called once at startup so all tool handlers share the same instances.
 */
export function createServices(): WalletServices {
  const core = createCoreServices();

  const jupiterService = new JupiterService({
    defaultSlippageBps: 50,
    maxSlippageBps: 300,
    maxPriceImpactPct: 5,
    cluster: core.config.cluster,
  });

  const x402Client = new X402Client({
    preferredNetwork: X402Client.getNetworkId(core.config.cluster),
    autoRetry: true,
    maxPaymentLamports: 1_000_000_000, // 1 SOL default max
  });

  return { ...core, jupiterService, x402Client };
}
