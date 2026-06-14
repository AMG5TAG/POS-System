import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

/**
 * Integration test for parts → inventory movement on service-job lines.
 *
 * Unlike the validation-only suites in this folder (which resolve every query to
 * []), this uses a small STATEFUL in-memory fake of the slice of drizzle the
 * route touches: select/insert/update/delete/transaction plus eq/and/asc. That
 * lets us drive real HTTP requests and assert that stock actually moved.
 */

const h = vi.hoisted(() => {
  // Each store key matches a table's `_name`.
  const store: Record<string, any[]> = { products: [], service_jobs: [], service_job_lines: [] };
  let lineSeq = 1;

  const mkTable = (name: string, cols: string[]) => {
    const t: any = { _name: name };
    for (const c of cols) t[c] = { _table: name, _col: c };
    return t;
  };
  const productsTable = mkTable("products",
    ["id", "merchantId", "stockQuantity", "trackInventory", "name", "sku", "lowStockThreshold", "price", "costPrice"]);
  const serviceJobLinesTable = mkTable("service_job_lines",
    ["id", "serviceJobId", "merchantId", "kind", "productId", "description", "quantity", "unitPrice", "unitCost", "taxRate", "createdAt", "updatedAt"]);
  const serviceJobsTable = mkTable("service_jobs", ["id", "merchantId"]);

  const matches = (row: any, pred: any): boolean => {
    if (!pred) return true;
    if (pred.type === "and") return pred.preds.every((p: any) => matches(row, p));
    if (pred.type === "eq") return row[pred.col._col] === pred.val;
    return true;
  };
  const project = (row: any, projection: any) => {
    if (!projection) return { ...row };
    const out: any = {};
    for (const k of Object.keys(projection)) out[k] = row[projection[k]._col];
    return out;
  };

  // A single chainable, thenable query builder backed by `store`.
  class Q {
    kind: string; table: any = null; projection: any = null; pred: any = null;
    order: any = null; lim: number | null = null; setObj: any = null; vals: any = null;
    constructor(kind: string, table?: any, projection?: any) {
      this.kind = kind; this.table = table ?? null; this.projection = projection ?? null;
    }
    from(t: any) { this.table = t; return this; }
    where(p: any) { this.pred = p; return this; }
    limit(n: number) { this.lim = n; return this; }
    orderBy(o: any) { this.order = o; return this; }
    set(o: any) { this.setObj = o; return this; }
    values(o: any) { this.vals = o; return this; }
    returning() { return this; }
    private exec(): any {
      const rows = store[this.table._name];
      if (this.kind === "select") {
        let out = rows.filter((r) => matches(r, this.pred));
        if (this.order?.type === "asc") out = [...out].sort((a, b) => a[this.order.col._col] - b[this.order.col._col]);
        if (this.lim != null) out = out.slice(0, this.lim);
        return out.map((r) => project(r, this.projection));
      }
      if (this.kind === "insert") {
        const row = { ...this.vals };
        if (this.table._name === "service_job_lines") {
          row.id = lineSeq++;
          row.createdAt = new Date();
          row.updatedAt = new Date();
        }
        rows.push(row);
        return [{ ...row }];
      }
      if (this.kind === "update") {
        const hit = rows.filter((r) => matches(r, this.pred));
        for (const r of hit) Object.assign(r, this.setObj);
        return hit.map((r) => ({ ...r }));
      }
      if (this.kind === "delete") {
        const keep = rows.filter((r) => !matches(r, this.pred));
        store[this.table._name] = keep;
        return [];
      }
      return [];
    }
    then(resolve: (v: any) => unknown, reject?: (e: unknown) => unknown) {
      try { return Promise.resolve(this.exec()).then(resolve); }
      catch (e) { return reject ? reject(e) : Promise.reject(e); }
    }
  }

  const db: any = {
    select: (projection?: any) => new Q("select", undefined, projection),
    insert: (t: any) => new Q("insert", t),
    update: (t: any) => new Q("update", t),
    delete: (t: any) => new Q("delete", t),
    transaction: (fn: any) => Promise.resolve().then(() => fn(db)),
  };

  return {
    store, db, productsTable, serviceJobLinesTable, serviceJobsTable,
    reset() {
      store.products = [];
      store.service_jobs = [];
      store.service_job_lines = [];
      lineSeq = 1;
    },
  };
});

vi.mock("@workspace/db", () => ({
  db: h.db,
  productsTable: h.productsTable,
  serviceJobLinesTable: h.serviceJobLinesTable,
  serviceJobsTable: h.serviceJobsTable,
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ type: "eq", col, val }),
  and: (...preds: any[]) => ({ type: "and", preds }),
  asc: (col: any) => ({ type: "asc", col }),
}));

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  invalidateMerchantStatusCache: () => {},
}));

