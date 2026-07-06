import { Router, type IRouter, type Request, type Response } from "express";
import { db, merchantsTable, staffTable, productsTable, customersTable, invoicesTable, transactionsTable, serviceJobsTable, appointmentsTable, mobilePosAppSettingsTable, posFavouritesTable } from "@workspace/db";
import { matchStaffByPin } from "../lib/staff-pin";
import { withUniqueRetry, nextSequential } from "../lib/document-numbers";
import { eq, and, desc, sql, ilike, or, inArray } from "drizzle-orm";
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
  const match = await matchStaffByPin(staff, parsed.data.pin);
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

/* ── Favourites (per-merchant; the Mobile POS keeps its own pinned list) ─ */
const MPOS_FAV_REGISTER = "mobile-pos";

function parseFavIds(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((n): n is number => typeof n === "number") : [];
  } catch { return []; }
}

router.get("/mobile-pos/favourites", async (req, res): Promise<void> => {
  const mpos = await requireMpos(req, res);
  if (!mpos) return;
  const [row] = await db.select().from(posFavouritesTable)
    .where(and(eq(posFavouritesTable.merchantId, mpos.merchantId), eq(posFavouritesTable.registerId, MPOS_FAV_REGISTER)))
    .limit(1);
  res.json({ productIds: parseFavIds(row?.productIds) });
});

const MposFavBody = z.object({ productIds: z.array(z.number().int().positive()).max(500) });

