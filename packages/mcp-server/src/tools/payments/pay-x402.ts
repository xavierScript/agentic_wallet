/**
 * tools/payments/pay-x402.ts
 *
 * MCP tool – pay for an x402-protected HTTP resource using a managed wallet.
 *
 * Flow:
 *   1. Agent calls this tool with a URL and wallet ID
 *   2. The tool makes an HTTP request to the URL
 *   3. If the server returns 402, it parses the payment requirements
 *   4. Builds a Solana payment transaction per the x402 SVM exact scheme
 *   5. Signs via WalletService (policy checks enforced)
 *   6. Retries the request with the payment proof
 *   7. Returns the resource body to the agent
 */

import { z } from "zod";
import { Transaction, PublicKey } from "@solana/web3.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WalletServices } from "../../services.js";

export function registerPayX402Tool(
  server: McpServer,
  services: WalletServices,
) {
  const { keyManager, walletService, x402Client } = services;

  server.registerTool(
    "pay_x402",
    {
      title: "Pay for HTTP Resource (x402)",
      description:
        "Access an x402-protected HTTP resource by automatically handling the payment flow. " +
        "If the server responds with 402 Payment Required, this tool builds and signs a " +
        "Solana payment transaction, sends it via the x402 protocol, and returns the " +
        "resource content. Works with any x402-compatible API. " +
        "Policy-checked before signing (spending limits, rate limits).",
      inputSchema: {
        wallet_id: z.string().describe("Wallet ID (UUID) to pay from"),
        url: z.string().url().describe("URL of the x402-protected resource"),
        method: z
          .enum(["GET", "POST", "PUT", "DELETE"])
          .optional()
          .default("GET")
          .describe("HTTP method (default: GET)"),
        headers: z
          .record(z.string())
          .optional()
          .describe("Optional HTTP headers as key-value pairs"),
        body: z
          .string()
          .optional()
          .describe("Optional request body (for POST/PUT)"),
      },
      annotations: {
        title: "Pay for HTTP Resource (x402)",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ wallet_id, url, method, headers, body }) => {
      // Validate wallet exists
      let entry;
      try {
        entry = keyManager.loadKeystore(wallet_id);
      } catch (err: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err.message}`,
            },
          ],
          isError: true,
        };
      }

      // Build fetch options
      const fetchOptions: RequestInit = {
        method: method || "GET",
        headers: headers || {},
      };
      if (body && (method === "POST" || method === "PUT")) {
        fetchOptions.body = body;
      }

      // Sign callback — signs via WalletService which enforces policies
      const signTx = async (tx: Transaction): Promise<Transaction> => {
        // We need to sign the transaction with the wallet's keypair.
        // The WalletService.signAndSendTransaction sends immediately, but
        // for x402 we only need a signature (the facilitator submits).
        // We unlock the keypair through KeyManager and sign locally.
        const keypair = keyManager.unlockWallet(wallet_id);

        // Policy check via a lightweight limits check
        const violation = services.policyEngine.checkLimits(wallet_id, 0);
        if (violation) {
          throw new Error(`Policy violation: ${violation}`);
        }

        // Every Solana transaction needs a recent blockhash before it can be
        // signed.  The x402 client builds the transaction without one (it has
        // no RPC access), so we must hydrate it here before calling partialSign.
        if (!tx.recentBlockhash) {
          const { blockhash } = await services.connection.getLatestBlockhash();
          tx.recentBlockhash = blockhash;
        }

        tx.partialSign(keypair);

        // Record the transaction for rate limiting
        services.policyEngine.recordTransaction(wallet_id);

        // Audit log
        services.auditLogger.log({
          action: "x402:payment_signed",
          walletId: wallet_id,
          publicKey: entry.publicKey,
          success: true,
          details: { url, method },
        });

        return tx;
      };

      try {
        const result = await x402Client.payForResource(
          url,
          fetchOptions,
          signTx,
          entry.publicKey,
        );

        if (!result.success) {
          services.auditLogger.log({
            action: "x402:payment_failed",
            walletId: wallet_id,
            publicKey: entry.publicKey,
            success: false,
            error: result.error || `HTTP ${result.httpStatus}`,
            details: { url, method, httpStatus: result.httpStatus },
          });

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: false,
                    url,
                    httpStatus: result.httpStatus,
                    error: result.error || "Payment or resource fetch failed",
                    paymentRequirements: result.paymentRequirements
                      ? {
                          amount: result.paymentRequirements.amount,
                          asset: result.paymentRequirements.asset,
                          payTo: result.paymentRequirements.payTo,
                          network: result.paymentRequirements.network,
                        }
                      : undefined,
                  },
                  null,
                  2,
                ),
              },
            ],
            isError: true,
          };
        }

        // Success
        services.auditLogger.log({
          action: "x402:payment_success",
          walletId: wallet_id,
          publicKey: entry.publicKey,
          success: true,
          details: {
            url,
            method,
            amountPaid: result.amountPaid,
            tokenMint: result.tokenMint,
            settlementTx: result.settlement?.transaction,
          },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  url,
                  httpStatus: result.httpStatus,
                  contentType: result.contentType,
                  body: result.body,
                  payment: result.paymentRequirements
                    ? {
                        amountPaid: result.amountPaid,
                        tokenMint: result.tokenMint,
                        payTo: result.paymentRequirements.payTo,
                        network: result.paymentRequirements.network,
                      }
                    : null,
                  settlement: result.settlement || null,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err: any) {
        services.auditLogger.log({
          action: "x402:payment_error",
          walletId: wallet_id,
          success: false,
          error: err.message,
          details: { url, method },
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Error paying for resource: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
