/**
 * tools/get-policy.ts
 *
 * MCP tool – get the safety policy attached to a wallet.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerGetPolicyTool(
  server: McpServer,
  services: WalletServices,
) {
  const { policyEngine } = services;

  server.registerTool(
    "get_policy",
    {
      title: "Get Policy",
      description:
        "Get the policy attached to a wallet, including spending limits, " +
        "rate limits, and allowed programs. Also returns current transaction statistics.",
      inputSchema: {
        wallet_id: z.string().describe("The wallet ID (UUID) to check"),
      },
      annotations: {
        title: "Get Policy",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ wallet_id }) => {
      const policy = policyEngine.getPolicy(wallet_id);
      const stats = policyEngine.getTransactionStats(wallet_id);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                walletId: wallet_id,
                policy: policy || "No policy attached",
                currentStats: stats,
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
