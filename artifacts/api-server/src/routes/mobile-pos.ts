import { Router, type IRouter, type Request, type Response } from "express";
import { db, merchantsTable, staffTable, productsTable, customersTable, invoicesTable, transactionsTable, mobilePosAppSettingsTable } from "@workspace/db";
import { eq, and, desc, sql, ilike, or } from "drizzle-orm";
import { z } from "zod/v4";
import { customerDisplayName } from "../lib/customer-name";

/**
 * Mobile POS web app API.
 *
 * Serves the PIN-authed companion at /b/:businessUsername/t/posapp. A staff
 * member signs in with their PIN scoped to the business; the session unlocks
 * only these /api/mobile-pos endpoints (it never sets session.merchantId, so
 * requireAuth-protected main-app endpoints stay closed).
 *
 * Exposes exactly three surfaces — Sell, Invoices, Products — each gated by the
 * merchant's Mobile POS settings (Management > Staff & Operations > Mobile POS).
 */

declare module "express-session" {
  interface SessionData {
    mpos?: { staffId: number; merchantId: number };
  }
}

const router: IRouter = Router();

/* ── PIN rate limiting (mirrors the tech app) ────────────────────────── */
const PIN_MAX_FAILS = 5;
const PIN_WINDOW_MS = 60_000;
const pinFailures = new Map<number, { fails: number; resetAt: number }>();

function pinRateLimited(merchantId: number): boolean {
  const entry = pinFailures.get(merchantId);
  if (!entry || Date.now() > entry.resetAt) return false;
  return entry.fails >= PIN_MAX_FAILS;
}
function recordPinFailure(merchantId: number): void {
  const now = Date.now();
  const entry = pinFailures.get(merchantId);
  if (!entry || now > entry.resetAt) pinFailures.set(merchantId, { fails: 1, resetAt: now + PIN_WINDOW_MS });
  else entry.fails += 1;
}

/* ── Settings ────────────────────────────────────────────────────────── */
async function getMobilePosSettings(merchantId: number) {
  const [row] = await db
    .select()
    .from(mobilePosAppSettingsTable)
    .where(eq(mobilePosAppSettingsTable.merchantId, merchantId))
    .limit(1);
  return {
    enabled:      (row?.enabled ?? "true") === "true",
    showSell:     (row?.showSell ?? "true") === "true",
    showInvoices: (row?.showInvoices ?? "true") === "true",
    showProducts: (row?.showProducts ?? "true") === "true",
  };
}

async function findMerchantByUsername(username: string) {
  const [m] = await db
    .select({ id: merchantsTable.id, businessName: merchantsTable.businessName, logoUrl: merchantsTable.logoUrl, status: merchantsTable.status })
    .from(merchantsTable)
    .where(eq(merchantsTable.username, username.toLowerCase()));
  return m && m.status === "active" ? m : null;
}

/** Auth gate — verifies the session staff member still exists, is active, and
    the Mobile POS app is still enabled for the business. */
async function requireMpos(req: Request, res: Response): Promise<{
  staffId: number; merchantId: number; staffName: string; role: string;
  settings: Awaited<ReturnType<typeof getMobilePosSettings>>;
} | null> {
  const mpos = req.session?.mpos;
  if (!mpos) { res.status(401).json({ error: "Not signed in" }); return null; }
  const [staff] = await db
    .select()
    .from(staffTable)
    .where(and(eq(staffTable.id, mpos.staffId), eq(staffTable.merchantId, mpos.merchantId)));
  if (!staff || staff.isActive !== "true") { res.status(401).json({ error: "Not signed in" }); return null; }
  const settings = await getMobilePosSettings(mpos.merchantId);
  if (!settings.enabled) { res.status(403).json({ error: "The Mobile POS app is currently disabled for this business" }); return null; }
  return { staffId: staff.id, merchantId: staff.merchantId, staffName: staff.name, role: staff.role, settings };
}

/* ── Public: business info for the login screen ──────────────────────── */
router.get("/mobile-pos/b/:username/info", async (req, res): Promise<void> => {
  const merchant = await findMerchantByUsername(req.params.username);
  if (!merchant) { res.status(404).json({ error: "Business not found" }); return; }
  res.json({ businessName: merchant.businessName, logoUrl: merchant.logoUrl ?? null });
});

/* ── Login with staff PIN ────────────────────────────────────────────── */
const MposLoginBody = z.object({ pin: z.string().min(1).max(32) });

