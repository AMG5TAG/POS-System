import { Router, type IRouter } from "express";
import { db, invoicesTable, customersTable, merchantsTable, businessProfileTable, loyaltySettingsTable, giftCardsTable, giftCardLedgerTable, salesTemplatesTable, serviceJobsTable, appointmentsTable, productsTable, staffTable } from "@workspace/db";
import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { customerDisplayName } from "../lib/customer-name";
import { sendEmail } from "../services/email";
import { publicOrigin } from "../lib/publicUrl";
import { buildInvoicePdf } from "../services/invoicePdf";
import { computeNextSendDate } from "../services/recurringInvoiceScheduler";
import crypto from "node:crypto";
import {
  RecordInvoicePaymentBody,
  AddInvoiceEventBody,
  SendInvoiceEmailBody,
  ListInvoicesQueryParams,
  CreateInvoiceBody,
  UpdateInvoiceBody,
  GetInvoiceParams,
  UpdateInvoiceParams,
  DeleteInvoiceParams,
  MarkInvoiceViewedParams,
  RecordInvoicePaymentParams,
  GetInvoicePdfParams,
  SendInvoiceEmailParams,
  AddInvoiceEventParams,
  GetInvoiceResponse,
  UpdateInvoiceResponse,
  ListInvoicesResponse,
  MarkInvoiceViewedResponse,
  RecordInvoicePaymentResponse,
  AddInvoiceEventResponse,
} from "@workspace/api-zod";
import type * as zod from "zod";

const router: IRouter = Router();

// 1×1 transparent GIF — returned by the email tracking pixel endpoint
const TRANSPARENT_GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

const VIEW_PING_SECRET = process.env.SESSION_SECRET ?? "koapos-dev-secret";

function makeViewKey(invoiceId: number, merchantId: number): string {
  return crypto.createHmac("sha256", VIEW_PING_SECRET).update(`${invoiceId}:${merchantId}`).digest("hex").slice(0, 24);
}

// GET /invoices/:id/ping-view?key=:key — public tracking pixel called by email open
router.get("/invoices/:id/ping-view", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const key = typeof req.query.key === "string" ? req.query.key : "";
  if (!Number.isFinite(id) || !key) {
    res.set("Content-Type", "image/gif").send(TRANSPARENT_GIF);
    return;
  }

  const [row] = await db
    .select({ merchantId: invoicesTable.merchantId, viewedAt: invoicesTable.viewedAt, events: invoicesTable.events })
    .from(invoicesTable)
    .where(eq(invoicesTable.id, id));

  if (row && key === makeViewKey(id, row.merchantId) && !row.viewedAt) {
    const events: InvoiceEvent[] = [
      ...((row.events as InvoiceEvent[] | null) ?? []),
      { type: "viewed", timestamp: new Date().toISOString(), detail: "email-open" },
    ];
    await db.update(invoicesTable).set({ viewedAt: new Date(), events }).where(eq(invoicesTable.id, id));
  }

  res.set("Content-Type", "image/gif").send(TRANSPARENT_GIF);
});

/**
 * Validate an invoice API response body against its declared OpenAPI/Zod schema
 * before it is sent. Throws synchronously on mismatch so Express catches it as
 * a 500 — making schema drift immediately visible instead of silently serving
 * a malformed payload. Uses safeParse (not parse) to avoid mutating the value
 * (e.g. zod.coerce.date() would turn ISO strings into Date objects).
 */
function assertValidInvoiceResponse(schema: zod.ZodTypeAny, data: unknown, context: string): void {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(
      `[invoices] Response schema mismatch in ${context}: ${result.error.message}`,
    );
  }
}

type LineItem = { description: string; quantity: number; unitPrice: number; taxRate: number };
type Discount = { type: "fixed" | "percent"; value: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

function computeTotals(lines: LineItem[], discount?: Discount | null) {
  const linesGross = lines.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const rawTax     = lines.reduce((s, i) => s + i.quantity * i.unitPrice * ((i.taxRate ?? 0) / (100 + (i.taxRate ?? 0))), 0);

  let discountAmount = 0;
  if (discount?.type === "fixed")   discountAmount = Math.min(discount.value, linesGross);
  else if (discount?.type === "percent") discountAmount = linesGross * Math.min(Math.max(discount.value, 0), 100) / 100;
  discountAmount = round2(discountAmount);

  const total    = round2(linesGross - discountAmount);
  const taxTotal = linesGross > 0 ? round2(rawTax * (total / linesGross)) : 0;
  const subtotal = round2(total - taxTotal);

  return { total, taxTotal, subtotal, discountAmount };
}
type InvoiceEvent = { type: string; timestamp: string; detail?: string; method?: string; amount?: number; idempotencyKey?: string };

type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/* Personal name first; business-only contacts fall back to their company
   name so invoices/quotes never show a blank or "Unknown" customer. */
const customerName = customerDisplayName;

function fmt(
  inv: typeof invoicesTable.$inferSelect,
  cFirst?: string | null,
  cLast?: string | null,
  cEmail?: string | null,
  cPhone?: string | null,
  cAddress?: string | null,
  cCompany?: string | null,
  cBillingStreet?: string | null,
  cBillingCity?: string | null,
  cBillingState?: string | null,
  cBillingPostcode?: string | null,
) {
  const isRecurring = inv.isRecurring === "true";
  const nextSendDate =
    isRecurring && inv.recurringStartDate
      ? computeNextSendDate(inv.recurringStartDate, inv.recurringFrequency ?? "monthly").toISOString()
      : null;

  const billingParts = [cBillingStreet, cBillingCity, cBillingState, cBillingPostcode].filter(Boolean);
  const customerAddress = billingParts.length ? billingParts.join(", ") : (cAddress ?? null);

  return {
    ...inv,
    subtotal: parseFloat(inv.subtotal),
    taxTotal: parseFloat(inv.taxTotal),
    total: parseFloat(inv.total),
    amountPaid: parseFloat(inv.amountPaid ?? "0"),
    serviceJobId: inv.serviceJobId ?? null,
    appointmentId: inv.appointmentId ?? null,
    discountType:  inv.discountType  ?? null,
    discountValue: inv.discountValue  ? parseFloat(inv.discountValue)  : null,
    discountTotal: inv.discountTotal  ? parseFloat(inv.discountTotal)  : null,
    items: (inv.items as LineItem[] | null) ?? [],
    events: (inv.events as InvoiceEvent[] | null) ?? [],
    dueDate: inv.dueDate?.toISOString() ?? null,
    paidAt: inv.paidAt?.toISOString() ?? null,
    viewedAt: inv.viewedAt?.toISOString() ?? null,
    isRecurring,
    recurringFrequency: inv.recurringFrequency ?? null,
    recurringOccurrences: inv.recurringOccurrences ?? null,
    recurringStartDate: inv.recurringStartDate?.toISOString() ?? null,
    nextSendDate,
    createdAt: inv.createdAt.toISOString(),
    updatedAt: inv.updatedAt.toISOString(),
    customerName: customerName(cFirst ?? null, cLast ?? null, cCompany ?? null),
    customerEmail: cEmail ?? null,
    customerPhone: cPhone ?? null,
    customerAddress,
    customerCompany: cCompany ?? null,
  };
}

async function appendInvoiceEvent(id: number, merchantId: number, event: InvoiceEvent) {
  const [row] = await db
    .select({ events: invoicesTable.events })
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, merchantId)));
  if (!row) return;
  const events: InvoiceEvent[] = [...((row.events as InvoiceEvent[] | null) ?? []), event];
  await db.update(invoicesTable).set({ events }).where(eq(invoicesTable.id, id));
}

/**
 * When an invoice is linked to a service job or appointment, that work has been
 * billed, so flip the linked record to "completed" (mirrors how a POS sale
 * completes its linked service/appointment). Safe to call with nulls.
 */
