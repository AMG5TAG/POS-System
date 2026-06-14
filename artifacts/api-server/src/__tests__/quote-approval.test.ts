import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

/**
 * Integration test for feature #2 — estimate → approval → deposit, tied to the
 * job. Uses the same stateful in-memory drizzle fake as service-job-lines.test:
 * select/insert/update/delete + eq/and/asc/desc/sql, so we can assert real state
 * transitions on the service_jobs table.
 */

const h = vi.hoisted(() => {
  const store: Record<string, any[]> = { service_jobs: [], quotes: [], sales_settings: [] };

  const mkTable = (name: string, cols: string[]) => {
    const t: any = { _name: name };
    for (const c of cols) t[c] = { _table: name, _col: c };
    return t;
  };
  const serviceJobsTable = mkTable("service_jobs",
    ["id", "merchantId", "status", "notes", "estimateApprovedAt", "estimateApprovedVia", "depositRequired", "depositPaid"]);
  const quotesTable = mkTable("quotes", ["id", "merchantId", "serviceJobId", "status", "depositRequired", "events"]);
  const salesSettingsTable = mkTable("sales_settings", ["id", "merchantId", "quoteDepositPercent"]);

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
    returning(_proj?: any) { return this; }
    private exec(): any {
      const rows = this.table ? store[this.table._name] : [];
      if (this.kind === "select") {
        let out = rows.filter((r) => matches(r, this.pred));
        if (this.lim != null) out = out.slice(0, this.lim);
        return out.map((r) => project(r, this.projection));
      }
      if (this.kind === "insert") { const row = { ...this.vals }; rows.push(row); return [{ ...row }]; }
      if (this.kind === "update") {
        const hit = rows.filter((r) => matches(r, this.pred));
        for (const r of hit) Object.assign(r, this.setObj);
        return hit.map((r) => ({ ...r }));
      }
      if (this.kind === "delete") { store[this.table._name] = rows.filter((r) => !matches(r, this.pred)); return []; }
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
    store, db, serviceJobsTable, quotesTable, salesSettingsTable,
    reset() { store.service_jobs = []; store.quotes = []; store.sales_settings = []; },
  };
});

