import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

/**
 * Online shop wishlist (routes/shop.ts). Pinned: guests can neither read nor
 * change a wishlist, only a product listed on the shop can be saved, and a
 * saved item is always scoped to the signed-in customer.
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

describe("wishlist", () => {
  it("refuses a guest on every route", async () => {
    expect((await request(app).get("/api/shop/wishlist")).status).toBe(401);
    expect((await request(app).put("/api/shop/wishlist/5")).status).toBe(401);
    expect((await request(app).delete("/api/shop/wishlist/5")).status).toBe(401);
    expect(h.values).toEqual([]);
  });

  it("saves a listed product against the signed-in customer", async () => {
    h.rows = [[shopper], [{ id: 5 }]];
    const res = await request(app).put("/api/shop/wishlist/5").set("x-customer", "9");
    expect(res.status).toBe(200);
    expect(h.values).toEqual([{ merchantId: 1, customerId: 9, productId: 5 }]);
  });

  it("will not save a product that is not on the shop", async () => {
    h.rows = [[shopper], []];
    const res = await request(app).put("/api/shop/wishlist/5").set("x-customer", "9");
    expect(res.status).toBe(404);
    expect(h.values).toEqual([]);
  });

  it("lists saved ids, but only still-listed products as items", async () => {
    h.rows = [[shopper], [{ productId: 7 }, { productId: 5 }], [{ id: 5, name: "Case", price: "20", imageUrl: null, categoryId: null, brandName: null, trackInventory: "false", stockQuantity: 0, isRefurbished: "false", typeTracksStock: null, isService: false }]];
    const res = await request(app).get("/api/shop/wishlist").set("x-customer", "9");
    expect(res.body.ids).toEqual([7, 5]);
    expect(res.body.items.map((p: { id: number }) => p.id)).toEqual([5]);
  });
});
