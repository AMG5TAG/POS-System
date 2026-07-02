import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

// Rows the session-closing UPDATE resolves to, and whether it ran at all.
let closedRows: Array<Record<string, unknown>> = [];
let updateCalled = false;
let sessionRole = "owner";

vi.mock("@workspace/db", () => {
  const tableProxy = new Proxy({} as any, { get: () => "col" });
  return {
    db: {
      // merchant lookup for closer display name
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([{ ownerName: "Owner", businessName: "Biz" }]) }) }) }),
      // insert daily_close — echo the values so the response reflects computed variance
      insert: () => ({ values: (v: any) => ({ returning: () => Promise.resolve([{ ...v, id: 1, createdAt: new Date() }]) }) }),
      // close-all-sessions UPDATE
      update: () => { updateCalled = true; return { set: () => ({ where: () => ({ returning: () => Promise.resolve(closedRows) }) }) }; },
    },
    dailyClosesTable: tableProxy,
    transactionsTable: tableProxy,
    merchantsTable: tableProxy,
    invoicesTable: tableProxy,
    posRegisterSessionsTable: tableProxy,
  };
});

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, _res: any, next: any) => { req.session = { merchantId: 1, staffId: null, staffRole: sessionRole }; next(); },
  invalidateMerchantStatusCache: () => {},
}));

// tax lib is imported by the route module; only /current uses it, not POST.
vi.mock("../lib/tax", () => ({ getDefaultTaxRate: vi.fn().mockResolvedValue(0.1), splitGstInclusive: () => ({ gst: 0, net: 0 }) }));

let app: express.Express;

beforeAll(async () => {
  const { default: router } = await import("../routes/daily-closes");
  app = express();
  app.use(express.json());
  app.use("/api", router);
});

beforeEach(() => { closedRows = []; updateCalled = false; sessionRole = "owner"; });

const body = (over: Record<string, unknown> = {}) => ({ closeDate: "2026-07-02", expectedCash: 100, countedCash: 90, ...over });

describe("POST /api/daily-closes — unified Close Day", () => {
  it("records the reconciliation, closes open sessions by default, and reports the count", async () => {
    closedRows = [{ id: 1 }, { id: 2 }];
    const res = await request(app).post("/api/daily-closes").send(body());
    expect(res.status).toBe(201);
    expect(res.body.variance).toBe(-10);        // countedCash - expectedCash
    expect(res.body.registersClosed).toBe(2);
    expect(updateCalled).toBe(true);
  });

  it("skips closing sessions when closeOpenSessions is false", async () => {
    closedRows = [{ id: 1 }];
    const res = await request(app).post("/api/daily-closes").send(body({ closeOpenSessions: false }));
    expect(res.status).toBe(201);
    expect(res.body.registersClosed).toBe(0);
    expect(updateCalled).toBe(false);
  });

  it("forbids a cashier from closing the day", async () => {
    sessionRole = "cashier";
    const res = await request(app).post("/api/daily-closes").send(body());
    expect(res.status).toBe(403);
    expect(updateCalled).toBe(false);
  });

  it("rejects a malformed closeDate with 400", async () => {
    const res = await request(app).post("/api/daily-closes").send(body({ closeDate: "07/02/2026" }));
    expect(res.status).toBe(400);
  });
});
