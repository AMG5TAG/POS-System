import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

/**
 * Route test for the duplicate-phone check the Add Customer form runs in the
 * background. The matching rule itself is covered by phone-match.test.ts and
 * verified against real Postgres; what matters here is the route's contract:
 * it must not go near the database for a number too short to identify anyone
 * (the form calls this on every keystroke), and it must scope to the merchant
 * and honour excludeId.
 */
const h = vi.hoisted(() => {
  const calls: { conditions: unknown[]; limit: number | null }[] = [];
  let result: Record<string, unknown>[] = [];

  class Q {
    private conditions: unknown[] = [];
    private lim: number | null = null;
    from() { return this; }
    where(pred: any) { this.conditions = pred?.preds ?? [pred]; return this; }
    limit(n: number) { this.lim = n; return this; }
    then(resolve: (v: unknown) => unknown) {
      calls.push({ conditions: this.conditions, limit: this.lim });
      return Promise.resolve(result).then(resolve);
    }
  }
  return {
    calls,
    setResult(rows: Record<string, unknown>[]) { result = rows; },
    reset() { calls.length = 0; result = []; },
    db: { select: () => new Q(), insert: () => new Q(), update: () => new Q(), delete: () => new Q() },
  };
});

/* vitest validates the shape of a module mock, so every table the route module
   imports has to be named here; each is a proxy so `table.column` resolves. */
const TABLES = [
  "customersTable", "customerNotesTable", "customerFilesTable", "transactionsTable",
  "appointmentsTable", "serviceJobsTable", "laybysTable", "invoicesTable", "parkedSalesTable",
  "formSubmissionsTable", "marketingAutomationLogTable", "emailCampaignsTable",
  "productPreOrdersTable", "merchantsTable", "staffTable", "loyaltySettingsTable",
] as const;

vi.mock("@workspace/db", () => {
  const mod: Record<string, unknown> = { db: h.db };
  for (const name of TABLES) {
    mod[name] = new Proxy({} as Record<string, unknown>, {
      get: (_t, col: string) => ({ _table: name, _col: col }),
    });
  }
  return mod;
});

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ type: "eq", col, val }),
  and: (...preds: any[]) => ({ type: "and", preds }),
  or: (...preds: any[]) => ({ type: "or", preds }),
  ilike: () => ({ type: "ilike" }),
  desc: (c: any) => c,
  isNull: () => ({ type: "isNull" }),
  inArray: () => ({ type: "inArray" }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...vals: unknown[]) => ({ type: "sql", sql: strings.join("?"), vals }),
    { raw: (s: string) => ({ type: "sql", sql: s, vals: [] }) },
  ),
}));

vi.mock("../middlewares/requireAuth", () => ({ requireAuth: (_q: any, _r: any, n: any) => n() }));
vi.mock("../middlewares/requireManagerOrOwner", () => ({ requireManagerOrOwner: (_q: any, _r: any, n: any) => n() }));
vi.mock("../lib/objectStorage", () => ({ ObjectStorageService: class {} }));
vi.mock("../services/entityQr", () => ({
  registerCustomerQr: vi.fn(), registerCustomerQrsBatch: vi.fn(), registerQrBestEffort: vi.fn(),
}));
vi.mock("../services/cloudFileMirror", () => ({
  mirrorCustomerFileToCloud: vi.fn(), getCustomerFilesCloudConfig: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("../services/autoSyncScheduler", () => ({ triggerInstantSync: vi.fn() }));

const customerRow = (over: Record<string, unknown> = {}) => ({
  id: 7, merchantId: 4, firstName: "Sarah", lastName: "Johnson", email: "sarah@example.com",
  phone: "0400 123 456", address: null, notes: null, photoUrl: null, dateOfBirth: null,
  loyaltyPoints: 0, totalSpent: "0", visitCount: 0, createdAt: new Date(),
  company: null, abn: null, referredBy: null, whatsappSameAsPhone: null,
  billingStreet: null, billingCity: null, billingState: null, billingPostcode: null, billingCountry: null,
  shippingStreet: null, shippingCity: null, shippingState: null, shippingPostcode: null, shippingCountry: null,
  customerGroup: null, warningNote: null, agreedToMarketing: null, portalToken: null, referralCode: null,
  heardFrom: null, heardFromDetails: null, referredByCustomerId: null, tierName: null, tierUpdatedAt: null,
  ...over,
});

let app: express.Express;

beforeEach(async () => {
  h.reset();
  const { default: router } = await import("../routes/customers");
  app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use((req: any, _res, next) => { req.session.merchantId = 4; next(); });
  app.use("/api", router);
});

describe("GET /api/customers/lookup-phone", () => {
  it("returns the customers already holding the number", async () => {
    h.setResult([customerRow()]);
    const res = await request(app).get("/api/customers/lookup-phone?phone=0400+123+456");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0]).toMatchObject({ id: 7, firstName: "Sarah", phone: "0400 123 456" });
  });

  it("says nobody has it when nobody does", async () => {
    h.setResult([]);
    const res = await request(app).get("/api/customers/lookup-phone?phone=0499999111");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], total: 0 });
  });

  it("never queries for a number too short to identify anyone", async () => {
    for (const phone of ["", "12345", "n/a", "(0"]) {
      const res = await request(app).get(`/api/customers/lookup-phone?phone=${encodeURIComponent(phone)}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [], total: 0 });
    }
    // The form calls this on every keystroke — early digits must cost nothing.
    expect(h.calls).toHaveLength(0);
  });

  it("scopes to the session's merchant and caps what it returns", async () => {
    h.setResult([]);
    await request(app).get("/api/customers/lookup-phone?phone=0400123456");
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].conditions).toContainEqual(
      expect.objectContaining({ type: "eq", val: 4 }),
    );
    expect(h.calls[0].limit).toBe(5);
  });

  it("leaves the customer being edited out of its own duplicate check", async () => {
    h.setResult([]);
    await request(app).get("/api/customers/lookup-phone?phone=0400123456&excludeId=7");
    const withExclude = h.calls[0].conditions.length;

    h.reset();
    h.setResult([]);
    await request(app).get("/api/customers/lookup-phone?phone=0400123456");
    expect(withExclude).toBe(h.calls[0].conditions.length + 1);
  });

  it("ignores a junk excludeId rather than filtering on NaN", async () => {
    h.setResult([]);
    await request(app).get("/api/customers/lookup-phone?phone=0400123456&excludeId=abc");
    const junk = h.calls[0].conditions.length;

    h.reset();
    h.setResult([]);
    await request(app).get("/api/customers/lookup-phone?phone=0400123456");
    expect(junk).toBe(h.calls[0].conditions.length);
  });
});
