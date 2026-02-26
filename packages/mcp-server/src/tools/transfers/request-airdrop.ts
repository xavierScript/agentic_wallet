/**
 * tools/request-airdrop.ts
 *
 * MCP tool – request a devnet SOL airdrop to fund a wallet.
 * If the airdrop fails (rate limit, network issues), returns a
 * fallback message with a direct link to the Solana faucet.
 */

import { z } from "zod";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerRequestAirdropTool(
  server: McpServer,
  services: WalletServices,
) {
  const { keyManager, walletService, connection, config, auditLogger } =
    services;

  server.registerTool(
    "request_airdrop",
    {
      title: "Request Airdrop",
      description:
        "Request a devnet SOL airdrop to fund a wallet. " +
        "Only works on devnet/testnet. If the airdrop fails due to " +
        "rate limiting or network issues, provides a fallback link " +
        "to the Solana faucet for manual funding.",
      inputSchema: {
        wallet_id: z.string().describe("Wallet ID (UUID) to fund"),
        amount: z
          .number()
          .positive()
          .max(2)
          .optional()
          .default(1)
          .describe("Amount of SOL to request (max 2, default 1)"),
      },
      annotations: {
        title: "Request Airdrop",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ wallet_id, amount }) => {
      // Only allow on devnet/testnet
      if (config.cluster === "mainnet-beta") {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Airdrops are not available on mainnet. Fund the wallet with real SOL.",
            },
          ],
          isError: true,
        };
      }

      const entry = keyManager.loadKeystore(wallet_id);
      const publicKey = entry.publicKey;
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);

      try {
        const conn = connection.getConnection();
        const signature = await conn.requestAirdrop(
          new (await import("@solana/web3.js")).PublicKey(publicKey),
          lamports,
        );

        // Confirm the airdrop
        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash();
        await conn.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          "confirmed",
        );

        // Get updated balance
        const balance = await connection.getBalance(publicKey);
        const balanceSol = balance / LAMPORTS_PER_SOL;

        auditLogger.log({
          action: "airdrop:received",
          walletId: wallet_id,
          publicKey,
          txSignature: signature,
          success: true,
          details: { amountSol: amount, newBalanceSol: balanceSol },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  signature,
                  wallet: publicKey,
                  airdropAmountSol: amount,
                  newBalanceSol: balanceSol,
                  explorer: `https://explorer.solana.com/tx/${signature}?cluster=${config.cluster}`,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err: any) {
        // Airdrop failed — provide fallback instructions
        auditLogger.log({
          action: "airdrop:failed",
          walletId: wallet_id,
          publicKey,
          success: false,
          error: err.message,
          details: { amountSol: amount },
        });

        const faucetUrl = `https://faucet.solana.com/?wallet=${publicKey}`;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: err.message,
                  reason:
                    "Airdrop failed — this usually happens due to rate limiting. " +
                    "The Solana devnet faucet limits requests to prevent abuse.",
                  fallback: {
                    message:
                      "Please fund the wallet manually using the Solana faucet:",
                    faucetUrl,
                    publicKey,
                    steps: [
                      `1. Open: ${faucetUrl}`,
                      "2. Paste the public key (pre-filled if using the link above)",
                      "3. Select 'Devnet' network",
                      `4. Request ${amount} SOL`,
                      "5. Wait ~10 seconds for confirmation",
                    ],
                  },
                },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