async function completeLinkedRecords(merchantId: number, serviceJobId?: number | null, appointmentId?: number | null): Promise<void> {
  if (serviceJobId != null) {
    await db.update(serviceJobsTable)
      .set({ status: "completed" })
      .where(and(eq(serviceJobsTable.id, serviceJobId), eq(serviceJobsTable.merchantId, merchantId)));
  }
  if (appointmentId != null) {
    await db.update(appointmentsTable)
      .set({ status: "completed" })
      .where(and(eq(appointmentsTable.id, appointmentId), eq(appointmentsTable.merchantId, merchantId)));
  }
}

/** Credit loyalty points/value to a customer when an invoice is fully settled. */
async function creditLoyaltyForPaidInvoice(executor: DbExecutor, merchantId: number, customerId: number, invoiceTotal: number) {
  if (invoiceTotal <= 0) return;
  const [loyaltyRow] = await executor
    .select({ programType: loyaltySettingsTable.programType, isEnabled: loyaltySettingsTable.isEnabled, config: loyaltySettingsTable.config })
    .from(loyaltySettingsTable)
    .where(eq(loyaltySettingsTable.merchantId, merchantId));
  const programOn = loyaltyRow ? loyaltyRow.isEnabled === "true" : true;
  if (!programOn) return;

  const programType = loyaltyRow?.programType ?? "cashback";
  const config = (loyaltyRow?.config ?? {}) as Record<string, unknown>;
  let earned = 0;
  switch (programType) {
    case "cashback": {
      const rate = Math.max(0, (config.cashbackRate as number) ?? 0.01);
      earned = round2(invoiceTotal * rate);
      break;
    }
    case "tiered": {
      const tiers = (config.tiers ?? []) as Array<{ minSpend?: number; pointsRequired?: number; rate?: number; bonusMultiplier?: number }>;
      const sorted = [...tiers].sort((a, b) => (b.pointsRequired ?? b.minSpend ?? 0) - (a.pointsRequired ?? a.minSpend ?? 0));
      const tier = sorted.find(t => invoiceTotal >= (t.minSpend ?? 0));
      const rate = Math.max(0, tier?.rate ?? 0.01);
      const mult = tier?.bonusMultiplier ?? 1;
      earned = round2(invoiceTotal * rate * mult);
      break;
    }
    case "points": {
      const ppd = Math.max(0, (config.pointsPerDollar as number) ?? 1);
      earned = Math.floor(invoiceTotal * ppd);
      break;
    }
    case "stamp":
      earned = 1;
      break;
    case "custom": {
      const rate = Math.max(0, (config.customValue as number) ?? 0.01);
      earned = round2(invoiceTotal * rate);
      break;
    }
  }
  if (earned > 0) {
    await executor
      .update(customersTable)
      .set({ loyaltyPoints: sql`${customersTable.loyaltyPoints} + ${earned}` })
      .where(and(eq(customersTable.id, customerId), eq(customersTable.merchantId, merchantId)));
  }
}

/* ── Invoice stock + customer-spend side effects ─────────────────────────────
 * Invoices are treated like POS sales: a paid invoice deducts stock for any
 * product-linked line item (mirroring POS) and rolls the total into the
 * customer's lifetime spend + visit count. Both are reversed when an invoice
 * leaves the paid state (un-paid / voided / deleted) so the figures never drift.
 * Only line items carrying a real productId for an inventory-tracked product
 * move stock; free-text lines are financial-only, exactly as on the POS. */
interface StockLine { productId?: number | null; quantity?: number | null }

function aggregateQtyByProduct(items: unknown): Map<number, number> {
  const map = new Map<number, number>();
  if (!Array.isArray(items)) return map;
  for (const it of items as StockLine[]) {
    const pid = it?.productId;
    if (typeof pid === "number" && pid > 0) {
      map.set(pid, (map.get(pid) ?? 0) + (Number(it.quantity) || 0));
    }
  }
  return map;
}

/** Apply a stock movement for an invoice's line items. `direction` is -1 to
 *  deduct (invoice became paid) or +1 to restore (invoice left paid). */
async function applyInvoiceStock(tx: DbExecutor, merchantId: number, items: unknown, direction: -1 | 1): Promise<void> {
  for (const [productId, qty] of aggregateQtyByProduct(items)) {
    if (qty <= 0) continue;
    const [product] = await tx
      .select({ stockQuantity: productsTable.stockQuantity, trackInventory: productsTable.trackInventory })
      .from(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.merchantId, merchantId)))
      .for("update");
    if (product?.trackInventory !== "true") continue;
    const newQty = Math.max(0, product.stockQuantity + direction * qty);
    await tx.update(productsTable).set({ stockQuantity: newQty }).where(eq(productsTable.id, productId));
  }
}

/** Confirm a client-supplied foreign-key id actually belongs to this merchant.
 *  Returns the id when it resolves to a live row, otherwise null. Used to guard
 *  invoice inserts/updates against stale client state (e.g. a device whose
 *  cached day-staff id predates a data restore that renumbered staff): without
 *  this the raw FK constraint throws an opaque 500 and invoice creation fails.
 *  `null`/`undefined` inputs pass straight through as null (field is optional). */
async function resolveMerchantFk(
  table: typeof staffTable | typeof customersTable | typeof serviceJobsTable | typeof appointmentsTable,
  merchantId: number,
  id: number | null | undefined,
): Promise<number | null> {
  if (id == null) return null;
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), eq(table.merchantId, merchantId)));
  return row ? id : null;
}

/** Snapshot each product-linked line item's cost price (server-authoritative),
 *  so invoice COGS in reports reflects the cost at invoicing rather than trusting
 *  whatever the client sent. Free-text lines (no productId) are left untouched. */
async function snapshotInvoiceLineCosts(merchantId: number, lines: LineItem[]): Promise<LineItem[]> {
  const arr = (Array.isArray(lines) ? lines : []) as Array<LineItem & { productId?: number; costPrice?: number }>;
  const ids = [...new Set(arr.map((l) => l.productId).filter((v): v is number => typeof v === "number" && Number.isInteger(v) && v > 0))];
  if (ids.length === 0) return lines;
  const rows = await db
    .select({ id: productsTable.id, costPrice: productsTable.costPrice })
    .from(productsTable)
    .where(and(inArray(productsTable.id, ids), eq(productsTable.merchantId, merchantId)));
  const costById = new Map(rows.map((r) => [r.id, r.costPrice != null ? parseFloat(r.costPrice) : NaN]));
  return arr.map((l) => {
    if (typeof l.productId === "number" && costById.has(l.productId)) {
      const c = costById.get(l.productId)!;
      if (Number.isFinite(c)) return { ...l, costPrice: c };
    }
    return l;
  });
}

/** Roll an invoice total into (or back out of) a customer's lifetime spend.
 *  `sign` is +1 when the invoice becomes paid, -1 when it leaves paid. */
async function applyInvoiceCustomerSpend(tx: DbExecutor, merchantId: number, customerId: number | null, total: number, sign: 1 | -1): Promise<void> {
  if (!customerId || total <= 0) return;
  await tx
    .update(customersTable)
    .set({
      totalSpent: sql`GREATEST(0, ${customersTable.totalSpent} + ${sign * total})`,
      visitCount: sql`GREATEST(0, ${customersTable.visitCount} + ${sign})`,
    })
    .where(and(eq(customersTable.id, customerId), eq(customersTable.merchantId, merchantId)));
}

