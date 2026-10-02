import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

/* Server-side staff roles (middlewares/requireManagerOrOwner.ts, routes/staff.ts).
 *
 * The audit found every role rule enforced only in the browser: any staff
 * session could promote itself to owner with PATCH /staff/:id, and a cashier
 * PIN-signed in on a till the owner had opened was an owner to the API. These
 * pin the server's answers. */

// Rows the next db select resolves to (the target staff member).
let selectRows: unknown[] = [];

vi.mock("@workspace/db", () => {
  const chain: any = new Proxy({} as any, {
    get(_t, k) {
      if (k === "then") return (res: any) => Promise.resolve(selectRows).then(res);
      if (k === "catch") return () => chain;
      if (k === "finally") return () => chain;
      return () => chain;
    },
  });
  const tableProxy = new Proxy({} as any, { get: () => tableProxy });
  return {
    db: new Proxy({} as any, { get: () => () => chain }),
    staffTable: tableProxy,
    transactionsTable: tableProxy,
    merchantsTable: tableProxy,
  };
});

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  invalidateMerchantStatusCache: () => {},
  invalidateStaffStatusCache: () => {},
  destroyStaffEmailSessions: async () => {},
}));

vi.mock("../lib/pin-guard", () => ({
  reservePinAttempt: async () => ({ ok: true, release: async () => {} }),
}));

let pinMatch: { id: number; name: string; role: string } | undefined;
vi.mock("../lib/staff-pin", () => ({
  hashPin: async (p: string) => `hashed:${p}`,
  matchStaffByPin: async () => pinMatch,
}));

type Sess = { staffRole?: string; staffId?: number; authKind?: string; managerApproval?: unknown };
let sess: Sess = {};
let app: express.Express;

beforeAll(async () => {
  const { default: staffRouter } = await import("../routes/staff");
  app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: true }));
  app.use((req, _res, next) => {
    Object.assign(req.session, { merchantId: 1, ...sess });
    next();
  });
  app.use("/api", staffRouter);
  // Echo the session after a request, so tests can see what a route set.
  app.get("/api/__session", (req, res) => { res.json(req.session); });
});

beforeEach(() => { sess = {}; selectRows = []; pinMatch = undefined; });

