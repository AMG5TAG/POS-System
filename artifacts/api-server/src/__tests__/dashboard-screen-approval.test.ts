import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

/**
 * Screen approval on the public Dashboard link (routes/dashboard-app-public.ts,
 * lib/dashboard-devices.ts). Pinned: while approval is required the right
 * access code alone shows no data — an unknown screen gets a pending request
 * with a pairing code (202, so its polling isn't counted as wrong codes), a
 * denied one gets 403, and only an approved one gets the snapshot. With
 * approval off the link behaves as it always did.
 */

const h = vi.hoisted(() => ({ rows: [] as unknown[][], inserts: [] as unknown[] }));

vi.mock("@workspace/db", async (importOriginal) => {
  process.env.DATABASE_URL ||= "postgres://user:pass@localhost:5432/test";
  const actual = await importOriginal<Record<string, unknown>>();
  const chain = (): any =>
    new Proxy({} as any, {
      get(_t, k) {
        if (k === "then") return (res: any, rej: any) => Promise.resolve(h.rows.shift() ?? []).then(res, rej);
        if (k === "values") return (v: unknown) => { h.inserts.push(v); return chain(); };
        return () => chain();
      },
    });
  return { ...actual, db: new Proxy({} as any, { get: () => () => chain() }) };
});

let app: express.Express;
const SECRET = "a".repeat(64);

// Every widget off, so an admitted request runs no data queries.
const settings = (over: Record<string, unknown> = {}) => ({
  merchantId: 1, enabled: true, requireApproval: true, publicToken: "code123",
  showStatusTiles: false, showMetricTiles: false, showOverdueBanner: false, showNotifications: false,
  showServiceJobsPanel: false, showCalendar: false, showReferralRevenue: false, ...over,
});
const merchant = [{ id: 1, businessName: "Koastal", logoUrl: null }];
const device = (over: Record<string, unknown> = {}) => ({
  id: 5, merchantId: 1, status: "approved", pairCode: "4821", lastSeenAt: new Date(), ipAddress: null, userAgent: null, ...over,
});

beforeAll(async () => {
  const { default: router } = await import("../routes/dashboard-app-public");
  app = express();
  app.use("/api", router);
}, 60000);

beforeEach(() => { h.rows = []; h.inserts = []; });

describe("dashboard screen approval", () => {
  it("opens a pending request for an unknown screen and returns its pairing code", async () => {
    // settings, merchant, device lookup (none), prune, live-pending count, insert
    h.rows = [[settings()], merchant, [], [], [{ live: 0 }], [device({ status: "pending", pairCode: "0042" })]];
    const res = await request(app).get("/api/public/dashboard/code123").set("X-Dashboard-Device", SECRET);
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ approval: "pending", pairCode: "0042" });
    expect(res.body.data).toBeUndefined();
    // Only the hash is stored, never the secret itself.
    expect(JSON.stringify(h.inserts)).not.toContain(SECRET);
  });

  it("keeps a waiting screen waiting", async () => {
    h.rows = [[settings()], merchant, [device({ status: "pending" })], []];
    const res = await request(app).get("/api/public/dashboard/code123").set("X-Dashboard-Device", SECRET);
    expect(res.status).toBe(202);
    expect(res.body.pairCode).toBe("4821");
  });

  it("refuses a denied screen", async () => {
    h.rows = [[settings()], merchant, [device({ status: "denied" })]];
    const res = await request(app).get("/api/public/dashboard/code123").set("X-Dashboard-Device", SECRET);
    expect(res.status).toBe(403);
    expect(res.body.approval).toBe("denied");
  });

  it("refuses a request with no screen secret", async () => {
    h.rows = [[settings()], merchant];
    const res = await request(app).get("/api/public/dashboard/code123");
    expect(res.status).toBe(400);
    expect(res.body.data).toBeUndefined();
  });

  it("stops opening requests once too many are waiting", async () => {
    h.rows = [[settings()], merchant, [], [], [{ live: 10 }]];
    const res = await request(app).get("/api/public/dashboard/code123").set("X-Dashboard-Device", SECRET);
    expect(res.status).toBe(429);
    expect(h.inserts).toEqual([]);
  });

  it("serves an approved screen the snapshot", async () => {
    h.rows = [[settings()], merchant, [device()]];
    const res = await request(app).get("/api/public/dashboard/code123").set("X-Dashboard-Device", SECRET);
    expect(res.status).toBe(200);
    expect(res.body.businessName).toBe("Koastal");
  });

  it("needs no screen secret while approval is off", async () => {
    h.rows = [[settings({ requireApproval: false })], merchant];
    const res = await request(app).get("/api/public/dashboard/code123");
    expect(res.status).toBe(200);
  });
});
