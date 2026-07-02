import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

/**
 * Integration test for the "completed repairs are locked" rule and the reopen
 * flow. Uses a small stateful in-memory fake of the slice of drizzle the route
 * touches (select/insert/update + eq/and/desc), so we can drive real HTTP
 * requests and assert on persisted rows.
 */

const h = vi.hoisted(() => {
  const store: Record<string, any[]> = { service_jobs: [], customers: [], merchants: [] };
  let jobSeq = 100;

  const mkTable = (name: string) => new Proxy({ _name: name } as any, {
    get: (t, prop: string) => (prop in t ? t[prop] : { _table: name, _col: prop }),
  });
  const serviceJobsTable = mkTable("service_jobs");
  const customersTable = mkTable("customers");
  const merchantsTable = mkTable("merchants");

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
        if (this.lim != null) out = out.slice(0, this.lim);
        return out.map((r) => project(r, this.projection));
      }
      if (this.kind === "insert") {
        const row = { ...this.vals };
        if (this.table._name === "service_jobs") {
          row.id = jobSeq++;
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
  };

  return {
    store, db, serviceJobsTable, customersTable, merchantsTable,
    reset() { store.service_jobs = []; store.customers = []; store.merchants = []; jobSeq = 100; },
  };
});

vi.mock("@workspace/db", () => ({
  db: h.db,
  serviceJobsTable: h.serviceJobsTable,
  customersTable: h.customersTable,
  merchantsTable: h.merchantsTable,
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ type: "eq", col, val }),
  and: (...preds: any[]) => ({ type: "and", preds }),
  desc: (col: any) => ({ type: "desc", col }),
}));

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../lib/customer-name", () => ({ customerDisplayName: () => "Test Customer" }));
vi.mock("../services/email", () => ({ sendEmail: vi.fn() }));
vi.mock("../services/sms", () => ({ sendSms: vi.fn(() => Promise.resolve({ success: true })) }));
vi.mock("../services/entityQr", () => ({
  registerServiceQr: vi.fn(() => Promise.resolve()),
  registerQrBestEffort: vi.fn(),
}));
vi.mock("../lib/publicUrl", () => ({ publicDomain: () => "example.com" }));
vi.mock("../routes/service-settings", () => ({
  getServiceWarrantyDefaults: () => Promise.resolve({ repairWarrantyDays: 30, reworkWarrantyDays: 14 }),
}));
vi.mock("@workspace/api-zod", () => {
  const ok = (params: any) => ({ success: true, data: { id: Number(params.id) } });
  return { UpdateServiceJobParams: { safeParse: ok }, DeleteServiceJobParams: { safeParse: ok }, SendServiceJobEmailParams: { safeParse: ok } };
});

let app: express.Express;

beforeEach(async () => {
  h.reset();
  const { default: router } = await import("../routes/service-jobs");
  app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use((req: any, _res, next) => { req.session.merchantId = 1; next(); });
  app.use("/api", router);
});

const seedJob = (over: Record<string, unknown> = {}) => {
  const row = {
    id: 42, merchantId: 1, customerId: null, staffId: null, jobNumber: "SJ0042",
    title: "Screen repair", status: "completed", bookInDate: "2026-01-01",
    completedAt: new Date(), reworkOfJobId: null, reopenedFromJobId: null,
    depositPaid: "0", repairWarrantyDays: 0, notes: null,
    createdAt: new Date(), updatedAt: new Date(),
    isPartnerRepair: "false", isCritical: "false", isUnderWarranty: "false", isMailIn: "false",
    ...over,
  };
  h.store.service_jobs.push(row);
  return row;
};
const jobRow = (id: number) => h.store.service_jobs.find((j) => j.id === id)!;

describe("PATCH /api/service-jobs/:id — completed lock", () => {
  it("rejects moving a completed job to another status with 409 and leaves it unchanged", async () => {
    seedJob({ status: "completed" });
    const res = await request(app).patch("/api/service-jobs/42").send({ status: "in-progress" });
    expect(res.status).toBe(409);
    expect(jobRow(42).status).toBe("completed");
  });

  it("allows editing other fields on a completed job (no status change)", async () => {
    seedJob({ status: "completed" });
    const res = await request(app).patch("/api/service-jobs/42").send({ notes: "Picked up by customer" });
    expect(res.status).toBe(200);
    expect(jobRow(42).notes).toBe("Picked up by customer");
    expect(jobRow(42).status).toBe("completed");
  });

  it("still allows a non-completed job to be completed", async () => {
    seedJob({ status: "in-progress", completedAt: null });
    const res = await request(app).patch("/api/service-jobs/42").send({ status: "completed" });
    expect(res.status).toBe(200);
    expect(jobRow(42).status).toBe("completed");
    expect(jobRow(42).completedAt).toBeInstanceOf(Date);
  });
});

describe("POST /api/service-jobs/:id/reopen", () => {
  it("creates a new pending repair linked to the original, leaving the original completed", async () => {
    seedJob({ status: "completed", deviceType: "Phone", deviceDescription: "iPhone 13" });
    const res = await request(app).post("/api/service-jobs/42/reopen").send({});
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
    expect(res.body.reopenedFromJobId).toBe(42);
    expect(res.body.deviceType).toBe("Phone");
    expect(res.body.repairWarrantyDays).toBe(30);
    // Original untouched.
    expect(jobRow(42).status).toBe("completed");
    // A new row now exists.
    expect(h.store.service_jobs).toHaveLength(2);
  });

  it("refuses to reopen a job that is not completed", async () => {
    seedJob({ status: "in-progress" });
    const res = await request(app).post("/api/service-jobs/42/reopen").send({});
    expect(res.status).toBe(409);
    expect(h.store.service_jobs).toHaveLength(1);
  });

  it("404s for an unknown job", async () => {
    const res = await request(app).post("/api/service-jobs/999/reopen").send({});
    expect(res.status).toBe(404);
  });
});
