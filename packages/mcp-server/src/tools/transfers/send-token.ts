/**
 * tools/send-token.ts
 *
 * MCP tool – send SPL tokens from a wallet to a recipient address.
 */

import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerSendTokenTool(
  server: McpServer,
  services: WalletServices,
) {
  const { keyManager, walletService, txBuilder } = services;

  server.registerTool(
    "send_token",
    {
      title: "Send Token",
      description:
        "Send SPL tokens from a wallet to a recipient address. Automatically " +
        "creates the recipient's Associated Token Account if it doesn't exist.",
      inputSchema: {
        wallet_id: z.string().describe("Source wallet ID (UUID)"),
        to: z.string().describe("Recipient Solana address (base58 public key)"),
        mint: z.string().describe("Token mint address (base58)"),
        amount: z
          .number()
          .positive()
          .describe("Amount of tokens to send (human-readable, e.g. 10.5)"),
        decimals: z
          .number()
          .int()
          .min(0)
          .max(18)
          .default(6)
          .describe("Token decimals (e.g. 6 for USDC, 9 for SOL)"),
      },
      annotations: {
        title: "Send Token",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ wallet_id, to, mint, amount, decimals }) => {
      let toPk: PublicKey;
      let mintPk: PublicKey;
      try {
        toPk = new PublicKey(to);
        mintPk = new PublicKey(mint);
      } catch {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Invalid address. Both recipient and mint must be valid base58 Solana public keys.",
            },
          ],
          isError: true,
        };
      }

      const entry = keyManager.loadKeystore(wallet_id);
      const fromPk = new PublicKey(entry.publicKey);
      const tx = await txBuilder.buildTokenTransfer(
        fromPk,
        toPk,
        mintPk,
        amount,
        decimals,
      );

      const signature = await walletService.signAndSendTransaction(
        wallet_id,
        tx,
        { action: "spl-token:transfer", details: { to, mint, amount } },
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
                mint,
                amount,
                decimals,
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
