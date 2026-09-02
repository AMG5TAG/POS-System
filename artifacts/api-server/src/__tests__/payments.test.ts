import { describe, it, expect, vi, beforeAll } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

// Generic db mock — every query resolves to []. These tests exercise the
// route's validation guards and webhook branch logic, not stateful data flows
// (the full create → capture → refund path is validated end-to-end in sandbox).
vi.mock("@workspace/db", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = new Proxy({} as any, {
    get(_t, k) {
      if (k === "then") return (res: (v: unknown[]) => unknown) => Promise.resolve([]).then(res);
      if (k === "catch") return () => chain;
      if (k === "finally") return () => chain;
      return () => chain;
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableProxy = new Proxy({} as any, { get: () => tableProxy });
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: new Proxy({} as any, { get: () => () => chain }),
    paymentAttemptsTable: tableProxy,
    transactionsTable: tableProxy,
    customersTable: tableProxy,
  };
});

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as express.Request & { session: { merchantId?: number } }).session.merchantId = 1;
    next();
  },
  invalidateMerchantStatusCache: () => {},
}));

// Keep the heavy sale-finalisation machinery out of these route tests.
vi.mock("../routes/transactions", () => ({
  default: express.Router(),
  finalizeSale: vi.fn().mockResolvedValue({ ok: true, transaction: { id: 99 }, customer: null }),
}));

let app: express.Express;

beforeAll(async () => {
  const { default: paymentsRouter } = await import("../routes/payments");
  app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use("/api", paymentsRouter);
});

describe("POST /api/payments/zip/create — validation", () => {
  it("returns 400 for an invalid body", async () => {
    const res = await request(app).post("/api/payments/zip/create").send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when the cart is empty", async () => {
    const res = await request(app).post("/api/payments/zip/create").send({
      items: [], paymentMethod: "zip", subtotal: 0, taxTotal: 0, total: 0,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least one item/i);
  });
});

describe("payment id validation", () => {
  it("GET /api/payments/:id/status rejects a non-numeric id", async () => {
    const res = await request(app).get("/api/payments/abc/status");
    expect(res.status).toBe(400);
  });

  it("POST /api/payments/:id/refund rejects a non-numeric id", async () => {
    const res = await request(app).post("/api/payments/abc/refund").send({});
    expect(res.status).toBe(400);
  });
});

describe("POST /api/webhooks/zip", () => {
  it("returns 400 when the payload has no recognisable order ref", async () => {
    const res = await request(app).post("/api/webhooks/zip").send({ foo: "bar" });
    expect(res.status).toBe(400);
  });

  it("acks (200) an unknown order ref without acting on it", async () => {
    // extractWebhookRef finds the id; the attempt lookup returns [] (unknown) →
    // the handler acks so Zip stops retrying.
    const res = await request(app).post("/api/webhooks/zip").send({ id: "zo_unknown", state: "approved" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });
});

describe("provider routing (zip + afterpay)", () => {
  it("rejects an empty Afterpay cart with 400", async () => {
    const res = await request(app).post("/api/payments/afterpay/create").send({
      items: [], paymentMethod: "afterpay", subtotal: 0, taxTotal: 0, total: 0,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least one item/i);
  });

  it("returns 404 for create with an unsupported provider", async () => {
    const res = await request(app).post("/api/payments/paypal/create").send({
      items: [], paymentMethod: "other", subtotal: 0, taxTotal: 0, total: 0,
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 for a webhook from an unsupported provider", async () => {
    const res = await request(app).post("/api/webhooks/paypal").send({ id: "x" });
    expect(res.status).toBe(404);
  });

  it("acks (200) an unknown Afterpay order ref", async () => {
    const res = await request(app).post("/api/webhooks/afterpay").send({ token: "ap_unknown", status: "approved" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });
});
