import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

/**
 * The middleware that makes "a saved phone number carries its country code" a
 * property of the API rather than of whichever handler remembered to do it.
 *
 * What is pinned here is *which fields it touches*: it matches field names from
 * a fixed list, never the shape of a value, so a note or a search term that
 * happens to look like a number is left alone. The conversion itself is covered
 * by phone-normalise.test.ts.
 */

vi.mock("../lib/phone", () => ({
  merchantPhoneCountry: vi.fn(async (merchantId: number) => {
    const { phoneCountry } = await import("@workspace/phone-shared");
    // Merchant 2 is set up as a New Zealand shop, to prove the country comes
    // from the merchant on the request and not from a constant.
    return phoneCountry(merchantId === 2 ? "NZ" : "AU")!;
  }),
}));

const { normalisePhoneFields } = await import("../middlewares/normalisePhoneFields");
const { merchantPhoneCountry } = await import("../lib/phone");

/**
 * An app that echoes whatever body the middleware let through. Pass `null` for
 * an unauthenticated request — an explicit `undefined` would take the default
 * and quietly test the wrong thing.
 */
function makeApp(merchantId: number | null = 1) {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "test-secret", resave: false, saveUninitialized: false }));
  app.use((req, _res, next) => {
    if (merchantId !== null) req.session.merchantId = merchantId;
    next();
  });
  app.use(normalisePhoneFields);
  app.all(/.*/, (req, res) => { res.json(req.body ?? {}); });
  return app;
}

describe("normalisePhoneFields", () => {
  it("rewrites a phone field on the way to the handler", async () => {
    const res = await request(makeApp()).post("/customers").send({
      firstName: "Sarah", phone: "0412 345 678",
    });
    expect(res.body).toEqual({ firstName: "Sarah", phone: "+61412345678" });
  });

  it("uses the country configured for the merchant on the request", async () => {
    const res = await request(makeApp(2)).post("/customers").send({ phone: "021 555 1234" });
    expect(res.body.phone).toBe("+64215551234");
  });

  it("reaches phone fields nested in arrays and objects", async () => {
    // The customer CSV import posts rows in bulk; a supplier posts contacts.
    const res = await request(makeApp()).post("/customers/import").send({
      rows: [{ phone: "0412345678" }, { phone: "0293334444" }],
      supplier: { contact: { phone: "0400000000" } },
    });
    expect(res.body.rows.map((r: { phone: string }) => r.phone))
      .toEqual(["+61412345678", "+61293334444"]);
    expect(res.body.supplier.contact.phone).toBe("+61400000000");
  });

  it("covers the other names a number is stored under", async () => {
    const res = await request(makeApp()).put("/x").send({
      mobile: "0412345678", contactPhone: "0412345678", customerPhone: "0412345678",
      whatsapp: "0412345678", vcPhone: "0412345678", smsTo: "0412345678",
      fromNumber: "0412345678",
    });
    for (const [key, value] of Object.entries(res.body)) {
      expect(value, key).toBe("+61412345678");
    }
  });

  it("leaves every other field untouched", async () => {
    // `notes` is the dangerous one: free text that often contains a number.
    // `search` is the other: rewriting a query turns a lookup into a miss.
    const body = {
      notes: "Called on 0412 345 678, no answer",
      search: "0412",
      abn: "12345678901",
      postcode: "2000",
      whatsappSameAsPhone: "true",
      defaultPhoneCountry: "AU",
    };
    const res = await request(makeApp()).post("/x").send(body);
    expect(res.body).toEqual(body);
  });

  it("does nothing without a merchant session", async () => {
    // Public routes have no session and normalise in the handler, where they
    // know which shop the request is for.
    const res = await request(makeApp(null)).post("/book/acme").send({ phone: "0412345678" });
    expect(res.body.phone).toBe("0412345678");
  });

  it("does not touch reads", async () => {
    const res = await request(makeApp()).get("/customers?phone=0412345678");
    expect(res.body).toEqual({});
  });

  it("does not go to the database when there is no phone field", async () => {
    vi.mocked(merchantPhoneCountry).mockClear();
    await request(makeApp()).post("/products").send({ name: "Coffee", price: "4.50" });
    expect(merchantPhoneCountry).not.toHaveBeenCalled();
  });

  it("lets the save through when the country can't be resolved", async () => {
    // Losing the setting is not a reason to lose the merchant's data — the
    // number goes in as typed, exactly as it did before this middleware existed.
    vi.mocked(merchantPhoneCountry).mockRejectedValueOnce(new Error("db down"));
    const res = await request(makeApp()).post("/customers").send({ phone: "0412 345 678" });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe("0412 345 678");
  });
});