describe("who may change staff", () => {
  it("refuses a cashier outright", async () => {
    sess = { staffRole: "cashier", staffId: 3 };
    const res = await request(app).patch("/api/staff/3").send({ role: "owner" });
    expect(res.status).toBe(403);
  });

  it("refuses a manager promoting anyone to manager or owner", async () => {
    sess = { staffRole: "manager", staffId: 2 };
    selectRows = [{ id: 7, role: "cashier" }];
    const res = await request(app).patch("/api/staff/7").send({ role: "owner" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/only the owner/i);
  });

  it("refuses a manager editing the owner (e.g. re-PINning them)", async () => {
    sess = { staffRole: "manager", staffId: 2 };
    selectRows = [{ id: 1, role: "owner" }];
    const res = await request(app).patch("/api/staff/1").send({ pin: "1234" });
    expect(res.status).toBe(403);
  });

  it("refuses a manager creating a manager", async () => {
    sess = { staffRole: "manager", staffId: 2 };
    const res = await request(app).post("/api/staff").send({ name: "X", role: "manager" });
    expect(res.status).toBe(403);
  });

  it("refuses changing your own role, even as owner", async () => {
    sess = { staffRole: "owner", staffId: 1 };
    selectRows = [{ id: 1, role: "owner" }];
    const res = await request(app).patch("/api/staff/1").send({ role: "cashier" });
    expect(res.status).toBe(403);
  });

  it("refuses deleting a manager unless you are the owner", async () => {
    sess = { staffRole: "manager", staffId: 2 };
    selectRows = [{ id: 4, role: "manager" }];
    const res = await request(app).delete("/api/staff/4");
    expect(res.status).toBe(403);
  });
});

describe("the till's session role follows the day's staff member", () => {
  it("a cashier's day sign-in makes the session a cashier's", async () => {
    sess = { staffRole: "owner", authKind: "owner" };
    pinMatch = { id: 9, name: "Casey", role: "cashier", createdAt: new Date() } as never;
    const agent = request.agent(app);
    const res = await agent.post("/api/staff/verify-pin").send({ pin: "1111", establishDaySession: true });
    expect(res.body, JSON.stringify(res.body)).toMatchObject({ ok: true });
    // The route wrote the role into the session store.
    sess = {};
    const after = await agent.get("/api/__session");
    expect(after.body.staffRole).toBe("cashier");
    expect(after.body.staffId).toBe(9);
  });

  it("a manager PIN for one approval grants a short approval, not a role", async () => {
    sess = { staffRole: "cashier", staffId: 9, authKind: "owner" };
    pinMatch = { id: 2, name: "Morgan", role: "manager", createdAt: new Date() } as never;
    const agent = request.agent(app);
    await agent.post("/api/staff/verify-pin").send({ pin: "2222", requireManager: true });
    sess = {};
    const after = await agent.get("/api/__session");
    expect(after.body.staffRole).toBe("cashier");
    expect(after.body.managerApproval.staffId).toBe(2);
    expect(after.body.managerApproval.until).toBeGreaterThan(Date.now());
  });

  it("ending the day on an owner-opened till drops to cashier, not back to owner", async () => {
    sess = { staffRole: "cashier", staffId: 9, authKind: "owner" };
    const agent = request.agent(app);
    await agent.post("/api/staff/end-day-session").send({});
    sess = {};
    const after = await agent.get("/api/__session");
    expect(after.body.staffRole).toBe("cashier");
    expect(after.body.staffId).toBeUndefined();
  });
});

describe("cashiers see colleagues without their private details", () => {
  it("strips pay, contact and address fields from other staff", async () => {
    sess = { staffRole: "cashier", staffId: 9 };
    selectRows = [{
      id: 4, merchantId: 1, name: "Alex", role: "manager", email: "alex@example.com", phone: "+61400000000",
      payRate: "40", dateOfBirth: "1990-01-01", isActive: "true", createdAt: new Date(),
    }];
    const res = await request(app).get("/api/staff");
    expect(res.status).toBe(200);
    expect(res.body[0].name).toBe("Alex");
    expect(res.body[0].email).toBeNull();
    expect(res.body[0].payRate).toBeNull();
    expect(res.body[0].dateOfBirth).toBeNull();
  });
});

describe("role middlewares", () => {
  it("requireManagerOrApproval accepts a fresh manager PIN and refuses a stale one", async () => {
    const { requireManagerOrApproval } = await import("../middlewares/requireManagerOrOwner");
    const run = (s: Sess) => {
      let status = 200; let body: any;
      const res: any = { status: (c: number) => { status = c; return res; }, json: (b: any) => { body = b; return res; } };
      let passed = false;
      requireManagerOrApproval({ session: s } as any, res, () => { passed = true; });
      return { passed, status, body };
    };
    expect(run({ staffRole: "manager" }).passed).toBe(true);
    expect(run({ staffRole: "cashier", managerApproval: { staffId: 2, staffName: "M", until: Date.now() + 60_000 } }).passed).toBe(true);
    const stale = run({ staffRole: "cashier", managerApproval: { staffId: 2, staffName: "M", until: Date.now() - 1 } });
    expect(stale.passed).toBe(false);
    expect(stale.status).toBe(403);
    expect(stale.body.code).toBe("manager_approval_required");
  });

  it("allowSensitiveChanges ignores resent unchanged values and stops a changed price", async () => {
    const { allowSensitiveChanges } = await import("../middlewares/requireManagerOrOwner");
    const res: any = { status: () => res, json: () => res };
    const cashier = { session: { staffRole: "cashier" } } as any;
    expect(allowSensitiveChanges(cashier, res, [["price", 12.5, "12.50"], ["groupPrices", { a: 1 }, { a: 1 }]])).toBe(true);
    expect(allowSensitiveChanges(cashier, res, [["price", 1, "12.50"]])).toBe(false);
  });

  it("requireOwner refuses a session with no role at all", async () => {
    const { requireOwner } = await import("../middlewares/requireManagerOrOwner");
    let passed = false;
    const res: any = { status: () => res, json: () => res };
    requireOwner({ session: {} } as any, res, () => { passed = true; });
    expect(passed).toBe(false);
  });
});
