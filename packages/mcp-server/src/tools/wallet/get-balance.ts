/**
 * tools/get-balance.ts
 *
 * MCP tool – get SOL + SPL token balances for a wallet.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerGetBalanceTool(
  server: McpServer,
  services: WalletServices,
) {
  const { walletService } = services;

  server.registerTool(
    "get_balance",
    {
      title: "Get Balance",
      description:
        "Get the SOL balance and SPL token balances for a specific wallet.",
      inputSchema: {
        wallet_id: z.string().describe("The wallet ID (UUID) to check"),
      },
      annotations: {
        title: "Get Balance",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ wallet_id }) => {
      const info = await walletService.getWalletInfo(wallet_id);
      const tokens = await walletService.getTokenBalances(wallet_id);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: info.id,
                label: info.label,
                publicKey: info.publicKey,
                balanceSol: info.balanceSol,
                balanceLamports: info.balanceLamports,
                tokens: tokens.map((t) => ({
                  mint: t.mint,
                  amount: t.uiAmount,
                  decimals: t.decimals,
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
