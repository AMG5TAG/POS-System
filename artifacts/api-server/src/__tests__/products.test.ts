import { describe, it, expect, vi, beforeAll } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import multer from "multer";

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
    categoriesTable: tableProxy,
    digitalCodesTable: tableProxy,
    productVariantsTable: tableProxy,
    productPriceHistoryTable: tableProxy,
    productTypesTable: tableProxy,
  };
});

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  invalidateMerchantStatusCache: () => {},
}));

vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class {
    uploadFile = vi.fn();
  },
}));

vi.mock("../lib/parseCsv", () => ({
  parseCsvBuffer: vi.fn().mockResolvedValue([]),
  normaliseHeaders: vi.fn().mockReturnValue({}),
}));

let app: express.Express;

beforeAll(async () => {
  const { default: productsRouter } = await import("../routes/products");

  app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use((_req, _res, next) => { (_req as any).session.merchantId = 1; next(); });
  app.use("/api", productsRouter);
});

describe("GET /api/products — query param validation", () => {
  it("returns 400 when limit is not a number", async () => {
    const res = await request(app).get("/api/products?limit=notanumber");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when offset is not a number", async () => {
    const res = await request(app).get("/api/products?offset=abc");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when categoryId is not a number", async () => {
    const res = await request(app).get("/api/products?categoryId=notanumber");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("GET /api/products/:id — route param validation", () => {
  it("returns 400 for a non-integer id", async () => {
    const res = await request(app).get("/api/products/abc");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("PATCH /api/products/:id — route param validation", () => {
  it("returns 400 for a non-integer id", async () => {
    const res = await request(app).patch("/api/products/not-a-number").send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("DELETE /api/products/:id — route param validation", () => {
  it("returns 400 for a non-integer id", async () => {
    const res = await request(app).delete("/api/products/abc");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("POST /api/products — body validation", () => {
  it("returns 400 when name is missing", async () => {
    const res = await request(app)
      .post("/api/products")
      .send({ price: 9.99 });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when price is missing", async () => {
    const res = await request(app)
      .post("/api/products")
      .send({ name: "Widget" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when price is a string instead of a number", async () => {
    const res = await request(app)
      .post("/api/products")
      .send({ name: "Widget", price: "free" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("POST /api/categories — body validation", () => {
  it("returns 400 when name is missing", async () => {
    const res = await request(app)
      .post("/api/categories")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("PATCH /api/categories/:id — route param validation", () => {
  it("returns 400 for a non-integer id", async () => {
    const res = await request(app)
      .patch("/api/categories/abc")
      .send({ name: "Food" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});
