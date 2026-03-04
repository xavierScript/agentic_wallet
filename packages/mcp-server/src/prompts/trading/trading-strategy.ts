/**
 * prompts/trading/trading-strategy.ts
 *
 * MCP prompt — helps an AI agent execute a token trading strategy
 * with proper risk management.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerTradingStrategyPrompt(
  server: McpServer,
  _services: WalletServices,
): void {
  server.registerPrompt(
    "trading-strategy",
    {
      title: "Trading Strategy",
      description:
        "Guides an AI agent through executing a token swap on Jupiter with " +
        "pre-trade analysis, risk checks, and post-trade verification.",
      argsSchema: {
        wallet_id: z.string().describe("The wallet ID to trade with"),
        action: z
          .enum(["buy", "sell"])
          .describe("Whether to buy or sell the target token"),
        token_symbol: z
          .string()
          .optional()
          .describe("Token symbol to trade (e.g., USDC, BONK). Default: USDC"),
        amount_sol: z
          .string()
          .optional()
          .describe(
            "Amount of SOL to spend (buy) or equivalent to receive (sell). Default: 0.1",
          ),
      },
    },
    async ({ wallet_id, action, token_symbol, amount_sol }) => {
      const token = token_symbol || "USDC";
      const amount = amount_sol || "0.1";

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `Execute a ${action} trade for **${token}** using wallet **${wallet_id}**.`,
                ``,
                `## Pre-Trade Checklist`,
                ``,
                `1. **Check wallet balance** using \`get_balance\` — confirm the wallet has at least ${amount} SOL available (plus fees)`,
                `2. **Check wallet policy** — read the wallet://wallets/${wallet_id}/policy resource to ensure the trade amount is within limits`,
                `3. **Review recent activity** — read wallet://wallets/${wallet_id}/audit-logs to check for recent failures or rate-limit hits`,
                ``,
                `## Execute Trade`,
                ``,
                `4. **Swap tokens** using \`swap_tokens\`:`,
                action === "buy"
                  ? `   - Input: SOL, Output: ${token}, Amount: ${amount} SOL`
                  : `   - Input: ${token}, Output: SOL, Amount: ${amount} ${token}`,
                `   - Use default slippage (0.5%)`,
                `   - On devnet, this returns a simulated swap with real Jupiter pricing (on-chain execution requires mainnet-beta)`,
                ``,
                `## Post-Trade Verification`,
                ``,
                `5. **Verify new balance** — call \`get_balance\` to confirm token received`,
                `6. **Check audit log** — confirm the swap was logged successfully`,
                `7. **Report summary** — provide a clear summary of input spent, output received, price impact, and route used`,
                ``,
                `If the trade fails, analyze the error (insufficient funds, slippage too high, rate limit) and recommend next steps.`,
              ].join("\n"),
            },
          },
        ],
      };
    },
  );
}
