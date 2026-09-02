import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

/**
 * Regression test for customer-group default pricing persistence.
 *
 * The per-group price formula (e.g. Trade = cost ex GST + 40%, capped at RRP)
 * used to be dropped by PUT /customer-settings — it had no column, so the rules
 * survived only in the browser's query cache and vanished on refresh. These
 * tests pin the round-trip through the `group_pricing` column.
 */

const h = vi.hoisted(() => {
  const store: Record<string, any[]> = { customer_settings: [] };
  let seq = 1;

  const mkTable = (name: string) => new Proxy({ _name: name } as any, {
    get: (t, prop: string) => (prop in t ? t[prop] : { _table: name, _col: prop }),
  });
  const customerSettingsTable = mkTable("customer_settings");

  const matches = (row: any, pred: any): boolean => {
    if (!pred) return true;
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
    setObj: any = null; vals: any = null;
    constructor(kind: string, table?: any, projection?: any) {
      this.kind = kind; this.table = table ?? null; this.projection = projection ?? null;
    }
    from(t: any) { this.table = t; return this; }
    where(p: any) { this.pred = p; return this; }
    set(o: any) { this.setObj = o; return this; }
    values(o: any) { this.vals = o; return this; }
    returning() { return this; }
    private exec(): any {
      const rows = store[this.table._name];
      if (this.kind === "select") {
        return rows.filter((r) => matches(r, this.pred)).map((r) => project(r, this.projection));
      }
      if (this.kind === "insert") {
        const row = { id: seq++, updatedAt: new Date(), ...this.vals };
        rows.push(row);
        return [{ ...row }];
      }
      if (this.kind === "update") {
        const hit = rows.filter((r) => matches(r, this.pred));
        for (const r of hit) Object.assign(r, this.setObj, { updatedAt: new Date() });
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
    store, db, customerSettingsTable,
    reset() { store.customer_settings = []; seq = 1; },
  };
});

vi.mock("@workspace/db", () => ({
  db: h.db,
  customerSettingsTable: h.customerSettingsTable,
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ type: "eq", col, val }),
}));

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));

let app: express.Express;

beforeEach(async () => {
  h.reset();
  const { default: router } = await import("../routes/customer-settings");
  app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use((req: any, _res, next) => { req.session.merchantId = 1; next(); });
  app.use("/api", router);
});

const TRADE_RULE = {
  groupId: "trade",
  enabled: true,
  formula: { basis: "cost_ex", mode: "markup", percent: 40, capAtRRP: true },
  categoryRules: [{ categoryId: 3, type: "exclude" }],
};

describe("PUT/GET /api/customer-settings — group pricing", () => {
  it("persists a group's markup rule and reads it back unchanged", async () => {
    const put = await request(app)
      .put("/api/customer-settings")
      .send({ groups: [{ id: "trade", name: "Trade" }], groupPricing: [TRADE_RULE] });
    expect(put.status).toBe(200);
    expect(put.body.groupPricing).toEqual([TRADE_RULE]);

    // A fresh read is what the page does after a refresh — the rule must survive.
    const get = await request(app).get("/api/customer-settings");
    expect(get.status).toBe(200);
    expect(get.body.groupPricing).toEqual([TRADE_RULE]);
  });

  it("keeps per-category overrides through the round-trip", async () => {
    await request(app).put("/api/customer-settings").send({ groupPricing: [TRADE_RULE] });
    const get = await request(app).get("/api/customer-settings");
    expect(get.body.groupPricing[0].categoryRules).toEqual([{ categoryId: 3, type: "exclude" }]);
  });

  it("updates an existing row rather than stacking a second one", async () => {
    await request(app).put("/api/customer-settings").send({ groupPricing: [TRADE_RULE] });
    const changed = { ...TRADE_RULE, formula: { ...TRADE_RULE.formula, basis: "cost_inc", percent: 15 } };
    await request(app).put("/api/customer-settings").send({ groupPricing: [changed] });

    expect(h.store.customer_settings).toHaveLength(1);
    const get = await request(app).get("/api/customer-settings");
    expect(get.body.groupPricing).toEqual([changed]);
  });

  it("defaults to an empty rule list when none is sent or stored", async () => {
    const fresh = await request(app).get("/api/customer-settings");
    expect(fresh.body.groupPricing).toEqual([]);

    const put = await request(app).put("/api/customer-settings").send({ groups: [] });
    expect(put.body.groupPricing).toEqual([]);
  });

  it("ignores a non-array groupPricing instead of storing junk", async () => {
    const put = await request(app)
      .put("/api/customer-settings")
      .send({ groupPricing: "not-an-array" });
    expect(put.status).toBe(200);
    expect(put.body.groupPricing).toEqual([]);
  });
});
