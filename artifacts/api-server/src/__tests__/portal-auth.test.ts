import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { createHash } from "crypto";

/**
 * Customer-portal password gate.
 *
 * The portal was token-only: the `portalToken` in the URL was the entire
 * credential, for reads and writes alike. That is being pointed at from a QR on
 * a service sticker, which lives on the customer's device on a workshop bench —
 * so the token has to stop being sufficient. What matters here is the exact
 * shape of the gate, because each rule protects a different person:
 *
 *   - a merchant who hasn't opted in must see NO change at all
 *   - a customer who hasn't set a password yet must not be locked out
 *   - a customer who HAS set one must not be reachable by token alone
 *
 * and that possession of the link can never, by itself, claim the account.
 */

const h = vi.hoisted(() => {
  const store: Record<string, Record<string, unknown>[]> = {
    customers: [], merchants: [], customerPortalTokens: [], loyaltySettings: [],
  };

  type Pred = { type: string; col?: { _col: string }; val?: unknown; preds?: Pred[] };

  const match = (row: Record<string, unknown>, pred: Pred | undefined): boolean => {
    if (!pred) return true;
    if (pred.type === "and") return (pred.preds ?? []).every((p) => match(row, p));
    if (pred.type === "eq") return row[pred.col!._col] === pred.val;
    if (pred.type === "isNull") return row[pred.col!._col] == null;
    return true;
  };

  class Q {
    private table = "";
    private pred: Pred | undefined;
    private op: "select" | "insert" | "update" | "delete" = "select";
    private payload: Record<string, unknown> = {};
    /* Drizzle's select({ alias: table.column }) renames columns, and route code
       reads the alias — so the fake has to project too, or every aliased read
       silently comes back undefined. */
    private projection: Record<string, { _col: string }> | undefined;

    setProjection(p?: Record<string, { _col: string }>) { this.projection = p; return this; }
    setOp(op: Q["op"]) { this.op = op; return this; }
    setTable(t: string) { this.table = t; return this; }
    from(t: { __table: string }) { this.table = t.__table; return this; }
    where(p: Pred) { this.pred = p; return this; }
    limit() { return this; }
    orderBy() { return this; }
    set(v: Record<string, unknown>) { this.payload = v; return this; }
    values(v: Record<string, unknown>) { this.payload = v; return this; }
    returning() { return this; }

    private project(rows: Record<string, unknown>[]): Record<string, unknown>[] {
      if (!this.projection) return rows;
      return rows.map((r) => Object.fromEntries(
        Object.entries(this.projection!).map(([alias, col]) => [alias, r[col._col]]),
      ));
    }

    private run(): Record<string, unknown>[] {
      const rows = store[this.table] ?? [];
      if (this.op === "select") return this.project(rows.filter((r) => match(r, this.pred)));
      if (this.op === "insert") { rows.push({ id: rows.length + 1, ...this.payload }); return [rows[rows.length - 1]]; }
      if (this.op === "update") {
        const hit = rows.filter((r) => match(r, this.pred));
        for (const r of hit) Object.assign(r, this.payload);
        return hit;
      }
      const kept = rows.filter((r) => !match(r, this.pred));
      store[this.table] = kept;
      return [];
    }

    then(resolve: (v: unknown) => unknown) { return Promise.resolve(this.run()).then(resolve); }
  }

  const api = {
    select: (fields?: Record<string, { _col: string }>) => new Q().setOp("select").setProjection(fields),
    insert: (t: { __table: string }) => new Q().setOp("insert").setTable(t.__table),
    update: (t: { __table: string }) => new Q().setOp("update").setTable(t.__table),
    delete: (t: { __table: string }) => new Q().setOp("delete").setTable(t.__table),
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(api),
  };

  return {
    store,
    db: api,
    reset() { for (const k of Object.keys(store)) store[k] = []; },
  };
});

const TABLES: Record<string, string> = {
  customersTable: "customers",
  merchantsTable: "merchants",
  customerPortalTokensTable: "customerPortalTokens",
  loyaltySettingsTable: "loyaltySettings",
  appointmentsTable: "appointments",
  serviceJobsTable: "serviceJobs",
  quotesTable: "quotes",
};

vi.mock("@workspace/db", () => {
  const mod: Record<string, unknown> = { db: h.db };
  for (const [exportName, tableName] of Object.entries(TABLES)) {
    mod[exportName] = new Proxy({} as Record<string, unknown>, {
      get: (_t, col: string) => (col === "__table" ? tableName : { _table: tableName, _col: col }),
    });
  }
  return mod;
});

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ type: "eq", col, val }),
  and: (...preds: any[]) => ({ type: "and", preds }),
  isNull: (col: any) => ({ type: "isNull", col }),
  desc: (c: any) => c,
}));

