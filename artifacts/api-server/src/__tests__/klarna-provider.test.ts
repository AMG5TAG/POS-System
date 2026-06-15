import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// Klarna's signing secret + credentials live in the vault — mock the read.
vi.mock("../services/tokenVault", () => ({
  readCredentialVault: vi.fn(),
}));

import { readCredentialVault } from "../services/tokenVault";
import { klarnaProvider } from "../services/payments/klarna";

const mockRead = readCredentialVault as unknown as ReturnType<typeof vi.fn>;
const mockFetch = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = mockFetch;

const okJson = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
  mockRead.mockReset();
  mockFetch.mockReset();
});

describe("klarnaProvider.extractWebhookRef", () => {
  it("returns the order_id from a valid body", () => {
    expect(klarnaProvider.extractWebhookRef(JSON.stringify({ order_id: "kl_1", status: "AUTHORIZED" }))).toBe("kl_1");
  });
  it("falls back to id when order_id is absent", () => {
    expect(klarnaProvider.extractWebhookRef(JSON.stringify({ id: "ord_9" }))).toBe("ord_9");
  });
  it("returns null for an unparseable body", () => {
    expect(klarnaProvider.extractWebhookRef("not json")).toBeNull();
  });
});

describe("klarnaProvider.verifyWebhook (per-merchant secret)", () => {
  const body = JSON.stringify({ order_id: "kl_1", status: "AUTHORIZED" });
  const sign = (secret: string) => crypto.createHmac("sha256", secret).update(body).digest("hex");

  it("accepts a correctly signed body and maps the status", async () => {
    mockRead.mockResolvedValue({ merchantId: "m1", apiKey: "k", webhookSecret: "s3cret" });
    const ev = await klarnaProvider.verifyWebhook(1, body, { "klarna-signature": sign("s3cret") });
    expect(ev).not.toBeNull();
    expect(ev!.externalRef).toBe("kl_1");
    expect(ev!.status).toBe("authorized");
  });

  it("rejects a body signed with the wrong secret", async () => {
    mockRead.mockResolvedValue({ merchantId: "m1", apiKey: "k", webhookSecret: "s3cret" });
    expect(await klarnaProvider.verifyWebhook(1, body, { "klarna-signature": sign("WRONG") })).toBeNull();
  });

  it("rejects when the merchant has no webhook secret on file", async () => {
    mockRead.mockResolvedValue({ merchantId: "m1", apiKey: "k" });
    expect(await klarnaProvider.verifyWebhook(1, body, { "klarna-signature": sign("s3cret") })).toBeNull();
  });

  it("rejects when the signature header is missing", async () => {
    mockRead.mockResolvedValue({ merchantId: "m1", apiKey: "k", webhookSecret: "s3cret" });
    expect(await klarnaProvider.verifyWebhook(1, body, {})).toBeNull();
  });
});

describe("klarnaProvider status mapping", () => {
  it("maps a captured order status", async () => {
    mockRead.mockResolvedValue({ merchantId: "m1", apiKey: "k" });
    mockFetch.mockResolvedValue(okJson({ order_id: "kl_1", status: "CAPTURED" }));
    expect((await klarnaProvider.getStatus(1, "kl_1")).status).toBe("captured");
  });

  it("maps a part-captured order status as captured", async () => {
    mockRead.mockResolvedValue({ merchantId: "m1", apiKey: "k" });
    mockFetch.mockResolvedValue(okJson({ order_id: "kl_1", status: "PART_CAPTURED" }));
    expect((await klarnaProvider.getStatus(1, "kl_1")).status).toBe("captured");
  });

  it("surfaces the first error message on a declined lookup", async () => {
    mockRead.mockResolvedValue({ merchantId: "m1", apiKey: "k" });
    mockFetch.mockResolvedValue(okJson({ order_id: "kl_1", status: "CANCELLED", error_messages: ["limit"] }));
    const r = await klarnaProvider.getStatus(1, "kl_1");
    expect(r.status).toBe("cancelled");
    expect(r.failureReason).toBe("limit");
  });
});

describe("klarnaProvider.createCharge", () => {
  it("maps the created session into a charge result", async () => {
    mockRead.mockResolvedValue({ merchantId: "m1", apiKey: "k" });
    mockFetch.mockResolvedValue(okJson({ order_id: "kl_9", redirect_url: "https://klarna.com/pay/kl_9", expires_at: "2026-01-01T00:00:00Z" }));
    const c = await klarnaProvider.createCharge(1, { amount: 10, currency: "AUD", orderRef: "ref-1" });
    expect(c.externalRef).toBe("kl_9");
    expect(c.qrPayload).toBe("https://klarna.com/pay/kl_9");
    expect(c.expiresAt).toBeInstanceOf(Date);
  });

  it("throws when the merchant has no Klarna credentials", async () => {
    mockRead.mockResolvedValue(null);
    await expect(klarnaProvider.createCharge(1, { amount: 10, currency: "AUD", orderRef: "ref-1" })).rejects.toThrow();
  });
});

describe("klarnaProvider.refund", () => {
  it("returns refunded on a successful reversal", async () => {
    mockRead.mockResolvedValue({ merchantId: "m1", apiKey: "k" });
    mockFetch.mockResolvedValue(okJson({ order_id: "kl_1", status: "refunded" }));
    const r = await klarnaProvider.refund(1, "kl_1", 10);
    expect(r.ok).toBe(true);
    expect(r.status).toBe("refunded");
  });

  it("reports failure when Klarna rejects the refund", async () => {
    mockRead.mockResolvedValue({ merchantId: "m1", apiKey: "k" });
    mockFetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error_messages: ["already refunded"] }) });
    const r = await klarnaProvider.refund(1, "kl_1", 10);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("already refunded");
  });
});
