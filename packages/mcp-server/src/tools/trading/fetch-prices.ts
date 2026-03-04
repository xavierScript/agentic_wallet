/**
 * tools/trading/fetch-prices.ts
 *
 * MCP tool — fetch real-time token prices.
 * Primary source: Jupiter Price API v2.
 * Fallback source: CoinGecko free API (no key required).
 * This gives AI agents the market data they need to make autonomous trading decisions.
 */

import { z } from "zod";
import { WELL_KNOWN_TOKENS } from "@agentic-wallet/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

const JUPITER_PRICE_API = "https://api.jup.ag/price/v2";
const COINGECKO_PRICE_API = "https://api.coingecko.com/api/v3/simple/price";

/** Maps mint address → CoinGecko coin ID */
const MINT_TO_COINGECKO_ID: Record<string, string> = {
  So11111111111111111111111111111111111111112: "solana",
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "usd-coin",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "tether",
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: "bonk",
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: "jupiter-exchange-solana",
};

/** Resolve a symbol like "SOL" to its mint address. */
function resolveToMint(symbolOrMint: string): string {
  // If it looks like a base58 mint address (> 20 chars), pass through
  if (symbolOrMint.length > 20) return symbolOrMint;

  const upper = symbolOrMint.toUpperCase();
  for (const [mint, info] of Object.entries(WELL_KNOWN_TOKENS)) {
    if (info.symbol.toUpperCase() === upper) return mint;
  }
  throw new Error(
    `Unknown token symbol: ${symbolOrMint}. ` +
      `Known symbols: ${Object.values(WELL_KNOWN_TOKENS)
        .map((t) => t.symbol)
        .join(", ")}. ` +
      `You can also pass a mint address directly.`,
  );
}

export function registerFetchPricesTool(
  server: McpServer,
  _services: WalletServices,
) {
  server.registerTool(
    "fetch_prices",
    {
      title: "Fetch Token Prices",
      description:
        "Fetch real-time USD prices for one or more Solana tokens from the " +
        "Jupiter Price API v2. Accepts token symbols (SOL, USDC, USDT, BONK, JUP) " +
        "or mint addresses. Use this before evaluating a trading strategy.",
      inputSchema: {
        tokens: z
          .string()
          .describe(
            "Comma-separated token symbols or mint addresses (e.g. 'SOL,USDC' or 'SOL,USDC,BONK')",
          ),
      },
      annotations: {
        title: "Fetch Token Prices",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ tokens }) => {
      // Parse and resolve tokens
      const tokenList = tokens
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      if (tokenList.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: provide at least one token symbol or mint address.",
            },
          ],
          isError: true,
        };
      }

      let mints: string[];
      try {
        mints = tokenList.map(resolveToMint);
      } catch (err: any) {
        return {
          content: [{ type: "text" as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }

      // ── Attempt 1: Jupiter Price API ────────────────────────────────────────
      let jupiterOk = false;
      let prices: Array<{ symbol: string; mint: string; priceUsd: number }> =
        [];
      let source = "";
      const now = new Date().toISOString();

      try {
        const params = new URLSearchParams();
        params.set("ids", mints.join(","));
        const url = `${JUPITER_PRICE_API}?${params.toString()}`;
        const response = await fetch(url);

        if (response.ok) {
          const json = (await response.json()) as {
            data: Record<
              string,
              { id: string; type: string; price: string } | null
            >;
            timeTaken: number;
          };

          for (const mint of mints) {
            const entry = json.data[mint];
            if (!entry) continue;
            const known = WELL_KNOWN_TOKENS[mint];
            prices.push({
              symbol: known?.symbol ?? mint.slice(0, 8),
              mint,
              priceUsd: parseFloat(entry.price),
            });
          }
          source = "Jupiter Price API v2";
          jupiterOk = true;
        }
      } catch {
        // fall through to CoinGecko
      }

      // ── Attempt 2: CoinGecko free API (fallback) ─────────────────────────
      if (!jupiterOk) {
        const geckoIds = mints
          .map((m) => MINT_TO_COINGECKO_ID[m])
          .filter(Boolean);

        if (geckoIds.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text:
                  "Jupiter Price API is unavailable and none of the requested tokens " +
                  "have a known CoinGecko mapping. Cannot fetch prices.",
              },
            ],
            isError: true,
          };
        }

        try {
          const params = new URLSearchParams({
            ids: geckoIds.join(","),
            vs_currencies: "usd",
          });
          const url = `${COINGECKO_PRICE_API}?${params.toString()}`;
          const response = await fetch(url);

          if (!response.ok) {
            const body = await response.text();
            return {
              content: [
                {
                  type: "text" as const,
                  text:
                    `Jupiter Price API unavailable. CoinGecko fallback also failed ` +
                    `(${response.status}): ${body}`,
                },
              ],
              isError: true,
            };
          }

          const json = (await response.json()) as Record<
            string,
            { usd: number }
          >;

          for (const mint of mints) {
            const geckoId = MINT_TO_COINGECKO_ID[mint];
            if (!geckoId || !json[geckoId]) continue;
            const known = WELL_KNOWN_TOKENS[mint];
            prices.push({
              symbol: known?.symbol ?? mint.slice(0, 8),
              mint,
              priceUsd: json[geckoId].usd,
            });
          }
          source = "CoinGecko API (Jupiter unavailable)";
        } catch (err: any) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Both Jupiter and CoinGecko are unreachable: ${err.message}`,
              },
            ],
            isError: true,
          };
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                timestamp: now,
                prices,
                source,
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
