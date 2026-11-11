import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

/**
 * Part payments as laybys (real DB; skipped without DATABASE_URL):
 *  - a layby payment counts in takings on the day it was taken, before the
 *    layby completes (view_layby_payment_legs);
 *  - cancelling with a refund records the refund as money out that day, and
 *    can't refund more than was paid or twice.
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

describe.skipIf(!hasDb)("layby takings (real DB)", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let db: any, t: any, orm: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  let app: express.Express;
  let productId = 0, customerId = 0;
  const laybyIds: number[] = [];
  // A method name no real sale uses, so the view sums only this test's rows.
  const METHOD = `lbtest${Date.now()}`;

  const legsToday = async () => {
    const r = await db.execute(orm.sql`
      SELECT COALESCE(SUM(amount), 0)::float AS total FROM view_layby_payment_legs
      WHERE merchant_id = ${h.merchantId} AND method = ${METHOD} AND completed_at::date = now()::date`);
    return Number(r.rows[0].total);
  };

  beforeAll(async () => {
    const dbmod = await import("@workspace/db");
    orm = await import("drizzle-orm");
    db = dbmod.db; t = dbmod;
    const [m] = await db.select({ id: t.merchantsTable.id }).from(t.merchantsTable).limit(1);
    h.merchantId = m.id;
    const [p] = await db.insert(t.productsTable).values({ merchantId: m.id, name: "Layby test", price: "600" }).returning();
    productId = p.id;
    const [c] = await db.insert(t.customersTable).values({ merchantId: m.id, firstName: "Layby", lastName: "Test" }).returning();
    customerId = c.id;
    const { default: laybysRouter } = await import("../routes/laybys");
    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use("/api", laybysRouter);
  });

  afterAll(async () => {
    if (!db) return;
    const { inArray, eq } = orm;
    if (laybyIds.length) {
      await db.delete(t.laybyPaymentsTable).where(inArray(t.laybyPaymentsTable.laybyId, laybyIds));
      await db.delete(t.laybysTable).where(inArray(t.laybysTable.id, laybyIds));
    }
    await db.delete(t.customersTable).where(eq(t.customersTable.id, customerId));
    await db.delete(t.productsTable).where(eq(t.productsTable.id, productId));
  });

  const start = async (deposit: number) => {
    const r = await request(app).post("/api/laybys").send({
      customerId, items: [{ productId, productName: "Layby test", quantity: 1, price: 600 }],
      totalAmount: 600, depositAmount: deposit, paymentMethod: METHOD,
    });
    expect(r.status).toBe(201);
    laybyIds.push(r.body.id);
    return r.body;
  };

  it("counts a deposit on the day it was taken, while the layby is still open", async () => {
    const before = await legsToday();
    const lb = await start(550);
    expect(lb.status).toBe("active");
    expect(await legsToday()).toBeCloseTo(before + 550, 2);
  });

  it("records a refund on cancel as money out today, once", async () => {
    const lb = await start(200);
    const before = await legsToday();
    expect((await request(app).post(`/api/laybys/${lb.id}/cancel`).send({ refundAmount: 250, refundMethod: METHOD })).status).toBe(400);
    expect((await request(app).post(`/api/laybys/${lb.id}/cancel`).send({ refundAmount: 50 })).status).toBe(400); // no method
    const r = await request(app).post(`/api/laybys/${lb.id}/cancel`).send({ refundAmount: 150, refundMethod: METHOD, reason: "test" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "cancelled", amountPaid: 50 });
    expect(await legsToday()).toBeCloseTo(before - 150, 2);
    expect((await request(app).post(`/api/laybys/${lb.id}/cancel`).send({ refundAmount: 50, refundMethod: METHOD })).status).toBe(400);
    expect(await legsToday()).toBeCloseTo(before - 150, 2);
  });

  it("cancels keeping the deposit when no refund is given", async () => {
    const lb = await start(100);
    const before = await legsToday();
    const r = await request(app).post(`/api/laybys/${lb.id}/cancel`).send({});
    expect(r.body).toMatchObject({ status: "cancelled", amountPaid: 100 });
    expect(await legsToday()).toBeCloseTo(before, 2);
  });
});
