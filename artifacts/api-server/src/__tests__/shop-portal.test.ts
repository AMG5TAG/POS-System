import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

/**
 * The customer portal, merged into the shop account (routes/shop-account.ts,
 * routes/shop.ts). Pinned:
 *
 *   - an account link (/c/<token>) signs in under the portal's rules: alone
 *     while the customer has no password or the business doesn't require one,
 *     never once both hold, and never to another business's customer;
 *   - quotes can only be answered while sent and unexpired, and accepting one
 *     drives its repair job forward;
 *   - appointments are booked under the signed-in customer, in the future;
 *   - the email can change, but not to an address another customer holds —
 *     the account gathers records by email, so that would hand over theirs;
 *   - only the owner or staff see the whole shop while it is curtained.
 */

const h = vi.hoisted(() => ({
  rows: [] as unknown[][], values: [] as Record<string, unknown>[], sets: [] as Record<string, unknown>[],
  session: {} as Record<string, unknown>,
  approvals: [] as unknown[],
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
vi.mock("../lib/sole-merchant", () => ({ soleMerchantId: async () => 1, SOLE_MERCHANT_EMAIL: "owner@koastal.test" }));
vi.mock("../services/autoSyncScheduler", () => ({ triggerInstantSync: vi.fn() }));
vi.mock("../lib/phone", () => ({ normalisePhoneFor: async (_m: number, p: string) => p }));
vi.mock("../services/quoteApproval", () => ({
  applyEstimateApprovalToJob: vi.fn(async (...args: unknown[]) => { h.approvals.push(args); return true; }),
}));

let app: express.Express;
const customer = {
  id: 9, merchantId: 1, firstName: "Sam", lastName: "Lee", email: "sam@example.com", phone: "+61400000000",
  portalToken: "tok-9", portalPasswordHash: null as string | null, dateOfBirth: null, loyaltyPoints: 0,
};
const quote = (over: object = {}) => ({
  id: 50, merchantId: 1, customerId: 9, status: "sent", expiryDate: null as Date | null, events: [], serviceJobId: 7, total: "370.00", ...over,
});
const profile = (over: object = {}) => ({
  firstName: "Sam", lastName: "Lee", phone: "",
  address: { street: "", city: "", state: "", postcode: "", country: "Australia" }, ...over,
});

beforeAll(async () => {
  const { default: shopRouter } = await import("../routes/shop");
  const { default: accountRouter } = await import("../routes/shop-account");
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).session = h.session; next(); });
  app.use("/api", shopRouter, accountRouter);
}, 60000);

beforeEach(() => { h.rows = []; h.values = []; h.sets = []; h.session = {}; h.approvals = []; });

describe("signing in from an account link", () => {
  it("admits a customer with no password, and signs them in", async () => {
    h.rows = [[customer]];
    const res = await request(app).post("/api/shop/auth/token").send({ token: "tok-9" });
    expect(res.status).toBe(200);
    expect(res.body.customer.id).toBe(9);
    expect(h.session.portalCustomerId).toBe(9);
  });

  it("admits a customer with a password when the business doesn't require one", async () => {
    h.rows = [[{ ...customer, portalPasswordHash: "hash" }], [{ require: "false" }]];
    const res = await request(app).post("/api/shop/auth/token").send({ token: "tok-9" });
    expect(res.status).toBe(200);
    expect(h.session.portalCustomerId).toBe(9);
  });

  it("asks for the password once the customer has one and the business requires it", async () => {
    h.rows = [[{ ...customer, portalPasswordHash: "hash" }], [{ require: "true" }]];
    const res = await request(app).post("/api/shop/auth/token").send({ token: "tok-9" });
    expect(res.status).toBe(401);
    expect(res.body.reason).toBe("password_required");
    expect(res.body.contactHint).toBe("s•••@example.com");
    expect(h.session.portalCustomerId).toBeUndefined();
  });

  it("lets an already signed-in customer straight through", async () => {
    h.session = { portalCustomerId: 9 };
    h.rows = [[{ ...customer, portalPasswordHash: "hash" }]];
    const res = await request(app).post("/api/shop/auth/token").send({ token: "tok-9" });
    expect(res.status).toBe(200);
  });

  it("refuses an unknown token", async () => {
    h.rows = [[]];
    const res = await request(app).post("/api/shop/auth/token").send({ token: "nope" });
    expect(res.status).toBe(404);
    expect(h.session.portalCustomerId).toBeUndefined();
  });

  it("refuses another business's customer", async () => {
    h.rows = [[{ ...customer, merchantId: 2 }]];
    const res = await request(app).post("/api/shop/auth/token").send({ token: "tok-9" });
    expect(res.status).toBe(404);
    expect(h.session.portalCustomerId).toBeUndefined();
  });
});

