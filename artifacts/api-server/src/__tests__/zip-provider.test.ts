import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// Zip's signing secret + credentials live in the vault — mock the read.
vi.mock("../services/tokenVault", () => ({
  readCredentialVault: vi.fn(),
}));

import { readCredentialVault } from "../services/tokenVault";
import { zipProvider } from "../services/payments/zip";

const mockRead = readCredentialVault as unknown as ReturnType<typeof vi.fn>;
const mockFetch = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = mockFetch;

const okJson = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

beforeEach(() => {
  mockRead.mockReset();
  mockFetch.mockReset();
});

describe("zipProvider.extractWebhookRef", () => {
  it("returns the order id from a valid body", () => {
    expect(zipProvider.extractWebhookRef(JSON.stringify({ id: "zo_1", state: "approved" }))).toBe("zo_1");
  });
  it("returns null for an unparseable body", () => {
    expect(zipProvider.extractWebhookRef("not json")).toBeNull();
  });
  it("returns null when there is no id", () => {
    expect(zipProvider.extractWebhookRef(JSON.stringify({ state: "approved" }))).toBeNull();
  });
});

describe("zipProvider.verifyWebhook (per-merchant secret)", () => {
  const body = JSON.stringify({ id: "zo_1", state: "approved" });
  const sign = (secret: string) => crypto.createHmac("sha256", secret).update(body).digest("hex");

  it("accepts a correctly signed body and maps the status", async () => {
    mockRead.mockResolvedValue({ merchantId: "m1", apiKey: "k", webhookSecret: "s3cret" });
    const ev = await zipProvider.verifyWebhook(1, body, { "zip-signature": sign("s3cret") });
    expect(ev).not.toBeNull();
    expect(ev!.externalRef).toBe("zo_1");
    expect(ev!.status).toBe("authorized"); // "approved" → authorized
  });

  it("rejects a body signed with the wrong secret", async () => {
    mockRead.mockResolvedValue({ merchantId: "m1", apiKey: "k", webhookSecret: "s3cret" });
    const ev = await zipProvider.verifyWebhook(1, body, { "zip-signature": sign("WRONG") });
    expect(ev).toBeNull();
  });

  it("rejects when the merchant has no webhook secret on file", async () => {
    mockRead.mockResolvedValue({ merchantId: "m1", apiKey: "k" });
    const ev = await zipProvider.verifyWebhook(1, body, { "zip-signature": sign("s3cret") });
    expect(ev).toBeNull();
  });

  it("rejects when the signature header is missing", async () => {
    mockRead.mockResolvedValue({ merchantId: "m1", apiKey: "k", webhookSecret: "s3cret" });
    const ev = await zipProvider.verifyWebhook(1, body, {});
    expect(ev).toBeNull();
  });
});

describe("zipProvider status mapping", () => {
  it("maps a captured order status", async () => {
    mockRead.mockResolvedValue({ merchantId: "m1", apiKey: "k" });
    mockFetch.mockResolvedValue(okJson({ id: "zo_1", state: "captured" }));
    const r = await zipProvider.getStatus(1, "zo_1");
    expect(r.status).toBe("captured");
  });

  it("maps a declined order status with reason", async () => {
    mockRead.mockResolvedValue({ merchantId: "m1", apiKey: "k" });
    mockFetch.mockResolvedValue(okJson({ id: "zo_1", state: "declined", declined_reason: "limit" }));
    const r = await zipProvider.getStatus(1, "zo_1");
    expect(r.status).toBe("declined");
    expect(r.failureReason).toBe("limit");
  });
});

describe("zipProvider.createCharge", () => {
  it("maps the created order into a charge result", async () => {
    mockRead.mockResolvedValue({ merchantId: "m1", apiKey: "k" });
    mockFetch.mockResolvedValue(okJson({ id: "zo_9", qr_code: "QR-DATA", state: "pending", expires_at: "2026-01-01T00:00:00Z" }));
    const c = await zipProvider.createCharge(1, { amount: 10, currency: "AUD", orderRef: "ref-1" });
    expect(c.externalRef).toBe("zo_9");
    expect(c.qrPayload).toBe("QR-DATA");
    expect(c.status).toBe("pending");
    expect(c.expiresAt).toBeInstanceOf(Date);
  });

  it("throws when the merchant has no Zip credentials", async () => {
    mockRead.mockResolvedValue(null);
    await expect(zipProvider.createCharge(1, { amount: 10, currency: "AUD", orderRef: "ref-1" })).rejects.toThrow();
  });
});

describe("zipProvider.refund", () => {
  it("returns refunded on a successful reversal", async () => {
    mockRead.mockResolvedValue({ merchantId: "m1", apiKey: "k" });
    mockFetch.mockResolvedValue(okJson({ id: "zo_1", state: "refunded" }));
    const r = await zipProvider.refund(1, "zo_1", 10);
    expect(r.ok).toBe(true);
    expect(r.status).toBe("refunded");
  });

  it("reports failure when Zip rejects the refund", async () => {
    mockRead.mockResolvedValue({ merchantId: "m1", apiKey: "k" });
    mockFetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({ declined_reason: "already refunded" }) });
    const r = await zipProvider.refund(1, "zo_1", 10);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("already refunded");
  });
});