// GET /invoices
router.get("/invoices", requireAuth, async (req, res): Promise<void> => {
  const qParsed = ListInvoicesQueryParams.safeParse(req.query);
  if (!qParsed.success) { res.status(400).json({ error: qParsed.error.message }); return; }
  const { status, limit, offset } = qParsed.data;
  const merchantId = req.session.merchantId!;
  const conditions = [eq(invoicesTable.merchantId, merchantId)];
  if (status) conditions.push(eq(invoicesTable.status, status));

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(invoicesTable)
    .where(and(...conditions));

  const rows = await db
    .select({
      invoice: invoicesTable,
      customerFirstName: customersTable.firstName,
      customerLastName: customersTable.lastName,
      customerEmail: customersTable.email,
      customerPhone: customersTable.phone,
      customerAddress: customersTable.address,
      customerCompany: customersTable.company,
      customerBillingStreet: customersTable.billingStreet,
      customerBillingCity: customersTable.billingCity,
      customerBillingState: customersTable.billingState,
      customerBillingPostcode: customersTable.billingPostcode,
    })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(and(...conditions))
    .orderBy(asc(invoicesTable.dueDate), desc(invoicesTable.createdAt))
    .limit(limit)
    .offset(offset);

  const listBody = {
    items: rows.map((r) => fmt(r.invoice, r.customerFirstName, r.customerLastName, r.customerEmail, r.customerPhone, r.customerAddress, r.customerCompany, r.customerBillingStreet, r.customerBillingCity, r.customerBillingState, r.customerBillingPostcode)),
    total: Number(countResult.count),
  };
  assertValidInvoiceResponse(ListInvoicesResponse, listBody, "GET /invoices");
  res.json(listBody);
});

// GET /invoices/:id
router.get("/invoices/:id", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = GetInvoiceParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  const merchantId = req.session.merchantId!;

  const [row] = await db
    .select({
      invoice: invoicesTable,
      customerFirstName: customersTable.firstName,
      customerLastName: customersTable.lastName,
      customerEmail: customersTable.email,
      customerPhone: customersTable.phone,
      customerAddress: customersTable.address,
      customerCompany: customersTable.company,
      customerBillingStreet: customersTable.billingStreet,
      customerBillingCity: customersTable.billingCity,
      customerBillingState: customersTable.billingState,
      customerBillingPostcode: customersTable.billingPostcode,
    })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, merchantId)));

  if (!row) { res.status(404).json({ error: "Invoice not found" }); return; }
  const getInvoiceBody = fmt(row.invoice, row.customerFirstName, row.customerLastName, row.customerEmail, row.customerPhone, row.customerAddress, row.customerCompany, row.customerBillingStreet, row.customerBillingCity, row.customerBillingState, row.customerBillingPostcode);
  assertValidInvoiceResponse(GetInvoiceResponse, getInvoiceBody, "GET /invoices/:id");
  res.json(getInvoiceBody);
});

// POST /invoices
router.post("/invoices", requireAuth, async (req, res): Promise<void> => {
  const bodyParsed = CreateInvoiceBody.safeParse(req.body);
  if (!bodyParsed.success) { res.status(400).json({ error: bodyParsed.error.message }); return; }
  const {
    customerId,
    staffId,
    dueDate,
    notes,
    items: lineItems,
    invoicePrefix,
    invoiceDigits,
    recurring,
    discount: discountInput,
    serviceJobId,
    appointmentId,
  } = bodyParsed.data;

  const merchantId = req.session.merchantId!;

  // Validate client-supplied foreign keys against this merchant before insert.
  // A stale value (e.g. a cached day-staff id from before a data restore) would
  // otherwise hit the DB FK constraint and surface as an opaque 500. Staff
  // attribution and the optional service-job/appointment links are non-critical,
  // so an unresolved id is dropped to null rather than failing the whole invoice.
  const safeStaffId = await resolveMerchantFk(staffTable, merchantId, staffId);
  const safeCustomerId = await resolveMerchantFk(customersTable, merchantId, customerId);
  const safeServiceJobId = await resolveMerchantFk(serviceJobsTable, merchantId, serviceJobId);
  const safeAppointmentId = await resolveMerchantFk(appointmentsTable, merchantId, appointmentId);
  if (staffId != null && safeStaffId == null) {
    console.warn(`[invoices] POST /invoices: staffId ${staffId} does not belong to merchant ${merchantId}; creating invoice without staff attribution`);
  }

  const rawLines: LineItem[] = (lineItems as LineItem[] | undefined) ?? [];
  const lines = await snapshotInvoiceLineCosts(merchantId, rawLines);
  const { total, taxTotal, subtotal, discountAmount } = computeTotals(lines, discountInput);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(invoicesTable)
    .where(eq(invoicesTable.merchantId, merchantId));

  const prefix = (invoicePrefix ?? "KI").toUpperCase();
  const digits = Math.max(1, Math.min(10, invoiceDigits ?? 5));
  const invNumber = `${prefix}${String(Number(countRow.count) + 1).padStart(digits, "0")}`;

  const [inv] = await db.insert(invoicesTable).values({
    merchantId,
    customerId: safeCustomerId,
    staffId: safeStaffId,
    invoiceNumber: invNumber,
    status: "draft",
    subtotal: String(subtotal),
    taxTotal: String(taxTotal),
    total: String(total),
    discountType:  discountInput?.type ?? null,
    discountValue: discountInput?.value != null ? String(discountInput.value) : null,
    discountTotal: discountAmount > 0 ? String(discountAmount) : null,
    items: lines.length ? lines : null,
    // dueDate / recurringStartDate columns are timestamps — they must be Date
    // objects, not the raw "YYYY-MM-DD" strings from the client.
    dueDate: dueDate ? new Date(dueDate) : null,
    notes: notes ?? null,
    serviceJobId: safeServiceJobId,
    appointmentId: safeAppointmentId,
    isRecurring: recurring ? "true" : "false",
    recurringFrequency: recurring?.frequency ?? null,
    recurringOccurrences: recurring?.occurrences ?? null,
    recurringStartDate: recurring?.startDate ? new Date(recurring.startDate) : null,
  }).returning();

  // Fetch with full customer details
  const [row] = await db
    .select({
      invoice: invoicesTable,
      customerFirstName: customersTable.firstName,
      customerLastName: customersTable.lastName,
      customerEmail: customersTable.email,
      customerPhone: customersTable.phone,
      customerAddress: customersTable.address,
      customerCompany: customersTable.company,
      customerBillingStreet: customersTable.billingStreet,
      customerBillingCity: customersTable.billingCity,
      customerBillingState: customersTable.billingState,
      customerBillingPostcode: customersTable.billingPostcode,
    })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(eq(invoicesTable.id, inv.id));

  const createInvoiceBody = row
    ? fmt(row.invoice, row.customerFirstName, row.customerLastName, row.customerEmail, row.customerPhone, row.customerAddress, row.customerCompany, row.customerBillingStreet, row.customerBillingCity, row.customerBillingState, row.customerBillingPostcode)
    : fmt(inv);
  assertValidInvoiceResponse(GetInvoiceResponse, createInvoiceBody, "POST /invoices");
  res.status(201).json(createInvoiceBody);
});

// PATCH /invoices/:id/viewed
router.patch("/invoices/:id/viewed", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = MarkInvoiceViewedParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  const merchantId = req.session.merchantId!;

  const [existing] = await db
    .select({ events: invoicesTable.events })
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, merchantId)));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const events: InvoiceEvent[] = [
    ...((existing.events as InvoiceEvent[] | null) ?? []),
    { type: "viewed", timestamp: new Date().toISOString() },
  ];
  await db
    .update(invoicesTable)
    .set({ viewedAt: new Date(), events })
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, merchantId)));

  const [row] = await db
    .select({
      invoice: invoicesTable,
      customerFirstName: customersTable.firstName,
      customerLastName: customersTable.lastName,
      customerEmail: customersTable.email,
      customerPhone: customersTable.phone,
      customerAddress: customersTable.address,
      customerCompany: customersTable.company,
      customerBillingStreet: customersTable.billingStreet,
      customerBillingCity: customersTable.billingCity,
      customerBillingState: customersTable.billingState,
      customerBillingPostcode: customersTable.billingPostcode,
    })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, merchantId)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const markViewedBody = fmt(row.invoice, row.customerFirstName, row.customerLastName, row.customerEmail, row.customerPhone, row.customerAddress, row.customerCompany, row.customerBillingStreet, row.customerBillingCity, row.customerBillingState, row.customerBillingPostcode);
  assertValidInvoiceResponse(MarkInvoiceViewedResponse, markViewedBody, "PATCH /invoices/:id/viewed");
  res.json(markViewedBody);
});

