import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

/**
 * A purchase order created already received (status "Fully Received", the
 * received counts typed in on the first save) must put those units in stock.
 * It used to record `received` and leave stock at 0 — and since a later edit
 * moves stock only by the *change* in received, re-saving never fixed it.
 * Real DB; skipped without DATABASE_URL. Fixtures are removed afterwards.
 */

const hasDb = !!process.env.DATABASE_URL;

const h = vi.hoisted(() => ({ merchantId: 0 }));
vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { session: Record<string, unknown> }).session.merchantId = h.merchantId;
    next();
  },
}));
vi.mock("../services/email", () => ({ sendEmail: vi.fn() }));

describe.skipIf(!hasDb)("purchase orders move stock (real DB)", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let db: any, t: any, orm: any, app: express.Express;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  let tracked = 0;
  let untracked = 0;
  const poIds: number[] = [];

  const stockOf = async (id: number) => {
    const [p] = await db.select({ s: t.productsTable.stockQuantity }).from(t.productsTable).where(orm.eq(t.productsTable.id, id));
    return p.s as number;
  };

  beforeAll(async () => {
    t = await import("@workspace/db");
    db = t.db;
    orm = await import("drizzle-orm");
    const [m] = await db.select({ id: t.merchantsTable.id }).from(t.merchantsTable).limit(1);
    h.merchantId = m.id;
    const [a] = await db.insert(t.productsTable).values({ merchantId: h.merchantId, name: "PO stock test tracked", price: "10", stockQuantity: 0, trackInventory: "true" }).returning();
    const [b] = await db.insert(t.productsTable).values({ merchantId: h.merchantId, name: "PO stock test untracked", price: "10", stockQuantity: 0, trackInventory: "false" }).returning();
    tracked = a.id;
    untracked = b.id;
    const { default: router } = await import("../routes/purchase-orders");
    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use("/api", router);
  });

  afterAll(async () => {
    if (!db) return;
    const { inArray, eq } = orm;
    if (poIds.length) {
      await db.delete(t.productPriceHistoryTable).where(inArray(t.productPriceHistoryTable.productId, [tracked, untracked]));
      await db.delete(t.purchaseOrderItemsTable).where(inArray(t.purchaseOrderItemsTable.poId, poIds));
      await db.delete(t.purchaseOrderReceiptsTable).where(inArray(t.purchaseOrderReceiptsTable.poId, poIds));
      await db.delete(t.purchaseOrdersTable).where(inArray(t.purchaseOrdersTable.id, poIds));
    }
    await db.delete(t.productOversellLedgerTable).where(inArray(t.productOversellLedgerTable.productId, [tracked, untracked]));
    for (const id of [tracked, untracked]) await db.delete(t.productsTable).where(eq(t.productsTable.id, id));
    await t.pool.end();
  });

  it("adds the received units of a PO created as Fully Received", async () => {
    const res = await request(app).post("/api/purchase-orders").send({
      status: "Fully Received", orderDate: "2026-11-10", poNumber: `TEST-STOCK-${Date.now()}`,
      items: [
        { productId: tracked, productName: "PO stock test tracked", quantity: 5, received: 5, unitCost: 2 },
        { productId: untracked, productName: "PO stock test untracked", quantity: 3, received: 3, unitCost: 2 },
        { productName: "Free-text line", quantity: 1, received: 1, unitCost: 1 },
      ],
    }).expect(201);
    poIds.push(res.body.id);
    expect(await stockOf(tracked)).toBe(5);
    expect(await stockOf(untracked)).toBe(0); // doesn't track inventory
  });

  it("adds nothing for a PO created with nothing received", async () => {
    const res = await request(app).post("/api/purchase-orders").send({
      status: "Ordered", orderDate: "2026-11-10", poNumber: `TEST-STOCK-B-${Date.now()}`,
      items: [{ productId: tracked, productName: "PO stock test tracked", quantity: 4, unitCost: 2 }],
    }).expect(201);
    poIds.push(res.body.id);
    expect(await stockOf(tracked)).toBe(5);
  });

  it("an edit then moves stock only by the change, so nothing is counted twice", async () => {
    const id = poIds[0]!;
    await request(app).put(`/api/purchase-orders/${id}`).send({
      status: "Fully Received", orderDate: "2026-11-10",
      items: [{ productId: tracked, productName: "PO stock test tracked", quantity: 6, received: 6, unitCost: 2 }],
    }).expect(200);
    expect(await stockOf(tracked)).toBe(6);
  });
});
