import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

/**
 * `defaultPrint` decides what pressing Print on a service job produces. It is
 * stored in the `service_settings.config` JSON blob, which is merchant-supplied
 * and predates the key, so the two things worth pinning are that a row without
 * it still reports "ask" — the chooser every merchant has today — and that a
 * value nobody can print never reaches the frontend.
 */

const h = vi.hoisted(() => {
  const store: Record<string, any[]> = { service_settings: [] };
  const mkTable = (name: string, cols: string[]) => {
    const t: any = { _name: name };
    for (const c of cols) t[c] = { _table: name, _col: c };
    return t;
  };
  const serviceSettingsTable = mkTable("service_settings", ["id", "merchantId", "config"]);

  const matches = (row: any, pred: any): boolean => {
    if (!pred) return true;
    if (pred.type === "and") return pred.preds.every((p: any) => matches(row, p));
    if (pred.type === "eq") return row[pred.col._col] === pred.val;
    return true;
  };

  class Q {
    kind: string; table: any = null; pred: any = null; setObj: any = null; vals: any = null;
    constructor(kind: string, table?: any) { this.kind = kind; this.table = table ?? null; }
    from(t: any) { this.table = t; return this; }
    where(p: any) { this.pred = p; return this; }
    set(o: any) { this.setObj = o; return this; }
    values(o: any) { this.vals = o; return this; }
    returning() { return this; }
    private exec(): any {
      const rows = this.table ? store[this.table._name] : [];
      if (this.kind === "select") return rows.filter((r) => matches(r, this.pred)).map((r) => ({ ...r }));
      if (this.kind === "insert") { const row = { id: rows.length + 1, ...this.vals }; rows.push(row); return [{ ...row }]; }
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
    select: () => new Q("select"),
    insert: (t: any) => new Q("insert", t),
    update: (t: any) => new Q("update", t),
  };
  return { store, db, serviceSettingsTable, reset() { store.service_settings = []; } };
});

vi.mock("@workspace/db", () => ({ db: h.db, serviceSettingsTable: h.serviceSettingsTable }));
vi.mock("drizzle-orm", () => ({
  eq:  (col: any, val: any) => ({ type: "eq", col, val }),
  and: (...preds: any[]) => ({ type: "and", preds }),
}));
vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, _res: any, next: any) => { req.session = { merchantId: 1 }; next(); },
}));

async function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => { req.session = { merchantId: 1 }; next(); });
  const router = (await import("../routes/service-settings")).default;
  app.use(router);
  return app;
}

beforeEach(() => h.reset());

describe("service settings — defaultPrint", () => {
  it("reports 'ask' for a merchant with no settings row at all", async () => {
    const res = await request(await makeApp()).get("/service-settings");
    expect(res.status).toBe(200);
    expect(res.body.defaultPrint).toBe("ask");
  });

  /* Existing rows predate the key — they must not start printing on their own. */
  it("reports 'ask' for an existing row that has no defaultPrint key", async () => {
    h.store.service_settings.push({ id: 1, merchantId: 1, config: { showQuote: false } });
    const res = await request(await makeApp()).get("/service-settings");
    expect(res.body.defaultPrint).toBe("ask");
    expect(res.body.showQuote).toBe(false);
  });

  it("round-trips a chosen default", async () => {
    const app = await makeApp();
    const put = await request(app).put("/service-settings").send({
      showPartsLabour: true, showApprovalDeposit: true, showDiagnostics: true,
      showWarranty: true, showTechnicianTime: true, showSignOff: true,
      showShipping: true, showNotes: true, defaultPrint: "80mm",
    });
    expect(put.status).toBe(200);
    expect(put.body.defaultPrint).toBe("80mm");
    expect((await request(app).get("/service-settings")).body.defaultPrint).toBe("80mm");
  });

  it("falls back to the chooser for a stored value nothing can print", async () => {
    h.store.service_settings.push({ id: 1, merchantId: 1, config: { defaultPrint: "fax" } });
    const res = await request(await makeApp()).get("/service-settings");
    expect(res.body.defaultPrint).toBe("ask");
  });
});
