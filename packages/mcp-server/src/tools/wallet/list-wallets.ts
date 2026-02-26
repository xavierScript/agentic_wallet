/**
 * tools/list-wallets.ts
 *
 * MCP tool – list all managed wallets with their balances.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerListWalletsTool(
  server: McpServer,
  services: WalletServices,
) {
  const { walletService } = services;

  server.registerTool(
    "list_wallets",
    {
      title: "List Wallets",
      description:
        "List all wallets managed by the agentic wallet system, " +
        "including their IDs, labels, public keys, and current SOL balances.",
      annotations: {
        title: "List Wallets",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const wallets = await walletService.listWallets();

      return {
        content: [
          {
            type: "text" as const,
            text:
              wallets.length === 0
                ? "No wallets found. Use create_wallet to create one."
                : JSON.stringify(
                    wallets.map((w) => ({
                      id: w.id,
                      label: w.label,
                      publicKey: w.publicKey,
                      balanceSol: w.balanceSol,
                    })),
                    null,
                    2,
                  ),
          },
        ],
      };
    },
  );
}
