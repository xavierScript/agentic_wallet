/**
 * tools/swap-tokens.ts
 *
 * MCP tool – swap tokens via Jupiter aggregator.
 * Fetches a quote, builds the swap transaction, then signs and sends
 * it through the WalletService (which enforces policies first).
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerSwapTokensTool(
  server: McpServer,
  services: WalletServices,
) {
  const { keyManager, walletService, jupiterService } = services;

  server.registerTool(
    "swap_tokens",
    {
      title: "Swap Tokens",
      description:
        "Swap tokens using Jupiter aggregator — the primary DEX aggregator on Solana. " +
        "Supports SOL, USDC, USDT, BONK, JUP, and any SPL token by mint address. " +
        "Automatically finds the best route across multiple liquidity sources. " +
        "Policy-checked before signing (spending limits, rate limits).",
      inputSchema: {
        wallet_id: z.string().describe("Source wallet ID (UUID)"),
        input_token: z
          .string()
          .describe(
            "Input token: symbol (SOL, USDC, USDT, BONK, JUP) or mint address",
          ),
        output_token: z
          .string()
          .describe(
            "Output token: symbol (SOL, USDC, USDT, BONK, JUP) or mint address",
          ),
        amount: z
          .number()
          .positive()
          .describe(
            "Amount of input token to swap (human-readable, e.g. 0.1 SOL)",
          ),
        slippage_bps: z
          .number()
          .int()
          .min(1)
          .max(300)
          .optional()
          .default(50)
          .describe(
            "Slippage tolerance in basis points (50 = 0.5%, max 300 = 3%). Default: 50",
          ),
      },
      annotations: {
        title: "Swap Tokens",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ wallet_id, input_token, output_token, amount, slippage_bps }) => {
      // ── Resolve token mints ──────────────────────────────────────────
      let inputMint: string;
      let outputMint: string;
      try {
        inputMint = jupiterService.resolveTokenMint(input_token);
        outputMint = jupiterService.resolveTokenMint(output_token);
      } catch (err: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error resolving tokens: ${err.message}`,
            },
          ],
          isError: true,
        };
      }

      if (inputMint === outputMint) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Input and output tokens must be different.",
            },
          ],
          isError: true,
        };
      }

      // ── Get wallet info ──────────────────────────────────────────────
      const entry = keyManager.loadKeystore(wallet_id);

      // ── Get token info for formatting ────────────────────────────────
      const inputInfo = jupiterService.getTokenInfo(inputMint);
      const outputInfo = jupiterService.getTokenInfo(outputMint);

      // ── Convert to raw amount ────────────────────────────────────────
      const rawAmount = jupiterService.toRawAmount(amount, inputInfo.decimals);

      // ── Fetch quote ──────────────────────────────────────────────────
      let quote;
      try {
        quote = await jupiterService.getQuote(
          inputMint,
          outputMint,
          rawAmount,
          slippage_bps,
        );
      } catch (err: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching swap quote: ${err.message}`,
            },
          ],
          isError: true,
        };
      }

      // ── Build swap transaction ───────────────────────────────────────
      let swapTx;
      try {
        swapTx = await jupiterService.getSwapTransaction(
          quote,
          entry.publicKey,
        );
      } catch (err: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error building swap transaction: ${err.message}`,
            },
          ],
          isError: true,
        };
      }

      // ── Sign and send (versioned transaction) ────────────────────────
      const expectedOutput = jupiterService.formatAmount(
        quote.outAmount,
        outputInfo.decimals,
      );
      const minOutput = jupiterService.formatAmount(
        quote.otherAmountThreshold,
        outputInfo.decimals,
      );

      const routeLabels = quote.routePlan
        .map((r) => r.swapInfo.label || "Unknown")
        .filter((label, i, arr) => arr.indexOf(label) === i);

      // When the input token is SOL, rawAmount is already in lamports — pass it
      // so the policy engine can enforce per-tx and daily spend caps.
      // For non-SOL inputs we can't trivially express the value in lamports, so
      // we pass 0 (rate limits and cooldown still apply fully).
      const SOL_MINT = "So11111111111111111111111111111111111111112";
      const estimatedLamports = inputMint === SOL_MINT ? Number(rawAmount) : 0;

      try {
        const result = await walletService.signAndSendVersionedTransaction(
          wallet_id,
          swapTx,
          {
            action: "swap:jupiter",
            details: {
              inputToken: inputInfo.symbol,
              outputToken: outputInfo.symbol,
              inputMint,
              outputMint,
              inputAmount: amount,
              expectedOutputAmount: expectedOutput,
              slippageBps: slippage_bps,
              priceImpactPct: quote.priceImpactPct,
              route: routeLabels,
            },
          },
          estimatedLamports,
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  signature: result.signature,
                  swap: {
                    from: `${amount} ${inputInfo.symbol}`,
                    to: `~${expectedOutput} ${outputInfo.symbol}`,
                    minimumReceived: `${minOutput} ${outputInfo.symbol}`,
                    priceImpact: `${quote.priceImpactPct}%`,
                    slippageTolerance: `${slippage_bps / 100}%`,
                    route: routeLabels.join(" → "),
                  },
                  wallet: entry.publicKey,
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
              text: `Swap failed: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
