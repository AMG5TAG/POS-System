import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

/**
 * Partial-payment + reversal flow for invoices, exercised end-to-end against the
 * real database (unlike the validation-only route suites, which mock @workspace/db).
 * Skips cleanly when no DATABASE_URL is configured (e.g. CI without a DB), and
 * reuses an existing merchant — merchant accounts can't be hard-deleted — while
 * creating and cleaning up its own customer/product/invoice.
 */

const hasDb = !!process.env.DATABASE_URL;

// requireAuth stamps the request with the test merchant id. The id isn't known
// until beforeAll creates fixtures, so it lives in a hoisted, mutable holder.
const h = vi.hoisted(() => ({ merchantId: 0 }));
vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as express.Request & { session: { merchantId?: number } }).session.merchantId = h.merchantId;
    next();
  },
  invalidateMerchantStatusCache: () => {},
}));

describe.skipIf(!hasDb)("invoices — partial payments & reversal (real DB)", () => {
  let app: express.Express;
  // Captured so assertions can re-read DB state and afterAll can clean up.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let db: any;
  let invoicesTable: any, customersTable: any, productsTable: any, merchantsTable: any;
  let eq: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  let invoiceId = 0;
  let customerId = 0;
  let productId = 0;

  const STOCK_START = 10;
  const LINE_QTY = 2;
  const TOTAL = 100;

  const reloadInvoice = async () => (await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId)))[0];
  const reloadProduct = async () => (await db.select().from(productsTable).where(eq(productsTable.id, productId)))[0];
  const reloadCustomer = async () => (await db.select().from(customersTable).where(eq(customersTable.id, customerId)))[0];

  beforeAll(async () => {
    const dbmod = await import("@workspace/db");
    const orm = await import("drizzle-orm");
    db = dbmod.db;
    invoicesTable = dbmod.invoicesTable;
    customersTable = dbmod.customersTable;
    productsTable = dbmod.productsTable;
    merchantsTable = dbmod.merchantsTable;
    eq = orm.eq;

    const [merchant] = await db.select({ id: merchantsTable.id }).from(merchantsTable).limit(1);
    if (!merchant) throw new Error("No merchant in DB to attach test fixtures to");
    h.merchantId = merchant.id;

    const [customer] = await db.insert(customersTable).values({
      merchantId: merchant.id, firstName: "Partial", lastName: "Test",
    }).returning();
    customerId = customer.id;

    const [product] = await db.insert(productsTable).values({
      merchantId: merchant.id, name: "Partial Pay Test Item",
      price: "50", trackInventory: "true", stockQuantity: STOCK_START,
    }).returning();
    productId = product.id;

    const [invoice] = await db.insert(invoicesTable).values({
      merchantId: merchant.id,
      customerId,
      invoiceNumber: `TEST-PP-${Date.now()}`,
      status: "sent",
      subtotal: String(TOTAL),
      taxTotal: "0",
      total: String(TOTAL),
      amountPaid: "0",
      items: [{ description: "Partial Pay Test Item", quantity: LINE_QTY, unitPrice: 50, taxRate: 0, productId }],
    }).returning();
    invoiceId = invoice.id;

    const { default: invoicesRouter } = await import("../routes/invoices");
    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use("/api", invoicesRouter);
  });

  afterAll(async () => {
    if (!db) return;
    if (invoiceId) await db.delete(invoicesTable).where(eq(invoicesTable.id, invoiceId));
    if (productId) await db.delete(productsTable).where(eq(productsTable.id, productId));
    if (customerId) await db.delete(customersTable).where(eq(customersTable.id, customerId));
    await (await import("@workspace/db")).pool.end();
  });

  it("records a partial payment → status 'partial'", async () => {
    const res = await request(app).post(`/api/invoices/${invoiceId}/payment`).send({ amount: 40, method: "cash" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("partial");
    expect(res.body.amountPaid).toBe(40);

    // A partial payment does not settle the sale: stock and spend are untouched.
    expect((await reloadProduct()).stockQuantity).toBe(STOCK_START);
    expect(parseFloat((await reloadCustomer()).totalSpent)).toBe(0);
  });

  it("a second payment settles the invoice → status 'paid' + side effects applied", async () => {
    const res = await request(app).post(`/api/invoices/${invoiceId}/payment`).send({ amount: 60, method: "cash" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("paid");
    expect(res.body.amountPaid).toBe(TOTAL);
    expect(res.body.paidAt).toBeTruthy();

    // Settling in full treats the invoice like a sale: stock deducts, spend rolls up.
    expect((await reloadProduct()).stockQuantity).toBe(STOCK_START - LINE_QTY);
    const cust = await reloadCustomer();
    expect(parseFloat(cust.totalSpent)).toBe(TOTAL);
    expect(cust.visitCount).toBe(1);
  });

  it("reversing a payment drops it back out of 'paid' and restores side effects", async () => {
    // Target the most recent payment leg so the reversal references a real event.
    const before = await reloadInvoice();
    const lastPayment = [...(before.events as { id?: string; type: string }[])].reverse().find((e) => e.type === "payment");

    const res = await request(app).post(`/api/invoices/${invoiceId}/payment/reverse`)
      .send({ amount: 30, eventId: lastPayment?.id, reason: "entered wrong amount" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("partial");
    expect(res.body.amountPaid).toBe(TOTAL - 30);
    expect(res.body.paidAt).toBeNull();

    // No longer fully paid → stock restored, spend + loyalty backed out.
    expect((await reloadProduct()).stockQuantity).toBe(STOCK_START);
    const cust = await reloadCustomer();
    expect(parseFloat(cust.totalSpent)).toBe(0);
    expect(cust.visitCount).toBe(0);
    expect(cust.loyaltyPoints).toBe(0);

    // The reversal is recorded as a negative-amount event in the trail.
    const reversal = (res.body.events as { type: string; amount: number }[]).find((e) => e.type === "payment-reversal");
    expect(reversal).toBeTruthy();
    expect(reversal!.amount).toBe(-30);
  });

  it("rejects a reversal larger than the amount paid", async () => {
    const res = await request(app).post(`/api/invoices/${invoiceId}/payment/reverse`).send({ amount: 9999 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exceeds the amount paid/i);
  });

  it("rejects a non-positive reversal amount", async () => {
    const res = await request(app).post(`/api/invoices/${invoiceId}/payment/reverse`).send({ amount: 0 });
    expect(res.status).toBe(400);
  });

  it("returns 404 when reversing a payment on a missing invoice", async () => {
    const res = await request(app).post(`/api/invoices/999999999/payment/reverse`).send({ amount: 10 });
    expect(res.status).toBe(404);
  });

  // Backdated settlement — the direct-deposit "date paid" flow. Uses its own
  // invoice so it doesn't disturb the partial/reversal fixture above, and cleans
  // it up here (the outer afterAll owns the shared pool).
  describe("backdated paidAt for direct-deposit settlement", () => {
    let bdInvoiceId = 0;

    beforeAll(async () => {
      const [invoice] = await db.insert(invoicesTable).values({
        merchantId: h.merchantId,
        customerId,
        invoiceNumber: `TEST-BD-${Date.now()}`,
        status: "sent",
        subtotal: "200", taxTotal: "0", total: "200", amountPaid: "0",
        items: [{ description: "Consulting", quantity: 1, unitPrice: 200, taxRate: 0 }],
      }).returning();
      bdInvoiceId = invoice.id;
    });

    afterAll(async () => {
      if (bdInvoiceId) await db.delete(invoicesTable).where(eq(invoicesTable.id, bdInvoiceId));
    });

    it("rejects a future paidAt date", async () => {
      const future = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
      const res = await request(app).post(`/api/invoices/${bdInvoiceId}/payment`)
        .send({ amount: 200, method: "direct_deposit", paidAt: future });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/future/i);
    });

    it("rejects an unparseable paidAt date", async () => {
      const res = await request(app).post(`/api/invoices/${bdInvoiceId}/payment`)
        .send({ amount: 200, method: "direct_deposit", paidAt: "not-a-date" });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid paidat/i);
    });

    it("books the settlement to the supplied date (paidAt + event timestamp)", async () => {
      const res = await request(app).post(`/api/invoices/${bdInvoiceId}/payment`)
        .send({ amount: 200, method: "direct_deposit", paidAt: "2026-06-15" });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("paid");

      // paidAt lands on the chosen calendar day (stored noon UTC → date-safe).
      expect(new Date(res.body.paidAt).toISOString().slice(0, 10)).toBe("2026-06-15");

      // The reporting view keys the sale off paid_at::date — confirm at the DB level.
      const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, bdInvoiceId));
      expect(inv.paidAt.toISOString().slice(0, 10)).toBe("2026-06-15");

      // The payment leg's own timestamp is stamped with the chosen date too.
      const leg = (inv.events as { type: string; timestamp: string }[]).find((e) => e.type === "payment");
      expect(leg!.timestamp.slice(0, 10)).toBe("2026-06-15");
    });
  });

  // Cost-price snapshot on create. Products whose catalog cost is 0/unset (e.g. an
  // item that also had no sell price, so the POS prompts the cashier to price it at
  // invoicing time) must keep the cost the cashier entered — otherwise COGS/margin
  // reports, which read the stored line costPrice, would show $0 cost / 100% margin.
  // A product WITH a real catalog cost stays server-authoritative.
  describe("line cost snapshot honours entered cost when catalog cost is 0", () => {
    let zeroCostProductId = 0;
    let realCostProductId = 0;
    let createdInvoiceId = 0;

    beforeAll(async () => {
      const [zeroCost] = await db.insert(productsTable).values({
        merchantId: h.merchantId, name: "No-price item", price: "0", costPrice: "0",
      }).returning();
      zeroCostProductId = zeroCost.id;
      const [realCost] = await db.insert(productsTable).values({
        merchantId: h.merchantId, name: "Costed item", price: "0", costPrice: "8",
      }).returning();
      realCostProductId = realCost.id;
    });

    afterAll(async () => {
      if (createdInvoiceId) await db.delete(invoicesTable).where(eq(invoicesTable.id, createdInvoiceId));
      if (zeroCostProductId) await db.delete(productsTable).where(eq(productsTable.id, zeroCostProductId));
      if (realCostProductId) await db.delete(productsTable).where(eq(productsTable.id, realCostProductId));
    });

    it("keeps entered cost for a 0-catalog-cost product, but catalog cost wins when set", async () => {
      const res = await request(app).post("/api/invoices").send({
        customerId,
        items: [
          // Zero catalog cost + cashier-entered cost 5 → keep 5.
          { description: "No-price item", quantity: 2, unitPrice: 20, taxRate: 0, productId: zeroCostProductId, costPrice: 5 },
          // Real catalog cost 8 overrides the client-sent 5 → 8.
          { description: "Costed item", quantity: 1, unitPrice: 30, taxRate: 0, productId: realCostProductId, costPrice: 5 },
          // Free-text line (no productId) keeps its client cost.
          { description: "Labour", quantity: 1, unitPrice: 40, taxRate: 0, costPrice: 3 },
        ],
      });
      expect(res.status).toBe(201);
      createdInvoiceId = res.body.id;

      const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, createdInvoiceId));
      const items = inv.items as { productId?: number; costPrice?: number }[];
      expect(items.find((l) => l.productId === zeroCostProductId)!.costPrice).toBe(5);
      expect(items.find((l) => l.productId === realCostProductId)!.costPrice).toBe(8);
      expect(items.find((l) => l.description === "Labour")!.costPrice).toBe(3);
    });
  });
});
