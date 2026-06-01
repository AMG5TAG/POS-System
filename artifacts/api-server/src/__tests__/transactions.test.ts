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
    transactionsTable: tableProxy,
    customersTable: tableProxy,
    productsTable: tableProxy,
    serviceJobsTable: tableProxy,
    appointmentsTable: tableProxy,
    loyaltySettingsTable: tableProxy,
    merchantsTable: tableProxy,
    giftCardsTable: tableProxy,
    giftCardLedgerTable: tableProxy,
    merchantIntegrationsTable: tableProxy,
  };
});

vi.mock("../services/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/lowStockAlertService", () => ({
  maybeQueueImmediateAlert: vi.fn(),
}));

let app: express.Express;

beforeAll(async () => {
  const { default: transactionsRouter } = await import("../routes/transactions");

  app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use((_req, _res, next) => { (_req as any).session.merchantId = 1; next(); });
  app.use("/api", transactionsRouter);
});

describe("GET /api/transactions — query param validation", () => {
  it("returns 400 when limit is not a number", async () => {
    const res = await request(app).get("/api/transactions?limit=notanumber");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when offset is not a number", async () => {
    const res = await request(app).get("/api/transactions?offset=abc");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when staffId is not a number", async () => {
    const res = await request(app).get("/api/transactions?staffId=abc");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("GET /api/transactions/:id — route param validation", () => {
  it("returns 400 for a non-integer id", async () => {
    const res = await request(app).get("/api/transactions/abc");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("POST /api/transactions/:id/refund — route param validation", () => {
  it("returns 400 for a non-integer id", async () => {
    const res = await request(app)
      .post("/api/transactions/abc/refund")
      .send({ items: [] });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("POST /api/transactions — body validation", () => {
  it("returns 400 when items field is missing", async () => {
    const res = await request(app)
      .post("/api/transactions")
      .send({
        paymentMethod: "cash",
        subtotal: 10,
        taxTotal: 1,
        total: 11,
      });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when paymentMethod is missing", async () => {
    const res = await request(app)
      .post("/api/transactions")
      .send({
        items: [],
        subtotal: 10,
        taxTotal: 1,
        total: 11,
      });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when paymentMethod is an unrecognised value", async () => {
    const res = await request(app)
      .post("/api/transactions")
      .send({
        items: [{ productId: 1, productName: "A", quantity: 1, unitPrice: 10, totalPrice: 10 }],
        paymentMethod: "bitcoin",
        subtotal: 10,
        taxTotal: 0,
        total: 10,
      });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when subtotal is missing", async () => {
    const res = await request(app)
      .post("/api/transactions")
      .send({
        items: [{ productId: 1, productName: "A", quantity: 1, unitPrice: 10, totalPrice: 10 }],
        paymentMethod: "cash",
        taxTotal: 0,
        total: 10,
      });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when total is missing", async () => {
    const res = await request(app)
      .post("/api/transactions")
      .send({
        items: [{ productId: 1, productName: "A", quantity: 1, unitPrice: 10, totalPrice: 10 }],
        paymentMethod: "cash",
        subtotal: 10,
        taxTotal: 0,
      });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when an item is missing productId", async () => {
    const res = await request(app)
      .post("/api/transactions")
      .send({
        items: [{ productName: "A", quantity: 1, unitPrice: 10, totalPrice: 10 }],
        paymentMethod: "cash",
        subtotal: 10,
        taxTotal: 0,
        total: 10,
      });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when an item quantity is zero", async () => {
    const res = await request(app)
      .post("/api/transactions")
      .send({
        items: [{ productId: 1, productName: "A", quantity: 0, unitPrice: 10, totalPrice: 0 }],
        paymentMethod: "cash",
        subtotal: 0,
        taxTotal: 0,
        total: 0,
      });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});