router.post("/mobile-pos/b/:username/login", async (req, res): Promise<void> => {
  const merchant = await findMerchantByUsername(req.params.username);
  if (!merchant) { res.status(404).json({ error: "Business not found" }); return; }
  const parsed = MposLoginBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "PIN is required" }); return; }
  const settings = await getMobilePosSettings(merchant.id);
  if (!settings.enabled) { res.status(403).json({ error: "The Mobile POS app is currently disabled for this business" }); return; }
  if (pinRateLimited(merchant.id)) { res.status(429).json({ error: "Too many attempts — try again in a minute" }); return; }
  const staff = await db
    .select()
    .from(staffTable)
    .where(and(eq(staffTable.merchantId, merchant.id), eq(staffTable.isActive, "true")));
  const match = staff.find((s) => s.pin && s.pin === parsed.data.pin);
  if (!match) { recordPinFailure(merchant.id); res.status(401).json({ error: "Invalid PIN" }); return; }
  req.session.mpos = { staffId: match.id, merchantId: merchant.id };
  res.json({
    staff: { id: match.id, name: match.name, role: match.role },
    business: { businessName: merchant.businessName, logoUrl: merchant.logoUrl ?? null },
    settings,
  });
});

/* ── Session info / logout ───────────────────────────────────────────── */
router.get("/mobile-pos/me", async (req, res): Promise<void> => {
  const mpos = await requireMpos(req, res);
  if (!mpos) return;
  const [merchant] = await db
    .select({ businessName: merchantsTable.businessName, logoUrl: merchantsTable.logoUrl, username: merchantsTable.username })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, mpos.merchantId));
  res.json({
    staff: { id: mpos.staffId, name: mpos.staffName, role: mpos.role },
    business: { businessName: merchant?.businessName ?? "", logoUrl: merchant?.logoUrl ?? null, username: merchant?.username ?? null },
    settings: mpos.settings,
  });
});

router.post("/mobile-pos/logout", async (req, res): Promise<void> => {
  if (req.session) req.session.mpos = undefined;
  res.json({ ok: true });
});

/* ── Products ────────────────────────────────────────────────────────── */
router.get("/mobile-pos/products", async (req, res): Promise<void> => {
  const mpos = await requireMpos(req, res);
  if (!mpos) return;
  if (!mpos.settings.showProducts) { res.status(403).json({ error: "Products are disabled for this app" }); return; }
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const conditions = [eq(productsTable.merchantId, mpos.merchantId)];
  if (search) {
    conditions.push(or(ilike(productsTable.name, `%${search}%`), ilike(productsTable.sku, `%${search}%`))!);
  }
  const rows = await db
    .select({
      id: productsTable.id, name: productsTable.name, price: productsTable.price,
      sku: productsTable.sku, imageUrl: productsTable.imageUrl,
      taxRate: productsTable.taxRate, trackInventory: productsTable.trackInventory,
      stockQuantity: productsTable.stockQuantity,
    })
    .from(productsTable)
    .where(and(...conditions))
    .orderBy(productsTable.name)
    .limit(200);
  res.json({
    items: rows.map((p) => ({
      id: p.id, name: p.name, price: parseFloat(p.price ?? "0"), sku: p.sku ?? null,
      imageUrl: p.imageUrl ?? null, taxRate: p.taxRate != null ? parseFloat(p.taxRate) : 0,
      trackInventory: p.trackInventory === "true", stockQuantity: p.stockQuantity,
    })),
  });
});

/* ── Customer lookup (for attaching a sale) ──────────────────────────── */
router.get("/mobile-pos/customers", async (req, res): Promise<void> => {
  const mpos = await requireMpos(req, res);
  if (!mpos) return;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  if (search.length < 2) { res.json({ items: [] }); return; }
  const rows = await db
    .select()
    .from(customersTable)
    .where(and(
      eq(customersTable.merchantId, mpos.merchantId),
      or(
        ilike(customersTable.firstName, `%${search}%`),
        ilike(customersTable.lastName, `%${search}%`),
        ilike(customersTable.company, `%${search}%`),
        ilike(customersTable.phone, `%${search}%`),
      )!,
    ))
    .limit(20);
  res.json({
    items: rows.map((c) => ({
      id: c.id,
      name: customerDisplayName(c.firstName, c.lastName, c.company),
      phone: c.phone ?? null, email: c.email ?? null,
    })),
  });
});