const alertSpy = vi.fn();
vi.mock("../services/lowStockAlertService", () => ({
  maybeQueueImmediateAlert: (...args: any[]) => { alertSpy(...args); return Promise.resolve(); },
}));

let app: express.Express;

beforeEach(async () => {
  h.reset();
  alertSpy.mockClear();
  // A merchant-1 job and a tracked part with 5 on hand, threshold 5.
  h.store.service_jobs.push({ id: 42, merchantId: 1 });
  h.store.products.push({
    id: 10, merchantId: 1, name: "iPhone 13 Screen", sku: "SCR-13",
    stockQuantity: 5, trackInventory: "true", lowStockThreshold: 5,
    price: "100", costPrice: "40",
  });

  const { default: router } = await import("../routes/service-job-lines");
  app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use((req: any, _res, next) => { req.session.merchantId = 1; next(); });
  app.use("/api", router);
});

const stockOf = (id: number) => h.store.products.find((p) => p.id === id)!.stockQuantity;
const addPart = (body: any) => request(app).post("/api/service-jobs/42/lines").send(body);

describe("POST /api/service-jobs/:jobId/lines — stock movement", () => {
  it("decrements product stock when a part is added", async () => {
    const res = await addPart({ kind: "part", productId: 10, quantity: 2 });
    expect(res.status).toBe(200);
    expect(res.body.totals.partsTotal).toBe(200); // 2 × $100, defaulted from product
    expect(stockOf(10)).toBe(3); // 5 → 3
  });

  it("clamps stock at zero and never goes negative", async () => {
    const res = await addPart({ kind: "part", productId: 10, quantity: 10 });
    expect(res.status).toBe(200);
    expect(stockOf(10)).toBe(0);
  });

  it("fires a low-stock alert when consumption drops to/below threshold", async () => {
    await addPart({ kind: "part", productId: 10, quantity: 1 }); // 5 → 4 (≤ threshold 5)
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [merchantId, productArg, prev] = alertSpy.mock.calls[0];
    expect(merchantId).toBe(1);
    expect(productArg.stockQuantity).toBe(4);
    expect(prev).toBe(5);
  });

  it("does not move stock for labour lines", async () => {
    const res = await addPart({ kind: "labour", description: "Diagnostic", quantity: 1, unitPrice: 50 });
    expect(res.status).toBe(200);
    expect(stockOf(10)).toBe(5);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("does not move stock for an untracked product", async () => {
    h.store.products.push({
      id: 11, merchantId: 1, name: "Service fee", sku: null,
      stockQuantity: 0, trackInventory: "false", lowStockThreshold: null,
      price: "20", costPrice: "0",
    });
    await addPart({ kind: "part", productId: 11, quantity: 3 });
    expect(stockOf(11)).toBe(0);
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

describe("PUT /api/service-jobs/:jobId/lines/:lineId — stock reconciliation", () => {
  it("consumes the delta when quantity increases", async () => {
    const added = await addPart({ kind: "part", productId: 10, quantity: 2 }); // 5 → 3
    const lineId = added.body.lines[0].id;
    const res = await request(app).put(`/api/service-jobs/42/lines/${lineId}`).send({ quantity: 3 });
    expect(res.status).toBe(200);
    expect(stockOf(10)).toBe(2); // one more unit consumed: 3 → 2
  });

  it("returns the delta when quantity decreases", async () => {
    const added = await addPart({ kind: "part", productId: 10, quantity: 3 }); // 5 → 2
    const lineId = added.body.lines[0].id;
    await request(app).put(`/api/service-jobs/42/lines/${lineId}`).send({ quantity: 1 });
    expect(stockOf(10)).toBe(4); // two units returned: 2 → 4
  });

  it("returns all consumed units when a part line is switched to labour", async () => {
    const added = await addPart({ kind: "part", productId: 10, quantity: 2 }); // 5 → 3
    const lineId = added.body.lines[0].id;
    await request(app).put(`/api/service-jobs/42/lines/${lineId}`).send({ kind: "labour" });
    expect(stockOf(10)).toBe(5); // back to full
  });
});

describe("DELETE /api/service-jobs/:jobId/lines/:lineId — stock restoration", () => {
  it("restores consumed units when a part line is removed", async () => {
    const added = await addPart({ kind: "part", productId: 10, quantity: 2 }); // 5 → 3
    const lineId = added.body.lines[0].id;
    const res = await request(app).delete(`/api/service-jobs/42/lines/${lineId}`);
    expect(res.status).toBe(200);
    expect(stockOf(10)).toBe(5); // 3 → 5
  });
});
