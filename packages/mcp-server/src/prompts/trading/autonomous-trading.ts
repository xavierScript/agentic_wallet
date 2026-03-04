/**
 * prompts/trading/autonomous-trading.ts
 *
 * MCP prompt — guides an AI agent through running an autonomous trading
 * loop: repeatedly fetch prices, evaluate a strategy, and execute trades.
 *
 * The agent IS the trading bot — this prompt gives it the instructions
 * to run a multi-tick loop using the fetch_prices, evaluate_strategy,
 * and swap_tokens tools.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerAutonomousTradingPrompt(
  server: McpServer,
  _services: WalletServices,
): void {
  server.registerPrompt(
    "autonomous-trading",
    {
      title: "Autonomous Trading Bot",
      description:
        "Turns the AI agent into an autonomous trading bot. The agent runs a " +
        "multi-tick loop of: fetch prices → evaluate strategy → execute trade, " +
        "using the specified strategy and wallet. All trades go through the " +
        "policy engine — the agent is constrained by the same spend caps, " +
        "rate limits, and cooldowns as any other operation.",
      argsSchema: {
        wallet_id: z.string().describe("The wallet ID to trade with"),
        strategy: z
          .enum(["threshold-rebalance", "sma-crossover"])
          .optional()
          .describe(
            "Strategy to use. Default: threshold-rebalance. " +
              "Read trading://strategies for details on each.",
          ),
        ticks: z
          .string()
          .optional()
          .describe("Number of ticks to run (default: 5)"),
        target_allocation: z
          .string()
          .optional()
          .describe(
            "For threshold-rebalance: SOL allocation 0–1 (default: 0.7 = 70% SOL)",
          ),
        drift_threshold: z
          .string()
          .optional()
          .describe(
            "For threshold-rebalance: drift before rebalancing 0–1 (default: 0.05 = 5%)",
          ),
      },
    },
    async ({
      wallet_id,
      strategy,
      ticks,
      target_allocation,
      drift_threshold,
    }) => {
      const strat = strategy || "threshold-rebalance";
      const tickCount = ticks || "5";
      const allocation = target_allocation || "0.7";
      const drift = drift_threshold || "0.05";

      const strategyParams =
        strat === "threshold-rebalance"
          ? `   - \`target_allocation\`: ${allocation}\n   - \`drift_threshold\`: ${drift}`
          : `   - \`fast_window\`: 5\n   - \`slow_window\`: 20\n   - \`trade_fraction\`: 0.2`;

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `You are now an **autonomous trading bot**. Execute a **${strat}** strategy ` +
                  `on wallet **${wallet_id}** for **${tickCount} ticks**.`,
                ``,
                `## Strategy Parameters`,
                ``,
                strategyParams,
                ``,
                `## Trading Loop`,
                ``,
                `For each tick (1 to ${tickCount}), execute these steps in order:`,
                ``,
                `### Step 1: Fetch prices`,
                `Call \`fetch_prices\` with tokens "SOL,USDC" to get current USD prices.`,
                ``,
                `### Step 2: Check balance`,
                `Call \`get_balance\` with wallet_id "${wallet_id}" to get current SOL and USDC balances.`,
                ``,
                `### Step 3: Evaluate strategy`,
                `Call \`evaluate_strategy\` with:`,
                `- \`strategy\`: "${strat}"`,
                `- \`wallet_id\`: "${wallet_id}"`,
                `- \`sol_price_usd\`: (from step 1)`,
                `- \`sol_balance\`: (from step 2)`,
                `- \`usdc_balance\`: (from step 2, check for USDC in tokens array, default 0)`,
                strat === "threshold-rebalance"
                  ? `- \`target_allocation\`: ${allocation}\n- \`drift_threshold\`: ${drift}`
                  : `- \`fast_window\`: 5\n- \`slow_window\`: 20\n- \`trade_fraction\`: 0.2`,
                ``,
                `### Step 4: Execute (if not HOLD)`,
                `If the signal is **BUY** or **SELL**, call \`swap_tokens\` with the parameters ` +
                  `from the signal's \`nextStep\` field. ` +
                  `On devnet, swap_tokens returns a simulated result with real Jupiter pricing ` +
                  `(on-chain execution requires mainnet-beta). Treat the simulation as a successful trade for reporting purposes.`,
                `If the signal is **HOLD**, skip to the next tick.`,
                ``,
                `### Step 5: Log`,
                `After each tick, report a one-line summary:`,
                `\`Tick N/T: ACTION — reason (tx: signature or skipped)\``,
                ``,
                `## Rules`,
                ``,
                `- **Do NOT stop** if a swap fails due to a policy violation. Log the error and continue to the next tick.`,
                `- **Do NOT modify** strategy parameters mid-loop.`,
                `- If the wallet has no USDC balance, the USDC balance is 0.`,
                `- After all ticks, provide a **summary table** showing each tick's action, amount, and result.`,
                ``,
                `## Begin`,
                ``,
                `Start tick 1 now.`,
              ].join("\n"),
            },
          },
        ],
      };
    },
  );
}
