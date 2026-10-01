import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

/**
 * Online shop account area (routes/shop.ts). Pinned: the birthday — which
 * earns a birthday reward — can be added once but not moved afterwards, must
 * be a real past date, and the account overview is for signed-in shoppers only.
 */

const h = vi.hoisted(() => ({
  rows: [] as unknown[][], values: [] as Record<string, unknown>[], sets: [] as Record<string, unknown>[],
  purchased: false,
}));

vi.mock("@workspace/db", async (importOriginal) => {
  process.env.DATABASE_URL ||= "postgres://user:pass@localhost:5432/test";
  const actual = await importOriginal<Record<string, unknown>>();
  const chain = (): any =>
    new Proxy({} as any, {
      get(_t, k) {
        if (k === "then") return (res: any, rej: any) => Promise.resolve(h.rows.shift() ?? []).then(res, rej);
        if (k === "values") return (v: Record<string, unknown>) => { h.values.push(v); return chain(); };
        if (k === "set") return (v: Record<string, unknown>) => { h.sets.push(v); return chain(); };
        return () => chain();
      },
    });
  return { ...actual, db: new Proxy({} as any, { get: () => () => chain() }) };
});
vi.mock("../lib/sole-merchant", () => ({ soleMerchantId: async () => 1 }));
vi.mock("../lib/shop-reviews", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  hasPurchased: vi.fn(async () => h.purchased),
}));
vi.mock("../services/autoSyncScheduler", () => ({ triggerInstantSync: vi.fn() }));
vi.mock("../lib/phone", () => ({ normalisePhoneFor: async (_m: number, p: string) => p }));
vi.mock("../lib/customer-profile-rules", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  profileRequirements: vi.fn(async () => ({
    required: { email: false, phone: false, dateOfBirth: false, company: false, abn: false, billingAddress: false },
    heardFromSources: [],
  })),
}));

let app: express.Express;
const shopper = { id: 9, merchantId: 1, firstName: "Sam", lastName: "lee", email: "sam@example.com", dateOfBirth: null as string | null, loyaltyPoints: 0 };
const profile = (over: object = {}) => ({
  firstName: "Sam", lastName: "Lee", phone: "",
  address: { street: "", city: "", state: "", postcode: "", country: "Australia" }, ...over,
});

beforeAll(async () => {
  const { default: shopRouter } = await import("../routes/shop");
  app = express();
  app.use(express.json());
  // x-customer stands in for a signed-in shop session.
  app.use((req, _res, next) => {
    const id = req.header("x-customer");
    (req as any).session = id ? { portalCustomerId: Number(id) } : {};
    next();
  });
  app.use("/api", shopRouter);
}, 60000);

beforeEach(() => { h.rows = []; h.values = []; h.sets = []; h.purchased = false; });

describe("birthday", () => {
  it("can be added when none is set", async () => {
    h.rows = [[shopper], [{ ...shopper, dateOfBirth: "1990-05-04" }]];
    const res = await request(app).patch("/api/shop/account/profile").set("x-customer", "9").send(profile({ dateOfBirth: "1990-05-04" }));
    expect(res.status).toBe(200);
    expect(h.sets[0]).toMatchObject({ dateOfBirth: "1990-05-04" });
  });

  it("cannot be moved once set", async () => {
    h.rows = [[{ ...shopper, dateOfBirth: "1990-05-04" }]];
    const res = await request(app).patch("/api/shop/account/profile").set("x-customer", "9").send(profile({ dateOfBirth: "1990-09-30" }));
    expect(res.status).toBe(409);
    expect(h.sets).toEqual([]);
  });

  it("re-saving the same birthday with other changes is fine, and does not rewrite it", async () => {
    h.rows = [[{ ...shopper, dateOfBirth: "1990-05-04" }], [{ ...shopper, dateOfBirth: "1990-05-04" }]];
    const res = await request(app).patch("/api/shop/account/profile").set("x-customer", "9").send(profile({ dateOfBirth: "1990-05-04", phone: "0400000000" }));
    expect(res.status).toBe(200);
    expect(h.sets[0]).not.toHaveProperty("dateOfBirth");
  });

  it("rejects an impossible or future date", async () => {
    for (const d of ["1990-02-30", "2999-01-01", "1800-01-01"]) {
      h.rows = [[shopper]];
      const res = await request(app).patch("/api/shop/account/profile").set("x-customer", "9").send(profile({ dateOfBirth: d }));
      expect(res.status).toBe(400);
    }
    expect(h.sets).toEqual([]);
  });
});

describe("account overview", () => {
  it("is for signed-in shoppers only", async () => {
    expect((await request(app).get("/api/shop/account/overview")).status).toBe(401);
  });
});
