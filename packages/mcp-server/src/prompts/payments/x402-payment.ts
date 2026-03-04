/**
 * prompts/payments/x402-payment.ts
 *
 * MCP prompt — guides an AI agent through using x402 payments
 * to access paid HTTP resources.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerX402PaymentPrompt(
  server: McpServer,
  _services: WalletServices,
): void {
  server.registerPrompt(
    "x402-payment",
    {
      title: "x402 Payment Flow",
      description:
        "Step-by-step guide for using x402 payments to access paid HTTP resources. " +
        "Walks through probing a URL for pricing, selecting a wallet, and making " +
        "the payment to retrieve the protected content.",
      argsSchema: {
        url: z
          .string()
          .optional()
          .describe("URL of the x402-protected resource to access"),
        wallet_id: z
          .string()
          .optional()
          .describe(
            "Wallet ID to use for payment (will list wallets if not provided)",
          ),
      },
    },
    async ({ url, wallet_id }) => {
      const targetUrl = url || "<URL of the x402-protected resource>";
      const walletInstructions = wallet_id
        ? `Use wallet \`${wallet_id}\` for payment.`
        : "First, use `list_wallets` to see available wallets and choose one with sufficient balance.";

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `I want to access an x402-protected HTTP resource and pay for it using my Solana wallet.`,
                ``,
                `**Target URL**: ${targetUrl}`,
                ``,
                `Please perform these steps in order:`,
                ``,
                `1. **Check wallet readiness**: ${walletInstructions}`,
                `   - Verify the wallet holds devnet USDC (mint \`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU\`) — x402 payments on Solana use USDC, not SOL`,
                `   - Check the wallet's policy allows the transaction`,
                ``,
                `2. **Probe the resource**: Use \`probe_x402\` to check the URL`,
                `   - Confirm it requires x402 payment`,
                `   - Report the price, accepted tokens, and network`,
                `   - Verify our wallet's network matches the payment requirements`,
                ``,
                `3. **Review costs**: Before paying, tell me:`,
                `   - Exact amount to be charged`,
                `   - Token being used for payment`,
                `   - Whether the amount is within the wallet's spending limits`,
                ``,
                `4. **Make the payment**: Use \`pay_x402\` to pay for and retrieve the resource`,
                `   - Report the transaction settlement details`,
                `   - Show the resource content received`,
                ``,
                `5. **Verify**: Check the audit logs to confirm the payment was recorded`,
                ``,
                `If any step fails, explain the error and suggest how to fix it.`,
              ].join("\n"),
            },
          },
        ],
      };
    },
  );
}
