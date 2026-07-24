import { describe, it, expect, vi, beforeAll } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

// Mock the DB so every query resolves to a single row. Because the duplicate-SKU
// lookup is the first awaited DB call in POST /products, this makes that lookup
// report an existing product with the same SKU — exercising the 409 path.
vi.mock("@workspace/db", () => {
  const row = { id: 1 };
  const chain: any = new Proxy({} as any, {
    get(_t, k) {
      if (k === "then") return (res: any) => Promise.resolve([row]).then(res);
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
    productSerialsTable: tableProxy,
    lowStockAlertSettingsTable: tableProxy,
    transactionsTable: tableProxy,
    invoicesTable: tableProxy,
    customersTable: tableProxy,
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

describe("POST /api/products — duplicate SKU", () => {
  it("returns 409 when a product with the same SKU already exists", async () => {
    const res = await request(app)
      .post("/api/products")
      .send({ name: "Widget", price: 9.99, sku: "ABC-123" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/SKU already exists/i);
    expect(res.body.error).toContain("ABC-123");
  });

  it("does not run the duplicate check when no SKU is provided", async () => {
    // Without a SKU the handler skips the duplicate lookup entirely, so it must
    // not short-circuit with a 409.
    const res = await request(app)
      .post("/api/products")
      .send({ name: "Widget", price: 9.99 });
    expect(res.status).not.toBe(409);
  });
});

describe("PATCH /api/products/:id — duplicate SKU", () => {
  it("returns 409 when another product already uses the SKU", async () => {
    const res = await request(app)
      .patch("/api/products/2")
      .send({ sku: "ABC-123" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/SKU already exists/i);
    expect(res.body.error).toContain("ABC-123");
  });

  it("does not run the duplicate check when the SKU is not being changed", async () => {
    const res = await request(app)
      .patch("/api/products/2")
      .send({ name: "Renamed" });
    expect(res.status).not.toBe(409);
  });
});
