/**
 * prompts/trading/portfolio-rebalance.ts
 *
 * MCP prompt — guides an AI agent through rebalancing SOL across
 * multiple wallets based on target allocation percentages.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerPortfolioRebalancePrompt(
  server: McpServer,
  _services: WalletServices,
): void {
  server.registerPrompt(
    "portfolio-rebalance",
    {
      title: "Portfolio Rebalance",
      description:
        "Plans and executes SOL rebalancing across multiple agent wallets " +
        "to maintain target allocation ratios. Useful for multi-agent setups.",
      argsSchema: {
        target_allocation: z
          .string()
          .optional()
          .describe(
            "Target allocation as comma-separated percentages matching wallet order " +
              "(e.g., '50,30,20'). Default: equal split across all wallets.",
          ),
      },
    },
    async ({ target_allocation }) => {
      const allocation = target_allocation || "equal";

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `Rebalance SOL across all agent wallets.`,
                ``,
                `**Target allocation**: ${allocation === "equal" ? "Equal split across all wallets" : allocation + " (percentages in wallet order)"}`,
                ``,
                `## Step 1: Inventory`,
                ``,
                `- Read **wallet://wallets** to get all wallets and current balances`,
                `- Calculate total SOL across all wallets`,
                `- Determine current allocation percentages`,
                ``,
                `## Step 2: Plan Transfers`,
                ``,
                `- Calculate the target SOL amount for each wallet based on the desired allocation`,
                `- Determine which wallets need to send and which need to receive`,
                `- Ensure each transfer respects the wallet's policy limits`,
                `- Account for transaction fees (~0.000005 SOL per transfer)`,
                `- Minimize the number of transfers needed`,
                ``,
                `## Step 3: Risk Check`,
                ``,
                `Before executing, verify:`,
                `- [ ] Total SOL is conserved (minus fees)`,
                `- [ ] No single transfer exceeds any wallet's maxLamportsPerTx`,
                `- [ ] No wallet will be left with 0 SOL (need rent-exempt minimum)`,
                `- [ ] Rate limits won't be hit if multiple transfers needed`,
                ``,
                `Present the transfer plan and wait for confirmation before executing.`,
                ``,
                `## Step 4: Execute`,
                ``,
                `Execute each transfer using \`send_sol\`, reporting:`,
                `- From wallet → To wallet: amount SOL (tx signature)`,
                ``,
                `## Step 5: Verify`,
                ``,
                `- Re-read **wallet://wallets** to confirm new balances`,
                `- Show before/after comparison table`,
                `- Report any deviations from target allocation`,
              ].join("\n"),
            },
          },
        ],
      };
    },
  );
}