describe("quotes", () => {
  // Query order: the shopper, their sibling records (buyerCustomerIds), the quote.
  const signedIn = (q: unknown[]) => { h.session = { portalCustomerId: 9 }; h.rows = [[customer], [{ id: 9 }], q]; };

  it("requires sign-in", async () => {
    const res = await request(app).get("/api/shop/account/quotes");
    expect(res.status).toBe(401);
  });

  it("accepting a sent quote marks it accepted and moves its repair on", async () => {
    signedIn([quote()]);
    const res = await request(app).post("/api/shop/account/quotes/50/respond").send({ decision: "accept" });
    expect(res.status).toBe(200);
    expect(h.sets[0]).toMatchObject({ status: "accepted" });
    expect(h.approvals).toHaveLength(1);
    expect(h.approvals[0]).toEqual([1, expect.objectContaining({ id: 50 }), "portal"]);
  });

  it("declining does not touch the job", async () => {
    signedIn([quote()]);
    const res = await request(app).post("/api/shop/account/quotes/50/respond").send({ decision: "decline" });
    expect(res.status).toBe(200);
    expect(h.sets[0]).toMatchObject({ status: "declined" });
    expect(h.approvals).toHaveLength(0);
  });

  it("a quote that is not this customer's is not found", async () => {
    signedIn([]);
    const res = await request(app).post("/api/shop/account/quotes/50/respond").send({ decision: "accept" });
    expect(res.status).toBe(404);
    expect(h.sets).toEqual([]);
  });

  it("an answered quote cannot be changed", async () => {
    signedIn([quote({ status: "declined" })]);
    const res = await request(app).post("/api/shop/account/quotes/50/respond").send({ decision: "accept" });
    expect(res.status).toBe(409);
    expect(h.sets).toEqual([]);
  });

  it("an expired quote cannot be accepted", async () => {
    signedIn([quote({ expiryDate: new Date(Date.now() - 86_400_000) })]);
    const res = await request(app).post("/api/shop/account/quotes/50/respond").send({ decision: "accept" });
    expect(res.status).toBe(409);
    expect(h.approvals).toHaveLength(0);
  });

  it("a sent quote past its expiry is listed as expired", async () => {
    signedIn([quote({ expiryDate: new Date(Date.now() - 86_400_000), quoteNumber: "Q-1", items: [], createdAt: new Date() })]);
    const res = await request(app).get("/api/shop/account/quotes");
    expect(res.status).toBe(200);
    expect(res.body[0].status).toBe("expired");
  });
});

describe("appointments", () => {
  const at = (ms: number) => new Date(Date.now() + ms).toISOString();

  it("books under the signed-in customer", async () => {
    h.session = { portalCustomerId: 9 };
    h.rows = [[customer], [{ id: 1, title: "Drop off laptop", scheduledAt: new Date(), durationMinutes: 30, status: "scheduled", notes: null }]];
    const res = await request(app).post("/api/shop/account/appointments").send({ title: "Drop off laptop", scheduledAt: at(86_400_000) });
    expect(res.status).toBe(201);
    expect(h.values[0]).toMatchObject({ merchantId: 1, customerId: 9, status: "scheduled", durationMinutes: 30 });
  });

  it("refuses a time in the past", async () => {
    h.session = { portalCustomerId: 9 };
    h.rows = [[customer]];
    const res = await request(app).post("/api/shop/account/appointments").send({ title: "Drop off", scheduledAt: at(-3_600_000) });
    expect(res.status).toBe(400);
    expect(h.values).toEqual([]);
  });
});

describe("changing email", () => {
  it("saves a new address nobody else has", async () => {
    h.session = { portalCustomerId: 9 };
    h.rows = [[customer], [], [{ ...customer, email: "new@example.com" }]];
    const res = await request(app).patch("/api/shop/account/profile").send(profile({ email: "New@Example.com" }));
    expect(res.status).toBe(200);
    expect(h.sets[0]).toMatchObject({ email: "new@example.com" });
  });

  it("refuses an address another customer holds", async () => {
    h.session = { portalCustomerId: 9 };
    h.rows = [[customer], [{ id: 12 }]];
    const res = await request(app).patch("/api/shop/account/profile").send(profile({ email: "someone@example.com" }));
    expect(res.status).toBe(409);
    expect(h.sets).toEqual([]);
  });

  it("leaves the email alone when it is unchanged", async () => {
    h.session = { portalCustomerId: 9 };
    h.rows = [[customer], [customer]];
    const res = await request(app).patch("/api/shop/account/profile").send(profile({ email: "sam@example.com" }));
    expect(res.status).toBe(200);
    expect(h.sets[0]).not.toHaveProperty("email");
  });
});

describe("previewing the curtained shop", () => {
  it("the owner may", async () => {
    h.session = { portalCustomerId: 9 };
    h.rows = [[{ ...customer, email: "Owner@Koastal.test" }]];
    expect((await request(app).get("/api/shop/auth/me")).body.preview).toBe(true);
  });

  it("an active staff member may", async () => {
    h.session = { portalCustomerId: 9 };
    h.rows = [[customer], [{ id: 3 }]];
    expect((await request(app).get("/api/shop/auth/me")).body.preview).toBe(true);
  });

  it("a customer may not", async () => {
    h.session = { portalCustomerId: 9 };
    h.rows = [[customer], []];
    expect((await request(app).get("/api/shop/auth/me")).body.preview).toBe(false);
  });

  it("nobody signed out may", async () => {
    expect((await request(app).get("/api/shop/auth/me")).body).toEqual({ customer: null, preview: false });
  });
});
