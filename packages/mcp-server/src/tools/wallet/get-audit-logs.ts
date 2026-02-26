/**
 * tools/get-audit-logs.ts
 *
 * MCP tool – retrieve recent audit log entries.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerGetAuditLogsTool(
  server: McpServer,
  services: WalletServices,
) {
  const { auditLogger } = services;

  server.registerTool(
    "get_audit_logs",
    {
      title: "Get Audit Logs",
      description:
        "Retrieve recent audit log entries. Every wallet operation (creation, " +
        "transfers, policy violations, etc.) is recorded in the audit trail.",
      inputSchema: {
        count: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(20)
          .describe("Number of log entries to retrieve"),
        wallet_id: z
          .string()
          .optional()
          .describe("Filter logs by wallet ID (optional)"),
      },
      annotations: {
        title: "Get Audit Logs",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ count, wallet_id }) => {
      const logs = wallet_id
        ? auditLogger.readWalletLogs(wallet_id, count)
        : auditLogger.readRecentLogs(count);

      return {
        content: [
          {
            type: "text" as const,
            text:
              logs.length === 0
                ? "No audit logs found."
                : JSON.stringify(logs, null, 2),
          },
        ],
      };
    },
  );
}
