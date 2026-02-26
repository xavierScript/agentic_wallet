/**
 * tools/get-status.ts
 *
 * MCP tool – get overall system status.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerGetStatusTool(
  server: McpServer,
  services: WalletServices,
) {
  const { config, walletService, auditLogger } = services;

  server.registerTool(
    "get_status",
    {
      title: "Get Status",
      description:
        "Get the overall system status including cluster, RPC endpoint, " +
        "wallet count, and recent activity.",
      annotations: {
        title: "Get Status",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const wallets = await walletService.listWallets();
      const recentLogs = auditLogger.readRecentLogs(5);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                cluster: config.cluster,
                rpcUrl: config.rpcUrl,
                walletCount: wallets.length,
                wallets: wallets.map((w) => ({
                  id: w.id,
                  label: w.label,
                  balanceSol: w.balanceSol,
                })),
                recentActivity: recentLogs.map((log) => ({
                  action: log.action,
                  success: log.success,
                  timestamp: log.timestamp,
                  walletId: log.walletId,
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
