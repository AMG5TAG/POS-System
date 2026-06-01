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
  return {
    db: new Proxy({} as any, { get: () => () => chain }),
    customersTable: tableProxy,
    customerNotesTable: tableProxy,
    customerFilesTable: tableProxy,
    transactionsTable: tableProxy,
    appointmentsTable: tableProxy,
    serviceJobsTable: tableProxy,
    laybysTable: tableProxy,
    invoicesTable: tableProxy,
    parkedSalesTable: tableProxy,
    formSubmissionsTable: tableProxy,
    marketingAutomationLogTable: tableProxy,
    emailCampaignsTable: tableProxy,
    productPreOrdersTable: tableProxy,
    productReturnAuthsTable: tableProxy,
    merchantsTable: tableProxy,
    staffTable: tableProxy,
  };
});

vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: class {
    uploadFile = vi.fn();
    deleteFile = vi.fn();
  },
}));

let app: express.Express;

beforeAll(async () => {
  const { default: customersRouter } = await import("../routes/customers");

  app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use((_req, _res, next) => { (_req as any).session.merchantId = 1; next(); });
  app.use("/api", customersRouter);
});

describe("GET /api/customers — query param validation", () => {
  it("returns 400 when limit is not a number", async () => {
    const res = await request(app).get("/api/customers?limit=foo");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when offset is not a number", async () => {
    const res = await request(app).get("/api/customers?offset=bar");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("GET /api/customers/:id — route param validation", () => {
  it("returns 400 for a non-integer id", async () => {
    const res = await request(app).get("/api/customers/abc");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("PATCH /api/customers/:id — route param validation", () => {
  it("returns 400 for a non-integer id", async () => {
    const res = await request(app).patch("/api/customers/xyz").send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("DELETE /api/customers/:id — route param validation", () => {
  it("returns 400 for a non-integer id", async () => {
    const res = await request(app).delete("/api/customers/not-a-number");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("POST /api/customers — body validation", () => {
  it("returns 400 for an invalid email format", async () => {
    const res = await request(app)
      .post("/api/customers")
      .send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});
