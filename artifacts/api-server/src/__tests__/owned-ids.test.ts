import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

/* Ids a request names must be this business's (lib/owned-ids.ts). Other
   businesses' rows are still in the database, and a stored foreign customer id
   let later reads — the calendar, follow-ups, invoices, reminder schedulers —
   show or message that business's customer. Real DB (skipped without
   DATABASE_URL); an id that is not this business's is refused before anything
   is written. */

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

const NOT_OURS = 2_000_000_000;

describe.skipIf(!hasDb)("foreign ids are refused (real DB)", () => {
  let app: express.Express;
  let foreignIdError: typeof import("../lib/owned-ids")["foreignIdError"];

  beforeAll(async () => {
    const t = await import("@workspace/db");
    const [m] = await t.db.select({ id: t.merchantsTable.id }).from(t.merchantsTable).limit(1);
    h.merchantId = m!.id;
    ({ foreignIdError } = await import("../lib/owned-ids"));
    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    for (const r of ["appointments", "service-jobs", "service-plans", "products", "purchase-orders", "invoices"]) {
      app.use("/api", (await import(`../routes/${r}`)).default);
    }
  }, 120_000);

  it("treats unset as fine and anything else not ours as not found", async () => {
    expect(await foreignIdError(h.merchantId, { customerId: null, staffId: undefined, categoryId: 0 })).toBeNull();
    expect(await foreignIdError(h.merchantId, { customerId: NOT_OURS })).toBe("Customer not found");
    expect(await foreignIdError(h.merchantId, { supplierId: "abc" })).toBe("Supplier not found");
  });

  it("refuses them on every route that stores one", async () => {
    const calls: Array<[string, string, Record<string, unknown>]> = [
      ["post", "/api/appointments", { title: "x", scheduledAt: "2030-01-01T10:00:00Z", endAt: "2030-01-01T11:00:00Z", status: "scheduled", customerId: NOT_OURS }],
      ["patch", "/api/appointments/1", { scheduledAt: "2030-01-01T10:00:00Z", endAt: "2030-01-01T11:00:00Z", status: "scheduled", staffId: NOT_OURS }],
      ["post", "/api/service-jobs", { customerId: NOT_OURS, deviceType: "Phone" }],
      ["patch", "/api/service-jobs/1", { referredByCustomerId: NOT_OURS }],
      ["post", "/api/service-plans", { name: "x", customerId: NOT_OURS }],
      ["put", "/api/service-plans/1", { customerId: NOT_OURS }],
      ["post", "/api/products", { name: "x", price: 1, categoryId: NOT_OURS }],
      ["patch", "/api/products/1", { categoryId: NOT_OURS }],
      ["post", "/api/purchase-orders", { orderDate: "2030-01-01", supplierId: NOT_OURS, items: [] }],
    ];
    for (const [method, path, body] of calls) {
      const res = await (request(app) as unknown as Record<string, (p: string) => request.Test>)[method]!(path).send(body);
      expect([path, res.status, res.body.error]).toEqual([path, 400, expect.stringMatching(/not found/)]);
    }
  });

  it("never shows another business's customer through a row already pointing at one", async () => {
    const t = await import("@workspace/db");
    const { eq, ne } = await import("drizzle-orm");
    // Another business's customer, and an invoice of ours naming them — what a
    // row saved before the write checks looks like. Businesses can't be deleted
    // (a trigger refuses), so this borrows one that already exists rather than
    // creating one, and skips when there is none.
    const [other] = await t.db.select({ id: t.merchantsTable.id }).from(t.merchantsTable)
      .where(ne(t.merchantsTable.id, h.merchantId)).limit(1);
    if (!other) return;
    const [theirs] = await t.db.insert(t.customersTable).values({
      merchantId: other!.id, firstName: "Foreign", lastName: "Customer", email: "foreign@example.invalid", phone: "+61400000999",
    }).returning({ id: t.customersTable.id });
    const [inv] = await t.db.insert(t.invoicesTable).values({
      merchantId: h.merchantId, customerId: theirs!.id, invoiceNumber: `TEST-OWN-${Date.now()}`, status: "draft",
      subtotal: "0", taxTotal: "0", total: "0", amountPaid: "0", items: [],
    }).returning({ id: t.invoicesTable.id });
    try {
      const one = await request(app).get(`/api/invoices/${inv!.id}`);
      expect(one.status).toBe(200);
      expect([one.body.customerEmail, one.body.customerPhone]).toEqual([null, null]);
      expect(String(one.body.customerName ?? "")).not.toContain("Foreign");
      const list = await request(app).get("/api/invoices?limit=200");
      const row = (list.body.items as Array<{ id: number; customerEmail: string | null }>).find((r) => r.id === inv!.id);
      if (row) expect(row.customerEmail).toBeNull();
    } finally {
      await t.db.delete(t.invoicesTable).where(eq(t.invoicesTable.id, inv!.id));
      await t.db.delete(t.customersTable).where(eq(t.customersTable.id, theirs!.id));
    }
  });
});
