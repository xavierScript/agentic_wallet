/**
 * resources/payments/x402-config.ts
 *
 * MCP resource — exposes x402 payment protocol configuration and status.
 * Agents can read this to understand the current x402 capabilities,
 * supported networks, and payment limits.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerX402ConfigResource(
  server: McpServer,
  services: WalletServices,
): void {
  const { config, x402Client } = services;

  server.registerResource(
    "x402-config",
    "wallet://x402/config",
    {
      title: "x402 Payment Protocol Configuration",
      description:
        "Current x402 payment protocol configuration including supported networks, " +
        "payment limits, and protocol version. Read this to understand what x402 " +
        "payment capabilities are available.",
      mimeType: "application/json",
    },
    async () => {
      const networkId = (
        await import("@agentic-wallet/core")
      ).X402Client.getNetworkId(config.cluster);

      return {
        contents: [
          {
            uri: "wallet://x402/config",
            mimeType: "application/json",
            text: JSON.stringify(
              {
                protocol: "x402",
                version: 1,
                description:
                  "x402 is an open standard for HTTP-native payments on Solana. " +
                  "When an API responds with 402 Payment Required, the agent " +
                  "automatically builds a signed SPL Transfer transaction and " +
                  "retries with an X-Payment header. The server verifies and " +
                  "broadcasts the transaction, then returns the resource. " +
                  "Note: https://x402.org/protected runs on Base (EVM). " +
                  "For Solana use a local server: https://github.com/Woody4618/x402-solana-examples",
                supportedSchemes: ["exact"],
                paymentToken: {
                  name: "USDC (devnet)",
                  mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
                  faucet: "https://faucet.circle.com/",
                },
                supportedNetworks: [
                  networkId,
                  "solana-devnet",
                  "solana-mainnet",
                ],
                currentCluster: config.cluster,
                capabilities: {
                  payForResource:
                    "Use pay_x402 tool to access x402-protected APIs",
                  probeResource:
                    "Use probe_x402 tool to check pricing before paying",
                },
                tools: [
                  {
                    name: "pay_x402",
                    description:
                      "Pay for and access an x402-protected HTTP resource",
                  },
                  {
                    name: "probe_x402",
                    description:
                      "Check if a URL requires x402 payment and see pricing",
                  },
                ],
                links: {
                  specification: "https://github.com/coinbase/x402",
                  documentation: "https://x402.org",
                },
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
