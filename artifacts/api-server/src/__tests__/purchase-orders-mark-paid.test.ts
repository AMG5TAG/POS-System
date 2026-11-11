import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

// POST /purchase-orders/:id/payment — mark paid settles at the stored total,
// mark unpaid clears every payment field. The PO list's History tab depends on it.
const updates: any[] = [];
let stored: any = null;

vi.mock("@workspace/db", () => {
  // The route reads the PO row first, then getPOWithItems re-reads it; items,
  // receipts and everything else come back empty.
  let selects = 0;
  const makeChain = (rows: () => any[]): any => {
    const chain: any = new Proxy({} as any, {
      get(_t, k) {
        if (k === "then") return (res: any) => Promise.resolve(rows()).then(res);
        if (k === "catch" || k === "finally") return () => chain;
        if (k === "set") return (v: any) => { updates.push(v); return chain; };
        return () => chain;
      },
    });
    return chain;
  };
  const poRows = () => (stored ? [{ ...stored, ...(updates[0] ?? {}) }] : []);
  const select = () => { const n = selects++; return makeChain(() => (n < 2 ? poRows() : [])); };
  (globalThis as any).__resetSelects = () => { selects = 0; };
  const chain = makeChain(() => []);
  const tableProxy = new Proxy({} as any, { get: () => tableProxy });
  const db: any = { select, update: () => makeChain(poRows), insert: () => chain, transaction: async (fn: any) => fn(db) };
  const t = tableProxy;
  return {
    db, purchaseOrdersTable: t, purchaseOrderItemsTable: t, purchaseOrderReceiptsTable: t, suppliersTable: t,
    merchantsTable: t, productsTable: t, productPriceHistoryTable: t, productSerialsTable: t,
    productOversellLedgerTable: t, productTypesTable: t, lowStockAlertSettingsTable: t, brandsTable: t,
  };
});
vi.mock("../middlewares/requireAuth", () => ({ requireAuth: (_q: any, _s: any, n: any) => n(), invalidateMerchantStatusCache: () => {} }));
vi.mock("../services/email", () => ({ sendEmail: vi.fn() }));

let app: express.Express;
beforeAll(async () => {
  const { default: poRouter } = await import("../routes/purchase-orders");
  app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use((req, _res, next) => { (req as any).session.merchantId = 1; next(); });
  app.use("/api", poRouter);
});
beforeEach(() => {
  updates.length = 0;
  (globalThis as any).__resetSelects();
  stored = { id: 7, merchantId: 1, poNumber: "KP7", status: "Fully Received", orderDate: "2026-11-01",
    totalCost: "123.45", amountPaid: "0", paymentStatus: "unpaid", paymentMethod: null, paidAt: null,
    deliveryCharge: "0", createdAt: new Date() };
});

describe("POST /purchase-orders/:id/payment", () => {
  it("marks paid at the stored total", async () => {
    await request(app).post("/api/purchase-orders/7/payment").send({ paid: true, paymentMethod: "bank_transfer" }).expect(200);
    expect(updates[0]).toMatchObject({ amountPaid: "123.45", paymentStatus: "paid", paymentMethod: "bank_transfer" });
    expect(updates[0].paidAt).toBeInstanceOf(Date);
  });

  it("marks unpaid and clears the payment", async () => {
    stored = { ...stored, amountPaid: "123.45", paymentStatus: "paid", paymentMethod: "card", paidAt: new Date() };
    await request(app).post("/api/purchase-orders/7/payment").send({ paid: false }).expect(200);
    expect(updates[0]).toEqual({ amountPaid: "0", paymentStatus: "unpaid", paymentMethod: null, paidAt: null });
  });

  it("records the method and the day the supplier was paid", async () => {
    await request(app).post("/api/purchase-orders/7/payment").send({ paid: true, paymentMethod: "cash", paidDate: "2026-11-03" }).expect(200);
    expect(updates[0]).toMatchObject({ paymentStatus: "paid", paymentMethod: "cash" });
    expect(updates[0].paidAt.toISOString()).toBe("2026-11-03T12:00:00.000Z");
  });

  it("refuses a future or invalid payment date", async () => {
    const future = new Date(Date.now() + 5 * 86400_000).toISOString().slice(0, 10);
    await request(app).post("/api/purchase-orders/7/payment").send({ paid: true, paidDate: future }).expect(400);
    await request(app).post("/api/purchase-orders/7/payment").send({ paid: true, paidDate: "2026-02-30" }).expect(400);
    expect(updates).toHaveLength(0);
  });

  it("404s another business's order", async () => {
    stored = null;
    await request(app).post("/api/purchase-orders/7/payment").send({ paid: true }).expect(404);
    expect(updates).toHaveLength(0);
  });

  it("rejects a body without paid", async () => {
    await request(app).post("/api/purchase-orders/7/payment").send({}).expect((r) => expect(r.status).toBeGreaterThanOrEqual(400));
    expect(updates).toHaveLength(0);
  });

  describe("PUT /purchase-orders/:id/receipt-files", () => {
    const own = "/api/storage/objects/merchants/1/assets/abc";
    it("saves receipts from this business's own storage", async () => {
      await request(app).put("/api/purchase-orders/7/receipt-files").send({ receiptUrls: [own, own] }).expect(200);
      expect(updates[0]).toEqual({ receiptUrls: JSON.stringify([own]) });
    });
    it("refuses another business's file, a backup or a web link", async () => {
      for (const bad of ["/api/storage/objects/merchants/2/assets/x", "/api/storage/objects/backups/b", "https://example.com/r.pdf", "/api/storage/objects/merchants/1/../2/x"]) {
        await request(app).put("/api/purchase-orders/7/receipt-files").send({ receiptUrls: [bad] }).expect(400);
      }
      expect(updates).toHaveLength(0);
    });
    it("clears the list", async () => {
      await request(app).put("/api/purchase-orders/7/receipt-files").send({ receiptUrls: [] }).expect(200);
      expect(updates[0]).toEqual({ receiptUrls: null });
    });
  });
});
