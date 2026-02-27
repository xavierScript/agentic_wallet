/**
 * resources/wallet/all-wallets.ts
 *
 * MCP resource — static list of all managed wallets with balances.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerAllWalletsResource(
  server: McpServer,
  services: WalletServices,
): void {
  const { walletService } = services;

  server.registerResource(
    "all-wallets",
    "wallet://wallets",
    {
      title: "All Wallets",
      description:
        "Lists every managed wallet with its ID, label, public key, and current SOL balance. " +
        "Use this to discover available wallets before performing operations.",
      mimeType: "application/json",
    },
    async () => {
      const wallets = await walletService.listWallets();
      return {
        contents: [
          {
            uri: "wallet://wallets",
            mimeType: "application/json",
            text: JSON.stringify(
              {
                walletCount: wallets.length,
                wallets: wallets.map((w) => ({
                  id: w.id,
                  label: w.label,
                  publicKey: w.publicKey,
                  balanceSol: w.balanceSol,
                  createdAt: w.createdAt,
                })),
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
