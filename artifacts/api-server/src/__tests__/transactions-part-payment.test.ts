import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

/**
 * KR67799: $550 keyed on EFTPOS against a larger total completed as paid in
 * full. EFTPOS/card/direct deposit below the total is now refused (the till
 * turns it into a split first); at the total, or with no amount, it records as
 * before. Real database (skipped without DATABASE_URL).
 */
const hasDb = !!process.env.DATABASE_URL;
vi.mock("../services/email", () => ({ sendEmail: vi.fn().mockResolvedValue(undefined), sendSystemEmail: vi.fn() }));
vi.mock("../services/lowStockAlertService", () => ({ maybeQueueImmediateAlert: vi.fn() }));

describe.skipIf(!hasDb)("part payments on exact tenders (real DB)", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let db: any, t: any, orm: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  let finalizeSale: typeof import("../routes/transactions")["finalizeSale"];
  let merchantId = 0, productId = 0;
  const createdTx: number[] = [];
  const PRICE = 600;

  const sale = (paymentMethod: string, amountTendered?: number) => ({
    items: [{ productId, productName: "Part-pay item", quantity: 1, unitPrice: PRICE, totalPrice: PRICE }],
    paymentMethod, subtotal: PRICE, taxTotal: 0, total: PRICE,
    ...(amountTendered !== undefined ? { amountTendered } : {}),
  }) as unknown as Parameters<typeof finalizeSale>[1];

  beforeAll(async () => {
    const dbmod = await import("@workspace/db");
    orm = await import("drizzle-orm");
    db = dbmod.db; t = dbmod;
    const [m] = await db.select({ id: t.merchantsTable.id }).from(t.merchantsTable).limit(1);
    merchantId = m.id;
    const [p] = await db.insert(t.productsTable).values({ merchantId, name: "Part-pay item", price: String(PRICE), taxRate: "0", trackInventory: "false" }).returning();
    productId = p.id;
    ({ finalizeSale } = await import("../routes/transactions"));
  });

  afterAll(async () => {
    if (!db) return;
    if (createdTx.length) await db.delete(t.transactionsTable).where(orm.inArray(t.transactionsTable.id, createdTx));
    await db.delete(t.productsTable).where(orm.eq(t.productsTable.id, productId));
  });

  it.each(["eftpos", "card", "direct_deposit"])("refuses %s below the total", async (method) => {
    const r = await finalizeSale(merchantId, sale(method, 550), []);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.code).toBe("underpaid");
      expect(r.error).toContain("50.00");
    }
  });

  it("records EFTPOS at the total, and with no amount sent, as paid in full", async () => {
    for (const tendered of [PRICE, undefined]) {
      const r = await finalizeSale(merchantId, sale("eftpos", tendered), []);
      expect(r.ok).toBe(true);
      if (r.ok) {
        createdTx.push(r.transaction.id);
        expect(parseFloat(r.transaction.amountTendered!)).toBe(PRICE);
      }
    }
  });
});