const sentEmails: { to: string; subject: string; text: string }[] = [];
const sentSms: { to: string; body: string }[] = [];
vi.mock("../services/email", () => ({
  sendEmail: (_m: number, msg: any) => { sentEmails.push(msg); return Promise.resolve({ success: true, provider: "test" }); },
  sendSystemEmail: () => Promise.resolve({ success: true, provider: "test" }),
}));
vi.mock("../services/sms", () => ({
  sendSms: (msg: any) => { sentSms.push(msg); return Promise.resolve({ success: true, provider: "test" }); },
}));
vi.mock("../services/quoteApproval", () => ({ applyEstimateApprovalToJob: vi.fn() }));

const TOKEN = "portal-token-abc";

function seed(opts: { requirePassword: boolean; passwordHash?: string | null }) {
  h.store.merchants.push({
    id: 4, businessName: "Koastal Komputers", logoUrl: null, username: "koastal", portalDomain: null,
    requirePortalPassword: opts.requirePassword ? "true" : "false",
  });
  h.store.customers.push({
    id: 77, merchantId: 4, firstName: "Sarah", lastName: "Johnson",
    email: "sarah@example.com", phone: "0400 123 456", address: null,
    billingStreet: null, billingCity: null, billingState: null, billingPostcode: null,
    dateOfBirth: null, loyaltyPoints: 0, totalSpent: "0", visitCount: 0,
    portalToken: TOKEN,
    portalPasswordHash: opts.passwordHash ?? null,
    portalPasswordSetAt: null, portalLastLoginAt: null,
  });
}

/** An app with both routers, plus a switch to simulate an authenticated session. */
async function buildApp(authenticatedCustomerId?: number) {
  const { default: portalRouter } = await import("../routes/portal");
  const { default: portalAuthRouter } = await import("../routes/portal-auth");
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use((req: any, _res, next) => {
    req.log = { warn: () => {}, error: () => {} };
    if (authenticatedCustomerId) req.session.portalCustomerId = authenticatedCustomerId;
    next();
  });
  app.use("/api", portalAuthRouter);
  app.use("/api", portalRouter);
  return app;
}

beforeEach(() => {
  h.reset();
  sentEmails.length = 0;
  sentSms.length = 0;
});