// PATCH /invoices/:id
router.patch("/invoices/:id", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = UpdateInvoiceParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  const bodyParsed = UpdateInvoiceBody.safeParse(req.body);
  if (!bodyParsed.success) { res.status(400).json({ error: bodyParsed.error.message }); return; }
  const { status, notes, dueDate, customerId, items, recurring, discount, serviceJobId, appointmentId } = bodyParsed.data;
  const updates: Record<string, unknown> = {};
  if (status) {
    updates.status = status;
    if (status === "paid") {
      updates.paidAt = new Date();
    } else {
      updates.paidAt = null;
      // Any explicit non-paid status (sent/draft/overdue/cancelled) clears recorded payments.
      if (status !== "partial") updates.amountPaid = "0";
    }
  }
  if (notes !== undefined) updates.notes = notes;
  if (dueDate !== undefined) updates.dueDate = dueDate ? new Date(dueDate) : null;
  // Validate FK ids against the merchant (mirrors POST /invoices) so a stale
  // client value can't trip the DB constraint and turn an edit into a 500.
  const updMerchantId = req.session.merchantId!;
  if (customerId !== undefined) updates.customerId = await resolveMerchantFk(customersTable, updMerchantId, customerId);
  if (serviceJobId !== undefined) updates.serviceJobId = await resolveMerchantFk(serviceJobsTable, updMerchantId, serviceJobId);
  if (appointmentId !== undefined) updates.appointmentId = await resolveMerchantFk(appointmentsTable, updMerchantId, appointmentId);
  if (items !== undefined || discount !== undefined) {
    // Fetch existing items/discount if only one was sent
    const [existing] = await db
      .select({ items: invoicesTable.items, discountType: invoicesTable.discountType, discountValue: invoicesTable.discountValue })
      .from(invoicesTable)
      .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, req.session.merchantId!)));
    // Re-snapshot costs only when new line data is supplied; otherwise keep the
    // existing items' original cost snapshots intact.
    const lines: LineItem[] = items !== undefined
      ? await snapshotInvoiceLineCosts(req.session.merchantId!, items as LineItem[])
      : ((existing?.items as LineItem[] | null) ?? []);
    const discountInput: Discount | null = discount !== undefined ? discount : (
      existing?.discountType && existing?.discountValue
        ? { type: existing.discountType as "fixed" | "percent", value: parseFloat(existing.discountValue) }
        : null
    );
    const { total, taxTotal, subtotal, discountAmount } = computeTotals(lines, discountInput);
    updates.items         = lines.length ? lines : null;
    updates.subtotal      = String(subtotal);
    updates.taxTotal      = String(taxTotal);
    updates.total         = String(total);
    updates.discountType  = discountInput?.type ?? null;
    updates.discountValue = discountInput?.value != null ? String(discountInput.value) : null;
    updates.discountTotal = discountAmount > 0 ? String(discountAmount) : null;
  }
  if (recurring !== undefined) {
    updates.isRecurring = recurring?.enabled ? "true" : "false";
    updates.recurringFrequency = recurring?.enabled ? (recurring.frequency ?? null) : null;
    updates.recurringOccurrences = recurring?.enabled ? (recurring.occurrences ?? null) : null;
    updates.recurringStartDate = recurring?.enabled && recurring.startDate ? new Date(recurring.startDate) : null;
  }
  // When marking an invoice paid we must detect the "first paid transition"
  // and credit loyalty exactly once. Lock the row and do the read-update-credit
  // in one transaction so two concurrent status="paid" updates can't both read
  // a non-paid state and double-credit loyalty.
  let inv: typeof invoicesTable.$inferSelect | undefined;
  const mId = req.session.merchantId!;
  await db.transaction(async (tx) => {
    // Always read the current row under lock so paid-state transitions (which
    // drive stock + customer spend, treating invoices like POS sales) are
    // computed atomically against the pre-update state.
    const [preInv] = await tx
      .select({ status: invoicesTable.status, customerId: invoicesTable.customerId, total: invoicesTable.total, items: invoicesTable.items })
      .from(invoicesTable)
      .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, mId)))
      .for("update");
    if (!preInv) return;

    const [updated] = await tx
      .update(invoicesTable)
      .set(updates)
      .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, mId)))
      .returning();
    inv = updated;
    if (!updated) return;

    const wasPaid = preInv.status === "paid";
    const isPaid  = updated.status === "paid";
    const itemsChanged = JSON.stringify(preInv.items ?? null) !== JSON.stringify(updated.items ?? null);
    const oldTotal = parseFloat(preInv.total ?? "0");
    const newTotal = parseFloat(updated.total ?? "0");

    // ── Stock: deduct on entering paid, restore on leaving, re-sync on edit ──
    if (!wasPaid && isPaid) {
      await applyInvoiceStock(tx, mId, updated.items, -1);
      // Marking paid via PATCH records no payment event, so stamp the invoice as
      // settled in full. The per-method reporting (view_invoice_payment_legs)
      // derives a remainder leg from amount_paid; without this the invoice would
      // appear in gross sales but contribute nothing to the payment breakdown.
      if (parseFloat(updated.amountPaid ?? "0") < newTotal) {
        const [resynced] = await tx
          .update(invoicesTable)
          .set({ amountPaid: updated.total })
          .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, mId)))
          .returning();
        inv = resynced;
      }
    } else if (wasPaid && !isPaid) {
      await applyInvoiceStock(tx, mId, preInv.items, 1);
    } else if (wasPaid && isPaid && itemsChanged) {
      await applyInvoiceStock(tx, mId, preInv.items, 1);
      await applyInvoiceStock(tx, mId, updated.items, -1);
    }

    // ── Customer lifetime spend + visit count (mirrors POS) ──
    if (!wasPaid && isPaid) {
      await applyInvoiceCustomerSpend(tx, mId, updated.customerId, newTotal, 1);
    } else if (wasPaid && !isPaid) {
      await applyInvoiceCustomerSpend(tx, mId, preInv.customerId, oldTotal, -1);
    } else if (wasPaid && isPaid && (oldTotal !== newTotal || preInv.customerId !== updated.customerId)) {
      await applyInvoiceCustomerSpend(tx, mId, preInv.customerId, oldTotal, -1);
      await applyInvoiceCustomerSpend(tx, mId, updated.customerId, newTotal, 1);
    }

    // ── Credit loyalty when an invoice transitions to paid for the first time ──
    if (!wasPaid && isPaid && preInv.customerId) {
      await creditLoyaltyForPaidInvoice(tx, mId, preInv.customerId, parseFloat(preInv.total ?? "0"));
    }
  });
  if (!inv) { res.status(404).json({ error: "Invoice not found" }); return; }

  // When this update marks the invoice Paid, complete any linked service job / appointment.
  if (status === "paid") {
    await completeLinkedRecords(req.session.merchantId!, inv.serviceJobId, inv.appointmentId);
  }

  const [row] = await db
    .select({
      invoice: invoicesTable,
      customerFirstName: customersTable.firstName,
      customerLastName: customersTable.lastName,
      customerEmail: customersTable.email,
    })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(eq(invoicesTable.id, id));

  const updateInvoiceBody = row
    ? fmt(row.invoice, row.customerFirstName, row.customerLastName, row.customerEmail)
    : fmt(inv);
  assertValidInvoiceResponse(UpdateInvoiceResponse, updateInvoiceBody, "PATCH /invoices/:id");
  res.json(updateInvoiceBody);
});

