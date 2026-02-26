/**
 * tools/send-sol.ts
 *
 * MCP tool – send SOL from a wallet to a recipient address.
 */

import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerSendSolTool(
  server: McpServer,
  services: WalletServices,
) {
  const { keyManager, walletService, txBuilder } = services;

  server.registerTool(
    "send_sol",
    {
      title: "Send SOL",
      description:
        "Send SOL from a wallet to a recipient address. The transaction is " +
        "policy-checked before signing (spending limits, rate limits) " +
        "and recorded in the audit log.",
      inputSchema: {
        wallet_id: z.string().describe("Source wallet ID (UUID)"),
        to: z.string().describe("Recipient Solana address (base58 public key)"),
        amount: z.number().positive().describe("Amount of SOL to send"),
      },
      annotations: {
        title: "Send SOL",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ wallet_id, to, amount }) => {
      // Validate recipient address
      let toPk: PublicKey;
      try {
        toPk = new PublicKey(to);
      } catch {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Invalid recipient address "${to}". Must be a valid base58 Solana public key.`,
            },
          ],
          isError: true,
        };
      }

      const entry = keyManager.loadKeystore(wallet_id);
      const fromPk = new PublicKey(entry.publicKey);
      const tx = txBuilder.buildSolTransfer(fromPk, toPk, amount);

      const signature = await walletService.signAndSendTransaction(
        wallet_id,
        tx,
        { action: "sol:transfer", details: { to, amount } },
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                success: true,
                signature,
                from: entry.publicKey,
                to,
                amountSol: amount,
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
