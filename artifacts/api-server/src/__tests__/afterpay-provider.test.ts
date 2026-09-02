import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// Afterpay's signing secret + credentials live in the vault — mock the read.
vi.mock("../services/tokenVault", () => ({
  readCredentialVault: vi.fn(),
}));

import { readCredentialVault } from "../services/tokenVault";
import { afterpayProvider } from "../services/payments/afterpay";

const mockRead = readCredentialVault as unknown as ReturnType<typeof vi.fn>;
const mockFetch = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = mockFetch;

const okJson = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
  mockRead.mockReset();
  mockFetch.mockReset();
});

describe("afterpayProvider.extractWebhookRef", () => {
  it("returns the token from a valid body", () => {
    expect(afterpayProvider.extractWebhookRef(JSON.stringify({ token: "ap_1", status: "APPROVED" }))).toBe("ap_1");
  });
  it("falls back to id when token is absent", () => {
    expect(afterpayProvider.extractWebhookRef(JSON.stringify({ id: "ord_9" }))).toBe("ord_9");
  });
  it("returns null for an unparseable body", () => {
    expect(afterpayProvider.extractWebhookRef("not json")).toBeNull();
  });
});

describe("afterpayProvider.verifyWebhook (per-merchant secret)", () => {
  const body = JSON.stringify({ token: "ap_1", status: "APPROVED" });
  const sign = (secret: string) => crypto.createHmac("sha256", secret).update(body).digest("hex");

  it("accepts a correctly signed body and maps the status", async () => {
    mockRead.mockResolvedValue({ merchantId: "m1", apiKey: "k", webhookSecret: "s3cret" });
    const ev = await afterpayProvider.verifyWebhook(1, body, { "afterpay-signature": sign("s3cret") });
    expect(ev).not.toBeNull();
    expect(ev!.externalRef).toBe("ap_1");
    expect(ev!.status).toBe("authorized"); // APPROVED → authorized
  });

  it("rejects a body signed with the wrong secret", async () => {
    mockRead.mockResolvedValue({ merchantId: "m1", apiKey: "k", webhookSecret: "s3cret" });
    expect(await afterpayProvider.verifyWebhook(1, body, { "afterpay-signature": sign("WRONG") })).toBeNull();
  });

  it("rejects when the merchant has no webhook secret on file", async () => {
    mockRead.mockResolvedValue({ merchantId: "m1", apiKey: "k" });
    expect(await afterpayProvider.verifyWebhook(1, body, { "afterpay-signature": sign("s3cret") })).toBeNull();
  });

  it("rejects when the signature header is missing", async () => {
    mockRead.mockResolvedValue({ merchantId: "m1", apiKey: "k", webhookSecret: "s3cret" });
    expect(await afterpayProvider.verifyWebhook(1, body, {})).toBeNull();
  });
});

describe("afterpayProvider status mapping", () => {
  it("maps a captured payment status", async () => {
    mockRead.mockResolvedValue({ merchantId: "m1", apiKey: "k" });
    mockFetch.mockResolvedValue(okJson({ token: "ap_1", status: "CAPTURED" }));
    expect((await afterpayProvider.getStatus(1, "ap_1")).status).toBe("captured");
  });

  it("maps a declined payment status with reason", async () => {
    mockRead.mockResolvedValue({ merchantId: "m1", apiKey: "k" });
    mockFetch.mockResolvedValue(okJson({ token: "ap_1", status: "DECLINED", message: "limit" }));
    const r = await afterpayProvider.getStatus(1, "ap_1");
    expect(r.status).toBe("declined");
    expect(r.failureReason).toBe("limit");
  });
});

describe("afterpayProvider.createCharge", () => {
  it("maps the created checkout into a charge result", async () => {
    mockRead.mockResolvedValue({ merchantId: "m1", apiKey: "k" });
    mockFetch.mockResolvedValue(okJson({ token: "ap_9", redirectCheckoutUrl: "https://portal.afterpay.com/checkout?token=ap_9", expires: "2026-01-01T00:00:00Z" }));
    const c = await afterpayProvider.createCharge(1, { amount: 10, currency: "AUD", orderRef: "ref-1" });
    expect(c.externalRef).toBe("ap_9");
    expect(c.qrPayload).toBe("https://portal.afterpay.com/checkout?token=ap_9");
    expect(c.expiresAt).toBeInstanceOf(Date);
  });

  it("throws when the merchant has no Afterpay credentials", async () => {
    mockRead.mockResolvedValue(null);
    await expect(afterpayProvider.createCharge(1, { amount: 10, currency: "AUD", orderRef: "ref-1" })).rejects.toThrow();
  });
});

describe("afterpayProvider.refund", () => {
  it("returns refunded on a successful reversal", async () => {
    mockRead.mockResolvedValue({ merchantId: "m1", apiKey: "k" });
    mockFetch.mockResolvedValue(okJson({ token: "ap_1", status: "refunded" }));
    const r = await afterpayProvider.refund(1, "ap_1", 10);
    expect(r.ok).toBe(true);
    expect(r.status).toBe("refunded");
  });

  it("reports failure when Afterpay rejects the refund", async () => {
    mockRead.mockResolvedValue({ merchantId: "m1", apiKey: "k" });
    mockFetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: "already refunded" }) });
    const r = await afterpayProvider.refund(1, "ap_1", 10);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("already refunded");
  });
});
