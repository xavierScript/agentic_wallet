/**
 * prompts/analysis/daily-report.ts
 *
 * MCP prompt — generates a daily summary of all wallet activity,
 * balances, and key metrics for the agent operator.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerDailyReportPrompt(
  server: McpServer,
  _services: WalletServices,
): void {
  server.registerPrompt(
    "daily-report",
    {
      title: "Daily Report",
      description:
        "Generates a daily operations report summarising wallet balances, " +
        "transaction counts, success/failure rates, and notable events.",
      argsSchema: {
        date: z
          .string()
          .optional()
          .describe("Date to report on in YYYY-MM-DD format (default: today)"),
      },
    },
    async ({ date }) => {
      const reportDate = date || new Date().toISOString().split("T")[0];

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `Generate a daily operations report for **${reportDate}**.`,
                ``,
                `## Data to Gather`,
                ``,
                `1. Read **wallet://system/status** for current system state`,
                `2. Read **wallet://wallets** for all wallet balances`,
                `3. Read **wallet://audit-logs** for today's activity`,
                ``,
                `## Report Sections`,
                ``,
                `### Executive Summary`,
                `- Total wallets active`,
                `- Total SOL held across all wallets`,
                `- Total transactions today`,
                `- Overall success rate`,
                ``,
                `### Wallet Balances`,
                `| Wallet | Label | Balance (SOL) | Change |`,
                `|--------|-------|---------------|--------|`,
                `(Fill in from wallet data — note if balance changes can be inferred from logs)`,
                ``,
                `### Transaction Summary`,
                `|  Action  | Count | Successful | Failed |`,
                `|----------|-------|------------|--------|`,
                `(Group audit log entries by action type)`,
                ``,
                `### Notable Events`,
                `- Any policy violations triggered`,
                `- Any transaction failures and their causes`,
                `- Any new wallets created or closed`,
                `- Any unusually large transactions`,
                ``,
                `### Recommendations`,
                `Based on today's activity, suggest:`,
                `- Policy adjustments (too strict / too loose)`,
                `- Balance management (fund or sweep wallets)`,
                `- Operational improvements`,
                ``,
                `Format the report cleanly in Markdown.`,
              ].join("\n"),
            },
          },
        ],
      };
    },
  );
}
