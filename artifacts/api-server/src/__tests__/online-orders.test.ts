import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

/**
 * Online store admin: product visibility (routes/online-store.ts) and order
 * tracking on Online › Orders (routes/delivery-orders.ts). Pinned: a bad body
 * writes nothing, and shipped/delivered dates are stamped once — moving the
 * status back and forth keeps the first date.
 */

const h = vi.hoisted(() => ({ rows: [] as unknown[][], sets: [] as Record<string, unknown>[] }));

vi.mock("@workspace/db", async (importOriginal) => {
  process.env.DATABASE_URL ||= "postgres://user:pass@localhost:5432/test";
  const actual = await importOriginal<Record<string, unknown>>();
  const chain = (): any =>
    new Proxy({} as any, {
      get(_t, k) {
        if (k === "then") return (res: any, rej: any) => Promise.resolve(h.rows.shift() ?? []).then(res, rej);
        if (k === "set") return (v: Record<string, unknown>) => { h.sets.push(v); return chain(); };
        return () => chain();
      },
    });
  return { ...actual, db: new Proxy({} as any, { get: () => () => chain() }) };
});
vi.mock("../middlewares/requireAuth", () => ({ requireAuth: (_q: any, _s: any, n: any) => n() }));
vi.mock("../middlewares/requireManagerOrOwner", () => ({ requireManagerOrOwner: (_q: any, _s: any, n: any) => n() }));
vi.mock("../services/deliveryOrderSale", () => ({ recordPaidOrderAsSale: vi.fn(async () => {}) }));

let app: express.Express;

const order = (over: Record<string, unknown> = {}) => ({
  id: 7, merchantId: 1, number: "1001", status: "processing", total: "50.00", subtotal: "45.45",
  taxTotal: "4.55", discountTotal: "0", shippingTotal: "0", createdAt: new Date(), ...over,
});

beforeAll(async () => {
  const { default: store } = await import("../routes/online-store");
  const { default: orders } = await import("../routes/delivery-orders");
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).session = { merchantId: 1 }; next(); });
  app.use("/api", store, orders);
}, 60000);

beforeEach(() => { h.rows = []; h.sets = []; });

describe("online store product visibility", () => {
  it("rejects a body without ids or a boolean, writing nothing", async () => {
    for (const body of [{ ids: [], showOnline: true }, { ids: [1], showOnline: "yes" }, {}]) {
      const res = await request(app).patch("/api/online-store/products").send(body);
      expect(res.status).toBe(400);
    }
    expect(h.sets).toEqual([]);
  });

  it("stores the flag as the text boolean the shop reads", async () => {
    h.rows = [[{ id: 1 }, { id: 2 }]];
    const res = await request(app).patch("/api/online-store/products").send({ ids: [1, 2], showOnline: false });
    expect(res.body).toEqual({ updated: 2 });
    expect(h.sets).toEqual([{ showOnline: "false" }]);
  });
});

describe("order tracking", () => {
  it("stamps shippedAt the first time an order is shipped", async () => {
    h.rows = [[{ shippedAt: null, deliveredAt: null }], [order({ status: "shipped" })]];
    const res = await request(app).patch("/api/delivery-orders/7").send({ status: "shipped", trackingCarrier: "auspost", trackingNumber: "ABC123" });
    expect(res.status).toBe(200);
    expect(h.sets[0]).toMatchObject({ status: "shipped", trackingNumber: "ABC123" });
    expect(h.sets[0]!.shippedAt).toBeInstanceOf(Date);
    expect(h.sets[0]).not.toHaveProperty("deliveredAt");
    expect(res.body.total).toBe(50);
  });

  it("keeps an existing shipped date, and fills a missing one on delivery", async () => {
    const first = new Date("2026-09-01T00:00:00Z");
    h.rows = [[{ shippedAt: first, deliveredAt: null }], [order({ status: "delivered" })]];
    await request(app).patch("/api/delivery-orders/7").send({ status: "delivered" });
    expect(h.sets[0]).not.toHaveProperty("shippedAt");
    expect(h.sets[0]!.deliveredAt).toBeInstanceOf(Date);
  });

  it("leaves the dates alone for any other status", async () => {
    h.rows = [[order({ status: "processing" })]];
    await request(app).patch("/api/delivery-orders/7").send({ status: "processing" });
    expect(h.sets).toEqual([{ status: "processing" }]);
  });
});
