import { describe, it, expect, vi, beforeAll } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

vi.mock("@workspace/db", () => {
  const chain: any = new Proxy({} as any, {
    get(_t, k) {
      if (k === "then") return (res: any) => Promise.resolve([]).then(res);
      if (k === "catch") return () => chain;
      if (k === "finally") return () => chain;
      return () => chain;
    },
  });
  const tableProxy = new Proxy({} as any, { get: () => tableProxy });
  // Any table import resolves to the same proxy; db calls resolve to [].
  return new Proxy(
    { db: new Proxy({} as any, { get: () => () => chain }) } as any,
    { get: (t, k) => (k in t ? (t as any)[k] : tableProxy) },
  );
});

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  invalidateMerchantStatusCache: () => {},
}));

let app: express.Express;

beforeAll(async () => {
  const { default: payrollRouter } = await import("../routes/payroll");
  app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use((_req, _res, next) => { (_req as any).session.merchantId = 1; next(); });
  app.use("/api", payrollRouter);
});

describe("POST /api/payroll/pay-runs — body validation", () => {
  it("returns 400 when period is missing", async () => {
    const res = await request(app).post("/api/payroll/pay-runs").send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("POST /api/payroll/sync/timesheets — body validation", () => {
  it("returns 400 when period is missing", async () => {
    const res = await request(app).post("/api/payroll/sync/timesheets").send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("POST /api/payroll/sync/journal — body validation", () => {
  it("returns 400 when payRunId is missing", async () => {
    const res = await request(app).post("/api/payroll/sync/journal").send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("GET /api/payroll/pay-runs/:id — route param validation", () => {
  it("returns 400 for a non-integer id", async () => {
    const res = await request(app).get("/api/payroll/pay-runs/abc");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});
