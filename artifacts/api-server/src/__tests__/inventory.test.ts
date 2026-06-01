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
    productsTable: tableProxy,
    productTypesTable: tableProxy,
  };
});

vi.mock("../services/lowStockAlertService", () => ({
  maybeQueueImmediateAlert: vi.fn(),
}));

let app: express.Express;

beforeAll(async () => {
  const { default: inventoryRouter } = await import("../routes/inventory");

  app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use((_req, _res, next) => { (_req as any).session.merchantId = 1; next(); });
  app.use("/api", inventoryRouter);
});

describe("GET /api/inventory — query param validation", () => {
  it("returns 400 when limit is not a number", async () => {
    const res = await request(app).get("/api/inventory?limit=notanumber");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when offset is not a number", async () => {
    const res = await request(app).get("/api/inventory?offset=abc");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("PATCH /api/inventory/:productId — route param validation", () => {
  it("returns 400 for a non-integer productId", async () => {
    const res = await request(app)
      .patch("/api/inventory/abc")
      .send({ stockQuantity: 10 });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("PATCH /api/inventory/:productId — body validation", () => {
  it("returns 400 when stockQuantity is missing", async () => {
    const res = await request(app)
      .patch("/api/inventory/1")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when stockQuantity is a string", async () => {
    const res = await request(app)
      .patch("/api/inventory/1")
      .send({ stockQuantity: "many" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});
