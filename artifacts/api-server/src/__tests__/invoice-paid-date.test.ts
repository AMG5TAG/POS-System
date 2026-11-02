import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

/**
 * Changing a paid invoice's paid date (POST /invoices/:id/paid-date). paidAt is
 * the sale date every revenue report files the invoice under, so the change
 * needs a reason, is recorded in the invoice's activity, and is a manager's
 * call. Real DB; skipped without DATABASE_URL.
 */

const hasDb = !!process.env.DATABASE_URL;

const h = vi.hoisted(() => ({ merchantId: 0, role: "owner" }));
vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    const s = (req as unknown as { session: { merchantId?: number; staffRole?: string } }).session;
    s.merchantId = h.merchantId;
    s.staffRole = h.role;
    next();
  },
  invalidateMerchantStatusCache: () => {},
}));

describe.skipIf(!hasDb)("invoices — change paid date (real DB)", () => {
  let app: express.Express;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let db: any, invoicesTable: any, eq: any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  let paidId = 0;
  let sentId = 0;
  const ORIGINAL = new Date("2026-10-20T03:00:00Z");

  const reload = async (id: number) => (await db.select().from(invoicesTable).where(eq(invoicesTable.id, id)))[0];

  beforeAll(async () => {
    const dbmod = await import("@workspace/db");
    db = dbmod.db;
    invoicesTable = dbmod.invoicesTable;
    eq = (await import("drizzle-orm")).eq;
    const [merchant] = await db.select({ id: dbmod.merchantsTable.id }).from(dbmod.merchantsTable).limit(1);
    if (!merchant) throw new Error("No merchant in DB to attach test fixtures to");
    h.merchantId = merchant.id;

    const base = { merchantId: merchant.id, subtotal: "100", taxTotal: "0", total: "100", items: [] };
    [{ id: paidId }] = await db.insert(invoicesTable).values({
      ...base, invoiceNumber: `TEST-PD-${Date.now()}`, status: "paid", amountPaid: "100", paidAt: ORIGINAL,
    }).returning();
    [{ id: sentId }] = await db.insert(invoicesTable).values({
      ...base, invoiceNumber: `TEST-PD-S-${Date.now()}`, status: "sent", amountPaid: "0",
    }).returning();

    const { default: invoicesRouter } = await import("../routes/invoices");
    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use("/api", invoicesRouter);
  });

  afterAll(async () => {
    if (!db) return;
    for (const id of [paidId, sentId]) if (id) await db.delete(invoicesTable).where(eq(invoicesTable.id, id));
    await (await import("@workspace/db")).pool.end();
  });

  it("refuses without a reason, and leaves the date alone", async () => {
    for (const body of [{ paidAt: "2026-10-15" }, { paidAt: "2026-10-15", reason: "   " }]) {
      const res = await request(app).post(`/api/invoices/${paidId}/paid-date`).send(body);
      expect(res.status).toBe(400);
    }
    expect((await reload(paidId)).paidAt.toISOString()).toBe(ORIGINAL.toISOString());
  });

  it("refuses a future or invalid date", async () => {
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    expect((await request(app).post(`/api/invoices/${paidId}/paid-date`).send({ paidAt: future, reason: "x" })).status).toBe(400);
    expect((await request(app).post(`/api/invoices/${paidId}/paid-date`).send({ paidAt: "not a date", reason: "x" })).status).toBe(400);
  });

  it("refuses an invoice that is not fully paid", async () => {
    const res = await request(app).post(`/api/invoices/${sentId}/paid-date`).send({ paidAt: "2026-10-15", reason: "bank transfer" });
    expect(res.status).toBe(400);
    expect((await reload(sentId)).paidAt).toBeNull();
  });

  it("needs a manager (or a manager PIN) — a cashier is asked for approval", async () => {
    h.role = "cashier";
    try {
      const res = await request(app).post(`/api/invoices/${paidId}/paid-date`).send({ paidAt: "2026-10-15", reason: "bank transfer" });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("manager_approval_required");
    } finally { h.role = "owner"; }
    expect((await reload(paidId)).paidAt.toISOString()).toBe(ORIGINAL.toISOString());
  });

  it("moves the paid date and records the reason in the activity", async () => {
    const res = await request(app).post(`/api/invoices/${paidId}/paid-date`)
      .send({ paidAt: "2026-10-15", reason: "Direct deposit cleared on the 15th" });
    expect(res.status).toBe(200);
    expect(res.body.paidAt).toBe("2026-10-15T12:00:00.000Z");
    expect(res.body.status).toBe("paid");
    const ev = res.body.events.at(-1);
    expect(ev.type).toBe("paid-date-changed");
    expect(ev.detail).toBe("from 20 Oct 2026 to 15 Oct 2026 — Direct deposit cleared on the 15th");
  });
});
