/**
 * tools/mint-token.ts
 *
 * MCP tool – create a new SPL token mint and mint tokens to a wallet.
 * Allows an AI agent to bootstrap its own test token on devnet,
 * simulating a DeFi agent managing its own liquidity.
 *
 * Both tools route through walletService.signAndSendTransaction so
 * every operation respects policy checks and gets audit-logged.
 */

import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerMintTokenTool(
  server: McpServer,
  services: WalletServices,
) {
  const { keyManager, walletService, splTokenService } = services;

  server.registerTool(
    "create_token_mint",
    {
      title: "Create Token Mint",
      description:
        "Create a new SPL token mint on devnet. The wallet becomes the " +
        "mint authority, able to mint new tokens. Returns the mint address. " +
        "Use mint_tokens to mint supply after creation.",
      inputSchema: {
        wallet_id: z
          .string()
          .describe("Wallet ID (UUID) that pays and becomes mint authority"),
        decimals: z
          .number()
          .int()
          .min(0)
          .max(18)
          .optional()
          .default(9)
          .describe(
            "Token decimals (default 9, like SOL. Use 6 for stablecoin-like)",
          ),
      },
      annotations: {
        title: "Create Token Mint",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ wallet_id, decimals }) => {
      const entry = keyManager.loadKeystore(wallet_id);

      try {
        const payerPk = new PublicKey(entry.publicKey);
        const { transaction, mintKeypair } =
          await splTokenService.buildCreateMint(payerPk, decimals);

        const result = await walletService.signAndSendTransaction(
          wallet_id,
          transaction,
          {
            action: "spl-token:create-mint",
            details: {
              mintAddress: mintKeypair.publicKey.toBase58(),
              decimals,
            },
          },
          [mintKeypair],
        );

        const clusterParam =
          result.network === "mainnet-beta" ? "" : `?cluster=${result.network}`;
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  mintAddress: mintKeypair.publicKey.toBase58(),
                  mintAuthority: entry.publicKey,
                  decimals,
                  signature: result.signature,
                  note: "Use mint_tokens to mint supply to a wallet.",
                  gasless: result.gasless,
                  network: result.network,
                  explorer: `https://explorer.solana.com/address/${mintKeypair.publicKey.toBase58()}${clusterParam}`,
                  txExplorer: result.explorerUrl,
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
              text: `Error creating token mint: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "mint_tokens",
    {
      title: "Mint Tokens",
      description:
        "Mint SPL tokens to a wallet's token account. The signing wallet " +
        "must be the mint authority. Automatically creates the recipient's " +
        "Associated Token Account if it doesn't exist.",
      inputSchema: {
        wallet_id: z
          .string()
          .describe("Wallet ID (UUID) of the mint authority"),
        mint: z.string().describe("Token mint address (base58)"),
        to: z
          .string()
          .optional()
          .describe(
            "Recipient address (base58). Defaults to the signing wallet itself.",
          ),
        amount: z
          .number()
          .positive()
          .describe("Amount of tokens to mint (human-readable, e.g. 1000)"),
      },
      annotations: {
        title: "Mint Tokens",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ wallet_id, mint, to, amount }) => {
      let mintPk: PublicKey;
      try {
        mintPk = new PublicKey(mint);
      } catch {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Invalid mint address "${mint}".`,
            },
          ],
          isError: true,
        };
      }

      const entry = keyManager.loadKeystore(wallet_id);
      const recipientAddress = to || entry.publicKey;

      let recipientPk: PublicKey;
      try {
        recipientPk = new PublicKey(recipientAddress);
      } catch {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Invalid recipient address "${recipientAddress}".`,
            },
          ],
          isError: true,
        };
      }

      try {
        const authorityPk = new PublicKey(entry.publicKey);
        const { transaction, tokenAccount } =
          await splTokenService.buildMintTokens(
            authorityPk,
            mintPk,
            recipientPk,
            amount,
          );

        const result = await walletService.signAndSendTransaction(
          wallet_id,
          transaction,
          {
            action: "spl-token:mint",
            details: {
              mint,
              recipient: recipientAddress,
              amount,
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
                  signature: result.signature,
                  mint,
                  recipient: recipientAddress,
                  amountMinted: amount,
                  tokenAccount,
                  gasless: result.gasless,
                  network: result.network,
                  explorer: result.explorerUrl,
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
              text: `Error minting tokens: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
