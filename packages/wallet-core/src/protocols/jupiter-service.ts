/**
 * jupiter-service.ts
 *
 * Wrapper around the Jupiter Aggregator API for token swaps.
 * Jupiter is the primary DEX aggregator on Solana — it routes swaps
 * across multiple liquidity sources to find the best price.
 *
 * This service handles:
 * - Fetching swap quotes (price + route info)
 * - Building swap transactions (returns a VersionedTransaction)
 * - Token metadata lookups for display purposes
 *
 * Jupiter v6 API: https://station.jup.ag/docs/apis/swap-api
 */

import { VersionedTransaction, PublicKey } from "@solana/web3.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface JupiterQuote {
  /** Input token mint */
  inputMint: string;
  /** Output token mint */
  outputMint: string;
  /** Raw input amount (integer, accounting for decimals) */
  inAmount: string;
  /** Raw output amount (integer, accounting for decimals) */
  outAmount: string;
  /** Other amount (after fees) */
  otherAmountThreshold: string;
  /** Swap mode: ExactIn or ExactOut */
  swapMode: string;
  /** Slippage in basis points */
  slippageBps: number;
  /** Price impact as a percentage string */
  priceImpactPct: string;
  /** Route plan details */
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label?: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
  /** Context slot for the quote */
  contextSlot?: number;
  /** Time taken for the quote in ms */
  timeTaken?: number;
}

export interface SwapResult {
  /** Transaction signature on-chain */
  signature: string;
  /** Input token mint */
  inputMint: string;
  /** Output token mint */
  outputMint: string;
  /** Human-readable input amount */
  inputAmount: string;
  /** Human-readable expected output amount */
  expectedOutputAmount: string;
  /** Minimum output considering slippage */
  minimumOutputAmount: string;
  /** Price impact percentage */
  priceImpactPct: string;
  /** Route labels */
  routeLabels: string[];
}

export interface JupiterTokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
}

export interface JupiterServiceConfig {
  /**
   * Jupiter API base URL.
   * Free/public tier:  https://lite-api.jup.ag/swap/v1  (default)
   * Paid tier:         https://api.jup.ag/swap/v1  (requires apiKey)
   * Override via JUPITER_API_URL env var.
   */
  apiBaseUrl: string;
  /**
   * Optional Jupiter API key for the paid tier.
   * Sent as the `Authorization: Bearer <key>` header.
   * Set via JUPITER_API_KEY env var.
   */
  apiKey?: string;
  /** Default slippage in basis points (default: 50 = 0.5%) */
  defaultSlippageBps: number;
  /** Maximum allowed slippage in basis points (default: 300 = 3%) */
  maxSlippageBps: number;
  /** Maximum allowed price impact percentage (default: 5%) */
  maxPriceImpactPct: number;
}

// ── Well-known devnet token mints ────────────────────────────────────────────

export const WELL_KNOWN_TOKENS: Record<
  string,
  { symbol: string; name: string; decimals: number }
> = {
  So11111111111111111111111111111111111111112: {
    symbol: "SOL",
    name: "Wrapped SOL",
    decimals: 9,
  },
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
  },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: {
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
  },
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: {
    symbol: "BONK",
    name: "Bonk",
    decimals: 5,
  },
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: {
    symbol: "JUP",
    name: "Jupiter",
    decimals: 6,
  },
};

// ── Service ──────────────────────────────────────────────────────────────────

/**
 * JupiterService wraps the Jupiter Aggregator v6 API.
 *
 * Usage:
 * ```ts
 * const jupiter = new JupiterService();
 * const quote = await jupiter.getQuote("SOL-mint", "USDC-mint", 1_000_000_000);
 * const tx = await jupiter.getSwapTransaction(quote, walletPublicKey);
 * // Then sign & send via WalletService.signAndSendVersionedTransaction()
 * ```
 */
export class JupiterService {
  private config: JupiterServiceConfig;

  constructor(config?: Partial<JupiterServiceConfig>) {
    this.config = {
      // The old https://api.jup.ag requires a paid API key (returns 401 without one).
      // Use the free public lite endpoint by default; override with JUPITER_API_URL.
      apiBaseUrl:
        config?.apiBaseUrl ||
        process.env.JUPITER_API_URL ||
        "https://lite-api.jup.ag/swap/v1",
      apiKey: config?.apiKey || process.env.JUPITER_API_KEY,
      defaultSlippageBps: config?.defaultSlippageBps ?? 50,
      maxSlippageBps: config?.maxSlippageBps ?? 300,
      maxPriceImpactPct: config?.maxPriceImpactPct ?? 5,
    };
  }

