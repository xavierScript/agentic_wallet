/**
 * resources/wallet/wallet-policy.ts
 *
 * MCP resource — template for a single wallet's transaction policy.
 */

import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerWalletPolicyResource(
  server: McpServer,
  services: WalletServices,
): void {
  const { keyManager, policyEngine } = services;

  server.registerResource(
    "wallet-policy",
    new ResourceTemplate("wallet://wallets/{walletId}/policy", {
      list: async () => {
        const entries = keyManager.listWallets();
        return {
          resources: entries.map((e) => ({
            uri: `wallet://wallets/${e.id}/policy`,
            name: `Policy: ${e.label}`,
            description: `Transaction policy for wallet ${e.label}`,
            mimeType: "application/json",
          })),
        };
      },
      complete: {
        walletId: async () => keyManager.listWallets().map((e) => e.id),
      },
    }),
    {
      title: "Wallet Policy",
      description:
        "The transaction policy (rate limits, spend caps, program allowlists) " +
        "for a specific wallet. Returns null if no policy is attached.",
      mimeType: "application/json",
    },
    async (_uri, variables) => {
      const walletId = String(variables.walletId);
      const policy = policyEngine.getPolicy(walletId);
      return {
        contents: [
          {
            uri: `wallet://wallets/${walletId}/policy`,
            mimeType: "application/json",
            text: JSON.stringify(
              { walletId, hasPolicy: !!policy, policy: policy || null },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