router.put("/mobile-pos/favourites", async (req, res): Promise<void> => {
  const mpos = await requireMpos(req, res);
  if (!mpos) return;
  const parsed = MposFavBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid favourites" }); return; }
  const ids = [...new Set(parsed.data.productIds)];
  const productIds = JSON.stringify(ids);
  const [existing] = await db.select().from(posFavouritesTable)
    .where(and(eq(posFavouritesTable.merchantId, mpos.merchantId), eq(posFavouritesTable.registerId, MPOS_FAV_REGISTER)))
    .limit(1);
  if (existing) {
    await db.update(posFavouritesTable).set({ productIds })
      .where(and(eq(posFavouritesTable.merchantId, mpos.merchantId), eq(posFavouritesTable.registerId, MPOS_FAV_REGISTER)));
  } else {
    await db.insert(posFavouritesTable).values({ merchantId: mpos.merchantId, registerId: MPOS_FAV_REGISTER, productIds });
  }
  res.json({ productIds: ids });
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
        ilike(customersTable.email, `%${search}%`),
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

/* ── Service jobs / appointments (for linking to a sale or invoice) ──── */
router.get("/mobile-pos/service-jobs", async (req, res): Promise<void> => {
  const mpos = await requireMpos(req, res);
  if (!mpos) return;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const where = search
    ? and(
        eq(serviceJobsTable.merchantId, mpos.merchantId),
        or(
          ilike(serviceJobsTable.jobNumber, `%${search}%`),
          ilike(serviceJobsTable.title, `%${search}%`),
          ilike(serviceJobsTable.deviceDescription, `%${search}%`),
        )!,
      )
    : eq(serviceJobsTable.merchantId, mpos.merchantId);
  const rows = await db
    .select({
      id: serviceJobsTable.id, jobNumber: serviceJobsTable.jobNumber, title: serviceJobsTable.title,
      deviceType: serviceJobsTable.deviceType, deviceDescription: serviceJobsTable.deviceDescription,
      status: serviceJobsTable.status,
    })
    .from(serviceJobsTable)
    .where(where)
    .orderBy(desc(serviceJobsTable.createdAt))
    .limit(30);
  res.json({ items: rows });
});

router.get("/mobile-pos/appointments", async (req, res): Promise<void> => {
  const mpos = await requireMpos(req, res);
  if (!mpos) return;
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const where = search
    ? and(eq(appointmentsTable.merchantId, mpos.merchantId), ilike(appointmentsTable.title, `%${search}%`))
    : eq(appointmentsTable.merchantId, mpos.merchantId);
  const rows = await db
    .select({
      id: appointmentsTable.id, title: appointmentsTable.title,
      scheduledAt: appointmentsTable.scheduledAt, status: appointmentsTable.status,
    })
    .from(appointmentsTable)
    .where(where)
    .orderBy(desc(appointmentsTable.scheduledAt))
    .limit(30);
  res.json({ items: rows.map((r) => ({ ...r, scheduledAt: r.scheduledAt?.toISOString() ?? null })) });
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
  serviceJobId: z.number().int().positive().nullable().optional(),
  appointmentId: z.number().int().positive().nullable().optional(),
});

/* Resolve a service job / appointment (scoped to the merchant) and build the
   "[Service #…]" / "[Appt #…]" note tags the rest of the app recognises. */
async function resolveSaleLinks(
  merchantId: number,
  serviceJobId: number | null | undefined,
  appointmentId: number | null | undefined,
): Promise<{ serviceJobId: number | null; appointmentId: number | null; tags: string[] }> {
  const tags: string[] = [];
  let safeServiceJobId: number | null = null;
  let safeAppointmentId: number | null = null;
  if (serviceJobId != null) {
    const [sj] = await db
      .select({ jobNumber: serviceJobsTable.jobNumber, title: serviceJobsTable.title, deviceDescription: serviceJobsTable.deviceDescription, deviceType: serviceJobsTable.deviceType })
      .from(serviceJobsTable)
      .where(and(eq(serviceJobsTable.id, serviceJobId), eq(serviceJobsTable.merchantId, merchantId)));
    if (sj) {
      safeServiceJobId = serviceJobId;
      tags.push(`[Service #${sj.jobNumber}: ${sj.title || sj.deviceDescription || sj.deviceType || "service"}]`);
    }
  }
  if (appointmentId != null) {
    const [ap] = await db
      .select({ title: appointmentsTable.title })
      .from(appointmentsTable)
      .where(and(eq(appointmentsTable.id, appointmentId), eq(appointmentsTable.merchantId, merchantId)));
    if (ap) {
      safeAppointmentId = appointmentId;
      tags.push(`[Appt #${appointmentId}: ${ap.title}]`);
    }
  }
  return { serviceJobId: safeServiceJobId, appointmentId: safeAppointmentId, tags };
}

/* Server-authoritative line pricing for the mobile POS: a line carrying a real
 * productId is repriced from the catalog (price/taxRate/name/cost from the DB row),
 * so a tampered client can't set its own price. Custom lines (no productId) keep
 * the client-entered price. Returns any productIds that don't belong to the
 * merchant so the caller can reject the sale. Mirrors the main POS finalizeSale. */
type MposLineIn = { productId?: number | null; name: string; unitPrice: number; quantity: number; taxRate?: number };
interface MposLinePriced { productId: number | null; name: string; unitPrice: number; quantity: number; taxRate: number; costPrice: number }

async function priceMposLines(merchantId: number, items: MposLineIn[]): Promise<{ priced: MposLinePriced[]; missing: number[] }> {
  const ids = [...new Set(items.filter((i) => i.productId != null && i.productId > 0).map((i) => i.productId as number))];
  const rows = ids.length
    ? await db.select({ id: productsTable.id, name: productsTable.name, price: productsTable.price, taxRate: productsTable.taxRate, costPrice: productsTable.costPrice })
        .from(productsTable).where(and(inArray(productsTable.id, ids), eq(productsTable.merchantId, merchantId)))
    : [];
  const map = new Map(rows.map((p) => [p.id, p]));
  const missing = ids.filter((id) => !map.has(id));
  const priced = items.map((i): MposLinePriced => {
    const p = i.productId != null && i.productId > 0 ? map.get(i.productId) : undefined;
    if (p) {
      return { productId: p.id, name: p.name, quantity: i.quantity, unitPrice: parseFloat(p.price), taxRate: p.taxRate != null ? parseFloat(p.taxRate) : 10, costPrice: p.costPrice != null ? parseFloat(p.costPrice) : 0 };
    }
    return { productId: null, name: i.name, quantity: i.quantity, unitPrice: Math.max(0, i.unitPrice), taxRate: i.taxRate ?? 0, costPrice: 0 };
  });
  return { priced, missing };
}

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

  // Resolve any linked service job / appointment and fold the link tags into the
  // notes — the same soft-link format the main POS uses.
  const links = await resolveSaleLinks(mpos.merchantId, parsed.data.serviceJobId, parsed.data.appointmentId);
  const finalNotes = [...links.tags, notes?.trim() || null].filter(Boolean).join(" | ") || null;

  // Server-authoritative pricing + totals (GST-inclusive, matching the main POS):
  // product-linked lines are repriced from the catalog, not the client body.
  const { priced, missing } = await priceMposLines(mpos.merchantId, items);
  if (missing.length) { res.status(400).json({ error: `Unknown product id(s): ${missing.join(", ")}` }); return; }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const total = round2(priced.reduce((s, i) => s + i.unitPrice * i.quantity, 0));
  const taxTotal = round2(priced.reduce((s, i) => s + (i.unitPrice * i.quantity) * (i.taxRate / (100 + i.taxRate)), 0));
  const subtotal = round2(total - taxTotal);

  const tendered = paymentMethod === "cash" && amountTendered != null ? amountTendered : null;
  const changeDue = tendered != null ? round2(Math.max(0, tendered - total)) : null;

  // Receipt number = KR + max+1, retried on the (merchantId, receiptNumber) unique
  // index so a concurrent sale can't collide (the whole txn rolls back + retries).
  const result = await withUniqueRetry("transactions_merchant_receipt_unique", (tryIndex) => db.transaction(async (tx) => {
    const existingReceipts = await tx
      .select({ n: transactionsTable.receiptNumber })
      .from(transactionsTable)
      .where(eq(transactionsTable.merchantId, mpos.merchantId));
    const receiptNumber = `KR${String(nextSequential(existingReceipts.map((r) => r.n), tryIndex)).padStart(5, "0")}`;
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
      notes: finalNotes,
      items: priced.map((i) => ({ productId: i.productId, name: i.name, quantity: i.quantity, unitPrice: i.unitPrice, taxRate: i.taxRate })),
    }).returning();

    // A linked service job / appointment is marked completed by the sale,
    // matching the main POS behaviour.
    if (links.serviceJobId != null) {
      await tx.update(serviceJobsTable).set({ status: "completed" })
        .where(and(eq(serviceJobsTable.id, links.serviceJobId), eq(serviceJobsTable.merchantId, mpos.merchantId)));
    }
    if (links.appointmentId != null) {
      await tx.update(appointmentsTable).set({ status: "completed" })
        .where(and(eq(appointmentsTable.id, links.appointmentId), eq(appointmentsTable.merchantId, mpos.merchantId)));
    }

    // Decrement tracked stock for product-linked lines.
    for (const i of priced) {
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
  }));

  res.status(201).json({
    id: result.id,
    receiptNumber: result.receiptNumber,
    total: parseFloat(result.total),
    changeDue: result.changeDue != null ? parseFloat(result.changeDue) : null,
    paymentMethod: result.paymentMethod,
    createdAt: result.createdAt.toISOString(),
  });
});

