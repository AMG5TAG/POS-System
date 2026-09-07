import { describe, it, expect, vi, beforeAll } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

vi.mock("@workspace/db", () => {
  const chain: any = new Proxy({} as any, {
    get(_t, k) {
      if (k === "then") return (res: any) => Promise.resolve([]).then(res);
      if (k === "catch") return () => chain;
      if (k === "finally") return () => chain;
      return () => chain;
    },
  });
  const tableProxy = new Proxy({} as any, { get: () => tableProxy });
  return {
    db: new Proxy({} as any, { get: () => () => chain }),
    productPreOrdersTable: tableProxy,
    productPreOrderItemsTable: tableProxy,
  };
});

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  invalidateMerchantStatusCache: () => {},
}));

let app: express.Express;

beforeAll(async () => {
  const { default: preOrdersRouter } = await import("../routes/product-pre-orders");
  app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use((_req, _res, next) => { (_req as any).session.merchantId = 1; next(); });
  app.use("/api", preOrdersRouter);
});

describe("POST /api/pre-orders — validation", () => {
  it("returns 400 when customerName is missing", async () => {
    const res = await request(app)
      .post("/api/pre-orders")
      .send({ items: [{ productName: "Widget", quantity: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/customerName/i);
  });

  it("returns 400 when no products are supplied (empty items)", async () => {
    const res = await request(app)
      .post("/api/pre-orders")
      .send({ customerName: "Sarah", items: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least one product/i);
  });

  it("returns 400 when neither items nor a flat product is supplied", async () => {
    const res = await request(app)
      .post("/api/pre-orders")
      .send({ customerName: "Sarah" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least one product/i);
  });
});

describe("PATCH /api/pre-orders/:id — validation", () => {
  it("returns 400 for a non-integer id", async () => {
    const res = await request(app).patch("/api/pre-orders/not-a-number").send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when items is explicitly emptied", async () => {
    const res = await request(app).patch("/api/pre-orders/1").send({ items: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least one product/i);
  });
});

describe("DELETE /api/pre-orders/:id — validation", () => {
  it("returns 400 for a non-integer id", async () => {
    const res = await request(app).delete("/api/pre-orders/abc");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});
