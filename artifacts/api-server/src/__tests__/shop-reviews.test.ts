import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

/**
 * Online shop product reviews (routes/shop.ts, lib/shop-reviews.ts).
 *
 * Pinned: only a signed-in customer who has bought the product can write a
 * review; a second review from the same customer edits the first instead of
 * adding another; and the public name is first name + last initial, never the
 * full name or email.
 */

const h = vi.hoisted(() => ({
  rows: [] as unknown[][], values: [] as Record<string, unknown>[], sets: [] as Record<string, unknown>[],
  purchased: false,
}));

vi.mock("@workspace/db", async (importOriginal) => {
  process.env.DATABASE_URL ||= "postgres://user:pass@localhost:5432/test";
  const actual = await importOriginal<Record<string, unknown>>();
  const chain = (): any =>
    new Proxy({} as any, {
      get(_t, k) {
        if (k === "then") return (res: any, rej: any) => Promise.resolve(h.rows.shift() ?? []).then(res, rej);
        if (k === "values") return (v: Record<string, unknown>) => { h.values.push(v); return chain(); };
        if (k === "set") return (v: Record<string, unknown>) => { h.sets.push(v); return chain(); };
        return () => chain();
      },
    });
  return { ...actual, db: new Proxy({} as any, { get: () => () => chain() }) };
});
vi.mock("../lib/sole-merchant", () => ({ soleMerchantId: async () => 1 }));
vi.mock("../lib/shop-reviews", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  hasPurchased: vi.fn(async () => h.purchased),
}));
vi.mock("../services/autoSyncScheduler", () => ({ triggerInstantSync: vi.fn() }));

let app: express.Express;
const shopper = { id: 9, merchantId: 1, firstName: "Sam", lastName: "lee", email: "sam@example.com" };

beforeAll(async () => {
  const { default: shopRouter } = await import("../routes/shop");
  app = express();
  app.use(express.json());
  // x-customer stands in for a signed-in shop session.
  app.use((req, _res, next) => {
    const id = req.header("x-customer");
    (req as any).session = id ? { portalCustomerId: Number(id) } : {};
    next();
  });
  app.use("/api", shopRouter);
}, 60000);

beforeEach(() => { h.rows = []; h.values = []; h.sets = []; h.purchased = false; });

const post = (body: object, signedIn = true) => {
  const r = request(app).post("/api/shop/products/5/reviews");
  return (signedIn ? r.set("x-customer", "9") : r).send(body);
};

describe("writing a review", () => {
  it("needs a signed-in customer", async () => {
    const res = await post({ rating: 5, body: "Great" }, false);
    expect(res.status).toBe(401);
    expect(h.values).toEqual([]);
  });

  it("refuses a customer who has not bought the product", async () => {
    h.rows = [[shopper], [{ id: 5 }]];
    const res = await post({ rating: 5, body: "Great" });
    expect(res.status).toBe(403);
    expect(h.values).toEqual([]);
    expect(h.sets).toEqual([]);
  });

  it("rejects a rating outside 1–5 or an empty review", async () => {
    for (const body of [{ rating: 0, body: "x" }, { rating: 6, body: "x" }, { rating: 4, body: "  " }]) {
      h.rows = [[shopper], [{ id: 5 }]];
      h.purchased = true;
      const res = await post(body);
      expect(res.status).toBe(400);
    }
    expect(h.values).toEqual([]);
  });

  it("saves a buyer's review as verified, under first name and last initial", async () => {
    h.rows = [[shopper], [{ id: 5 }], []];
    h.purchased = true;
    const res = await post({ rating: 4, title: "Solid", body: "Works well" });
    expect(res.status).toBe(201);
    expect(h.values).toEqual([expect.objectContaining({
      productId: 5, customerId: 9, rating: 4, title: "Solid", body: "Works well",
      authorName: "Sam L.", verified: "true", status: "approved",
    })]);
  });

  it("edits the customer's existing review instead of adding a second", async () => {
    h.rows = [[shopper], [{ id: 5 }], [{ id: 77 }]];
    h.purchased = true;
    const res = await post({ rating: 2, body: "Changed my mind" });
    expect(res.status).toBe(200);
    expect(h.values).toEqual([]);
    expect(h.sets).toEqual([expect.objectContaining({ rating: 2, body: "Changed my mind" })]);
    expect(h.sets[0]).not.toHaveProperty("status");
  });

  it("404s a product that is not listed on the shop", async () => {
    h.rows = [[shopper], []];
    h.purchased = true;
    const res = await post({ rating: 5, body: "Great" });
    expect(res.status).toBe(404);
  });
});

describe("reviewerName", () => {
  it("never shows more than first name and last initial", async () => {
    const { reviewerName } = await import("../lib/shop-reviews");
    expect(reviewerName("Sam", "Lee")).toBe("Sam L.");
    expect(reviewerName("Sam", "")).toBe("Sam");
    expect(reviewerName("", "lee")).toBe("L.");
    expect(reviewerName(null, null)).toBe("Customer");
  });
});
