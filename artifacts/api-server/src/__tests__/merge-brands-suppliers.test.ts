import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

/**
 * Merging brands and suppliers (routes/brands.ts, routes/suppliers.ts).
 * Pinned: a merge needs another record besides the kept one, refuses records
 * that aren't the merchant's, and a dry run reports counts without writing.
 */

const h = vi.hoisted(() => ({ rows: [] as unknown[], writes: 0 }));

vi.mock("@workspace/db", async (importOriginal) => {
  process.env.DATABASE_URL ||= "postgres://user:pass@localhost:5432/test";
  const actual = await importOriginal<Record<string, unknown>>();
  const chain = (): any =>
    new Proxy({} as any, {
      get(_t, k) {
        if (k === "then") return (res: any, rej: any) => Promise.resolve(h.rows.shift() ?? []).then(res, rej);
        if (k === "set") return () => { h.writes++; return chain(); };
        return () => chain();
      },
    });
  const db = new Proxy({} as any, {
    get: (_t, k) => (k === "transaction" ? async () => { h.writes++; return {}; } : k === "delete" ? () => { h.writes++; return chain(); } : () => chain()),
  });
  return { ...actual, db };
});
vi.mock("../middlewares/requireAuth", () => ({ requireAuth: (_q: any, _s: any, n: any) => n() }));

let app: express.Express;

beforeAll(async () => {
  const { default: brands } = await import("../routes/brands");
  const { default: suppliers } = await import("../routes/suppliers");
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).session = { merchantId: 1, staffRole: "owner" }; next(); });
  app.use("/api", brands, suppliers);
}, 60000);

beforeEach(() => { h.rows = []; h.writes = 0; });

describe("merge brands and suppliers", () => {
  it("needs a record other than the one being kept", async () => {
    for (const path of ["/api/brands/merge", "/api/suppliers/merge"]) {
      const res = await request(app).post(path).send({ targetId: 4, sourceIds: [4] });
      expect(res.status).toBe(400);
    }
    expect(h.writes).toBe(0);
  });

  it("refuses records that aren't found for this merchant", async () => {
    h.rows = [[{ id: 4 }]]; // only the target came back
    const res = await request(app).post("/api/brands/merge").send({ targetId: 4, sourceIds: [9] });
    expect(res.status).toBe(404);
    expect(h.writes).toBe(0);
  });

  it("reports a brand dry run without writing", async () => {
    h.rows = [[{ id: 4 }, { id: 9 }], [{ n: 12 }]];
    const res = await request(app).post("/api/brands/merge").send({ targetId: 4, sourceIds: [9], dryRun: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ products: 12, brandsRemoved: 1 });
    expect(h.writes).toBe(0);
  });

  it("reports a supplier dry run across products, POs and returns", async () => {
    h.rows = [[{ id: 4, name: "Acme" }, { id: 9, name: " ACME Pty " }], [{ n: 7 }], [{ n: 2 }], [{ n: 1 }]];
    const res = await request(app).post("/api/suppliers/merge").send({ targetId: 4, sourceIds: [9], dryRun: true });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ products: 7, purchaseOrders: 2, returnAuths: 1, suppliersRemoved: 1 });
    expect(h.writes).toBe(0);
  });
});
