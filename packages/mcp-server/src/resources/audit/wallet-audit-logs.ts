/**
 * resources/audit/wallet-audit-logs.ts
 *
 * MCP resource — template for per-wallet audit log history.
 */

import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerWalletAuditLogsResource(
  server: McpServer,
  services: WalletServices,
): void {
  const { auditLogger, keyManager } = services;

  server.registerResource(
    "wallet-audit-logs",
    new ResourceTemplate("wallet://wallets/{walletId}/audit-logs", {
      list: async () => {
        const entries = keyManager.listWallets();
        return {
          resources: entries.map((e) => ({
            uri: `wallet://wallets/${e.id}/audit-logs`,
            name: `Logs: ${e.label}`,
            description: `Audit log history for wallet ${e.label}`,
            mimeType: "application/json",
          })),
        };
      },
      complete: {
        walletId: async () => keyManager.listWallets().map((e) => e.id),
      },
    }),
    {
      title: "Wallet Audit Logs",
      description:
        "Audit log entries filtered to a specific wallet. Shows the last 30 operations " +
        "for a given wallet ID, useful for reviewing agent decision history.",
      mimeType: "application/json",
    },
    async (_uri, variables) => {
      const walletId = String(variables.walletId);
      const logs = auditLogger.readWalletLogs(walletId, 30);
      return {
        contents: [
          {
            uri: `wallet://wallets/${walletId}/audit-logs`,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                walletId,
                count: logs.length,
                entries: logs.map((l) => ({
                  timestamp: l.timestamp,
                  action: l.action,
                  txSignature: l.txSignature,
                  success: l.success,
                  error: l.error,
                  details: l.details,
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
