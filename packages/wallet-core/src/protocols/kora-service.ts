/**
 * kora-service.ts
 *
 * Gasless transaction relay via a Kora paymaster node.
 * Wraps Kora's JSON-RPC 2.0 API directly (no SDK dependency) to avoid
 * pulling in @solana/kit v5 alongside the existing @solana/web3.js v1.x.
 *
 * When enabled, WalletService routes legacy transactions through Kora:
 *   1. Agent wallet partially signs the transaction payload
 *   2. Kora co-signs as fee payer and broadcasts to Solana
 *   3. Agent never needs SOL for gas — only the tokens it's working with
 *
 * @see https://github.com/solana-foundation/kora
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface KoraServiceConfig {
  /** URL of the Kora JSON-RPC server (e.g. http://localhost:8080) */
  rpcUrl: string;
  /** Optional API key for authenticated Kora nodes */
  apiKey?: string;
}

/** Shape returned by Kora's `getPayerSigner` RPC method. */
export interface KoraPayerInfo {
  signerAddress: string;
  paymentDestination: string;
}

/** Shape returned by Kora's `getConfig` RPC method (subset we care about). */
export interface KoraNodeConfig {
  feePayers: string[];
  validationConfig: Record<string, unknown>;
  enabledMethods: Record<string, boolean>;
}

/** Shape returned by Kora's `signAndSendTransaction` RPC method. */
export interface KoraSignAndSendResult {
  signature: string;
  signedTransaction: string;
  signerPubkey: string;
}

/** Shape returned by Kora's `signTransaction` RPC method. */
export interface KoraSignResult {
  signature: string;
  signedTransaction: string;
  signerPubkey: string;
}

/** Standard JSON-RPC 2.0 response envelope. */
interface JsonRpcResponse<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

// ── Service ──────────────────────────────────────────────────────────────────

/**
 * KoraService provides gasless transaction relay via a Kora paymaster node.
 *
 * Usage:
 * ```ts
 * const kora = KoraService.create("http://localhost:8080", "my-api-key");
 * if (kora) {
 *   const { signerAddress } = await kora.getPayerSigner();
 *   const { signature } = await kora.signAndSendTransaction(base64Tx);
 * }
 * ```
 */
export class KoraService {
  private rpcUrl: string;
  private apiKey: string | undefined;
  private requestId = 0;

  /** Cached payer signer info — the Kora node's signer address is static. */
  private cachedPayerInfo: KoraPayerInfo | null = null;

  constructor(config: KoraServiceConfig) {
    // Strip trailing slash for consistent URL construction
    this.rpcUrl = config.rpcUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
  }

  // ── Factory ──────────────────────────────────────────────────────────────

  /**
   * Create a KoraService if a Kora RPC URL is provided.
   * Returns `null` when Kora is not configured — callers should fall back
   * to the standard fee-payer flow.
   *
   * Follows the same nullable-factory pattern as `MasterFunder.create()`.
   */
  static create(rpcUrl?: string, apiKey?: string): KoraService | null {
    if (!rpcUrl) return null;
    return new KoraService({ rpcUrl, apiKey });
  }

  // ── JSON-RPC transport ───────────────────────────────────────────────────

  /**
   * Low-level JSON-RPC 2.0 call to the Kora server.
   * Handles request envelope, auth headers, and error unwrapping.
   */
  async rpcCall<T>(
    method: string,
    params: Record<string, unknown> | unknown[] = {},
  ): Promise<T> {
    this.requestId += 1;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }

    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: this.requestId,
      method,
      params,
    });

    let response: Response;
    try {
      response = await fetch(this.rpcUrl, { method: "POST", headers, body });
    } catch (err: any) {
      throw new Error(
        `Kora RPC request failed (${method}): ${err.message ?? err}`,
      );
    }

    if (!response.ok) {
      throw new Error(
        `Kora RPC HTTP error (${method}): ${response.status} ${response.statusText}`,
      );
    }

    const json = (await response.json()) as JsonRpcResponse<T>;

    if (json.error) {
      throw new Error(
        `Kora RPC error (${method}): [${json.error.code}] ${json.error.message}`,
      );
    }

    if (json.result === undefined) {
      throw new Error(`Kora RPC (${method}): missing result in response`);
    }

    return json.result;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Get the Kora node's fee-payer signer address and payment destination.
   * The result is cached — signer address is static for a given Kora node.
   */
  async getPayerSigner(): Promise<KoraPayerInfo> {
    if (this.cachedPayerInfo) return this.cachedPayerInfo;

    const raw = await this.rpcCall<{
      signer_address: string;
      payment_address: string;
    }>("getPayerSigner", []);

    this.cachedPayerInfo = {
      signerAddress: raw.signer_address,
      paymentDestination: raw.payment_address,
    };

    return this.cachedPayerInfo;
  }

  /**
   * Retrieve the Kora node's configuration (for health-check / diagnostics).
   */
  async getConfig(): Promise<KoraNodeConfig> {
    const raw = await this.rpcCall<{
      fee_payers?: string[];
      validation_config?: Record<string, unknown>;
      enabled_methods?: Record<string, boolean>;
    }>("getConfig", []);

    return {
      feePayers: raw.fee_payers ?? [],
      validationConfig: raw.validation_config ?? {},
      enabledMethods: raw.enabled_methods ?? {},
    };
  }

  /**
   * Submit a partially-signed transaction to Kora for co-signing
   * and immediate broadcast to the Solana network.
   *
   * The transaction must have:
   *   - `feePayer` set to the Kora signer address
   *   - Agent wallet's signature applied (partial sign)
   *   - Serialized as base64 with `requireAllSignatures: false`
   *
   * Kora validates the transaction, co-signs as fee payer, and
   * sends it to its configured Solana RPC endpoint.
   */
  async signAndSendTransaction(
    base64Transaction: string,
  ): Promise<KoraSignAndSendResult> {
    const raw = await this.rpcCall<{
      signature: string;
      signed_transaction: string;
      signer_pubkey: string;
    }>("signAndSendTransaction", { transaction: base64Transaction });

    return {
      signature: raw.signature,
      signedTransaction: raw.signed_transaction,
      signerPubkey: raw.signer_pubkey,
    };
  }

  /**
   * Sign a transaction with the Kora fee payer WITHOUT broadcasting.
   * Useful for debugging or when the caller wants to submit manually.
   */
  async signTransaction(base64Transaction: string): Promise<KoraSignResult> {
    const raw = await this.rpcCall<{
      signature: string;
      signed_transaction: string;
      signer_pubkey: string;
    }>("signTransaction", { transaction: base64Transaction });

    return {
      signature: raw.signature,
      signedTransaction: raw.signed_transaction,
      signerPubkey: raw.signer_pubkey,
    };
  }

  /**
   * Clear the cached payer info (useful in tests or after signer rotation).
   */
  clearCache(): void {
    this.cachedPayerInfo = null;
  }

  /** The configured Kora RPC URL. */
  get url(): string {
    return this.rpcUrl;
  }
}