// POST /invoices/:id/payment — record a (partial or full) payment against an invoice
router.post("/invoices/:id/payment", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = RecordInvoicePaymentParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  const merchantId = req.session.merchantId!;
  const bodyParsed = RecordInvoicePaymentBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }
  const { amount, method, payments, giftCardPayment, idempotencyKey: rawIdempotencyKey } = bodyParsed.data;
  const idempotencyKey =
    typeof rawIdempotencyKey === "string" && rawIdempotencyKey.trim() !== ""
      ? rawIdempotencyKey.trim()
      : undefined;

  // Normalise to a list of payment legs. A split payment supplies `payments`
  // (each method + amount, recorded as its own event so reporting can attribute
  // each leg to its method); a single payment is one leg of `amount`/`method`.
  const isSplit = Array.isArray(payments) && payments.length > 0;
  if (isSplit && giftCardPayment) {
    res.status(400).json({ error: "Split payments cannot be combined with a gift card payment" });
    return;
  }
  const legs: { amount: number; method?: string }[] = isSplit
    ? payments!.map((p) => ({ amount: round2(Number(p.amount)), method: p.method }))
    : [{ amount: round2(Number(amount)), method }];
  if (legs.some((l) => !Number.isFinite(l.amount) || l.amount <= 0)) {
    res.status(400).json({ error: "Every payment amount must be positive" });
    return;
  }
  const payInput = round2(legs.reduce((s, l) => s + l.amount, 0));
  if (!Number.isFinite(payInput) || payInput <= 0) {
    res.status(400).json({ error: "A positive payment amount is required" });
    return;
  }

  // Read-modify-write inside a transaction with a row lock so two concurrent
  // submissions (double-click, retry, two terminals) can't both read the
  // pre-paid state and both append a payment event / double-credit loyalty.
  let notFound = false;
  let payErrorStatus = 0;
  let payErrorMessage = "";
  // Captured for after-commit completion of any linked service job / appointment.
  let settledServiceJobId: number | null = null;
  let settledAppointmentId: number | null = null;
  await db.transaction(async (tx) => {
    const [cur] = await tx
      .select({
        total: invoicesTable.total,
        amountPaid: invoicesTable.amountPaid,
        status: invoicesTable.status,
        customerId: invoicesTable.customerId,
        events: invoicesTable.events,
        items: invoicesTable.items,
        serviceJobId: invoicesTable.serviceJobId,
        appointmentId: invoicesTable.appointmentId,
      })
      .from(invoicesTable)
      .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, merchantId)))
      .for("update");
    if (!cur) { notFound = true; return; }

    // Idempotency: if a payment carrying this key was already recorded, do not
    // re-apply it (which would double-charge a gift card / double-credit loyalty).
    // Returning here leaves the invoice untouched; the response below reflects
    // the already-recorded state.
    if (idempotencyKey) {
      const alreadyApplied = ((cur.events as InvoiceEvent[] | null) ?? [])
        .some((e) => e.idempotencyKey === idempotencyKey);
      if (alreadyApplied) return;
    }

    const total = parseFloat(cur.total ?? "0");
    const prevPaid = parseFloat(cur.amountPaid ?? "0");
    const pay = round2(payInput);
    const newPaid = Math.min(round2(prevPaid + pay), total);
    const fullyPaid = newPaid >= total - 0.005;
    const balance = round2(Math.max(0, total - newPaid));
    const newStatus = fullyPaid ? "paid" : newPaid > 0 ? "partial" : cur.status;

    // Atomic gift-card debit: lock, validate, decrement the card and write a
    // redemption ledger entry inside the SAME transaction as the invoice
    // payment, so the card is never charged unless the payment is recorded.
    if (giftCardPayment) {
      const cardId = Number(giftCardPayment.cardId);
      const applied = round2(Number(giftCardPayment.amount));
      if (!Number.isFinite(cardId)) { payErrorStatus = 400; payErrorMessage = "Invalid gift card"; return; }
      if (!(applied > 0)) { payErrorStatus = 400; payErrorMessage = "Gift card payment amount must be positive"; return; }
      if (applied > pay + 0.005) { payErrorStatus = 400; payErrorMessage = "Gift card payment exceeds payment amount"; return; }
      const [card] = await tx
        .select()
        .from(giftCardsTable)
        .where(and(eq(giftCardsTable.id, cardId), eq(giftCardsTable.merchantId, merchantId)))
        .for("update");
      if (!card) { payErrorStatus = 404; payErrorMessage = "Gift card not found"; return; }
      if (card.status !== "active") { payErrorStatus = 400; payErrorMessage = `Gift card is ${card.status}`; return; }
      if (card.expiryDate && new Date() > card.expiryDate) { payErrorStatus = 400; payErrorMessage = "Gift card has expired"; return; }
      const cardBalance = parseFloat(card.currentBalance);
      if (applied > cardBalance + 0.005) { payErrorStatus = 400; payErrorMessage = "Insufficient gift card balance"; return; }
      const newCardBalance = round2(Math.max(0, cardBalance - applied));
      await tx
        .update(giftCardsTable)
        .set({
          currentBalance: newCardBalance.toString(),
          status: newCardBalance <= 0 ? "redeemed" : card.status,
        })
        .where(eq(giftCardsTable.id, card.id));
      await tx.insert(giftCardLedgerTable).values({
        merchantId,
        giftCardId: card.id,
        type: "redemption",
        amount: (-applied).toString(),
        balanceAfter: newCardBalance.toString(),
        note: `Redeemed on invoice payment #${id}`,
      });
    }

    // One payment event per leg, each carrying its own amount + method so the
    // per-method reporting can attribute each leg correctly. The settlement
    // summary (paid in full / balance remaining) is noted on the first leg, and
    // the idempotency key is stamped on the first leg only.
    const ts = new Date().toISOString();
    const settleNote = fullyPaid
      ? `— paid in full`
      : `— balance $${balance.toFixed(2)} remaining`;
    const legEvents: InvoiceEvent[] = legs.map((leg, i) => ({
      type: "payment",
      timestamp: ts,
      detail: `Payment of $${leg.amount.toFixed(2)} recorded${i === 0 ? ` ${settleNote}` : leg.method ? ` (${leg.method})` : ""}`,
      amount: leg.amount,
      ...(leg.method ? { method: leg.method } : {}),
      ...(i === 0 && idempotencyKey ? { idempotencyKey } : {}),
    }));
    const events: InvoiceEvent[] = [
      ...((cur.events as InvoiceEvent[] | null) ?? []),
      ...legEvents,
    ];

    await tx
      .update(invoicesTable)
      .set({
        amountPaid: String(newPaid),
        status: newStatus,
        paidAt: fullyPaid ? new Date() : null,
        events,
      })
      .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, merchantId)));

    // Settling in full for the first time treats the invoice like a POS sale:
    // deduct stock, roll into customer spend, and credit loyalty — exactly once.
    if (fullyPaid && cur.status !== "paid") {
      await applyInvoiceStock(tx, merchantId, cur.items, -1);
      await applyInvoiceCustomerSpend(tx, merchantId, cur.customerId, total, 1);
      if (cur.customerId) {
        await creditLoyaltyForPaidInvoice(tx, merchantId, cur.customerId, total);
      }
    }
    // When this payment settles the invoice in full for the first time, complete
    // any linked service job / appointment (done after commit, below).
    if (fullyPaid && cur.status !== "paid") {
      settledServiceJobId = cur.serviceJobId;
      settledAppointmentId = cur.appointmentId;
    }
  });

  if (notFound) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (payErrorStatus) { res.status(payErrorStatus).json({ error: payErrorMessage }); return; }
  if (settledServiceJobId != null || settledAppointmentId != null) {
    await completeLinkedRecords(merchantId, settledServiceJobId, settledAppointmentId);
  }
  // An already-applied idempotent payment falls through and returns the
  // current (unchanged) invoice below.

  const [row] = await db
    .select({
      invoice: invoicesTable,
      customerFirstName: customersTable.firstName,
      customerLastName: customersTable.lastName,
      customerEmail: customersTable.email,
      customerPhone: customersTable.phone,
      customerAddress: customersTable.address,
      customerCompany: customersTable.company,
      customerBillingStreet: customersTable.billingStreet,
      customerBillingCity: customersTable.billingCity,
      customerBillingState: customersTable.billingState,
      customerBillingPostcode: customersTable.billingPostcode,
    })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, merchantId)));
  if (!row) { res.status(404).json({ error: "Invoice not found" }); return; }
  const paymentBody = fmt(row.invoice, row.customerFirstName, row.customerLastName, row.customerEmail, row.customerPhone, row.customerAddress, row.customerCompany, row.customerBillingStreet, row.customerBillingCity, row.customerBillingState, row.customerBillingPostcode);
  assertValidInvoiceResponse(RecordInvoicePaymentResponse, paymentBody, "POST /invoices/:id/payment");
  res.json(paymentBody);
});

