/**
 * prompts/analysis/risk-assessment.ts
 *
 * MCP prompt — performs a risk assessment before a significant transaction,
 * checking balances, policies, and recent activity for anomalies.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerRiskAssessmentPrompt(
  server: McpServer,
  _services: WalletServices,
): void {
  server.registerPrompt(
    "risk-assessment",
    {
      title: "Risk Assessment",
      description:
        "Pre-transaction risk analysis for a wallet. Evaluates balance exposure, " +
        "policy compliance, recent error rates, and provides a go/no-go recommendation.",
      argsSchema: {
        wallet_id: z.string().describe("The wallet ID to assess"),
        transaction_type: z
          .enum(["transfer", "swap", "mint", "airdrop"])
          .optional()
          .describe("Type of transaction being considered (default: transfer)"),
        amount_sol: z
          .string()
          .optional()
          .describe("Estimated SOL amount for the transaction"),
      },
    },
    async ({ wallet_id, transaction_type, amount_sol }) => {
      const txType = transaction_type || "transfer";
      const amount = amount_sol || "unknown";

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `Perform a risk assessment for wallet **${wallet_id}** before executing a **${txType}** transaction.`,
                amount !== "unknown"
                  ? `Estimated amount: **${amount} SOL**`
                  : "",
                ``,
                `## Assessment Steps`,
                ``,
                `### 1. Balance Check`,
                `- Read the wallet://wallets/${wallet_id} resource`,
                `- Report current SOL balance and token holdings`,
                `- Calculate what percentage of the wallet this transaction represents`,
                amount !== "unknown"
                  ? `- Flag if the transaction would use more than 50% of the balance`
                  : "",
                ``,
                `### 2. Policy Compliance`,
                `- Read the wallet://wallets/${wallet_id}/policy resource`,
                `- Check if a policy exists. If not, **warn** that the wallet has no guardrails`,
                `- If a policy exists, verify:`,
                `  - Transaction amount is within \`maxLamportsPerTx\``,
                `  - Rate limits (\`maxTxPerHour\`, \`maxTxPerDay\`) are not exhausted`,
                `  - Daily spend cap is not exceeded`,
                ``,
                `### 3. Activity Analysis`,
                `- Read the wallet://wallets/${wallet_id}/audit-logs resource`,
                `- Count recent failures — if error rate > 30%, flag a warning`,
                `- Check for rapid repeated transactions (possible loop or bug)`,
                `- Note the time since last transaction`,
                ``,
                `### 4. Risk Score & Recommendation`,
                `Assign a risk score from 1-10 based on:`,
                `- Balance exposure (higher % = higher risk)`,
                `- Policy presence and strictness`,
                `- Recent failure rate`,
                `- Transaction type (swaps are riskier than airdrops)`,
                ``,
                `Provide a clear **GO** or **NO-GO** recommendation with reasoning.`,
                `If NO-GO, suggest specific actions to reduce risk (e.g., reduce amount, add policy, wait for cooldown).`,
              ]
                .filter(Boolean)
                .join("\n"),
            },
          },
        ],
      };
    },
  );
}
