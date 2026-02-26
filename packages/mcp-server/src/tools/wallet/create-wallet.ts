/**
 * tools/create-wallet.ts
 *
 * MCP tool – create a new Solana wallet with encrypted key storage.
 */

import { z } from "zod";
import { PolicyEngine } from "@agentic-wallet/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerCreateWalletTool(
  server: McpServer,
  services: WalletServices,
) {
  const { config, walletService } = services;

  server.registerTool(
    "create_wallet",
    {
      title: "Create Wallet",
      description:
        "Create a new Solana wallet with AES-256-GCM encrypted key storage. " +
        "Returns the wallet ID and public key. A devnet safety policy " +
        "(2 SOL per-tx limit, rate limits) is attached by default.",
      inputSchema: {
        label: z
          .string()
          .optional()
          .default("agent-wallet")
          .describe("Human-readable label for the wallet"),
        attach_policy: z
          .boolean()
          .optional()
          .default(true)
          .describe("Attach the default devnet safety policy"),
      },
      annotations: {
        title: "Create Wallet",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ label, attach_policy }) => {
      const policy = attach_policy
        ? PolicyEngine.createDevnetPolicy()
        : undefined;
      const wallet = await walletService.createWallet(label, policy);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: wallet.id,
                label: wallet.label,
                publicKey: wallet.publicKey,
                cluster: config.cluster,
                policyAttached: attach_policy,
                note: "Fund this wallet at https://faucet.solana.com by pasting the public key.",
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
