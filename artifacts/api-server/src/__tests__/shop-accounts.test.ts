import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

/**
 * Online shop accounts (routes/shop.ts).
 *
 * A shop account IS the POS customer — same row, same password as the portal —
 * so the rules that stop one person claiming another's account are what these
 * tests pin:
 *   - signing up with an email the POS already knows never sets a password; the
 *     set-up link goes to that inbox instead;
 *   - one email can belong to several POS customers, and login finds the one
 *     whose password matches;
 *   - a set-password link works once, and not after it expires.
 */

// Rows the mocked `db` hands back, in query order (see service-job-qr.test.ts).
const h = vi.hoisted(() => ({ rows: [] as unknown[][] }));

vi.mock("@workspace/db", async (importOriginal) => {
  process.env.DATABASE_URL ||= "postgres://user:pass@localhost:5432/test";
  const actual = await importOriginal<Record<string, unknown>>();
  const chain = (): any =>
    new Proxy({} as any, {
      get(_t, k) {
        if (k === "then") return (res: any, rej: any) => Promise.resolve(h.rows.shift() ?? []).then(res, rej);
        if (k === "catch") return (rej: any) => Promise.resolve(h.rows.shift() ?? []).catch(rej);
        if (k === "finally") return (f: any) => Promise.resolve(h.rows.shift() ?? []).finally(f);
        return () => chain();
      },
    });
  const db: any = new Proxy({} as any, {
    get: (_t, k) => (k === "transaction" ? (fn: (tx: any) => unknown) => fn(db) : () => chain()),
  });
  return { ...actual, db };
});

const issueSetupLink = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../lib/customerPasswordLinks", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  issueSetupLink,
}));
vi.mock("../lib/sole-merchant", () => ({ soleMerchantId: async () => 1 }));
vi.mock("../lib/auth", () => ({
  hashPassword: async (p: string) => `h(${p})`,
  verifyPassword: async (p: string, hash: string) => hash === `h(${p})`,
}));
vi.mock("../lib/phone", () => ({ normalisePhoneFor: async (_m: number, p: string) => p }));
vi.mock("../services/autoSyncScheduler", () => ({ triggerInstantSync: vi.fn() }));

let app: express.Express;

const customer = (over: Record<string, unknown>) => ({
  id: 1, merchantId: 1, firstName: "Sam", lastName: "Lee", email: "sam@example.com", phone: null,
  address: null, billingStreet: null, billingCity: null, billingState: null, billingPostcode: null, billingCountry: null,
  loyaltyPoints: 0, portalToken: "tok", portalPasswordHash: null, ...over,
});

beforeAll(async () => {
  const { default: shopRouter } = await import("../routes/shop");
  app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use("/api", shopRouter);
}, 60000);

beforeEach(() => { h.rows = []; issueSetupLink.mockClear(); });

describe("POST /api/shop/auth/register", () => {
  it("never sets a password for an email the POS already knows — it emails a set-up link instead", async () => {
    h.rows = [[customer({ id: 5 })]];
    const res = await request(app).post("/api/shop/auth/register")
      .send({ firstName: "Mallory", email: "SAM@example.com", password: "attacker-pass" });
    expect(res.body).toEqual({ status: "check-email" });
    expect(issueSetupLink).toHaveBeenCalledTimes(1);
    const [target, purpose, , destination] = issueSetupLink.mock.calls[0] as unknown as [{ id: number }, string, unknown, string];
    expect(target.id).toBe(5);
    expect(purpose).toBe("setup");
    expect(destination).toBe("shop");
  });

  it("sends a reset link when that customer already has a password", async () => {
    h.rows = [[customer({ id: 5, portalPasswordHash: "h(old)" })]];
    await request(app).post("/api/shop/auth/register").send({ firstName: "S", email: "sam@example.com", password: "whatever1" });
    expect((issueSetupLink.mock.calls[0] as unknown as unknown[])[1]).toBe("reset");
  });

  it("creates a new POS customer, signed in, for a new email", async () => {
    h.rows = [[], [customer({ id: 9, email: "new@example.com", portalPasswordHash: "h(secret12)" })]];
    const res = await request(app).post("/api/shop/auth/register")
      .send({ firstName: "New", email: "new@example.com", password: "secret12" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("created");
    expect(res.body.customer.id).toBe(9);
    expect(issueSetupLink).not.toHaveBeenCalled();
  });

  it("rejects a short password", async () => {
    const res = await request(app).post("/api/shop/auth/register").send({ firstName: "A", email: "a@example.com", password: "short" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/shop/auth/login", () => {
  it("signs in the customer whose password matches when an email is shared", async () => {
    h.rows = [[customer({ id: 1 }), customer({ id: 2, portalPasswordHash: "h(right-one)" })], []];
    const res = await request(app).post("/api/shop/auth/login").send({ email: "sam@example.com", password: "right-one" });
    expect(res.status).toBe(200);
    expect(res.body.customer.id).toBe(2);
  });

  it("tells an in-store customer with no password yet to set one up", async () => {
    h.rows = [[customer({ id: 1 })]];
    const res = await request(app).post("/api/shop/auth/login").send({ email: "sam@example.com", password: "anything" });
    expect(res.status).toBe(401);
    expect(res.body.needsSetup).toBe(true);
  });

  it("gives the same answer for a wrong password as for an unknown email", async () => {
    h.rows = [[customer({ id: 1, portalPasswordHash: "h(right)" })]];
    const wrong = await request(app).post("/api/shop/auth/login").send({ email: "sam@example.com", password: "wrong" });
    h.rows = [[]];
    const unknown = await request(app).post("/api/shop/auth/login").send({ email: "nobody@example.com", password: "wrong" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });
});

describe("POST /api/shop/auth/set-password", () => {
  const token = (over: Record<string, unknown>) => ({
    id: 3, customerId: 1, tokenHash: "x", purpose: "setup",
    expiresAt: new Date(Date.now() + 60_000), usedAt: null, ...over,
  });

  it("refuses a link that has already been used", async () => {
    h.rows = [[token({ usedAt: new Date() })]];
    const res = await request(app).post("/api/shop/auth/set-password").send({ token: "abc", password: "newpass12" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already been used/);
  });

  it("refuses an expired link", async () => {
    h.rows = [[token({ expiresAt: new Date(Date.now() - 1000) })]];
    const res = await request(app).post("/api/shop/auth/set-password").send({ token: "abc", password: "newpass12" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/);
  });

  it("sets the password and signs the customer in with a valid link", async () => {
    h.rows = [[token({})], [customer({ id: 1 })], [], [], []];
    const res = await request(app).post("/api/shop/auth/set-password").send({ token: "abc", password: "newpass12" });
    expect(res.status).toBe(200);
    expect(res.body.customer.id).toBe(1);
  });
});

describe("POST /api/shop/auth/forgot", () => {
  it("answers the same whether or not the email is a customer", async () => {
    h.rows = [[]];
    const res = await request(app).post("/api/shop/auth/forgot").send({ email: "nobody@example.com" });
    expect(res.body).toEqual({ ok: true });
    expect(issueSetupLink).not.toHaveBeenCalled();
  });
});

describe("GET /api/shop/products/:id", () => {
  it("404s a product that is inactive or hidden from the shop", async () => {
    h.rows = [[]];
    const res = await request(app).get("/api/shop/products/42");
    expect(res.status).toBe(404);
  });
});
