import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

// Capture the values passed to every db.insert(...).values(...) so we can assert
// exactly what payment fields the create handler writes to the purchase_orders row.
const insertCalls: any[] = [];

vi.mock("@workspace/db", () => {
  // A select/update chain that resolves to [] for any awaited query.
  const chain: any = new Proxy({} as any, {
    get(_t, k) {
      if (k === "then") return (res: any) => Promise.resolve([]).then(res);
      if (k === "catch") return () => chain;
      if (k === "finally") return () => chain;
      return () => chain;
    },
  });
  const tableProxy = new Proxy({} as any, { get: () => tableProxy });
  const db = {
    select: () => chain,
    update: () => chain,
    insert: (_table: any) => ({
      values: (v: any) => {
        insertCalls.push(v);
        return {
          returning: async () => [
            { id: 1, poNumber: typeof v?.poNumber === "string" ? v.poNumber : "KP00001", createdAt: new Date(), ...v },
          ],
        };
      },
    }),
  };
  return {
    db,
    purchaseOrdersTable: tableProxy,
    purchaseOrderItemsTable: tableProxy,
    purchaseOrderReceiptsTable: tableProxy,
    suppliersTable: tableProxy,
    merchantsTable: tableProxy,
    productsTable: tableProxy,
    productPriceHistoryTable: tableProxy,
    productSerialsTable: tableProxy,
  };
});

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  invalidateMerchantStatusCache: () => {},
}));

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

beforeEach(() => { insertCalls.length = 0; });

// The first insert in the create handler is always the purchase_orders row.
const poRow = () => insertCalls[0];

const baseBody = {
  poNumber: "KP99999", // supplied → skips the auto-number select/retry path
  orderDate: "2026-07-24",
  // One item with no productId so cost-price sync / serial handling are skipped:
  // itemsSubtotal = 2 * 10 = 20, no delivery → totalCost = 20.
  items: [{ productName: "Widget", quantity: 2, unitCost: 10 }],
};

describe("POST /api/purchase-orders — supplier payment at creation", () => {
  it("records a full payment (payFull) as paid with a paidAt timestamp", async () => {
    const res = await request(app)
      .post("/api/purchase-orders")
      .send({ ...baseBody, payFull: true, paymentMethod: "bank_transfer" });
    expect(res.status).toBe(201);
    const po = poRow();
    expect(po.totalCost).toBe("20");
    expect(po.amountPaid).toBe("20");
    expect(po.paymentStatus).toBe("paid");
    expect(po.paymentMethod).toBe("bank_transfer");
    expect(po.paidAt).toBeInstanceOf(Date);
  });

  it("records a partial payment as partial with no paidAt", async () => {
    const res = await request(app)
      .post("/api/purchase-orders")
      .send({ ...baseBody, paymentAmount: 5, paymentMethod: "cash" });
    expect(res.status).toBe(201);
    const po = poRow();
    expect(po.amountPaid).toBe("5");
    expect(po.paymentStatus).toBe("partial");
    expect(po.paymentMethod).toBe("cash");
    expect(po.paidAt).toBeNull();
  });

  it("clamps an overpayment down to the total and marks it paid", async () => {
    const res = await request(app)
      .post("/api/purchase-orders")
      .send({ ...baseBody, paymentAmount: 999, paymentMethod: "card" });
    expect(res.status).toBe(201);
    const po = poRow();
    expect(po.amountPaid).toBe("20");
    expect(po.paymentStatus).toBe("paid");
    expect(po.paidAt).toBeInstanceOf(Date);
  });

  it("defaults to unpaid when no payment is supplied", async () => {
    const res = await request(app).post("/api/purchase-orders").send(baseBody);
    expect(res.status).toBe(201);
    const po = poRow();
    expect(po.amountPaid).toBe("0");
    expect(po.paymentStatus).toBe("unpaid");
    expect(po.paymentMethod).toBeNull();
    expect(po.paidAt).toBeNull();
  });
});
