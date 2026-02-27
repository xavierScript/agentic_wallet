/**
 * resources/wallet/wallet-detail.ts
 *
 * MCP resource — template for a single wallet's detail including SPL token holdings.
 */

import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerWalletDetailResource(
  server: McpServer,
  services: WalletServices,
): void {
  const { walletService, keyManager } = services;

  server.registerResource(
    "wallet-detail",
    new ResourceTemplate("wallet://wallets/{walletId}", {
      list: async () => {
        const entries = keyManager.listWallets();
        return {
          resources: entries.map((e) => ({
            uri: `wallet://wallets/${e.id}`,
            name: `Wallet: ${e.label}`,
            description: `Wallet ${e.label} (${e.publicKey.slice(0, 8)}...)`,
            mimeType: "application/json",
          })),
        };
      },
      complete: {
        walletId: async () => keyManager.listWallets().map((e) => e.id),
      },
    }),
    {
      title: "Wallet Detail",
      description:
        "Detailed view of a single wallet including SOL balance, SPL token holdings, " +
        "and metadata. Provide the wallet UUID.",
      mimeType: "application/json",
    },
    async (_uri, variables) => {
      const walletId = String(variables.walletId);
      const info = await walletService.getWalletInfo(walletId);
      let tokens: Array<{ mint: string; uiAmount: number; decimals: number }> =
        [];
      try {
        tokens = (await walletService.getTokenBalances(walletId)).map((t) => ({
          mint: t.mint,
          uiAmount: t.uiAmount,
          decimals: t.decimals,
        }));
      } catch {
        // Token fetch may fail on devnet — still return SOL data
      }

      return {
        contents: [
          {
            uri: `wallet://wallets/${walletId}`,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                id: info.id,
                label: info.label,
                publicKey: info.publicKey,
                balanceSol: info.balanceSol,
                balanceLamports: info.balanceLamports,
                createdAt: info.createdAt,
                metadata: info.metadata,
                tokens,
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
