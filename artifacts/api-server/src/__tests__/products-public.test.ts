import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import express from "express";

// Mocked db: every query resolves to [] so merchant/product lookups come back
// empty — enough to exercise route wiring, input validation and the not-found
// paths of the public product endpoint without a real database.
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
    merchantsTable: tableProxy,
    productsTable: tableProxy,
    categoriesTable: tableProxy,
    brandsTable: tableProxy,
  };
});

let app: express.Express;

beforeAll(async () => {
  const { default: productsPublicRouter } = await import("../routes/products-public");
  app = express();
  app.use(express.json());
  app.use("/api", productsPublicRouter);
});

describe("GET /api/public/b/:username/products/:id — public product page", () => {
  it("404s when the product id is not a number", async () => {
    const res = await request(app).get("/api/public/b/demo/products/abc");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });

  it("404s when the merchant/product can't be found", async () => {
    const res = await request(app).get("/api/public/b/demo/products/5");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error", "Product not found");
  });

  it("does not require authentication (no 401)", async () => {
    const res = await request(app).get("/api/public/b/demo/products/5");
    expect(res.status).not.toBe(401);
  });
});
