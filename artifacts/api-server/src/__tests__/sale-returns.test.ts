import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import {
  buildReturnLine, defaultRefundMethod, loyaltyToTakeBack, nonReturnableReason, returnableLines, returnMethodError,
  type SaleLine,
} from "../lib/sale-returns";

/* Customer › History › Return / swap. A return refunds what was paid for the
   items, never more, can't take a line back twice, and moves stock, loyalty,
   spend and store credit in the same database transaction. */

const sale: SaleLine[] = [
  // 3 × $10 with a $1 line discount: paid $29 — $9.67 a unit.
  { productId: 1, productName: "Cable", quantity: 3, unitPrice: 10, totalPrice: 29, taxAmount: 2.64, costPrice: 4 },
  { productId: 2, productName: "Mouse", quantity: 1, unitPrice: 20, totalPrice: 20, taxAmount: 1.82 },
  { productId: 0, productName: "Gift Card", quantity: 1, unitPrice: 50, totalPrice: 50, giftCardIssue: true },
];

describe("return rules", () => {
  it("refunds what was paid, and the last unit takes the remainder so the parts sum exactly", () => {
    const first = buildReturnLine(sale, [], 0, 1, true);
    expect(first).toMatchObject({ quantity: -1, totalPrice: -9.67, returnOfLine: 0, restocked: true, costPrice: 4 });
    const second = buildReturnLine(sale, [[first]], 0, 2, false);
    expect(second.totalPrice).toBe(-19.33);
    expect(-(first.totalPrice + second.totalPrice)).toBeCloseTo(29, 10);
    expect(-((first.taxAmount ?? 0) + (second.taxAmount ?? 0))).toBeCloseTo(2.64, 10);
  });

  it("never takes a line back twice", () => {
    const all = buildReturnLine(sale, [], 1, 1, true);
    expect(() => buildReturnLine(sale, [[all]], 1, 1, true)).toThrow(/only 0 left/);
    const lines = returnableLines(sale, [[all]]);
    expect(lines[1]).toMatchObject({ returned: 1, remaining: 0, blockedReason: "Already returned" });
    expect(lines[0]).toMatchObject({ remaining: 3, unitRefund: 9.67, blockedReason: null });
  });

  it("won't return gift cards, deposits, digital codes or custom lines", () => {
    expect(nonReturnableReason(sale[2]!)).toMatch(/Gift cards/);
    expect(nonReturnableReason({ productId: 0, quantity: 1, totalPrice: 5, preOrderDeposit: { productId: 3, quantity: 1 } })).toMatch(/deposit/i);
    expect(nonReturnableReason({ productId: 5, quantity: 1, totalPrice: 5, digitalCodes: ["X"] })).toMatch(/Digital/);
    expect(() => buildReturnLine(sale, [], 2, 1, true)).toThrow(/Gift cards/);
  });

  it("takes back loyalty in proportion to the refund", () => {
    expect(loyaltyToTakeBack(4.9, 29, 49)).toBe(2.9);
    expect(loyaltyToTakeBack(49, 29, 49)).toBe(29); // whole points stay whole
    expect(loyaltyToTakeBack(0, 29, 49)).toBe(0);
  });

  it("settles by the sale's own method where it can", () => {
    expect(defaultRefundMethod("eftpos")).toBe("eftpos");
    expect(defaultRefundMethod("split")).toBe("store_credit");
    expect(defaultRefundMethod("gift_card")).toBe("store_credit");
    expect(returnMethodError("cash")).toBeNull();
    expect(returnMethodError("loyalty")).toMatch(/can't/);
  });
});

/* ── Route, against the real database ──────────────────────────────────── */

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

describe.skipIf(!hasDb)("return route (real DB)", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let db: any, t: any, orm: any, app: express.Express;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const created = { tx: [] as number[], products: [] as number[], customers: [] as number[] };
  let cable = 0, mouse = 0, customerId = 0, saleId = 0;

  const stock = async (id: number) => (await db.select().from(t.productsTable).where(orm.eq(t.productsTable.id, id)))[0].stockQuantity;
  const cust = async () => (await db.select().from(t.customersTable).where(orm.eq(t.customersTable.id, customerId)))[0];
  const credit = async () => {
    const [r] = await db.select({ b: orm.sql`COALESCE(SUM(${t.storeCreditLedgerTable.amount}),0)` })
      .from(t.storeCreditLedgerTable).where(orm.eq(t.storeCreditLedgerTable.customerId, customerId));
    return Math.round(parseFloat(String(r.b)) * 100) / 100;
  };

  beforeAll(async () => {
    t = await import("@workspace/db");
    db = t.db;
    orm = await import("drizzle-orm");
    const [m] = await db.select({ id: t.merchantsTable.id }).from(t.merchantsTable).limit(1);
    h.merchantId = m.id;
    const [a] = await db.insert(t.productsTable).values({ merchantId: m.id, name: "Return test cable", price: "10", costPrice: "4", stockQuantity: 5, trackInventory: "true" }).returning();
    const [b] = await db.insert(t.productsTable).values({ merchantId: m.id, name: "Return test mouse", price: "25", taxRate: "10", stockQuantity: 5, trackInventory: "true" }).returning();
    cable = a.id; mouse = b.id;
    created.products.push(a.id, b.id);
    const [c] = await db.insert(t.customersTable).values({ merchantId: m.id, firstName: "Return", lastName: "Test", loyaltyPoints: "5", totalSpent: "29" }).returning();
    customerId = c.id;
    created.customers.push(c.id);
    const [s] = await db.insert(t.transactionsTable).values({
      merchantId: m.id, customerId, receiptNumber: `RTEST${Date.now()}`, status: "completed",
      subtotal: "29", taxTotal: "2.64", total: "29", paymentMethod: "cash", loyaltyEarned: "2.9",
      items: [{ productId: cable, productName: "Return test cable", quantity: 3, unitPrice: 10, totalPrice: 29, taxAmount: 2.64, costPrice: 4 }],
    }).returning();
    saleId = s.id;
    created.tx.push(s.id);
    const { default: router } = await import("../routes/transactions");
    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use("/api", router);
  });

  afterAll(async () => {
    if (!db) return;
    const { inArray } = orm;
    const returns = await db.select({ id: t.transactionsTable.id }).from(t.transactionsTable).where(orm.eq(t.transactionsTable.returnOfTransactionId, saleId));
    const ids = [...created.tx, ...returns.map((r: { id: number }) => r.id)];
    await db.delete(t.storeCreditLedgerTable).where(orm.eq(t.storeCreditLedgerTable.customerId, customerId));
    await db.delete(t.productOversellLedgerTable).where(inArray(t.productOversellLedgerTable.productId, created.products));
    await db.delete(t.transactionsTable).where(inArray(t.transactionsTable.id, ids));
    await db.delete(t.customersTable).where(inArray(t.customersTable.id, created.customers));
    await db.delete(t.productsTable).where(inArray(t.productsTable.id, created.products));
    await t.pool.end();
  });

  it("returns 1 of 3 for cash: restocks, takes back loyalty and spend, records a negative transaction", async () => {
    const res = await request(app).post(`/api/transactions/${saleId}/return`)
      .send({ lines: [{ index: 0, quantity: 1, restock: true }], method: "cash", reason: "Wrong colour" }).expect(201);
    expect(res.body).toMatchObject({ total: -9.67, paymentMethod: "cash", returnOfTransactionId: saleId, status: "completed" });
    expect(res.body.items[0]).toMatchObject({ quantity: -1, totalPrice: -9.67, returnOfLine: 0, restocked: true });
    expect(await stock(cable)).toBe(6);
    const c = await cust();
    expect(parseFloat(c.totalSpent)).toBeCloseTo(19.33, 2);
    expect(parseFloat(c.loyaltyPoints)).toBeCloseTo(5 - 0.97, 2); // 2.9 × 9.67/29

    const r = await request(app).get(`/api/transactions/${saleId}/returnable`).expect(200);
    expect(r.body.lines[0]).toMatchObject({ returned: 1, remaining: 2 });
    expect(r.body.returns).toHaveLength(1);
  });

  it("swaps one for a dearer mouse paid partly from store credit, without restocking a faulty cable", async () => {
    await db.insert(t.storeCreditLedgerTable).values({ merchantId: h.merchantId, customerId, type: "issue", amount: "20", balanceAfter: "20", note: "test" });
    const res = await request(app).post(`/api/transactions/${saleId}/return`)
      .send({ lines: [{ index: 0, quantity: 1, restock: false }], newItems: [{ productId: mouse, quantity: 1 }], method: "store_credit" }).expect(201);
    expect(res.body.total).toBeCloseTo(25 - 9.67, 2);
    expect(await stock(cable)).toBe(6);  // faulty: not restocked
    expect(await stock(mouse)).toBe(4);  // swapped out
    expect(await credit()).toBeCloseTo(20 - 15.33, 2);
  });

  it("refuses returning more than is left, and refunding or voiding the sale whole", async () => {
    await request(app).post(`/api/transactions/${saleId}/return`)
      .send({ lines: [{ index: 0, quantity: 2, restock: true }], method: "cash" }).expect(409);
    await request(app).post(`/api/transactions/${saleId}/refund`).send({ reason: "x" }).expect(409);
    await request(app).post(`/api/transactions/${saleId}/void`).send({ reason: "x" }).expect(409);
  });

  it("refunds the last unit to the cent, and is idempotent on retry", async () => {
    const body = { lines: [{ index: 0, quantity: 1, restock: true }], method: "store_credit", idempotencyKey: `k-${saleId}` };
    const first = await request(app).post(`/api/transactions/${saleId}/return`).send(body).expect(201);
    const again = await request(app).post(`/api/transactions/${saleId}/return`).send(body).expect(201);
    expect(again.body.id).toBe(first.body.id);
    expect(first.body.total).toBe(-9.66); // 29 − 9.67 − 9.67
    const r = await request(app).get(`/api/transactions/${saleId}/returnable`).expect(200);
    expect(r.body.lines[0]).toMatchObject({ remaining: 0, blockedReason: "Already returned" });
  });
});
