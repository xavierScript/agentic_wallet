/**
 * prompts/setup/wallet-setup.ts
 *
 * MCP prompt — guides an AI agent through creating and configuring
 * a new wallet with appropriate security policies.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerWalletSetupPrompt(
  server: McpServer,
  _services: WalletServices,
): void {
  server.registerPrompt(
    "wallet-setup",
    {
      title: "Wallet Setup",
      description:
        "Step-by-step guide for creating a new agentic wallet with security policies. " +
        "Walks through wallet creation, policy configuration, and initial funding via airdrop.",
      argsSchema: {
        wallet_label: z
          .string()
          .optional()
          .describe(
            "Human-readable label for the new wallet (default: agent-wallet)",
          ),
        risk_level: z
          .enum(["conservative", "moderate", "aggressive"])
          .optional()
          .describe(
            "Risk level determines default policy — conservative (strict limits), " +
              "moderate (balanced), or aggressive (relaxed limits)",
          ),
      },
    },
    async ({ wallet_label, risk_level }) => {
      const label = wallet_label || "agent-wallet";
      const risk = risk_level || "moderate";

      const policyPresets: Record<string, string> = {
        conservative:
          "maxLamportsPerTx: 100_000_000 (0.1 SOL), maxTxPerHour: 5, maxTxPerDay: 20, maxDailySpendLamports: 500_000_000 (0.5 SOL)",
        moderate:
          "maxLamportsPerTx: 500_000_000 (0.5 SOL), maxTxPerHour: 15, maxTxPerDay: 100, maxDailySpendLamports: 2_000_000_000 (2 SOL)",
        aggressive:
          "maxLamportsPerTx: 2_000_000_000 (2 SOL), maxTxPerHour: 50, maxTxPerDay: 500, maxDailySpendLamports: 10_000_000_000 (10 SOL)",
      };

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `I need to set up a new agentic wallet with the following configuration:`,
                ``,
                `- **Label**: ${label}`,
                `- **Risk Level**: ${risk}`,
                `- **Network**: devnet`,
                ``,
                `Please perform these steps in order:`,
                ``,
                `1. **Create the wallet** using the \`create_wallet\` tool with label "${label}"`,
                `2. **Configure a ${risk} policy** with these limits:`,
                `   ${policyPresets[risk]}`,
                `3. **Request an airdrop** of 2 SOL to fund the wallet for testing`,
                `4. **Verify the setup** by checking the wallet balance and confirming the policy is active`,
                ``,
                `After each step, report the result before moving on. If any step fails, explain the error and suggest a fix.`,
              ].join("\n"),
            },
          },
        ],
      };
    },
  );
}