/* ── Invoices: create a draft invoice ────────────────────────────────── */
const MposInvoiceBody = z.object({
  items: z.array(SaleItem).min(1).max(100),
  customerId: z.number().int().positive().nullable().optional(),
  dueDate: z.string().trim().min(1).nullable().optional(),
  notes: z.string().max(2000).optional(),
  serviceJobId: z.number().int().positive().nullable().optional(),
  appointmentId: z.number().int().positive().nullable().optional(),
});

router.post("/mobile-pos/invoices", async (req, res): Promise<void> => {
  const mpos = await requireMpos(req, res);
  if (!mpos) return;
  if (!mpos.settings.showInvoices) { res.status(403).json({ error: "Invoices are disabled for this app" }); return; }
  const parsed = MposInvoiceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { items, customerId, dueDate, notes } = parsed.data;

  // Validate the (optional) customer belongs to this merchant.
  let safeCustomerId: number | null = null;
  if (customerId != null) {
    const [c] = await db
      .select({ id: customersTable.id })
      .from(customersTable)
      .where(and(eq(customersTable.id, customerId), eq(customersTable.merchantId, mpos.merchantId)));
    safeCustomerId = c ? customerId : null;
  }

  // Validate any linked service job / appointment belong to this merchant. These
  // are stored as real FKs; the invoice auto-completes them when it's paid.
  let safeServiceJobId: number | null = null;
  if (parsed.data.serviceJobId != null) {
    const [sj] = await db.select({ id: serviceJobsTable.id }).from(serviceJobsTable)
      .where(and(eq(serviceJobsTable.id, parsed.data.serviceJobId), eq(serviceJobsTable.merchantId, mpos.merchantId)));
    safeServiceJobId = sj ? parsed.data.serviceJobId : null;
  }
  let safeAppointmentId: number | null = null;
  if (parsed.data.appointmentId != null) {
    const [ap] = await db.select({ id: appointmentsTable.id }).from(appointmentsTable)
      .where(and(eq(appointmentsTable.id, parsed.data.appointmentId), eq(appointmentsTable.merchantId, mpos.merchantId)));
    safeAppointmentId = ap ? parsed.data.appointmentId : null;
  }

  // Server-authoritative pricing + totals: product-linked lines are repriced (and
  // cost-snapshotted) from the catalog, not the client body.
  const { priced, missing } = await priceMposLines(mpos.merchantId, items);
  if (missing.length) { res.status(400).json({ error: `Unknown product id(s): ${missing.join(", ")}` }); return; }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const total = round2(priced.reduce((s, i) => s + i.unitPrice * i.quantity, 0));
  const taxTotal = round2(priced.reduce((s, i) => s + (i.unitPrice * i.quantity) * (i.taxRate / (100 + i.taxRate)), 0));
  const subtotal = round2(total - taxTotal);

  // Invoice number = KI + max+1, retried on the (merchantId, invoiceNumber) unique
  // index so a concurrent create can't produce a duplicate.
  const inv = await withUniqueRetry("invoices_merchant_invoice_number_unique", async (tryIndex) => {
    const existingNums = await db
      .select({ n: invoicesTable.invoiceNumber })
      .from(invoicesTable)
      .where(eq(invoicesTable.merchantId, mpos.merchantId));
    const invoiceNumber = `KI${String(nextSequential(existingNums.map((r) => r.n), tryIndex)).padStart(5, "0")}`;
    const [row] = await db.insert(invoicesTable).values({
      merchantId: mpos.merchantId,
      customerId: safeCustomerId,
      staffId: mpos.staffId,
      invoiceNumber,
      status: "draft",
      subtotal: String(subtotal),
      taxTotal: String(taxTotal),
      total: String(total),
      items: priced.map((i) => ({
        description: i.name,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        taxRate: i.taxRate,
        productId: i.productId,
        costPrice: i.productId != null ? i.costPrice : null,
      })),
      dueDate: dueDate ? new Date(dueDate) : null,
      notes: notes ?? null,
      serviceJobId: safeServiceJobId,
      appointmentId: safeAppointmentId,
    }).returning();
    return row;
  });

  res.status(201).json({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    total: parseFloat(inv.total),
    amountPaid: parseFloat(inv.amountPaid ?? "0"),
    dueDate: inv.dueDate?.toISOString() ?? null,
    createdAt: inv.createdAt.toISOString(),
  });
});

export default router;
