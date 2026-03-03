import { describe, it, expect, vi, beforeEach } from "vitest";
import { KoraService } from "../protocols/kora-service.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a mock JSON-RPC success response. */
function jsonRpcOk<T>(result: T): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** Build a mock JSON-RPC error response. */
function jsonRpcErr(code: number, message: string): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code, message } }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("KoraService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── Factory ──────────────────────────────────────────────────────────────

  describe("KoraService.create()", () => {
    it("returns null when no URL is provided", () => {
      expect(KoraService.create()).toBeNull();
      expect(KoraService.create(undefined)).toBeNull();
      expect(KoraService.create("")).toBeNull();
    });

    it("returns a KoraService instance when URL is provided", () => {
      const svc = KoraService.create("http://localhost:8080");
      expect(svc).toBeInstanceOf(KoraService);
    });

    it("strips trailing slashes from URL", () => {
      const svc = KoraService.create("http://localhost:8080///");
      expect(svc!.url).toBe("http://localhost:8080");
    });
  });

  // ── rpcCall ──────────────────────────────────────────────────────────────

  describe("rpcCall()", () => {
    it("sends a correct JSON-RPC 2.0 request body", async () => {
      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(jsonRpcOk({ pong: true }));

      const svc = new KoraService({ rpcUrl: "http://kora.test" });
      await svc.rpcCall("liveness", {});

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toBe("http://kora.test");
      expect(opts!.method).toBe("POST");

      const body = JSON.parse(opts!.body as string);
      expect(body.jsonrpc).toBe("2.0");
      expect(body.method).toBe("liveness");
      expect(typeof body.id).toBe("number");
    });

    it("includes x-api-key header when apiKey is set", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        jsonRpcOk({ ok: true }),
      );

      const svc = new KoraService({
        rpcUrl: "http://kora.test",
        apiKey: "secret-key-123",
      });
      await svc.rpcCall("getConfig", []);

      const [, opts] = vi.mocked(fetch).mock.calls[0];
      const headers = opts!.headers as Record<string, string>;
      expect(headers["x-api-key"]).toBe("secret-key-123");
    });

    it("does NOT include x-api-key header when apiKey is absent", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        jsonRpcOk({ ok: true }),
      );

      const svc = new KoraService({ rpcUrl: "http://kora.test" });
      await svc.rpcCall("getConfig", []);

      const [, opts] = vi.mocked(fetch).mock.calls[0];
      const headers = opts!.headers as Record<string, string>;
      expect(headers["x-api-key"]).toBeUndefined();
    });

    it("throws on JSON-RPC error response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        jsonRpcErr(-32600, "Invalid request"),
      );

      const svc = new KoraService({ rpcUrl: "http://kora.test" });
      await expect(svc.rpcCall("bad", {})).rejects.toThrow(
        "Kora RPC error (bad): [-32600] Invalid request",
      );
    });

    it("throws on HTTP error status", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response("Internal Server Error", {
          status: 500,
          statusText: "Internal Server Error",
        }),
      );

      const svc = new KoraService({ rpcUrl: "http://kora.test" });
      await expect(svc.rpcCall("crash", {})).rejects.toThrow(
        "Kora RPC HTTP error (crash): 500 Internal Server Error",
      );
    });

    it("throws on network failure", async () => {
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
        new Error("ECONNREFUSED"),
      );

      const svc = new KoraService({ rpcUrl: "http://kora.test" });
      await expect(svc.rpcCall("ping", {})).rejects.toThrow(
        "Kora RPC request failed (ping): ECONNREFUSED",
      );
    });

    it("throws when response has no result field", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ jsonrpc: "2.0", id: 1 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const svc = new KoraService({ rpcUrl: "http://kora.test" });
      await expect(svc.rpcCall("empty", {})).rejects.toThrow(
        "Kora RPC (empty): missing result in response",
      );
    });
  });

  // ── getPayerSigner ───────────────────────────────────────────────────────

  describe("getPayerSigner()", () => {
    it("returns signer address and payment destination", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        jsonRpcOk({
          signer_address: "KoraSignerPubkey111111111111111111111111111",
          payment_address: "KoraPaymentPubkey1111111111111111111111111",
        }),
      );

      const svc = new KoraService({ rpcUrl: "http://kora.test" });
      const info = await svc.getPayerSigner();

      expect(info.signerAddress).toBe(
        "KoraSignerPubkey111111111111111111111111111",
      );
      expect(info.paymentDestination).toBe(
        "KoraPaymentPubkey1111111111111111111111111",
      );
    });

    it("caches the result on repeated calls", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
        Promise.resolve(
          jsonRpcOk({
            signer_address: "Cached111111111111111111111111111111111111111",
            payment_address: "Cached111111111111111111111111111111111111111",
          }),
        ),
      );

      const svc = new KoraService({ rpcUrl: "http://kora.test" });

      const first = await svc.getPayerSigner();
      const second = await svc.getPayerSigner();
      const third = await svc.getPayerSigner();

      // fetch should only be called once — result is cached
      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(first).toEqual(second);
      expect(second).toEqual(third);
    });

    it("re-fetches after clearCache()", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
        Promise.resolve(
          jsonRpcOk({
            signer_address: "Refreshed11111111111111111111111111111111111",
            payment_address: "Refreshed11111111111111111111111111111111111",
          }),
        ),
      );

      const svc = new KoraService({ rpcUrl: "http://kora.test" });

      await svc.getPayerSigner();
      svc.clearCache();
      await svc.getPayerSigner();

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  // ── signAndSendTransaction ───────────────────────────────────────────────

  describe("signAndSendTransaction()", () => {
    it("sends base64 transaction and returns the signature", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        jsonRpcOk({
          signature: "5abc123signature",
          signed_transaction: "base64signedTx==",
          signer_pubkey: "KoraSigner111111111111111111111111111111111",
        }),
      );

      const svc = new KoraService({ rpcUrl: "http://kora.test" });
      const result = await svc.signAndSendTransaction("base64UnsignedTx==");

      expect(result.signature).toBe("5abc123signature");
      expect(result.signedTransaction).toBe("base64signedTx==");
      expect(result.signerPubkey).toBe(
        "KoraSigner111111111111111111111111111111111",
      );

      // Verify the transaction was passed in the params
      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(body.method).toBe("signAndSendTransaction");
      expect(body.params.transaction).toBe("base64UnsignedTx==");
    });
  });

  // ── signTransaction ──────────────────────────────────────────────────────

  describe("signTransaction()", () => {
    it("signs without broadcasting and returns the signed tx", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        jsonRpcOk({
          signature: "signOnly123",
          signed_transaction: "base64SignedOnly==",
          signer_pubkey: "KoraSigner111111111111111111111111111111111",
        }),
      );

      const svc = new KoraService({ rpcUrl: "http://kora.test" });
      const result = await svc.signTransaction("base64Tx==");

      expect(result.signature).toBe("signOnly123");
      expect(result.signedTransaction).toBe("base64SignedOnly==");
    });
  });

  // ── getConfig ────────────────────────────────────────────────────────────

  describe("getConfig()", () => {
    it("returns normalized config from Kora node", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        jsonRpcOk({
          fee_payers: ["Payer111", "Payer222"],
          validation_config: { max_allowed_lamports: 1000000 },
          enabled_methods: { sign_transaction: true },
        }),
      );

      const svc = new KoraService({ rpcUrl: "http://kora.test" });
      const cfg = await svc.getConfig();

      expect(cfg.feePayers).toEqual(["Payer111", "Payer222"]);
      expect(cfg.validationConfig).toHaveProperty("max_allowed_lamports");
      expect(cfg.enabledMethods.sign_transaction).toBe(true);
    });
  });
});
