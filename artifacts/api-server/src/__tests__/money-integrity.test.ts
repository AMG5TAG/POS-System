import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

/**
 * Money-integrity fixes from the security audit, against the real database
 * (skipped without DATABASE_URL). Each was a way to get value without paying:
 *  - store credit was a payment *label* — the balance never went down;
 *  - a trade-in could be paid out twice by a double-click;
 *  - toggling an invoice paid → sent → paid credited loyalty every time;
 *  - two tills could spend one loyalty balance at once.
 * Fixtures are created on an existing merchant and removed afterwards.
 */

const hasDb = !!process.env.DATABASE_URL;

const h = vi.hoisted(() => ({ merchantId: 0 }));
vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const s = (req as unknown as { session: Record<string, unknown> }).session;
    s.merchantId = h.merchantId;
    s.staffRole = "owner";
    next();
  },
  invalidateMerchantStatusCache: () => {},
  invalidateStaffStatusCache: () => {},
  destroyStaffEmailSessions: async () => {},
}));
vi.mock("../services/email", () => ({ sendEmail: vi.fn().mockResolvedValue(undefined), sendSystemEmail: vi.fn() }));
vi.mock("../services/lowStockAlertService", () => ({ maybeQueueImmediateAlert: vi.fn() }));

describe.skipIf(!hasDb)("money integrity (real DB)", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let db: any, t: any, orm: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  let app: express.Express;
  let finalizeSale: typeof import("../routes/transactions")["finalizeSale"];
  const created = { customers: [] as number[], products: [] as number[], tx: [] as number[], invoices: [] as number[], tradeIns: [] as number[] };

  const PRICE = 20;
  let productId = 0;

  const newCustomer = async (over: Record<string, unknown> = {}) => {
    const [c] = await db.insert(t.customersTable).values({ merchantId: h.merchantId, firstName: "Audit", lastName: "Test", ...over }).returning();
    created.customers.push(c.id);
    return c;
  };
  const creditBalance = async (customerId: number) => {
    const [r] = await db.select({ b: orm.sql`COALESCE(SUM(${t.storeCreditLedgerTable.amount}),0)` })
      .from(t.storeCreditLedgerTable).where(orm.eq(t.storeCreditLedgerTable.customerId, customerId));
    return Math.round(parseFloat(String(r.b)) * 100) / 100;
  };
  const sale = (customerId: number, over: Record<string, unknown> = {}) => ({
    customerId,
    items: [{ productId, productName: "Audit item", quantity: 1, unitPrice: PRICE, totalPrice: PRICE }],
    paymentMethod: "store_credit", subtotal: PRICE, taxTotal: 0, total: PRICE, ...over,
  }) as unknown as Parameters<typeof finalizeSale>[1];

  beforeAll(async () => {
    const dbmod = await import("@workspace/db");
    orm = await import("drizzle-orm");
    db = dbmod.db;
    t = dbmod;
    const [merchant] = await db.select({ id: t.merchantsTable.id }).from(t.merchantsTable).limit(1);
    if (!merchant) throw new Error("No merchant in DB to attach test fixtures to");
    h.merchantId = merchant.id;
    const [p] = await db.insert(t.productsTable).values({
      merchantId: merchant.id, name: "Audit item", price: String(PRICE), taxRate: "0", trackInventory: "false",
    }).returning();
    productId = p.id;
    created.products.push(p.id);

    ({ finalizeSale } = await import("../routes/transactions"));
    const { default: transactionsRouter } = await import("../routes/transactions");
    const { default: tradeInsRouter } = await import("../routes/trade-ins");
    const { default: invoicesRouter } = await import("../routes/invoices");
    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use("/api", transactionsRouter, tradeInsRouter, invoicesRouter);
  });

  afterAll(async () => {
    if (!db) return;
    const { eq, inArray } = orm;
    if (created.tx.length) {
      await db.delete(t.storeCreditLedgerTable).where(inArray(t.storeCreditLedgerTable.transactionId, created.tx));
      await db.delete(t.transactionsTable).where(inArray(t.transactionsTable.id, created.tx));
    }
    if (created.tradeIns.length) await db.delete(t.tradeInsTable).where(inArray(t.tradeInsTable.id, created.tradeIns));
    if (created.invoices.length) await db.delete(t.invoicesTable).where(inArray(t.invoicesTable.id, created.invoices));
    for (const id of created.customers) {
      await db.delete(t.storeCreditLedgerTable).where(eq(t.storeCreditLedgerTable.customerId, id));
      await db.delete(t.transactionsTable).where(eq(t.transactionsTable.customerId, id));
      await db.delete(t.customersTable).where(eq(t.customersTable.id, id));
    }
    if (created.products.length) await db.delete(t.productsTable).where(inArray(t.productsTable.id, created.products));
    await t.pool.end();
  });

  it("debits store credit when a sale is paid with it, and refuses a short balance", async () => {
    const c = await newCustomer();
    await db.insert(t.storeCreditLedgerTable).values({ merchantId: h.merchantId, customerId: c.id, type: "issue", amount: "30", balanceAfter: "30" });

    const first = await finalizeSale(h.merchantId, sale(c.id), []);
    expect(first.ok).toBe(true);
    if (first.ok) created.tx.push(first.transaction.id);
    expect(await creditBalance(c.id)).toBe(10);

    // $10 left can't pay for a $20 sale — this used to go through every time.
    const second = await finalizeSale(h.merchantId, sale(c.id), []).catch((e: { status?: number; message: string }) => e);
    expect("ok" in second ? second.ok : false).toBe(false);
    expect(await creditBalance(c.id)).toBe(10);
  });

  it("gives store credit back when the sale is refunded", async () => {
    const c = await newCustomer();
    await db.insert(t.storeCreditLedgerTable).values({ merchantId: h.merchantId, customerId: c.id, type: "issue", amount: "25", balanceAfter: "25" });
    const res = await finalizeSale(h.merchantId, sale(c.id), []);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    created.tx.push(res.transaction.id);
    expect(await creditBalance(c.id)).toBe(5);

    const refund = await request(app).post(`/api/transactions/${res.transaction.id}/refund`).send({ reason: "audit test" });
    expect(refund.status).toBe(200);
    expect(await creditBalance(c.id)).toBe(25);
  });

  it("debits only the store-credit leg of a split sale", async () => {
    const c = await newCustomer();
    await db.insert(t.storeCreditLedgerTable).values({ merchantId: h.merchantId, customerId: c.id, type: "issue", amount: "8", balanceAfter: "8" });
    const res = await finalizeSale(h.merchantId, sale(c.id, { paymentMethod: "split", storeCreditPayment: { amount: 8 } }), []);
    expect(res.ok).toBe(true);
    if (res.ok) created.tx.push(res.transaction.id);
    expect(await creditBalance(c.id)).toBe(0);
  });

  it("pays a trade-in out once, however many times Accept is pressed", async () => {
    const c = await newCustomer();
    const make = await request(app).post("/api/trade-ins").send({ deviceName: "Audit phone", valuationAmount: 50, customerId: c.id });
    expect(make.status).toBe(201);
    const ti = (make.body.items as Array<{ id: number; deviceName: string }>).find((x) => x.deviceName === "Audit phone")!;
    created.tradeIns.push(ti.id);

    const [a, b] = await Promise.all([
      request(app).post(`/api/trade-ins/${ti.id}/accept`).send({ payoutMethod: "store_credit" }),
      request(app).post(`/api/trade-ins/${ti.id}/accept`).send({ payoutMethod: "store_credit" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await creditBalance(c.id)).toBe(50);
  });

  it("refuses a negative trade-in valuation", async () => {
    const res = await request(app).post("/api/trade-ins").send({ deviceName: "Audit phone 2", valuationAmount: -100 });
    expect(res.status).toBe(400);
  });

  it("credits invoice loyalty once, not once per paid ↔ unpaid toggle", async () => {
    const c = await newCustomer({ loyaltyPoints: 0 });
    const [inv] = await db.insert(t.invoicesTable).values({
      merchantId: h.merchantId, customerId: c.id, invoiceNumber: `TEST-LOY-${Date.now()}`, status: "sent",
      subtotal: "100", taxTotal: "0", total: "100", amountPaid: "0",
      items: [{ description: "Audit work", quantity: 1, unitPrice: 100, taxRate: 0 }],
    }).returning();
    created.invoices.push(inv.id);
    const points = async () => Number((await db.select({ p: t.customersTable.loyaltyPoints }).from(t.customersTable).where(orm.eq(t.customersTable.id, c.id)))[0].p);

    expect((await request(app).patch(`/api/invoices/${inv.id}`).send({ status: "paid" })).status).toBe(200);
    const once = await points();
    expect((await request(app).patch(`/api/invoices/${inv.id}`).send({ status: "sent" })).status).toBe(200);
    expect(await points()).toBe(0);
    expect((await request(app).patch(`/api/invoices/${inv.id}`).send({ status: "paid" })).status).toBe(200);
    expect(await points()).toBe(once);
  });
});
