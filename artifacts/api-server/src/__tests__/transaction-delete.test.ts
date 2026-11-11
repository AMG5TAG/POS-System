import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

/**
 * DELETE /transactions/:id against the real database (skipped without
 * DATABASE_URL). A sale was un-deletable whenever a payment attempt, a converted
 * quote or the oversell ledger pointed at it — the foreign key refused and the
 * page said only "Failed to delete". Now: only a voided/refunded sale may be
 * deleted, and those links are cleared (rows kept) in the same DB transaction.
 */
const hasDb = !!process.env.DATABASE_URL;
const h = vi.hoisted(() => ({ merchantId: 0, role: "owner" }));
vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const s = (req as unknown as { session: Record<string, unknown> }).session;
    s.merchantId = h.merchantId;
    s.staffRole = h.role;
    next();
  },
  invalidateMerchantStatusCache: () => {},
  invalidateStaffStatusCache: () => {},
  destroyStaffEmailSessions: async () => {},
}));
vi.mock("../services/email", () => ({ sendEmail: vi.fn().mockResolvedValue(undefined), sendSystemEmail: vi.fn() }));

describe.skipIf(!hasDb)("deleting a sale (real DB)", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let db: any, t: any, orm: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  let app: express.Express;
  const made = { tx: [] as number[], attempts: [] as number[], quotes: [] as number[], products: [] as number[], ledger: [] as number[] };
  const stamp = `DELTEST-${Date.now()}`;

  const newSale = async (status: string) => {
    const [tx] = await db.insert(t.transactionsTable).values({
      merchantId: h.merchantId, receiptNumber: `${stamp}-${made.tx.length}`, status, total: "10", subtotal: "10",
    }).returning();
    made.tx.push(tx.id);
    return tx;
  };

  beforeAll(async () => {
    const dbmod = await import("@workspace/db");
    orm = await import("drizzle-orm");
    db = dbmod.db;
    t = dbmod;
    const [merchant] = await db.select({ id: t.merchantsTable.id }).from(t.merchantsTable).limit(1);
    if (!merchant) throw new Error("No merchant in DB to attach test fixtures to");
    h.merchantId = merchant.id;
    const { default: transactionsRouter } = await import("../routes/transactions");
    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use("/api", transactionsRouter);
  });

  afterAll(async () => {
    if (!db) return;
    const { inArray } = orm;
    if (made.ledger.length) await db.delete(t.productOversellLedgerTable).where(inArray(t.productOversellLedgerTable.id, made.ledger));
    if (made.attempts.length) await db.delete(t.paymentAttemptsTable).where(inArray(t.paymentAttemptsTable.id, made.attempts));
    if (made.quotes.length) await db.delete(t.quotesTable).where(inArray(t.quotesTable.id, made.quotes));
    if (made.tx.length) await db.delete(t.transactionsTable).where(inArray(t.transactionsTable.id, made.tx));
    if (made.products.length) await db.delete(t.productsTable).where(inArray(t.productsTable.id, made.products));
  });

  it("refuses a completed sale — void or refund it first", async () => {
    const tx = await newSale("completed");
    const r = await request(app).delete(`/api/transactions/${tx.id}`);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("void_before_delete");
    const [still] = await db.select().from(t.transactionsTable).where(orm.eq(t.transactionsTable.id, tx.id));
    expect(still).toBeTruthy();
  });

  it("refuses anyone but the owner", async () => {
    const tx = await newSale("voided");
    h.role = "manager";
    try {
      expect((await request(app).delete(`/api/transactions/${tx.id}`)).status).toBe(403);
    } finally { h.role = "owner"; }
  });

  it("deletes a voided sale that other records point at, keeping those records", async () => {
    const tx = await newSale("voided");
    const [attempt] = await db.insert(t.paymentAttemptsTable).values({
      merchantId: h.merchantId, provider: "test", orderRef: `${stamp}-pa`, amount: "10", salePayload: {}, transactionId: tx.id,
    }).returning();
    made.attempts.push(attempt.id);
    const [quote] = await db.insert(t.quotesTable).values({
      merchantId: h.merchantId, quoteNumber: `${stamp}-Q`, status: "converted", convertedTransactionId: tx.id,
    }).returning();
    made.quotes.push(quote.id);
    const [p] = await db.insert(t.productsTable).values({ merchantId: h.merchantId, name: "Delete test", price: "10" }).returning();
    made.products.push(p.id);
    const [led] = await db.insert(t.productOversellLedgerTable).values({
      merchantId: h.merchantId, productId: p.id, transactionId: tx.id, receiptNumber: tx.receiptNumber, quantity: 1, remaining: 0,
    }).returning();
    made.ledger.push(led.id);

    expect((await request(app).delete(`/api/transactions/${tx.id}`)).status).toBe(204);

    const { eq } = orm;
    expect(await db.select().from(t.transactionsTable).where(eq(t.transactionsTable.id, tx.id))).toHaveLength(0);
    const [a] = await db.select().from(t.paymentAttemptsTable).where(eq(t.paymentAttemptsTable.id, attempt.id));
    expect(a.transactionId).toBeNull();
    const [q] = await db.select().from(t.quotesTable).where(eq(t.quotesTable.id, quote.id));
    expect(q).toMatchObject({ convertedTransactionId: null, status: "converted" });
    const [l] = await db.select().from(t.productOversellLedgerTable).where(eq(t.productOversellLedgerTable.id, led.id));
    expect(l).toMatchObject({ transactionId: null, receiptNumber: tx.receiptNumber });
  });
});
