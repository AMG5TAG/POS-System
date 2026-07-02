import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

// Existing config row the select returns, and the patch the update captures.
let existingRow: Record<string, unknown> | null = null;
let capturedPatch: Record<string, unknown> | null = null;

vi.mock("@workspace/db", () => {
  const tableProxy = new Proxy({} as any, { get: () => "col" });
  return {
    db: {
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve(existingRow ? [existingRow] : []) }) }) }),
      update: () => ({ set: (v: any) => { capturedPatch = v; return { where: () => ({ returning: () => Promise.resolve([{ ...existingRow, ...v, updatedAt: new Date() }]) }) }; } }),
      insert: () => ({ values: (v: any) => ({ returning: () => Promise.resolve([{ id: 1, ...v, updatedAt: new Date() }]) }) }),
    },
    transactionsTable: tableProxy, customersTable: tableProxy, productsTable: tableProxy,
    appointmentsTable: tableProxy, serviceJobsTable: tableProxy, invoicesTable: tableProxy,
    dashboardConfigTable: tableProxy, merchantsTable: tableProxy,
  };
});

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, _res: any, next: any) => { req.session = { merchantId: 1 }; next(); },
  invalidateMerchantStatusCache: () => {},
}));

vi.mock("../lib/tax", () => ({ getDefaultTaxRate: vi.fn().mockResolvedValue(0.1), splitGstInclusive: () => ({ gst: 0, net: 0 }) }));

const BASE = { id: 1, merchantId: 1, showStatusTiles: true, showMetricTiles: true, showOverdueBanner: true, showNotifications: true, showServiceJobsPanel: true, showCalendar: true, showReferralRevenue: true, showBirthdayNotifications: true, sectionOrder: null, updatedAt: new Date() };

let app: express.Express;

beforeAll(async () => {
  const { default: router } = await import("../routes/dashboard");
  app = express();
  app.use(express.json());
  app.use("/api", router);
});

beforeEach(() => { existingRow = { ...BASE }; capturedPatch = null; });

describe("PUT /api/dashboard/config — sectionOrder persistence", () => {
  it("persists a supplied sectionOrder", async () => {
    const order = ["calendar", "serviceJobs", "referralRevenue", "panels"];
    const res = await request(app).put("/api/dashboard/config").send({ sectionOrder: order });
    expect(res.status).toBe(200);
    expect(capturedPatch).toEqual({ sectionOrder: order });
    expect(res.body.sectionOrder).toEqual(order);
  });

  it("does not touch sectionOrder when only a visibility flag is sent", async () => {
    const res = await request(app).put("/api/dashboard/config").send({ showCalendar: false });
    expect(res.status).toBe(200);
    expect(capturedPatch).toEqual({ showCalendar: false });
    expect(capturedPatch).not.toHaveProperty("sectionOrder");
  });

  it("rejects a non-array sectionOrder with 400", async () => {
    const res = await request(app).put("/api/dashboard/config").send({ sectionOrder: "calendar" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/dashboard/config", () => {
  it("returns the stored sectionOrder", async () => {
    existingRow = { ...BASE, sectionOrder: ["panels", "calendar", "serviceJobs", "referralRevenue"] };
    const res = await request(app).get("/api/dashboard/config");
    expect(res.status).toBe(200);
    expect(res.body.sectionOrder).toEqual(["panels", "calendar", "serviceJobs", "referralRevenue"]);
  });
});
