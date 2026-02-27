/**
 * resources/audit/audit-logs.ts
 *
 * MCP resource — recent audit log entries across all wallets.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerAuditLogsResource(
  server: McpServer,
  services: WalletServices,
): void {
  const { auditLogger } = services;

  server.registerResource(
    "audit-logs",
    "wallet://audit-logs",
    {
      title: "Recent Audit Logs",
      description:
        "The most recent 50 audit log entries across all wallets. " +
        "Includes timestamps, actions, success/failure status, and transaction signatures.",
      mimeType: "application/json",
    },
    async () => {
      const logs = auditLogger.readRecentLogs(50);
      return {
        contents: [
          {
            uri: "wallet://audit-logs",
            mimeType: "application/json",
            text: JSON.stringify(
              {
                count: logs.length,
                entries: logs.map((l) => ({
                  timestamp: l.timestamp,
                  action: l.action,
                  walletId: l.walletId,
                  publicKey: l.publicKey,
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
