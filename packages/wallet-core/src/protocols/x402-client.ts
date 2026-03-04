/**
 * x402-client.ts
 *
 * Client-side implementation of the x402 payment protocol for Solana (SVM).
 *
 * x402 is an open standard (by Coinbase) for HTTP-native payments. When an
 * HTTP server responds with `402 Payment Required`, this client:
 *   1. Parses the `X-PAYMENT-REQUIRED` header (or JSON body) as a PaymentRequired object
 *   2. Selects the best SVM `PaymentRequirements` the wallet can fulfil
 *   3. Builds and signs a Solana Transfer (SPL) or SystemTransfer (SOL) transaction
 *   4. Retries the original request with the `X-Payment` header (base64 JSON)
 *
 * The agent never touches raw private keys — signing goes through
 * `WalletService`, which enforces policy checks before any signature.
 *
 * Reference: https://github.com/coinbase/x402
 * SVM spec:  specs/schemes/exact/scheme_exact_svm.md
 */

import {
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Connection,
} from "@solana/web3.js";
import {
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * A single payment option returned by a 402 response.
 */
export interface PaymentRequirements {
  /** Payment scheme — currently only "exact" is supported */
  scheme: "exact";
  /** Network identifier (CAIP-2), e.g. "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" */
  network: string;
  /** Amount in smallest unit (e.g. lamports for SOL, base units for SPL) */
  amount: string;
  /** SPL token mint address (native SOL uses the wrapped SOL mint) */
  asset: string;
  /** Recipient address that receives the payment */
  payTo: string;
  /** Maximum time in seconds the payment is valid */
  maxTimeoutSeconds: number;
  /** Extra SVM-specific fields */
  extra: {
    /** Public key of the fee payer (typically the facilitator) */
    feePayer: string;
  };
  /** Optional human-readable description */
  description?: string;
}

/**
 * Full 402 response payload (Base64-decoded from PAYMENT-REQUIRED header).
 */
export interface PaymentRequired {
  x402Version: number;
  accepts: PaymentRequirements[];
  error?: string;
}

/**
 * Payload sent back to the server in the X-Payment header.
 */
export interface PaymentPayload {
  x402Version: number;
  scheme: "exact";
  network: string;
  payload: {
    /** Base64-encoded serialised partially-signed transaction */
    serializedTransaction: string;
  };
}

/**
 * Settlement receipt returned in the X-PAYMENT-RESPONSE header on success.
 */
export interface SettlementResponse {
  success: boolean;
  transaction: string;
  network: string;
  payer: string;
}

/**
 * Result object returned by `payForResource`.
 */
export interface X402PaymentResult {
  /** Whether the payment + resource fetch succeeded */
  success: boolean;
  /** HTTP status code of the final response */
  httpStatus: number;
  /** Response body (the protected resource) */
  body: string;
  /** Content-Type of the response */
  contentType: string;
  /** Settlement details, if the server returned them */
  settlement?: SettlementResponse;
  /** Payment requirements that were fulfilled */
  paymentRequirements?: PaymentRequirements;
  /** Amount paid (human-readable) */
  amountPaid?: string;
  /** Token used for payment */
  tokenMint?: string;
  /** Error message if something failed */
  error?: string;
}

/**
 * Configuration for the x402 client.
 */
export interface X402ClientConfig {
  /** Preferred network (CAIP-2 format). Defaults to Solana devnet. */
  preferredNetwork?: string;
  /** Whether to automatically retry on 402 (default: true) */
  autoRetry?: boolean;
  /** Maximum payment amount in lamports the client will approve per request */
  maxPaymentLamports?: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Solana devnet CAIP-2 identifier */
const SOLANA_DEVNET = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
/** Solana mainnet CAIP-2 identifier */
const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

/** Native SOL wrapped mint */
const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

/** Default maximum payment: 1 SOL in lamports */
const DEFAULT_MAX_PAYMENT_LAMPORTS = 1_000_000_000;

// ── x402 Client Service ─────────────────────────────────────────────────────

/**
 * X402Client handles the client side of the x402 payment protocol.
 *
 * Given a URL, it:
 *  1. Makes an initial HTTP request
 *  2. If the server responds 402, parses payment requirements
 *  3. Builds a payment transaction using the agent's wallet
 *  4. Signs via the callback (which goes through WalletService + PolicyEngine)
 *  5. Retries the request with the payment proof attached
 *
 * This class does NOT hold private keys — signing is delegated via callback.
 */
export class X402Client {
  private config: Required<X402ClientConfig>;

  constructor(config: X402ClientConfig = {}) {
    this.config = {
      preferredNetwork: config.preferredNetwork || SOLANA_DEVNET,
      autoRetry: config.autoRetry ?? true,
      maxPaymentLamports:
        config.maxPaymentLamports ?? DEFAULT_MAX_PAYMENT_LAMPORTS,
    };
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Attempt to fetch a resource. If the server responds 402, automatically
   * construct and sign a payment, then retry.
   *
   * @param url        - The HTTP(S) URL to request
   * @param options    - Standard fetch options (method, headers, body …)
   * @param signTx     - Callback that signs a legacy Transaction via WalletService
   * @param walletPublicKey - The payer wallet's base58 public key
   * @param connection - Optional Solana RPC connection used to check/create
   *                     recipient Associated Token Accounts before signing.
   *                     Without this, SPL payments will fail if the recipient
   *                     ATA does not yet exist.
   * @returns Payment result with the resource body or error details
   */
  async payForResource(
    url: string,
    options: RequestInit = {},
    signTx: (tx: Transaction) => Promise<Transaction>,
    walletPublicKey: string,
    connection?: Connection,
  ): Promise<X402PaymentResult> {
    // ── Step 1: Initial request ──────────────────────────────────────────
    const initialResponse = await fetch(url, options);

    if (initialResponse.status !== 402) {
      // No payment required — return the response as-is
      return {
        success: initialResponse.ok,
        httpStatus: initialResponse.status,
        body: await initialResponse.text(),
        contentType:
          initialResponse.headers.get("content-type") || "text/plain",
      };
    }

    if (!this.config.autoRetry) {
      return {
        success: false,
        httpStatus: 402,
        body: "",
        contentType: "text/plain",
        error: "Server returned 402 Payment Required and autoRetry is disabled",
      };
    }

    // ── Step 2: Parse payment requirements ───────────────────────────────
    // Read the 402 body — some servers embed PaymentRequired in the JSON body
    // rather than (or in addition to) the X-PAYMENT-REQUIRED header.
    let body402: string | undefined;
    try {
      body402 = await initialResponse.text();
    } catch {
      // Non-fatal — header-only servers won't have a useful body
    }
    const paymentRequired = this.parsePaymentRequired(initialResponse, body402);
    if (!paymentRequired) {
      return {
        success: false,
        httpStatus: 402,
        body: "",
        contentType: "text/plain",
        error: "Server returned 402 but no valid PAYMENT-REQUIRED header found",
      };
    }

    // ── Step 3: Select a compatible payment option ───────────────────────
    const requirements = this.selectRequirements(paymentRequired);
    if (!requirements) {
      return {
        success: false,
        httpStatus: 402,
        body: "",
        contentType: "text/plain",
        error: `No compatible SVM payment option found. Server accepts: ${paymentRequired.accepts
          .map((a) => `${a.scheme}/${a.network}`)
          .join(", ")}`,
      };
    }

    // ── Step 4: Safety check — amount within limits ──────────────────────
    const amountNum = BigInt(requirements.amount);
    if (amountNum > BigInt(this.config.maxPaymentLamports)) {
      return {
        success: false,
        httpStatus: 402,
        body: "",
        contentType: "text/plain",
        error: `Payment amount ${requirements.amount} exceeds max allowed ${this.config.maxPaymentLamports}`,
        paymentRequirements: requirements,
      };
    }

    // ── Step 5: Build the payment transaction ────────────────────────────
    const paymentTx = await this.buildPaymentTransaction(
      requirements,
      walletPublicKey,
      connection,
    );

    // ── Step 6: Sign via WalletService (policy checks happen here) ───────
    let signedTx: Transaction;
    try {
      signedTx = await signTx(paymentTx);
    } catch (err: any) {
      return {
        success: false,
        httpStatus: 402,
        body: "",
        contentType: "text/plain",
        error: `Transaction signing failed: ${err.message}`,
        paymentRequirements: requirements,
      };
    }

    // ── Step 7: Serialize and encode the signed transaction ──────────────
    const serialized = signedTx.serialize({
      requireAllSignatures: false, // fee payer (facilitator) hasn't signed yet
      verifySignatures: false,
    });
    const txBase64 = Buffer.from(serialized).toString("base64");

    // ── Step 8: Build the payment payload ────────────────────────────────
    const paymentPayload: PaymentPayload = {
      x402Version: 1,
      scheme: "exact",
      network: requirements.network,
      payload: {
        serializedTransaction: txBase64,
      },
    };

    const xPaymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString(
      "base64",
    );

    // ── Step 9: Retry with payment proof ─────────────────────────────────
    const retryHeaders = new Headers(options.headers || {});
    // Standard x402 header is "X-Payment" (Coinbase spec, native example)
    retryHeaders.set("X-Payment", xPaymentHeader);

    const paidResponse = await fetch(url, {
      ...options,
      headers: retryHeaders,
    });

    // ── Step 10: Parse settlement response ───────────────────────────────
    let settlement: SettlementResponse | undefined;
    // Try X-PAYMENT-RESPONSE (Coinbase standard) then legacy PAYMENT-RESPONSE
    const paymentResponseHeader =
      paidResponse.headers.get("X-PAYMENT-RESPONSE") ??
      paidResponse.headers.get("PAYMENT-RESPONSE");
    if (paymentResponseHeader) {
      try {
        settlement = JSON.parse(
          Buffer.from(paymentResponseHeader, "base64").toString("utf-8"),
        );
      } catch {
        // Settlement header malformed — non-fatal
      }
    }

    const body = await paidResponse.text();

    return {
      success: paidResponse.ok,
      httpStatus: paidResponse.status,
      body,
      contentType: paidResponse.headers.get("content-type") || "text/plain",
      settlement,
      paymentRequirements: requirements,
      amountPaid: requirements.amount,
      tokenMint: requirements.asset,
    };
  }

  // ── Parsing helpers ──────────────────────────────────────────────────────

  /**
   * Extract and decode the PaymentRequired object from a 402 response.
   *
   * Tries, in order:
   *  1. `X-PAYMENT-REQUIRED` header — Coinbase x402 standard
   *  2. `PAYMENT-REQUIRED` header   — legacy / older implementations
   *  3. Response body as JSON       — native/minimal server implementations
   */
  parsePaymentRequired(
    response: Response,
    bodyText?: string,
  ): PaymentRequired | null {
    // Helper: try to decode a base64 header → PaymentRequired
    const tryHeader = (name: string): PaymentRequired | null => {
      const header = response.headers.get(name);
      if (!header) return null;
      try {
        const decoded = Buffer.from(header, "base64").toString("utf-8");
        const parsed = JSON.parse(decoded) as PaymentRequired;
        if (!parsed.accepts || !Array.isArray(parsed.accepts)) return null;
        return parsed;
      } catch {
        return null;
      }
    };

    // 1. Coinbase standard header
    const fromXHeader = tryHeader("X-PAYMENT-REQUIRED");
    if (fromXHeader) return fromXHeader;

    // 2. Legacy header (keep backward-compat)
    const fromLegacyHeader = tryHeader("PAYMENT-REQUIRED");
    if (fromLegacyHeader) return fromLegacyHeader;

    // 3. JSON body fallback (native/minimal server implementations)
    if (bodyText) {
      try {
        const body = JSON.parse(bodyText);
        // Standard Coinbase body: { x402Version, accepts }
        if (body.accepts && Array.isArray(body.accepts)) {
          return body as PaymentRequired;
        }
        // Native/minimal server body: { payment: { recipient|recipientWallet, tokenAccount, mint, amount, cluster } }
        if (body.payment) {
          const p = body.payment;
          const network =
            p.cluster === "devnet"
              ? "solana-devnet"
              : p.cluster === "mainnet-beta"
                ? "solana-mainnet"
                : `solana:${p.cluster}`;
          // Normalise into PaymentRequired shape so the rest of the flow works.
          // payTo: SPL servers provide tokenAccount (recipient ATA);
          //        SOL servers provide recipient (wallet address).
          // feePayer: left empty — native servers have no facilitator,
          //           so the wallet pays its own gas (falls back in buildPaymentTransaction).
          return {
            x402Version: 1,
            accepts: [
              {
                scheme: "exact",
                network,
                amount: String(p.amount ?? "0"),
                asset: p.mint ?? NATIVE_SOL_MINT,
                payTo: p.tokenAccount ?? p.recipient ?? p.recipientWallet ?? "",
                maxTimeoutSeconds: 60,
                extra: { feePayer: "" }, // wallet is its own fee payer
                description: p.message,
                // Stash recipientWallet so buildPaymentTransaction can create
                // a missing ATA if needed (SPL only).
                _recipientWallet: p.recipientWallet,
              } as any,
            ],
          } as PaymentRequired;
        }
      } catch {
        // Body not JSON — skip
      }
    }

    return null;
  }

  /**
   * Select the best matching PaymentRequirements for our wallet.
   * Prefers the configured network and "exact" scheme.
   *
   * Handles both CAIP-2 identifiers (`solana:EtWTRA…`) and the shorthand
   * network names used by the Coinbase reference implementation and native
   * servers (`solana-devnet`, `solana-mainnet`, `solana-testnet`).
   */
  selectRequirements(
    paymentRequired: PaymentRequired,
  ): PaymentRequirements | null {
    // Normalise a network string to its canonical CAIP-2 id for comparison
    const normalise = (n: string): string => {
      if (n === "solana-devnet") return SOLANA_DEVNET;
      if (n === "solana-mainnet" || n === "solana-mainnet-beta")
        return SOLANA_MAINNET;
      return n; // already CAIP-2 or unknown
    };

    const preferredNorm = normalise(this.config.preferredNetwork);

    // First try: exact match on preferred network (after normalisation)
    const preferred = paymentRequired.accepts.find(
      (r) => r.scheme === "exact" && normalise(r.network) === preferredNorm,
    );
    if (preferred) return preferred;

    // Second try: any SVM network with exact scheme
    const anySvm = paymentRequired.accepts.find(
      (r) =>
        r.scheme === "exact" &&
        (r.network.startsWith("solana:") || r.network.startsWith("solana-")),
    );
    return anySvm || null;
  }

  // ── Transaction building ─────────────────────────────────────────────────

  /**
   * Build the Solana payment transaction per the x402 SVM exact scheme.
   *
   * For SPL tokens, uses a plain `Transfer` instruction (opcode 3) — this is
   * what native/minimal x402 servers validate for. If a Solana `connection`
   * is provided, the recipient's Associated Token Account is created inline
   * when it does not yet exist (matching the Woody reference client behaviour).
   *
   * For native SOL, uses `SystemProgram.transfer`.
   *
   * The fee payer defaults to the wallet itself (no external facilitator in
   * the native server pattern). When `requirements.extra.feePayer` is
   * non-empty a facilitator address is used instead.
   */
  async buildPaymentTransaction(
    requirements: PaymentRequirements & { _recipientWallet?: string },
    walletPublicKey: string,
    connection?: Connection,
  ): Promise<Transaction> {
    const payer = new PublicKey(walletPublicKey);
    // feePayer is optional — native/minimal servers have no facilitator.
    // Fall back to the wallet itself as fee payer in that case.
    const feePayerKey = requirements.extra?.feePayer || walletPublicKey;
    const feePayer = new PublicKey(feePayerKey);
    const payTo = new PublicKey(requirements.payTo);
    const amount = BigInt(requirements.amount);

    const tx = new Transaction();

    // ── Payment instruction ────────────────────────────────────────────────
    if (requirements.asset === NATIVE_SOL_MINT) {
      // Native SOL transfer via System Program
      tx.add(
        SystemProgram.transfer({
          fromPubkey: payer,
          toPubkey: payTo,
          lamports: Number(amount),
        }),
      );
    } else {
      // SPL Token Transfer (opcode 3 — plain Transfer, not TransferChecked).
      // Native servers validate ix.data[0] === 3, so we must NOT use
      // createTransferCheckedInstruction (opcode 12).
      const mint = new PublicKey(requirements.asset);
      const sourceAta = getAssociatedTokenAddressSync(mint, payer);
      // payTo is already the recipient ATA when the server provides tokenAccount.
      const destAta = payTo;

      // If a connection is available, check whether the recipient ATA exists
      // and prepend a createAssociatedTokenAccount instruction if not —
      // exactly what the reference client does.
      if (connection) {
        let ataExists = false;
        try {
          await getAccount(connection, destAta);
          ataExists = true;
        } catch {
          // Account does not exist or fetch failed — will create below
        }
        if (!ataExists) {
          // Derive the recipient wallet: prefer the stashed _recipientWallet
          // (from body-fallback), otherwise treat payTo AS the wallet (for
          // Coinbase-style servers that hand us the wallet address directly).
          const recipientWalletKey =
            requirements._recipientWallet ?? requirements.payTo;
          const recipientWallet = new PublicKey(recipientWalletKey);
          tx.add(
            createAssociatedTokenAccountInstruction(
              payer, // payer (rent)
              destAta, // ATA to create
              recipientWallet, // owner
              mint,
            ),
          );
        }
      }

      tx.add(
        createTransferInstruction(
          sourceAta, // source ATA
          destAta, // destination ATA
          payer, // owner / authority
          Number(amount),
        ),
      );
    }

    // Fee payer is either the facilitator or the wallet itself
    tx.feePayer = feePayer;

    return tx;
  }

  // ── Utility ──────────────────────────────────────────────────────────────

  /**
   * Check whether a URL requires x402 payment without actually paying.
   *
   * Uses GET (not HEAD) because many x402 servers embed payment requirements
   * in the response body, which HEAD requests do not return.
   */
  async probeResource(url: string): Promise<{
    requiresPayment: boolean;
    paymentRequired?: PaymentRequired;
    svmOptions?: PaymentRequirements[];
  }> {
    const response = await fetch(url, { method: "GET" });

    if (response.status !== 402) {
      return { requiresPayment: false };
    }

    // Read body so parsePaymentRequired can fall back to JSON body
    let bodyText: string | undefined;
    try {
      bodyText = await response.text();
    } catch {
      // non-fatal
    }

    const paymentRequired = this.parsePaymentRequired(response, bodyText);
    if (!paymentRequired) {
      return { requiresPayment: true };
    }

    const svmOptions = paymentRequired.accepts.filter(
      (r) =>
        r.scheme === "exact" &&
        (r.network.startsWith("solana:") || r.network.startsWith("solana-")),
    );

    return {
      requiresPayment: true,
      paymentRequired,
      svmOptions: svmOptions.length > 0 ? svmOptions : undefined,
    };
  }

  /**
   * Format a payment amount for display.
   */
  static formatAmount(amount: string, asset: string): string {
    const value = Number(amount);
    if (asset === NATIVE_SOL_MINT) {
      return `${(value / LAMPORTS_PER_SOL).toFixed(6)} SOL`;
    }
    // Default to 6 decimal places (USDC, USDT, etc.)
    return `${(value / 1_000_000).toFixed(6)} tokens`;
  }

  /**
   * Get the CAIP-2 network identifier for a Solana cluster.
   */
  static getNetworkId(cluster: "devnet" | "testnet" | "mainnet-beta"): string {
    switch (cluster) {
      case "mainnet-beta":
        return SOLANA_MAINNET;
      case "devnet":
        return SOLANA_DEVNET;
      default:
        return `solana:${cluster}`;
    }
  }
}