/* ── Invoices (read-only list) ───────────────────────────────────────── */
router.get("/mobile-pos/invoices", async (req, res): Promise<void> => {
  const mpos = await requireMpos(req, res);
  if (!mpos) return;
  if (!mpos.settings.showInvoices) { res.status(403).json({ error: "Invoices are disabled for this app" }); return; }
  const rows = await db
    .select({
      invoice: invoicesTable,
      firstName: customersTable.firstName, lastName: customersTable.lastName, company: customersTable.company,
    })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(eq(invoicesTable.merchantId, mpos.merchantId))
    .orderBy(desc(invoicesTable.createdAt))
    .limit(100);
  res.json({
    items: rows.map((r) => ({
      id: r.invoice.id,
      invoiceNumber: r.invoice.invoiceNumber,
      status: r.invoice.status,
      total: parseFloat(r.invoice.total),
      amountPaid: parseFloat(r.invoice.amountPaid ?? "0"),
      dueDate: r.invoice.dueDate?.toISOString() ?? null,
      createdAt: r.invoice.createdAt.toISOString(),
      customerName: r.firstName || r.lastName || r.company
        ? customerDisplayName(r.firstName, r.lastName, r.company)
        : null,
    })),
  });
});

/* ── Sell: create a sale (real transaction) ──────────────────────────── */
const SaleItem = z.object({
  productId: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1).max(200),
  unitPrice: z.number().nonnegative(),
  quantity: z.number().int().positive().max(999),
  taxRate: z.number().min(0).max(100).optional(),
});
const MposSaleBody = z.object({
  items: z.array(SaleItem).min(1).max(100),
  paymentMethod: z.enum(["cash", "card", "eftpos"]),
  customerId: z.number().int().positive().nullable().optional(),
  amountTendered: z.number().nonnegative().nullable().optional(),
  notes: z.string().max(2000).optional(),
});

router.post("/mobile-pos/sale", async (req, res): Promise<void> => {
  const mpos = await requireMpos(req, res);
  if (!mpos) return;
  if (!mpos.settings.showSell) { res.status(403).json({ error: "Selling is disabled for this app" }); return; }
  const parsed = MposSaleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { items, paymentMethod, customerId, amountTendered, notes } = parsed.data;

  // Validate the (optional) customer belongs to this merchant.
  let safeCustomerId: number | null = null;
  if (customerId != null) {
    const [c] = await db
      .select({ id: customersTable.id })
      .from(customersTable)
      .where(and(eq(customersTable.id, customerId), eq(customersTable.merchantId, mpos.merchantId)));
    safeCustomerId = c ? customerId : null;
  }

  // Server-authoritative totals (GST-inclusive pricing, matching the main POS).
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const total = round2(items.reduce((s, i) => s + i.unitPrice * i.quantity, 0));
  const taxTotal = round2(items.reduce((s, i) => {
    const r = i.taxRate ?? 0;
    return s + (i.unitPrice * i.quantity) * (r / (100 + r));
  }, 0));
  const subtotal = round2(total - taxTotal);

  // Receipt number: KR + zero-padded running count for this merchant.
  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(transactionsTable)
    .where(eq(transactionsTable.merchantId, mpos.merchantId));
  const receiptNumber = `KR${String(Number(countRow.count) + 1).padStart(5, "0")}`;

  const tendered = paymentMethod === "cash" && amountTendered != null ? amountTendered : null;
  const changeDue = tendered != null ? round2(Math.max(0, tendered - total)) : null;

  const result = await db.transaction(async (tx) => {
    const [txn] = await tx.insert(transactionsTable).values({
      merchantId: mpos.merchantId,
      customerId: safeCustomerId,
      staffId: mpos.staffId,
      receiptNumber,
      status: "completed",
      subtotal: String(subtotal),
      taxTotal: String(taxTotal),
      total: String(total),
      paymentMethod,
      amountTendered: tendered != null ? String(tendered) : null,
      changeDue: changeDue != null ? String(changeDue) : null,
      notes: notes ?? null,
      items: items.map((i) => ({ productId: i.productId ?? null, name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, taxRate: i.taxRate ?? 0 })),
    }).returning();

    // Decrement tracked stock for product-linked lines.
    for (const i of items) {
      if (i.productId == null) continue;
      const [p] = await tx
        .select({ stockQuantity: productsTable.stockQuantity, trackInventory: productsTable.trackInventory })
        .from(productsTable)
        .where(and(eq(productsTable.id, i.productId), eq(productsTable.merchantId, mpos.merchantId)))
        .for("update");
      if (p?.trackInventory !== "true") continue;
      await tx.update(productsTable)
        .set({ stockQuantity: Math.max(0, p.stockQuantity - i.quantity) })
        .where(eq(productsTable.id, i.productId));
    }
    return txn;
  });

  res.status(201).json({
    id: result.id,
    receiptNumber: result.receiptNumber,
    total: parseFloat(result.total),
    changeDue: result.changeDue != null ? parseFloat(result.changeDue) : null,
    paymentMethod: result.paymentMethod,
    createdAt: result.createdAt.toISOString(),
  });
});

export default router;
