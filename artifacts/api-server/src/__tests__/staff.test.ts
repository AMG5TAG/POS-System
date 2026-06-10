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
    staffTable: tableProxy,
    transactionsTable: tableProxy,
  };
});

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  invalidateMerchantStatusCache: () => {},
}));

let app: express.Express;

beforeAll(async () => {
  const { default: staffRouter } = await import("../routes/staff");

  app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use((_req, _res, next) => { (_req as any).session.merchantId = 1; next(); });
  app.use("/api", staffRouter);
});

describe("GET /api/staff/:id — route param validation", () => {
  it("returns 400 for a non-integer id", async () => {
    const res = await request(app).get("/api/staff/abc");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("PATCH /api/staff/:id — route param validation", () => {
  it("returns 400 for a non-integer id", async () => {
    const res = await request(app).patch("/api/staff/not-a-number").send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("DELETE /api/staff/:id — route param validation", () => {
  it("returns 400 for a non-integer id", async () => {
    const res = await request(app).delete("/api/staff/abc");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("POST /api/staff — body validation", () => {
  it("returns 400 when name is missing", async () => {
    const res = await request(app)
      .post("/api/staff")
      .send({ role: "cashier" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when role is missing", async () => {
    const res = await request(app)
      .post("/api/staff")
      .send({ name: "Alice" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when role is an invalid value", async () => {
    const res = await request(app)
      .post("/api/staff")
      .send({ name: "Alice", role: "superadmin" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});