vi.mock("@workspace/db", () => ({
  db: h.db,
  serviceJobsTable: h.serviceJobsTable,
  quotesTable: h.quotesTable,
  salesSettingsTable: h.salesSettingsTable,
  customersTable: { _name: "customers" },
  merchantsTable: { _name: "merchants" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ type: "eq", col, val }),
  and: (...preds: any[]) => ({ type: "and", preds }),
  asc: (col: any) => ({ type: "asc", col }),
  desc: (col: any) => ({ type: "desc", col }),
  sql: () => ({}),
}));

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  invalidateMerchantStatusCache: () => {},
}));
vi.mock("../services/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock("../services/sms", () => ({ sendSms: vi.fn().mockResolvedValue({ success: true }) }));

const job = (id: number) => h.store.service_jobs.find((j) => j.id === id)!;
const seedJob = (over: any = {}) =>
  h.store.service_jobs.push({ id: 42, merchantId: 1, status: "awaiting-customer", notes: null, estimateApprovedAt: null, estimateApprovedVia: null, depositRequired: null, depositPaid: "0", ...over });

beforeEach(() => h.reset());

describe("applyEstimateApprovalToJob — approval drives the job", () => {
  it("stamps approval, copies the deposit, and releases an awaiting job to in-progress", async () => {
    seedJob({ status: "awaiting-customer" });
    const { applyEstimateApprovalToJob } = await import("../services/quoteApproval");

    const changed = await applyEstimateApprovalToJob(1, { serviceJobId: 42, depositRequired: "150" }, "portal");
    expect(changed).toBe(true);
    const j = job(42);
    expect(j.estimateApprovedAt).toBeTruthy();
    expect(j.estimateApprovedVia).toBe("portal");
    expect(j.depositRequired).toBe("150");
    expect(j.status).toBe("in-progress");
    expect(j.notes).toContain("Estimate approved (customer portal)");
  });

  it("also releases a pending job, and records the in-store channel", async () => {
    seedJob({ status: "pending" });
    const { applyEstimateApprovalToJob } = await import("../services/quoteApproval");
    await applyEstimateApprovalToJob(1, { serviceJobId: 42, depositRequired: null }, "in-store");
    expect(job(42).status).toBe("in-progress");
    expect(job(42).estimateApprovedVia).toBe("in-store");
    expect(job(42).notes).toContain("(in-store)");
  });

  it("does not drag a job already in progress backwards", async () => {
    seedJob({ status: "awaiting-parts" });
    const { applyEstimateApprovalToJob } = await import("../services/quoteApproval");
    await applyEstimateApprovalToJob(1, { serviceJobId: 42, depositRequired: "50" }, "portal");
    expect(job(42).status).toBe("awaiting-parts"); // status untouched
    expect(job(42).estimateApprovedAt).toBeTruthy(); // but approval still stamped
    expect(job(42).depositRequired).toBe("50");
  });

  it("is a no-op when the quote isn't linked to a job", async () => {
    const { applyEstimateApprovalToJob } = await import("../services/quoteApproval");
    const changed = await applyEstimateApprovalToJob(1, { serviceJobId: null, depositRequired: "100" }, "portal");
    expect(changed).toBe(false);
  });

  it("won't touch another merchant's job", async () => {
    seedJob({ merchantId: 2, status: "awaiting-customer" });
    const { applyEstimateApprovalToJob } = await import("../services/quoteApproval");
    const changed = await applyEstimateApprovalToJob(1, { serviceJobId: 42, depositRequired: "10" }, "portal");
    expect(changed).toBe(false);
    expect(job(42).status).toBe("awaiting-customer");
  });
});

describe("markJobAwaitingApproval — sending an estimate blocks the job on the customer", () => {
  it("promotes a pending job to awaiting-customer", async () => {
    seedJob({ status: "pending" });
    const { markJobAwaitingApproval } = await import("../services/quoteApproval");
    await markJobAwaitingApproval(1, 42);
    expect(job(42).status).toBe("awaiting-customer");
  });

  it("does not pull an in-progress job back to awaiting-customer", async () => {
    seedJob({ status: "in-progress" });
    const { markJobAwaitingApproval } = await import("../services/quoteApproval");
    await markJobAwaitingApproval(1, 42);
    expect(job(42).status).toBe("in-progress");
  });
});

describe("POST /api/service-jobs/:id/deposit — record deposit (soft tracking)", () => {
  let app: express.Express;
  beforeEach(async () => {
    seedJob({ depositRequired: "200", depositPaid: "0" });
    const { default: router } = await import("../routes/service-jobs");
    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use((req: any, _res, next) => { req.session.merchantId = 1; next(); });
    app.use("/api", router);
  });

  it("accumulates deposits and returns required vs paid", async () => {
    const r1 = await request(app).post("/api/service-jobs/42/deposit").send({ amount: 120, method: "card" });
    expect(r1.status).toBe(200);
    expect(r1.body).toEqual({ depositRequired: 200, depositPaid: 120 });

    const r2 = await request(app).post("/api/service-jobs/42/deposit").send({ amount: 80 });
    expect(r2.body.depositPaid).toBe(200); // 120 + 80
    expect(job(42).notes).toContain("Deposit recorded: $120.00 (card)");
  });

  it("rejects a non-positive amount", async () => {
    const res = await request(app).post("/api/service-jobs/42/deposit").send({ amount: 0 });
    expect(res.status).toBe(400);
  });

  it("404s for an unknown job", async () => {
    const res = await request(app).post("/api/service-jobs/999/deposit").send({ amount: 50 });
    expect(res.status).toBe(404);
  });
});