  // ── Quote ────────────────────────────────────────────────────────────────

  /**
   * Get a swap quote from Jupiter.
   *
   * @param inputMint  - Source token mint address
   * @param outputMint - Destination token mint address
   * @param amount     - Raw amount of input token (integer, includes decimals)
   * @param slippageBps - Slippage tolerance in basis points (optional)
   */
  async getQuote(
    inputMint: string,
    outputMint: string,
    amount: number | string,
    slippageBps?: number,
  ): Promise<JupiterQuote> {
    const slippage = Math.min(
      slippageBps ?? this.config.defaultSlippageBps,
      this.config.maxSlippageBps,
    );

    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: String(amount),
      slippageBps: String(slippage),
      swapMode: "ExactIn",
    });

    const url = `${this.config.apiBaseUrl}/quote?${params.toString()}`;
    const headers: Record<string, string> = {};
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }
    const response = await fetch(url, { headers });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Jupiter quote failed (${response.status}): ${body}`);
    }

    const quote = (await response.json()) as JupiterQuote;

    // Safety check: price impact
    const priceImpact = parseFloat(quote.priceImpactPct || "0");
    if (priceImpact > this.config.maxPriceImpactPct) {
      throw new Error(
        `Price impact too high: ${priceImpact.toFixed(2)}% exceeds max ${this.config.maxPriceImpactPct}%. ` +
          `Try a smaller amount or a more liquid pair.`,
      );
    }

    return quote;
  }

  // ── Swap Transaction ─────────────────────────────────────────────────────

  /**
   * Get a serialized swap transaction from Jupiter for a given quote.
   *
   * @param quote          - The quote object from getQuote()
   * @param userPublicKey  - The wallet that will sign and execute the swap
   */
  async getSwapTransaction(
    quote: JupiterQuote,
    userPublicKey: string,
  ): Promise<VersionedTransaction> {
    const url = `${this.config.apiBaseUrl}/swap`;
    const swapHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.config.apiKey) {
      swapHeaders["Authorization"] = `Bearer ${this.config.apiKey}`;
    }
    const response = await fetch(url, {
      method: "POST",
      headers: swapHeaders,
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        dynamicSlippage: true,
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: {
            maxLamports: 1_000_000,
            priorityLevel: "medium",
          },
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Jupiter swap transaction failed (${response.status}): ${body}`,
      );
    }

    const data = (await response.json()) as { swapTransaction: string };
    const swapTransactionBuf = Buffer.from(data.swapTransaction, "base64");
    const tx = VersionedTransaction.deserialize(swapTransactionBuf);

    return tx;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Resolve a token symbol to a mint address using well-known tokens.
   * Falls back to treating the input as a raw mint address.
   */
  resolveTokenMint(symbolOrMint: string): string {
    // Check if it's already a valid base58 address (32+ chars)
    if (symbolOrMint.length >= 32) {
      return symbolOrMint;
    }

    // Search well-known tokens by symbol (case-insensitive)
    const upper = symbolOrMint.toUpperCase();
    for (const [mint, info] of Object.entries(WELL_KNOWN_TOKENS)) {
      if (info.symbol.toUpperCase() === upper) {
        return mint;
      }
    }

    throw new Error(
      `Unknown token symbol "${symbolOrMint}". Use a full mint address or one of: ` +
        Object.values(WELL_KNOWN_TOKENS)
          .map((t) => t.symbol)
          .join(", "),
    );
  }

  /**
   * Get human-readable token info for a mint address.
   */
  getTokenInfo(mint: string): {
    symbol: string;
    name: string;
    decimals: number;
  } {
    const known = WELL_KNOWN_TOKENS[mint];
    if (known) return known;
    return { symbol: "UNKNOWN", name: mint.slice(0, 8) + "…", decimals: 0 };
  }

  /**
   * Format a raw token amount into a human-readable string.
   */
  formatAmount(rawAmount: string | number, decimals: number): string {
    const raw = BigInt(String(rawAmount));
    const divisor = BigInt(10 ** decimals);
    const whole = raw / divisor;
    const frac = raw % divisor;
    const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
    return fracStr ? `${whole}.${fracStr}` : whole.toString();
  }

  /**
   * Convert a human-readable amount to raw integer representation.
   */
  toRawAmount(amount: number, decimals: number): string {
    return Math.floor(amount * 10 ** decimals).toString();
  }

  /**
   * Validate that a string is a valid Solana public key.
   */
  isValidPublicKey(address: string): boolean {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }
}
