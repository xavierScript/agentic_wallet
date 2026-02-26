/**
 * tools/write-memo.ts
 *
 * MCP tool – write an on-chain memo using the SPL Memo Program.
 * Memos are stored permanently in the transaction log and serve as
 * a lightweight way to interact with a Solana program on-chain.
 *
 * Use cases for AI agents:
 * - On-chain audit trail of autonomous decisions
 * - Provable timestamped messages
 * - Simple protocol interaction for demos
 */

import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerWriteMemoTool(
  server: McpServer,
  services: WalletServices,
) {
  const { keyManager, walletService, txBuilder } = services;

  server.registerTool(
    "write_memo",
    {
      title: "Write Memo",
      description:
        "Write a text memo on-chain using the SPL Memo Program. " +
        "The memo is stored permanently in the Solana transaction log. " +
        "Useful for on-chain audit trails, agent decision logging, or " +
        "simple protocol interaction. Optionally attach a SOL transfer.",
      inputSchema: {
        wallet_id: z.string().describe("Wallet ID (UUID) that signs the memo"),
        message: z
          .string()
          .min(1)
          .max(500)
          .describe("Memo text to write on-chain (max 500 chars)"),
        transfer_to: z
          .string()
          .optional()
          .describe(
            "Optional: recipient address to attach a SOL transfer to the memo",
          ),
        transfer_amount: z
          .number()
          .positive()
          .optional()
          .describe("Optional: SOL amount to transfer alongside the memo"),
      },
      annotations: {
        title: "Write Memo",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ wallet_id, message, transfer_to, transfer_amount }) => {
      const entry = keyManager.loadKeystore(wallet_id);
      const fromPk = new PublicKey(entry.publicKey);

      let tx;

      // If both transfer fields are provided, do a transfer + memo
      if (transfer_to && transfer_amount) {
        let toPk: PublicKey;
        try {
          toPk = new PublicKey(transfer_to);
        } catch {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Invalid recipient address "${transfer_to}".`,
              },
            ],
            isError: true,
          };
        }
        tx = txBuilder.buildSolTransferWithMemo(
          fromPk,
          toPk,
          transfer_amount,
          message,
        );
      } else {
        // Memo only
        tx = txBuilder.buildMemo(fromPk, message);
      }

      try {
        const signature = await walletService.signAndSendTransaction(
          wallet_id,
          tx,
          {
            action: "memo:write",
            details: {
              message,
              ...(transfer_to && { transfer_to, transfer_amount }),
            },
          },
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  signature,
                  memo: message,
                  wallet: entry.publicKey,
                  ...(transfer_to && {
                    transfer: {
                      to: transfer_to,
                      amountSol: transfer_amount,
                    },
                  }),
                  explorer: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error writing memo: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
