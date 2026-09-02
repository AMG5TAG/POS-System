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
// A fully-configured Zip merchant (apiKey + locationId required).
const CREDS = { apiKey: "k", locationId: "loc_1", deviceRefCode: "dev_1" };

beforeEach(() => {
  mockRead.mockReset();
  mockFetch.mockReset();
});

describe("zipProvider.extractWebhookRef", () => {
  it("returns the checkout id from a valid body", () => {
    expect(zipProvider.extractWebhookRef(JSON.stringify({ id: "zco_1", status: "completed" }))).toBe("zco_1");
  });
  it("returns null for an unparseable body", () => {
    expect(zipProvider.extractWebhookRef("not json")).toBeNull();
  });
  it("returns null when there is no id", () => {
    expect(zipProvider.extractWebhookRef(JSON.stringify({ status: "completed" }))).toBeNull();
  });
});

describe("zipProvider.verifyWebhook (per-merchant secret)", () => {
  const body = JSON.stringify({ id: "zco_1", status: "completed", charge: { status: "authorised" } });
  const sign = (secret: string) => crypto.createHmac("sha256", secret).update(body).digest("hex");

  it("accepts a correctly signed body and maps the status", async () => {
    mockRead.mockResolvedValue({ ...CREDS, webhookSecret: "s3cret" });
    const ev = await zipProvider.verifyWebhook(1, body, { "zip-signature": sign("s3cret") });
    expect(ev).not.toBeNull();
    expect(ev!.externalRef).toBe("zco_1");
    expect(ev!.status).toBe("authorized"); // charge "authorised" → authorized
  });

  it("rejects a body signed with the wrong secret", async () => {
    mockRead.mockResolvedValue({ ...CREDS, webhookSecret: "s3cret" });
    const ev = await zipProvider.verifyWebhook(1, body, { "zip-signature": sign("WRONG") });
    expect(ev).toBeNull();
  });

  it("rejects when the merchant has no webhook secret on file", async () => {
    mockRead.mockResolvedValue({ ...CREDS });
    const ev = await zipProvider.verifyWebhook(1, body, { "zip-signature": sign("s3cret") });
    expect(ev).toBeNull();
  });

  it("rejects when the signature header is missing", async () => {
    mockRead.mockResolvedValue({ ...CREDS, webhookSecret: "s3cret" });
    const ev = await zipProvider.verifyWebhook(1, body, {});
    expect(ev).toBeNull();
  });
});

describe("zipProvider status mapping", () => {
  it("maps a captured charge status", async () => {
    mockRead.mockResolvedValue({ ...CREDS });
    mockFetch.mockResolvedValue(okJson({ id: "zco_1", status: "completed", charge: { status: "captured" } }));
    const r = await zipProvider.getStatus(1, "zco_1");
    expect(r.status).toBe("captured");
  });

  it("maps a declined charge status with reason", async () => {
    mockRead.mockResolvedValue({ ...CREDS });
    mockFetch.mockResolvedValue(okJson({ id: "zco_1", status: "completed", charge: { status: "declined" }, decline_reason: "limit" }));
    const r = await zipProvider.getStatus(1, "zco_1");
    expect(r.status).toBe("declined");
    expect(r.failureReason).toBe("limit");
  });

  it("maps an expired checkout with no charge", async () => {
    mockRead.mockResolvedValue({ ...CREDS });
    mockFetch.mockResolvedValue(okJson({ id: "zco_1", status: "expired" }));
    const r = await zipProvider.getStatus(1, "zco_1");
    expect(r.status).toBe("expired");
  });
});

describe("zipProvider.createCharge", () => {
  it("maps the created checkout into a charge result", async () => {
    mockRead.mockResolvedValue({ ...CREDS });
    mockFetch.mockResolvedValue(okJson({ id: "zco_9", status: "new", media: { qr_code: "https://qr/zco_9" } }));
    const c = await zipProvider.createCharge(1, { amount: 10, currency: "AUD", orderRef: "ref-1" });
    expect(c.externalRef).toBe("zco_9");
    expect(c.qrPayload).toBe("https://qr/zco_9");
    expect(c.status).toBe("pending"); // "new" → pending
    expect(c.expiresAt).toBeNull();
  });

  it("sends the documented QR-API wire format (key auth, string amount, lowercase currency)", async () => {
    mockRead.mockResolvedValue({ ...CREDS });
    mockFetch.mockResolvedValue(okJson({ id: "zco_9", status: "new" }));
    await zipProvider.createCharge(1, { amount: 12.5, currency: "AUD", orderRef: "ref-1" });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.zip.co/au/merchant/instore-qr/checkouts");
    expect(init.headers["X-Zip-API-Key"]).toBe("k");
    expect(init.headers["Content-Type"]).toBe("application/vnd.zipco.v3+json");
    const sent = JSON.parse(init.body);
    expect(sent.order.amount).toBe("12.50");
    expect(sent.order.currency).toBe("aud");
    expect(sent.originator.location_id).toBe("loc_1");
    expect(sent.config.capture).toBe(false);
  });

  it("throws when the merchant has no Zip credentials", async () => {
    mockRead.mockResolvedValue(null);
    await expect(zipProvider.createCharge(1, { amount: 10, currency: "AUD", orderRef: "ref-1" })).rejects.toThrow();
  });

  it("throws when locationId is missing", async () => {
    mockRead.mockResolvedValue({ apiKey: "k" });
    await expect(zipProvider.createCharge(1, { amount: 10, currency: "AUD", orderRef: "ref-1" })).rejects.toThrow();
  });
});

describe("zipProvider.cancel", () => {
  it("voids a checkout and reports cancelled", async () => {
    mockRead.mockResolvedValue({ ...CREDS });
    mockFetch.mockResolvedValue(okJson({}));
    const r = await zipProvider.cancel!(1, "zco_1");
    expect(r.status).toBe("cancelled");
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.zip.co/au/merchant/instore-qr/checkouts/zco_1/cancel");
    expect(init.method).toBe("POST");
  });

  it("reports failure when Zip rejects the void", async () => {
    mockRead.mockResolvedValue({ ...CREDS });
    mockFetch.mockResolvedValue({ ok: false, status: 409, json: async () => ({ decline_reason: "already captured" }) });
    const r = await zipProvider.cancel!(1, "zco_1");
    expect(r.status).toBe("failed");
    expect(r.failureReason).toBe("already captured");
  });
});

describe("zipProvider.refund", () => {
  it("returns refunded on a successful reversal", async () => {
    mockRead.mockResolvedValue({ ...CREDS });
    mockFetch.mockResolvedValue(okJson({ id: "zco_1", charge: { status: "refunded" } }));
    const r = await zipProvider.refund(1, "zco_1", 10);
    expect(r.ok).toBe(true);
    expect(r.status).toBe("refunded");
  });

  it("reports failure when Zip rejects the refund", async () => {
    mockRead.mockResolvedValue({ ...CREDS });
    mockFetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({ decline_reason: "already refunded" }) });
    const r = await zipProvider.refund(1, "zco_1", 10);
    expect(r.ok).toBe(false);
    expect(r.error).toBe("already refunded");
  });
});