// DELETE /invoices/:id
router.delete("/invoices/:id", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = DeleteInvoiceParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  const merchantId = req.session.merchantId!;
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ status: invoicesTable.status, customerId: invoicesTable.customerId, total: invoicesTable.total, items: invoicesTable.items })
      .from(invoicesTable)
      .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, merchantId)))
      .for("update");
    if (!existing) return;
    // Deleting a paid invoice reverses its stock + spend effects (mirrors POS).
    if (existing.status === "paid") {
      await applyInvoiceStock(tx, merchantId, existing.items, 1);
      await applyInvoiceCustomerSpend(tx, merchantId, existing.customerId, parseFloat(existing.total ?? "0"), -1);
    }
    await tx.delete(invoicesTable).where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, merchantId)));
  });
  res.sendStatus(204);
});

// GET /invoices/:id/pdf — stream a branded A4 PDF for this invoice
router.get("/invoices/:id/pdf", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = GetInvoicePdfParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  const merchantId = req.session.merchantId!;

  const [row] = await db
    .select({
      invoice: invoicesTable,
      customerFirstName: customersTable.firstName,
      customerLastName: customersTable.lastName,
      customerEmail: customersTable.email,
      customerPhone: customersTable.phone,
      customerAddress: customersTable.address,
      customerCompany: customersTable.company,
      customerBillingStreet: customersTable.billingStreet,
      customerBillingCity: customersTable.billingCity,
      customerBillingState: customersTable.billingState,
      customerBillingPostcode: customersTable.billingPostcode,
    })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, merchantId)));

  if (!row) { res.status(404).json({ error: "Invoice not found" }); return; }

  const [[merchant], [bp], [tplRow]] = await Promise.all([
    db.select().from(merchantsTable).where(eq(merchantsTable.id, merchantId)),
    db.select().from(businessProfileTable).where(eq(businessProfileTable.merchantId, merchantId)),
    db.select().from(salesTemplatesTable).where(and(eq(salesTemplatesTable.merchantId, merchantId), eq(salesTemplatesTable.templateType, "Invoice"))),
  ]);

  const inv = fmt(
    row.invoice,
    row.customerFirstName, row.customerLastName, row.customerEmail,
    row.customerPhone, row.customerAddress, row.customerCompany,
    row.customerBillingStreet, row.customerBillingCity, row.customerBillingState, row.customerBillingPostcode,
  );

  const billingAddr = [row.customerBillingStreet, row.customerBillingCity, row.customerBillingState, row.customerBillingPostcode].filter(Boolean).join(", ")
    || row.customerAddress
    || null;

  const tplOpts = (tplRow?.options ?? {}) as Record<string, unknown>;
  let bpBrandColors: string[] = [];
  try { bpBrandColors = JSON.parse(bp?.brandColors || "[]"); } catch { /* use default */ }
  const pdfBuffer = await buildInvoicePdf({
    invoiceNumber: inv.invoiceNumber,
    status:        inv.status ?? "draft",
    createdAt:     inv.createdAt,
    dueDate:       inv.dueDate,
    paidAt:        inv.paidAt,
    items:         (inv.items as LineItem[]) ?? [],
    subtotal:      inv.subtotal,
    taxTotal:      inv.taxTotal,
    total:         inv.total,
    amountPaid:    inv.amountPaid,
    discountTotal: inv.discountTotal,
    discountType:  inv.discountType,
    discountValue: inv.discountValue,
    notes:         inv.notes,
    customerName:  inv.customerName,
    customerEmail: inv.customerEmail,
    customerPhone: inv.customerPhone,
    customerAddress: billingAddr,
    customerCompany: inv.customerCompany,
    businessName:    merchant?.businessName ?? "Your Business",
    businessPhone:   merchant?.phone ?? null,
    businessAddress: merchant?.address ?? null,
    businessCity:    merchant?.city ?? null,
    businessAbn:     bp?.abn || null,
    businessWebsite: bp?.website || null,
    businessEmail:   bp?.contactEmail || null,
    brandColor:      bpBrandColors[0] || null,
    logoUrl:         bp?.logo || null,
    // ── Template settings ────────────────────────────────────────────────
    showLogo:              tplRow ? tplRow.showLogo : true,
    showAbn:               tplOpts.showAbn !== undefined ? Boolean(tplOpts.showAbn) : true,
    showWebsite:           tplOpts.showWebsite !== undefined ? Boolean(tplOpts.showWebsite) : true,
    showTagline:           Boolean(tplOpts.showTagline),
    businessTagline:       bp?.tagline || null,
    showGstBreakdown:      tplOpts.showGstBreakdown !== undefined ? Boolean(tplOpts.showGstBreakdown) : true,
    headerText:            tplRow?.headerHtml || (tplOpts.headerText as string | undefined) || null,
    thankYouMsg:           (tplOpts.thankYouMsg as string | undefined) || null,
    footerText:            tplRow?.footerHtml || (tplOpts.footerText as string | undefined) || null,
    paymentTerms:          (tplOpts.paymentTerms as string | undefined) || null,
    invoiceNotes:          (tplOpts.invoiceNotes as string | undefined) || null,
    bankDetails:           (tplOpts.bankDetails as string | undefined) || null,
    paymentSectionHeading: (tplOpts.paymentSectionHeading as string | undefined) || null,
    showAllCustomerDetails: Boolean(tplOpts.showAllCustomerDetails),
    showSocialLinks:        Boolean(tplOpts.showSocialLinks),
    socialIconBrandColors:  Boolean(tplOpts.socialIconBrandColors),
    socialLinks:            (() => { try { return JSON.parse(bp?.socialLinks || "{}") as Record<string, string>; } catch { return null; } })(),
    fontFamily:             tplRow?.fontFamily || null,
    styleVariant:           tplRow?.selectedStyle || null,
    showCustomerQr:         Boolean(tplOpts.showCustomerQr),
    showLoyaltyEarned:      Boolean(tplOpts.showLoyaltyEarned),
    showPaymentMethods:     Boolean(tplOpts.showPaymentMethods),
    showBarcode:            Boolean(tplOpts.showBarcode),
    showReferralLink:       Boolean(tplOpts.showReferralLink),
    customMessage:          (tplOpts.customMessage as string | undefined) || null,
    referralLinkText:       (tplOpts.referralLinkText as string | undefined) || null,
    // The customer-profile QR encodes the customer code (a stable scan-to-lookup
    // identifier). Once persisted per-customer QRs land, swap in that QR's URL.
    customerCode:           row.invoice.customerId ? `CUS-${row.invoice.customerId}` : null,
    customerQrValue:        row.invoice.customerId ? `CUS-${row.invoice.customerId}` : null,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${inv.invoiceNumber}.pdf"`);
  res.setHeader("Content-Length", pdfBuffer.length);
  res.send(pdfBuffer);
});

