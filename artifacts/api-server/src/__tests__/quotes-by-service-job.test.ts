import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

/**
 * `GET /quotes?serviceJobId=` — the lookup behind the POS quote prompt.
 *
 * When a cashier links a service job to a sale, the till asks for that job's
 * quotes and offers to import one. So this filter is load-bearing in a way a
 * list filter usually is not: if it were ignored and the endpoint returned every
 * quote the merchant has, the POS would offer a *different* customer's quote
 * against this job and the cashier would ring up the wrong price. The first test
 * below is what makes that impossible.
 *
 * Merchant scoping is asserted alongside it for the same reason.
 */

const h = vi.hoisted(() => {
  const store: Record<string, any[]> = { quotes: [] };

  const mkTable = (name: string, cols: string[]) => {
    const t: any = { _name: name };
    for (const c of cols) t[c] = { _table: name, _col: c };
    return t;
  };
  const quotesTable = mkTable("quotes", [
    "id", "merchantId", "customerId", "serviceJobId", "quoteNumber", "status",
    "subtotal", "taxTotal", "total", "items", "events", "notes", "expiryDate",
    "discountType", "discountValue", "discountTotal", "depositRequired",
    "convertedTransactionId", "createdAt", "updatedAt",
  ]);
  const customersTable = mkTable("customers", [
    "id", "firstName", "lastName", "email", "phone", "address", "company",
    "billingStreet", "billingCity", "billingState", "billingPostcode",
  ]);

  const matches = (row: any, pred: any): boolean => {
    if (!pred) return true;
    if (pred.type === "and") return pred.preds.every((p: any) => matches(row, p));
    if (pred.type === "eq") return row[pred.col._col] === pred.val;
    return true;
  };

  const project = (row: any, projection: any) => {
    if (!projection) return { ...row };
    const out: any = {};
    for (const [key, col] of Object.entries<any>(projection)) {
      // `{ quote: quotesTable }` projects the whole row under that key.
      if (col && col._name && !col._col) out[key] = { ...row };
      else if (col && col._col) out[key] = row[col._col] ?? null;
      else out[key] = null;
    }
    return out;
  };

  class Q {
    kind: string; table: any = null; projection: any = null; pred: any = null;
    lim: number | null = null; off = 0; setObj: any = null; vals: any = null;
    constructor(kind: string, table?: any, projection?: any) {
      this.kind = kind; this.table = table ?? null; this.projection = projection ?? null;
    }
    from(t: any) { this.table = t; return this; }
    leftJoin(_t: any, _on: any) { return this; }   // customer columns come back null
    where(p: any) { this.pred = p; return this; }
    orderBy(_o: any) { return this; }
    limit(n: number) { this.lim = n; return this; }
    offset(n: number) { this.off = n; return this; }
    set(o: any) { this.setObj = o; return this; }
    values(o: any) { this.vals = o; return this; }
    returning() { return this; }
    private exec(): any {
      const rows = this.table ? store[this.table._name] ?? [] : [];
      const hit = rows.filter((r) => matches(r, this.pred));
      if (this.kind !== "select") return [];
      // A count projection is a single aggregate row, not one row per match.
      if (this.projection && Object.values<any>(this.projection).some((c) => c?._count)) {
        return [{ count: hit.length }];
      }
      const page = hit.slice(this.off, this.lim != null ? this.off + this.lim : undefined);
      return page.map((r) => project(r, this.projection));
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

  return { store, db, quotesTable, customersTable, reset() { store.quotes = []; } };
});

vi.mock("@workspace/db", () => ({
  db: h.db,
  quotesTable: h.quotesTable,
  customersTable: h.customersTable,
  serviceJobsTable: { _name: "service_jobs" },
  salesSettingsTable: { _name: "sales_settings" },
  merchantsTable: { _name: "merchants" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ type: "eq", col, val }),
  and: (...preds: any[]) => ({ type: "and", preds }),
  asc: (col: any) => ({ type: "asc", col }),
  desc: (col: any) => ({ type: "desc", col }),
  sql: Object.assign(() => ({ _count: true }), { raw: () => ({ _count: true }) }),
}));

const MERCHANT = 1;
vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, _res: any, next: any) => { req.session = { merchantId: MERCHANT }; next(); },
  invalidateMerchantStatusCache: () => {},
}));
vi.mock("../services/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock("../services/sms", () => ({ sendSms: vi.fn().mockResolvedValue({ success: true }) }));

let seq = 1;
function seedQuote(over: Record<string, unknown> = {}) {
  const id = seq++;
  h.store.quotes.push({
    id,
    merchantId: MERCHANT,
    customerId: null,
    serviceJobId: null,
    quoteNumber: `Q-${1000 + id}`,
    status: "draft",
    subtotal: "100",
    taxTotal: "10",
    total: "110",
    items: [{ description: "Screen replacement", quantity: 1, unitPrice: 110, taxRate: 10 }],
    events: [],
    notes: null,
    expiryDate: null,
    discountType: null, discountValue: null, discountTotal: null,
    depositRequired: null, convertedTransactionId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  });
  return id;
}

async function app() {
  const quotesRouter = (await import("../routes/quotes")).default;
  const a = express();
  a.use(express.json());
  a.use(quotesRouter);
  return a;
}

beforeEach(() => { h.reset(); seq = 1; });

describe("GET /quotes?serviceJobId=", () => {
  it("returns only the quotes raised against that job", async () => {
    seedQuote({ serviceJobId: 42, quoteNumber: "Q-JOB42" });
    seedQuote({ serviceJobId: 99, quoteNumber: "Q-JOB99" });
    seedQuote({ serviceJobId: null, quoteNumber: "Q-LOOSE" });

    const res = await request(await app()).get("/quotes?serviceJobId=42").expect(200);

    // The POS rings up whatever comes back, so a stray quote here is a stray
    // charge on someone's sale.
    expect(res.body.items.map((q: any) => q.quoteNumber)).toEqual(["Q-JOB42"]);
    expect(res.body.total).toBe(1);
  });

  it("still scopes to the merchant when filtering by job", async () => {
    seedQuote({ serviceJobId: 42, merchantId: 2, quoteNumber: "Q-OTHER-MERCHANT" });
    seedQuote({ serviceJobId: 42, quoteNumber: "Q-MINE" });

    const res = await request(await app()).get("/quotes?serviceJobId=42").expect(200);
    expect(res.body.items.map((q: any) => q.quoteNumber)).toEqual(["Q-MINE"]);
  });

  it("carries serviceJobId and items back, which is what the till imports", async () => {
    seedQuote({ serviceJobId: 42 });
    const res = await request(await app()).get("/quotes?serviceJobId=42").expect(200);
    expect(res.body.items[0].serviceJobId).toBe(42);
    expect(res.body.items[0].items).toHaveLength(1);
    expect(res.body.items[0].items[0].description).toBe("Screen replacement");
  });

  it("omitting the filter still lists every quote", async () => {
    seedQuote({ serviceJobId: 42 });
    seedQuote({ serviceJobId: null });
    const res = await request(await app()).get("/quotes").expect(200);
    expect(res.body.items).toHaveLength(2);
  });

  it("returns nothing for a job with no quotes rather than falling back to all", async () => {
    seedQuote({ serviceJobId: 42 });
    const res = await request(await app()).get("/quotes?serviceJobId=7").expect(200);
    expect(res.body.items).toEqual([]);
  });
});