describe("portal access gate", () => {
  it("leaves a merchant who hasn't opted in completely untouched", async () => {
    // Password set, but the merchant never turned the requirement on.
    seed({ requirePassword: false, passwordHash: "$2a$10$notarealhash" });
    const res = await request(await buildApp()).get(`/api/portal/${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.firstName).toBe("Sarah");
  });

  it("does not lock out a customer who has no password yet", async () => {
    // This is what makes the toggle safe to switch on: it invites, never evicts.
    seed({ requirePassword: true, passwordHash: null });
    const res = await request(await buildApp()).get(`/api/portal/${TOKEN}`);
    expect(res.status).toBe(200);
  });

  it("refuses the token alone once a password exists", async () => {
    seed({ requirePassword: true, passwordHash: "$2a$10$notarealhash" });
    const res = await request(await buildApp()).get(`/api/portal/${TOKEN}`);
    expect(res.status).toBe(401);
    expect(res.body.reason).toBe("password_required");
  });

  it("admits the same request once it holds a session", async () => {
    seed({ requirePassword: true, passwordHash: "$2a$10$notarealhash" });
    const res = await request(await buildApp(77)).get(`/api/portal/${TOKEN}`);
    expect(res.status).toBe(200);
  });

  it("gates writes, not just reads", async () => {
    seed({ requirePassword: true, passwordHash: "$2a$10$notarealhash" });
    const res = await request(await buildApp())
      .patch(`/api/portal/${TOKEN}/profile`)
      .send({ firstName: "Intruder" });
    expect(res.status).toBe(401);
    expect(h.store.customers[0].firstName).toBe("Sarah");
  });

  it("404s an unknown token without saying anything else", async () => {
    seed({ requirePassword: true, passwordHash: null });
    const res = await request(await buildApp()).get("/api/portal/not-a-real-token");
    expect(res.status).toBe(404);
  });
});

describe("set-up link", () => {
  it("sends the link to the address on file, never to the caller", async () => {
    seed({ requirePassword: true, passwordHash: null });
    const res = await request(await buildApp()).post(`/api/portal/${TOKEN}/auth/request-setup`).send({});

    expect(res.status).toBe(200);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe("sarah@example.com");
    // The response masks the destination and carries no token.
    expect(res.body.sentTo).toBe("s•••@example.com");
    expect(JSON.stringify(res.body)).not.toContain("set-password?token=");
  });

  it("answers identically for a token that belongs to nobody", async () => {
    seed({ requirePassword: true, passwordHash: null });
    const real = await request(await buildApp()).post(`/api/portal/${TOKEN}/auth/request-setup`).send({});
    const fake = await request(await buildApp()).post(`/api/portal/nope/auth/request-setup`).send({});
    expect(fake.status).toBe(real.status);
    expect(Object.keys(fake.body).sort()).toEqual(Object.keys(real.body).sort());
  });

  it("falls back to SMS when there is no email on file", async () => {
    seed({ requirePassword: true, passwordHash: null });
    h.store.customers[0].email = null;
    await request(await buildApp()).post(`/api/portal/${TOKEN}/auth/request-setup`).send({});
    expect(sentEmails).toHaveLength(0);
    expect(sentSms).toHaveLength(1);
    expect(sentSms[0].to).toBe("0400 123 456");
  });
});

describe("set-password", () => {
  const RAW = "raw-one-time-token";
  const seedToken = (over: Record<string, unknown> = {}) => {
    h.store.customerPortalTokens.push({
      id: 1, customerId: 77,
      tokenHash: createHash("sha256").update(RAW).digest("hex"),
      purpose: "setup",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      usedAt: null,
      ...over,
    });
  };

  it("sets the password, burns the token and opens a session", async () => {
    seed({ requirePassword: true, passwordHash: null });
    seedToken();
    const agent = request.agent(await buildApp());

    const res = await agent.post("/api/portal/auth/set-password").send({ token: RAW, password: "correct horse" });
    expect(res.status).toBe(200);
    expect(h.store.customers[0].portalPasswordHash).toBeTruthy();
    expect(h.store.customers[0].portalPasswordHash).not.toBe("correct horse");
    expect(h.store.customerPortalTokens[0].usedAt).toBeTruthy();
  });

  it("refuses a token that has already been used", async () => {
    seed({ requirePassword: true, passwordHash: null });
    seedToken({ usedAt: new Date() });
    const res = await request(await buildApp())
      .post("/api/portal/auth/set-password").send({ token: RAW, password: "correct horse" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already been used/i);
  });

  it("refuses an expired token", async () => {
    seed({ requirePassword: true, passwordHash: null });
    seedToken({ expiresAt: new Date(Date.now() - 1000) });
    const res = await request(await buildApp())
      .post("/api/portal/auth/set-password").send({ token: RAW, password: "correct horse" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
  });

  it("refuses a token nobody issued", async () => {
    seed({ requirePassword: true, passwordHash: null });
    const res = await request(await buildApp())
      .post("/api/portal/auth/set-password").send({ token: "made-up", password: "correct horse" });
    expect(res.status).toBe(400);
    expect(h.store.customers[0].portalPasswordHash).toBeNull();
  });

  it("rejects a password too short to be worth having", async () => {
    seed({ requirePassword: true, passwordHash: null });
    seedToken();
    const res = await request(await buildApp())
      .post("/api/portal/auth/set-password").send({ token: RAW, password: "short" });
    expect(res.status).toBe(400);
    expect(h.store.customerPortalTokens[0].usedAt).toBeNull();
  });
});

describe("login", () => {
  it("accepts the right password and admits the session afterwards", async () => {
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.default.hash("correct horse", 10);
    seed({ requirePassword: true, passwordHash: hash });

    const agent = request.agent(await buildApp());
    const login = await agent.post(`/api/portal/${TOKEN}/auth/login`).send({ password: "correct horse" });
    expect(login.status).toBe(200);

    const profile = await agent.get(`/api/portal/${TOKEN}`);
    expect(profile.status).toBe(200);
  });

  it("gives the same answer for a wrong password and an account with none set", async () => {
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.default.hash("correct horse", 10);

    seed({ requirePassword: true, passwordHash: hash });
    const wrong = await request(await buildApp()).post(`/api/portal/${TOKEN}/auth/login`).send({ password: "guess" });

    h.reset();
    seed({ requirePassword: true, passwordHash: null });
    const none = await request(await buildApp()).post(`/api/portal/${TOKEN}/auth/login`).send({ password: "guess" });

    expect(wrong.status).toBe(401);
    expect(none.status).toBe(401);
    expect(none.body).toEqual(wrong.body);
  });
});

describe("auth state", () => {
  it("tells the SPA which screen to show without leaking the address", async () => {
    seed({ requirePassword: true, passwordHash: null });
    const res = await request(await buildApp()).get(`/api/portal/${TOKEN}/auth/state`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ found: true, required: true, hasPassword: false, authenticated: false });
    expect(res.body.contactHint).toBe("s•••@example.com");
    expect(JSON.stringify(res.body)).not.toContain("sarah@example.com");
  });
});

/**
 * Rate limits.
 *
 * These endpoints used to share one counter, which meant a customer who mistyped
 * their password a few times also lost the ability to request a reset link — the
 * one action that would have got them back in. Each budget is now separate, and
 * scoped per account as well as per IP, so the tests that matter are about who
 * gets punished for whose behaviour.
 */
describe("rate limits", () => {
  const OTHER_TOKEN = "portal-token-xyz";
  const CLIENT_IP = "203.0.113.5";

  /** Cheap hash — these tests do dozens of verifications. */
  async function hashFor(password: string) {
    const bcrypt = await import("bcryptjs");
    return bcrypt.default.hash(password, 4);
  }

  /**
   * The limiters are module-level and skip localhost, which is exactly where
   * supertest connects from — so a fresh module registry gives each test clean
   * counters, and a public-looking address makes the limiters engage at all.
   */
  async function buildLimitedApp(clientIp = CLIENT_IP) {
    vi.resetModules();
    const { default: portalAuthRouter } = await import("../routes/portal-auth");
    const app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use((req: any, _res, next) => {
      req.log = { warn: () => {}, error: () => {} };
      Object.defineProperty(req, "ip", { value: clientIp, configurable: true });
      next();
    });
    app.use("/api", portalAuthRouter);
    return app;
  }

  it("a customer locked out of login can still ask for a reset link", async () => {
    seed({ requirePassword: true, passwordHash: await hashFor("correct horse") });
    const app = await buildLimitedApp();

    let last = 0;
    for (let i = 0; i < 11; i++) {
      last = (await request(app).post(`/api/portal/${TOKEN}/auth/login`).send({ password: "guess" })).status;
    }
    expect(last).toBe(429); // the login budget is spent

    // …and the way out is still open, which is the whole point of separating them.
    const reset = await request(app)
      .post(`/api/portal/${TOKEN}/auth/request-setup`).send({ purpose: "reset" });
    expect(reset.status).toBe(200);
    expect(sentEmails.length).toBe(1);
  });

  it("does not count the passwords a customer gets right", async () => {
    seed({ requirePassword: true, passwordHash: await hashFor("correct horse") });
    const app = await buildLimitedApp();

    // Comfortably past the 10-per-window failure budget.
    for (let i = 0; i < 12; i++) {
      const res = await request(app).post(`/api/portal/${TOKEN}/auth/login`).send({ password: "correct horse" });
      expect(res.status).toBe(200);
    }
  });

  it("keeps one customer's failures off another's account on the same wi-fi", async () => {
    seed({ requirePassword: true, passwordHash: await hashFor("correct horse") });
    h.store.customers.push({
      ...h.store.customers[0], id: 78, portalToken: OTHER_TOKEN,
      email: "mike@example.com",
    });
    const app = await buildLimitedApp();

    let last = 0;
    for (let i = 0; i < 11; i++) {
      last = (await request(app).post(`/api/portal/${TOKEN}/auth/login`).send({ password: "guess" })).status;
    }
    expect(last).toBe(429);

    // Same IP — a shop's guest network — but a different account, so it answers
    // on the merits rather than turning someone else's typing into a lockout.
    const other = await request(app).post(`/api/portal/${OTHER_TOKEN}/auth/login`).send({ password: "guess" });
    expect(other.status).toBe(401);
  });

  it("stops a link being sent over and over to the same inbox", async () => {
    seed({ requirePassword: true, passwordHash: null });
    const app = await buildLimitedApp();

    for (let i = 0; i < 3; i++) {
      expect((await request(app).post(`/api/portal/${TOKEN}/auth/request-setup`).send({})).status).toBe(200);
    }
    const fourth = await request(app).post(`/api/portal/${TOKEN}/auth/request-setup`).send({});
    expect(fourth.status).toBe(429);
    expect(sentEmails.length).toBe(3);
  });
});
