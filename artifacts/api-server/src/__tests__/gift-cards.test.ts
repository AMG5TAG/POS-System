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
    giftCardsTable: tableProxy,
    giftCardLedgerTable: tableProxy,
    giftCardSettingsTable: tableProxy,
    customersTable: tableProxy,
  };
});

vi.mock("../services/lowStockAlertService", () => ({
  maybeQueueImmediateAlert: vi.fn(),
}));

vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: vi.fn().mockImplementation(() => ({})),
}));

let app: express.Express;

beforeAll(async () => {
  const { default: giftCardsRouter } = await import("../routes/gift-cards");

  app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use((_req, _res, next) => { (_req as any).session.merchantId = 1; next(); });
  app.use("/api", giftCardsRouter);
});

describe("GET /api/gift-cards — query param validation", () => {
  it("returns 400 when limit is not a number", async () => {
    const res = await request(app).get("/api/gift-cards?limit=foo");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when offset is not a number", async () => {
    const res = await request(app).get("/api/gift-cards?offset=bar");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("GET /api/gift-cards/:id — route param validation", () => {
  it("returns 400 for a non-integer id", async () => {
    const res = await request(app).get("/api/gift-cards/abc");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 for a purely alphabetic id", async () => {
    const res = await request(app).get("/api/gift-cards/xyz");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("GET /api/gift-cards/:id/ledger — route param validation", () => {
  it("returns 400 for a non-integer id", async () => {
    const res = await request(app).get("/api/gift-cards/abc/ledger");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("PATCH /api/gift-cards/:id — route param validation", () => {
  it("returns 400 for a non-integer id", async () => {
    const res = await request(app).patch("/api/gift-cards/abc").send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("DELETE /api/gift-cards/:id — route param validation", () => {
  it("returns 400 for a non-integer id", async () => {
    const res = await request(app).delete("/api/gift-cards/abc");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("POST /api/gift-cards — body validation", () => {
  it("returns 400 when cardNumber is missing", async () => {
    const res = await request(app)
      .post("/api/gift-cards")
      .send({ initialValue: 50 });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when initialValue is missing", async () => {
    const res = await request(app)
      .post("/api/gift-cards")
      .send({ cardNumber: "GC-001" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("returns 400 when initialValue is negative", async () => {
    const res = await request(app)
      .post("/api/gift-cards")
      .send({ cardNumber: "GC-001", initialValue: -10 });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});

describe("POST /api/gift-cards/validate — body validation", () => {
  it("returns 400 when cardNumber is missing", async () => {
    const res = await request(app)
      .post("/api/gift-cards/validate")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });
});
