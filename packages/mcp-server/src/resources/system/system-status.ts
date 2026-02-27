/**
 * resources/system/system-status.ts
 *
 * MCP resource — overall system health, cluster info, and aggregate wallet stats.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerSystemStatusResource(
  server: McpServer,
  services: WalletServices,
): void {
  const { config, walletService, auditLogger, policyEngine } = services;

  server.registerResource(
    "system-status",
    "wallet://system/status",
    {
      title: "System Status",
      description:
        "Overall system health: Solana cluster, RPC endpoint, total wallet count, " +
        "aggregate balances, and recent activity summary. Read this first to " +
        "understand the current state of the agentic wallet system.",
      mimeType: "application/json",
    },
    async () => {
      const wallets = await walletService.listWallets();
      const recentLogs = auditLogger.readRecentLogs(10);
      const totalSol = wallets.reduce((sum, w) => sum + w.balanceSol, 0);

      const walletsWithPolicies = wallets.filter(
        (w) => policyEngine.getPolicy(w.id) !== undefined,
      ).length;

      const actionCounts: Record<string, number> = {};
      for (const log of recentLogs) {
        actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
      }

      return {
        contents: [
          {
            uri: "wallet://system/status",
            mimeType: "application/json",
            text: JSON.stringify(
              {
                cluster: config.cluster,
                rpcUrl: config.rpcUrl,
                walletCount: wallets.length,
                walletsWithPolicies,
                totalBalanceSol: Math.round(totalSol * 1e6) / 1e6,
                wallets: wallets.map((w) => ({
                  id: w.id,
                  label: w.label,
                  publicKey: w.publicKey,
                  balanceSol: w.balanceSol,
                })),
                recentActivity: {
                  entryCount: recentLogs.length,
                  actionSummary: actionCounts,
                  latestAction: recentLogs[0] || null,
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