// POST /invoices/:id/send-email
router.post("/invoices/:id/send-email", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = SendInvoiceEmailParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  const merchantId = req.session.merchantId!;
  const bodyParsed = SendInvoiceEmailBody.safeParse(req.body);
  if (!bodyParsed.success) { res.status(400).json({ error: bodyParsed.error.message }); return; }
  const { email, template } = bodyParsed.data;

  const [row] = await db
    .select({
      invoice: invoicesTable,
      customerFirstName: customersTable.firstName,
      customerLastName: customersTable.lastName,
      customerEmail: customersTable.email,
      customerPhone: customersTable.phone,
      customerAddress: customersTable.address,
      customerCompany: customersTable.company,
      customerBillingStreet: customersTable.billingStreet,
      customerBillingCity: customersTable.billingCity,
      customerBillingState: customersTable.billingState,
      customerBillingPostcode: customersTable.billingPostcode,
    })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, merchantId)));

  if (!row) { res.status(404).json({ error: "Invoice not found" }); return; }

  const [merchant, bp, emailTplRow] = await Promise.all([
    db.select().from(merchantsTable).where(eq(merchantsTable.id, merchantId)).then((r) => r[0]),
    db.select().from(businessProfileTable).where(eq(businessProfileTable.merchantId, merchantId)).then((r) => r[0]),
    db.select().from(salesTemplatesTable).where(and(eq(salesTemplatesTable.merchantId, merchantId), eq(salesTemplatesTable.templateType, "Invoice"))).then((r) => r[0]),
  ]);
  const bizName = merchant?.businessName ?? "KoaPOS";
  const inv = row.invoice;
  const cName = customerName(row.customerFirstName, row.customerLastName, row.customerCompany);
  const lines = (inv.items as LineItem[] | null) ?? [];

  /* ── Resolve template options (with sensible defaults) ── */
  const tpl = template ?? {};
  const tplId            = tpl.templateId ?? "e-pro";
  const brandColor       = tpl.brandColor ?? "#4f46e5";
  const totalStr         = `$${parseFloat(inv.total).toFixed(2)}`;
  const resolve = (s: string) => s
    .replace(/{{business\.name}}/g, bizName)
    .replace(/{{business\.email}}/g, tpl.contactEmail ?? "")
    .replace(/{{business\.website}}/g, tpl.website ?? "")
    .replace(/{{transaction\.total}}/g, totalStr)
    .replace(/{{transaction\.number}}/g, inv.invoiceNumber)
    .replace(/{{customer\.name}}/g, cName || "")
    .replace(/{{[^}]+}}/g, "");

  const subject  = resolve(tpl.subjectLine || `Invoice ${inv.invoiceNumber} from ${bizName}`);
  const greeting = resolve(tpl.customGreeting || (cName ? `Hi ${cName.split(" ")[0]},` : "Hi,"));
  const signOff  = resolve(tpl.customSignOff  || `— The team at ${bizName}`);
  const cMsg     = tpl.customMessage ? resolve(tpl.customMessage) : "";
  const thankYou = resolve(tpl.thankYouMsg || "Thank you for your business!");
  const footer   = tpl.footerText ? resolve(tpl.footerText) : "";

  const itemRows = lines.map((l) =>
    `<tr>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;">${l.description}</td>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;text-align:center;">${l.quantity}</td>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;text-align:right;">$${(l.quantity * l.unitPrice).toFixed(2)}</td>
    </tr>`
  ).join("");

  const logoBlock = (tpl.showLogo !== false && tpl.logo)
    ? `<img src="${tpl.logo}" alt="${bizName}" style="max-height:48px;max-width:140px;display:block;margin-bottom:8px"/>`
    : "";

  const socialsBlock = tpl.showSocialLinks && tpl.socialLinks ? (() => {
    const s = tpl.socialLinks!;
    const parts: string[] = [];
    if (s.facebook)  parts.push(`fb/ ${s.facebook}`);
    if (s.instagram) parts.push(`ig/ @${s.instagram}`);
    if (s.twitter)   parts.push(`x/ @${s.twitter}`);
    if (s.linkedin)  parts.push(`in/ ${s.linkedin}`);
    return parts.length ? `<p style="margin-top:12px;font-size:11px;color:#aaa;text-align:center;">${parts.join(" · ")}</p>` : "";
  })() : "";

  // Layout per template id
  const isMinimal = tplId === "e-minimal";
  const isCasual  = tplId === "e-casual";

  const headerHtml = isMinimal
    ? `<h2 style="margin:0 0 4px;font-family:monospace;font-size:16px;">${bizName}</h2>`
    : isCasual
      ? `<div style="text-align:center;margin-bottom:16px;">${logoBlock ? `<div style="display:flex;justify-content:center">${logoBlock}</div>` : ""}<h2 style="margin:0;font-size:20px;color:${brandColor};">${bizName}</h2>${tpl.tagline ? `<p style="margin:2px 0 0;color:#888;font-size:12px;font-style:italic">${tpl.tagline}</p>` : ""}</div>`
      : `<div style="border-bottom:3px solid ${brandColor};padding-bottom:12px;margin-bottom:20px;">${logoBlock}<h2 style="margin:0;font-size:18px;">${bizName}</h2></div>`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#222;">
      ${headerHtml}
      <p style="margin:0 0 12px;font-size:14px;">${greeting}</p>
      ${cMsg ? `<p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#444;">${cMsg.replace(/\n/g, "<br>")}</p>` : `<p style="margin:0 0 16px;font-size:13px;color:#555;">Your invoice <strong>${inv.invoiceNumber}</strong> is attached below.</p>`}
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
        <thead>
          <tr>
            <th style="text-align:left;padding-bottom:8px;border-bottom:2px solid #eee;color:#555;font-size:12px;">Description</th>
            <th style="text-align:center;padding-bottom:8px;border-bottom:2px solid #eee;color:#555;font-size:12px;">Qty</th>
            <th style="text-align:right;padding-bottom:8px;border-bottom:2px solid #eee;color:#555;font-size:12px;">Amount</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div style="margin-top:16px;text-align:right;font-size:13px;color:#555;">
        <div>Subtotal: $${parseFloat(inv.subtotal).toFixed(2)}</div>
        ${tpl.showGstBreakdown !== false ? `<div>GST (10%): $${parseFloat(inv.taxTotal).toFixed(2)}</div>` : ""}
        ${inv.discountTotal ? `<div style="color:#d97706;">Discount: −$${parseFloat(inv.discountTotal).toFixed(2)}</div>` : ""}
        <div style="font-size:16px;font-weight:bold;margin-top:8px;color:${brandColor};">Total: ${totalStr}</div>
      </div>
      ${inv.notes ? `<p style="margin-top:24px;font-size:13px;color:#555;border-top:1px solid #eee;padding-top:16px;">${inv.notes}</p>` : ""}
      <p style="margin-top:28px;font-size:13px;color:#444;">${signOff}</p>
      <p style="margin-top:24px;font-size:13px;font-weight:600;text-align:center;color:${brandColor};">${thankYou}</p>
      ${tpl.showWebsite && tpl.website ? `<p style="margin-top:8px;font-size:12px;text-align:center;"><a href="${tpl.website}" style="color:${brandColor};">${tpl.website}</a></p>` : ""}
      ${socialsBlock}
      ${footer ? `<p style="margin-top:20px;padding-top:12px;border-top:1px solid #eee;font-size:11px;color:#aaa;text-align:center;">${footer}</p>` : ""}
    </div>`;

  // Generate PDF to attach
  const billingAddrForPdf = [row.customerBillingStreet, row.customerBillingCity, row.customerBillingState, row.customerBillingPostcode].filter(Boolean).join(", ")
    || row.customerAddress
    || null;
  const emailTplOpts = (emailTplRow?.options ?? {}) as Record<string, unknown>;
  const pdfBuffer = await buildInvoicePdf({
    invoiceNumber: inv.invoiceNumber,
    status:        inv.status ?? "draft",
    createdAt:     inv.createdAt.toISOString(),
    dueDate:       inv.dueDate?.toISOString() ?? null,
    paidAt:        inv.paidAt?.toISOString() ?? null,
    items:         (inv.items as LineItem[]) ?? [],
    subtotal:      parseFloat(inv.subtotal),
    taxTotal:      parseFloat(inv.taxTotal),
    total:         parseFloat(inv.total),
    amountPaid:    parseFloat(inv.amountPaid ?? "0"),
    discountTotal: inv.discountTotal ? parseFloat(inv.discountTotal) : null,
    discountType:  inv.discountType ?? null,
    discountValue: inv.discountValue ? parseFloat(inv.discountValue) : null,
    notes:         inv.notes ?? null,
    customerName:  cName || null,
    customerEmail: row.customerEmail ?? null,
    customerPhone: row.customerPhone ?? null,
    customerAddress: billingAddrForPdf,
    customerCompany: row.customerCompany ?? null,
    businessName:    bizName,
    businessPhone:   merchant?.phone ?? null,
    businessAddress: merchant?.address ?? null,
    businessCity:    merchant?.city ?? null,
    businessAbn:     bp?.abn || null,
    businessWebsite: bp?.website || null,
    businessEmail:   bp?.contactEmail || null,
    brandColor:      tpl.brandColor || (() => { try { return (JSON.parse(bp?.brandColors || "[]") as string[])[0] || null; } catch { return null; } })(),
    logoUrl:         tpl.logo || bp?.logo || null,
    // ── Template settings ────────────────────────────────────────────────
    showLogo:              emailTplRow ? emailTplRow.showLogo : true,
    showAbn:               emailTplOpts.showAbn !== undefined ? Boolean(emailTplOpts.showAbn) : true,
    showWebsite:           emailTplOpts.showWebsite !== undefined ? Boolean(emailTplOpts.showWebsite) : true,
    showTagline:           Boolean(emailTplOpts.showTagline),
    businessTagline:       bp?.tagline || null,
    showGstBreakdown:      emailTplOpts.showGstBreakdown !== undefined ? Boolean(emailTplOpts.showGstBreakdown) : true,
    headerText:            emailTplRow?.headerHtml || (emailTplOpts.headerText as string | undefined) || null,
    thankYouMsg:           (emailTplOpts.thankYouMsg as string | undefined) || null,
    footerText:            emailTplRow?.footerHtml || (emailTplOpts.footerText as string | undefined) || null,
    paymentTerms:          (emailTplOpts.paymentTerms as string | undefined) || null,
    invoiceNotes:          (emailTplOpts.invoiceNotes as string | undefined) || null,
    bankDetails:           (emailTplOpts.bankDetails as string | undefined) || null,
    paymentSectionHeading: (emailTplOpts.paymentSectionHeading as string | undefined) || null,
    showAllCustomerDetails: Boolean(emailTplOpts.showAllCustomerDetails),
    showSocialLinks:        Boolean(emailTplOpts.showSocialLinks),
    socialIconBrandColors:  Boolean(emailTplOpts.socialIconBrandColors),
    socialLinks:            tpl.socialLinks ?? (() => { try { return JSON.parse(bp?.socialLinks || "{}") as Record<string, string>; } catch { return null; } })(),
    fontFamily:             emailTplRow?.fontFamily || null,
    styleVariant:           emailTplRow?.selectedStyle || null,
  });

  // Embed a 1×1 tracking pixel so viewedAt is set when the customer opens the email
  const baseUrl = publicOrigin(req);
  const pingUrl = `${baseUrl}/api/invoices/${id}/ping-view?key=${makeViewKey(id, merchantId)}`;
  const htmlWithPixel = html + `\n<img src="${pingUrl}" width="1" height="1" alt="" style="display:none" />`;

  const result = await sendEmail(merchantId, {
    to: email,
    subject,
    html: htmlWithPixel,
    text: `${greeting}\n\nInvoice ${inv.invoiceNumber} from ${bizName}\nTotal: ${totalStr}\n\n${cMsg}\n\n${signOff}\n${thankYou}`,
    attachments: [{ filename: `${inv.invoiceNumber}.pdf`, content: pdfBuffer, contentType: "application/pdf" }],
  });

  if (!result.success) {
    req.log.warn({ invoiceId: id, email, error: result.error }, "Invoice email failed");
    res.status(400).json({ error: result.error ?? "Failed to send invoice email" });
    return;
  }

  // Mark as sent if still draft
  if (inv.status === "draft") {
    await db.update(invoicesTable).set({ status: "sent" }).where(eq(invoicesTable.id, id));
  }

  await appendInvoiceEvent(id, merchantId, { type: "email", timestamp: new Date().toISOString(), detail: email });

  req.log.info({ invoiceId: id, email }, "Invoice emailed");
  res.json({ success: true });
});

// POST /invoices/:id/event  — record a client-side event (download, print, etc.)
router.post("/invoices/:id/event", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = AddInvoiceEventParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  const merchantId = req.session.merchantId!;
  const bodyParsed = AddInvoiceEventBody.safeParse(req.body);
  if (!bodyParsed.success) { res.status(400).json({ error: bodyParsed.error.message }); return; }
  const { type, detail } = bodyParsed.data;

  const [existing] = await db
    .select({ events: invoicesTable.events })
    .from(invoicesTable)
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, merchantId)));
  if (!existing) { res.status(404).json({ error: "Invoice not found" }); return; }

  const events: InvoiceEvent[] = [
    ...((existing.events as InvoiceEvent[] | null) ?? []),
    { type, timestamp: new Date().toISOString(), ...(detail ? { detail } : {}) },
  ];
  await db.update(invoicesTable).set({ events }).where(eq(invoicesTable.id, id));

  const [row] = await db
    .select({
      invoice: invoicesTable,
      customerFirstName: customersTable.firstName,
      customerLastName: customersTable.lastName,
      customerEmail: customersTable.email,
      customerPhone: customersTable.phone,
      customerAddress: customersTable.address,
      customerCompany: customersTable.company,
      customerBillingStreet: customersTable.billingStreet,
      customerBillingCity: customersTable.billingCity,
      customerBillingState: customersTable.billingState,
      customerBillingPostcode: customersTable.billingPostcode,
    })
    .from(invoicesTable)
    .leftJoin(customersTable, eq(invoicesTable.customerId, customersTable.id))
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, merchantId)));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const addEventBody = fmt(row.invoice, row.customerFirstName, row.customerLastName, row.customerEmail, row.customerPhone, row.customerAddress, row.customerCompany, row.customerBillingStreet, row.customerBillingCity, row.customerBillingState, row.customerBillingPostcode);
  assertValidInvoiceResponse(AddInvoiceEventResponse, addEventBody, "POST /invoices/:id/event");
  res.json(addEventBody);
});

export default router;
