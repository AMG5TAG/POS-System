import { Router, type IRouter } from "express";
import { db, quotesTable, customersTable, merchantsTable, businessProfileTable, salesTemplatesTable, salesSettingsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { customerDisplayName } from "../lib/customer-name";
import { sendEmail } from "../services/email";
import { withUniqueRetry, nextSequential } from "../lib/document-numbers";
import { buildInvoicePdf } from "../services/invoicePdf";
import { customQrEmailBlock } from "../lib/custom-qr-email";
import { applyEstimateApprovalToJob, markJobAwaitingApproval } from "../services/quoteApproval";
import { appendJobNote } from "../lib/service-job-notes";
import {
  ListQuotesQueryParams,
  CreateQuoteBody,
  GetQuoteParams,
  UpdateQuoteParams,
  UpdateQuoteBody,
  DeleteQuoteParams,
  GetQuotePdfParams,
  SendQuoteEmailParams,
  SendQuoteEmailBody,
  ConvertQuoteParams,
  ConvertQuoteBody,
  AddQuoteEventParams,
  AddQuoteEventBody,
  GetQuoteResponse,
  UpdateQuoteResponse,
  ListQuotesResponse,
  ConvertQuoteResponse,
  AddQuoteEventResponse,
} from "@workspace/api-zod";
import type * as zod from "zod";

const router: IRouter = Router();

/**
 * Validate a quote API response against its declared Zod schema before sending.
 * Throws on mismatch (caught by Express as a 500) so schema drift is visible
 * rather than silently serving a malformed payload. safeParse avoids mutating
 * the value (e.g. coerced dates).
 */
function assertValidQuoteResponse(schema: zod.ZodTypeAny, data: unknown, context: string): void {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`[quotes] Response schema mismatch in ${context}: ${result.error.message}`);
  }
}

type LineItem = { description: string; quantity: number; unitPrice: number; taxRate: number };
type Discount = { type: "fixed" | "percent"; value: number };
type QuoteEvent = { type: string; timestamp: string; detail?: string; method?: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

/* Totals are GST-inclusive: unitPrice already includes tax, so taxTotal is the
   embedded component. Mirrors the invoices route's computeTotals exactly. */
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

/** Resolve the deposit required for a quote: an explicit amount wins, otherwise
 *  fall back to the merchant's default deposit % of the total. Returns a numeric
 *  string for the column, or null when no deposit applies. */
async function resolveDepositRequired(merchantId: number, total: number, explicit: unknown): Promise<string | null> {
  if (explicit != null && Number.isFinite(Number(explicit))) {
    const amt = Math.max(0, round2(Number(explicit)));
    return amt > 0 ? String(amt) : null;
  }
  const [s] = await db.select({ pct: salesSettingsTable.quoteDepositPercent })
    .from(salesSettingsTable).where(eq(salesSettingsTable.merchantId, merchantId)).limit(1);
  const pct = s ? parseFloat(s.pct) : 0;
  if (!(pct > 0) || !(total > 0)) return null;
  return String(round2(total * pct / 100));
}

const customerName = customerDisplayName;

function fmt(
  q: typeof quotesTable.$inferSelect,
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
  const billingParts = [cBillingStreet, cBillingCity, cBillingState, cBillingPostcode].filter(Boolean);
  const customerAddress = billingParts.length ? billingParts.join(", ") : (cAddress ?? null);

  // Surface expired status without mutating the row: a draft/sent quote past its
  // expiry date reads as "expired" for the client and filters.
  const isPastExpiry = q.expiryDate ? q.expiryDate.getTime() < Date.now() : false;
  const status = (isPastExpiry && (q.status === "draft" || q.status === "sent")) ? "expired" : q.status;

  return {
    ...q,
    status,
    subtotal: parseFloat(q.subtotal),
    taxTotal: parseFloat(q.taxTotal),
    total: parseFloat(q.total),
    discountType:  q.discountType  ?? null,
    discountValue: q.discountValue  ? parseFloat(q.discountValue)  : null,
    discountTotal: q.discountTotal  ? parseFloat(q.discountTotal)  : null,
    depositRequired: q.depositRequired != null ? parseFloat(q.depositRequired) : null,
    items: (q.items as LineItem[] | null) ?? [],
    events: (q.events as QuoteEvent[] | null) ?? [],
    expiryDate: q.expiryDate?.toISOString() ?? null,
    convertedTransactionId: q.convertedTransactionId ?? null,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
    customerName: customerName(cFirst ?? null, cLast ?? null, cCompany ?? null),
    customerEmail: cEmail ?? null,
    customerPhone: cPhone ?? null,
    customerAddress,
    customerCompany: cCompany ?? null,
  };
}

const CUSTOMER_COLS = {
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
} as const;

type QuoteJoinRow = {
  quote: typeof quotesTable.$inferSelect;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  customerCompany: string | null;
  customerBillingStreet: string | null;
  customerBillingCity: string | null;
  customerBillingState: string | null;
  customerBillingPostcode: string | null;
};

const fmtRow = (r: QuoteJoinRow) =>
  fmt(r.quote, r.customerFirstName, r.customerLastName, r.customerEmail, r.customerPhone, r.customerAddress, r.customerCompany, r.customerBillingStreet, r.customerBillingCity, r.customerBillingState, r.customerBillingPostcode);

async function loadQuoteRow(id: number, merchantId: number): Promise<QuoteJoinRow | undefined> {
  const [row] = await db
    .select({ quote: quotesTable, ...CUSTOMER_COLS })
    .from(quotesTable)
    .leftJoin(customersTable, eq(quotesTable.customerId, customersTable.id))
    .where(and(eq(quotesTable.id, id), eq(quotesTable.merchantId, merchantId)));
  return row;
}

async function appendQuoteEvent(id: number, merchantId: number, event: QuoteEvent) {
  const [row] = await db
    .select({ events: quotesTable.events })
    .from(quotesTable)
    .where(and(eq(quotesTable.id, id), eq(quotesTable.merchantId, merchantId)));
  if (!row) return;
  const events: QuoteEvent[] = [...((row.events as QuoteEvent[] | null) ?? []), event];
  await db.update(quotesTable).set({ events }).where(eq(quotesTable.id, id));
}

// GET /quotes
router.get("/quotes", requireAuth, async (req, res): Promise<void> => {
  const qParsed = ListQuotesQueryParams.safeParse(req.query);
  if (!qParsed.success) { res.status(400).json({ error: qParsed.error.message }); return; }
  const { status, customerId, serviceJobId, search, limit, offset } = qParsed.data;
  const merchantId = req.session.merchantId!;

  const conditions = [eq(quotesTable.merchantId, merchantId)];
  if (status) conditions.push(eq(quotesTable.status, status));
  if (customerId) conditions.push(eq(quotesTable.customerId, customerId));
  // Quotes raised against one repair job — what the POS asks for when a cashier
  // links that job to a sale.
  if (serviceJobId) conditions.push(eq(quotesTable.serviceJobId, serviceJobId));

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(quotesTable)
    .where(and(...conditions));

  const rows = await db
    .select({ quote: quotesTable, ...CUSTOMER_COLS })
    .from(quotesTable)
    .leftJoin(customersTable, eq(quotesTable.customerId, customersTable.id))
    .where(and(...conditions))
    .orderBy(desc(quotesTable.createdAt))
    .limit(limit)
    .offset(offset);

  let items = rows.map(fmtRow);

  // status filter must respect the computed "expired" overlay (fmt may flip
  // draft/sent → expired); re-filter after formatting when a status was given.
  if (status) items = items.filter((q) => q.status === status);

  if (search) {
    const term = search.toLowerCase();
    items = items.filter(
      (q) => q.quoteNumber.toLowerCase().includes(term) || (q.customerName ?? "").toLowerCase().includes(term),
    );
  }

  const listBody = { items, total: Number(countResult.count) };
  assertValidQuoteResponse(ListQuotesResponse, listBody, "GET /quotes");
  res.json(listBody);
});

// GET /quotes/:id
router.get("/quotes/:id", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = GetQuoteParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const row = await loadQuoteRow(paramsResult.data.id, req.session.merchantId!);
  if (!row) { res.status(404).json({ error: "Quote not found" }); return; }
  const body = fmtRow(row);
  assertValidQuoteResponse(GetQuoteResponse, body, "GET /quotes/:id");
  res.json(body);
});

// POST /quotes
router.post("/quotes", requireAuth, async (req, res): Promise<void> => {
  const bodyParsed = CreateQuoteBody.safeParse(req.body);
  if (!bodyParsed.success) { res.status(400).json({ error: bodyParsed.error.message }); return; }
  const { customerId, serviceJobId, expiryDate, notes, items: lineItems, quotePrefix, quoteDigits, discount: discountInput } = bodyParsed.data as typeof bodyParsed.data & { serviceJobId?: number | null };

  const merchantId = req.session.merchantId!;
  const lines: LineItem[] = (lineItems as LineItem[] | undefined) ?? [];
  const { total, taxTotal, subtotal, discountAmount } = computeTotals(lines, discountInput);

  const prefix = (quotePrefix ?? "QT-").toUpperCase();
  const digits = Math.max(1, Math.min(10, quoteDigits ?? 4));

  const depositRequired = await resolveDepositRequired(merchantId, total, (req.body as { depositRequired?: unknown }).depositRequired);

  // Number = <prefix><max existing suffix + 1> (max+1, not count+1, so a delete
  // never re-issues a number), retried on the unique-index conflict.
  const created = await withUniqueRetry("quotes_merchant_quote_number_unique", async (tryIndex) => {
    const existing = await db
      .select({ n: quotesTable.quoteNumber })
      .from(quotesTable)
      .where(eq(quotesTable.merchantId, merchantId));
    const quoteNumber = `${prefix}${String(nextSequential(existing.map((r) => r.n), tryIndex)).padStart(digits, "0")}`;
    const [row] = await db.insert(quotesTable).values({
      merchantId,
      customerId: customerId ?? null,
      serviceJobId: serviceJobId ?? null,
      quoteNumber,
      status: "draft",
      subtotal: String(subtotal),
      taxTotal: String(taxTotal),
      total: String(total),
      discountType:  discountInput?.type ?? null,
      discountValue: discountInput?.value != null ? String(discountInput.value) : null,
      discountTotal: discountAmount > 0 ? String(discountAmount) : null,
      depositRequired,
      items: lines.length ? lines : null,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      notes: notes ?? null,
    }).returning();
    return row;
  });

  /* Record the quote in the job's own note log, so the job history shows what
     the customer was offered and when without cross-referencing the Quotes page.
     Best-effort: the quote row is already committed and is what the caller asked
     for, so failing to annotate the job must not fail the request. */
  if (serviceJobId != null) {
    try {
      await appendJobNote(merchantId, serviceJobId, `Quote ${created.quoteNumber} added — $${total.toFixed(2)}`);
    } catch (err) {
      console.error("Failed to note quote on service job", err);
    }
  }

  const row = await loadQuoteRow(created.id, merchantId);
  const body = row ? fmtRow(row) : fmt(created);
  assertValidQuoteResponse(GetQuoteResponse, body, "POST /quotes");
  res.status(201).json(body);
});

// PUT /quotes/:id — partial update (only provided fields are applied)
router.put("/quotes/:id", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = UpdateQuoteParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  const bodyParsed = UpdateQuoteBody.safeParse(req.body);
  if (!bodyParsed.success) { res.status(400).json({ error: bodyParsed.error.message }); return; }
  const { status, notes, expiryDate, customerId, items, discount } = bodyParsed.data;
  const merchantId = req.session.merchantId!;

  const updates: Record<string, unknown> = {};
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  if (expiryDate !== undefined) updates.expiryDate = expiryDate ? new Date(expiryDate) : null;
  if (customerId !== undefined) updates.customerId = customerId ?? null;
  if (items !== undefined || discount !== undefined) {
    const [existing] = await db
      .select({ items: quotesTable.items, discountType: quotesTable.discountType, discountValue: quotesTable.discountValue })
      .from(quotesTable)
      .where(and(eq(quotesTable.id, id), eq(quotesTable.merchantId, merchantId)));
    const lines: LineItem[] = items ?? ((existing?.items as LineItem[] | null) ?? []);
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
  // Explicit per-quote deposit override (null clears it).
  const depositOverride = (req.body as { depositRequired?: unknown }).depositRequired;
  if (depositOverride !== undefined) {
    updates.depositRequired = depositOverride != null && Number.isFinite(Number(depositOverride)) && Number(depositOverride) > 0
      ? String(round2(Number(depositOverride))) : null;
  }

  const [updated] = await db
    .update(quotesTable)
    .set(updates)
    .where(and(eq(quotesTable.id, id), eq(quotesTable.merchantId, merchantId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Quote not found" }); return; }

  const row = await loadQuoteRow(id, merchantId);
  const body = row ? fmtRow(row) : fmt(updated);
  assertValidQuoteResponse(UpdateQuoteResponse, body, "PUT /quotes/:id");
  res.json(body);
});

// DELETE /quotes/:id
router.delete("/quotes/:id", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = DeleteQuoteParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  await db.delete(quotesTable).where(and(eq(quotesTable.id, paramsResult.data.id), eq(quotesTable.merchantId, req.session.merchantId!)));
  res.sendStatus(204);
});

// GET /quotes/:id/pdf — branded A4 PDF (reuses the invoice renderer with a "Quote" heading)
router.get("/quotes/:id/pdf", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = GetQuotePdfParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  const merchantId = req.session.merchantId!;

  const row = await loadQuoteRow(id, merchantId);
  if (!row) { res.status(404).json({ error: "Quote not found" }); return; }

  const [[merchant], [bp], [tplRow]] = await Promise.all([
    db.select().from(merchantsTable).where(eq(merchantsTable.id, merchantId)),
    db.select().from(businessProfileTable).where(eq(businessProfileTable.merchantId, merchantId)),
    db.select().from(salesTemplatesTable).where(and(eq(salesTemplatesTable.merchantId, merchantId), eq(salesTemplatesTable.templateType, "Quote"))),
  ]);

  const q = fmtRow(row);
  const billingAddr = [row.customerBillingStreet, row.customerBillingCity, row.customerBillingState, row.customerBillingPostcode].filter(Boolean).join(", ")
    || row.customerAddress || null;

  const tplOpts = (tplRow?.options ?? {}) as Record<string, unknown>;
  let bpBrandColors: string[] = [];
  try { bpBrandColors = JSON.parse(bp?.brandColors || "[]"); } catch { /* default */ }

  const pdfBuffer = await buildInvoicePdf({
    title:         "Quote",
    dueDateLabel:  "Valid until",
    invoiceNumber: q.quoteNumber,
    status:        q.status ?? "draft",
    createdAt:     q.createdAt,
    dueDate:       q.expiryDate,
    paidAt:        null,
    items:         (q.items as LineItem[]) ?? [],
    subtotal:      q.subtotal,
    taxTotal:      q.taxTotal,
    total:         q.total,
    amountPaid:    0,
    discountTotal: q.discountTotal,
    discountType:  q.discountType,
    discountValue: q.discountValue,
    notes:         q.notes,
    customerName:  q.customerName,
    customerEmail: q.customerEmail,
    customerPhone: q.customerPhone,
    customerAddress: billingAddr,
    customerCompany: q.customerCompany,
    businessName:    merchant?.businessName ?? "Your Business",
    businessPhone:   merchant?.phone ?? null,
    businessAddress: merchant?.address ?? null,
    businessCity:    merchant?.city ?? null,
    businessAbn:     bp?.abn || null,
    businessWebsite: bp?.website || null,
    businessEmail:   bp?.contactEmail || null,
    brandColor:      bpBrandColors[0] || null,
    logoUrl:         bp?.logo || null,
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
    showCustomQr:           Boolean(tplOpts.showCustomQr),
    customQrImage:          (tplOpts.customQrImage as string | undefined) || null,
    customQrCaption:        (tplOpts.customQrCaption as string | undefined) || null,
    showLoyaltyEarned:      Boolean(tplOpts.showLoyaltyEarned),
    showPaymentMethods:     Boolean(tplOpts.showPaymentMethods),
    showBarcode:            Boolean(tplOpts.showBarcode),
    showReferralLink:       Boolean(tplOpts.showReferralLink),
    customMessage:          (tplOpts.customMessage as string | undefined) || null,
    referralLinkText:       (tplOpts.referralLinkText as string | undefined) || null,
    customerCode:           row.quote.customerId ? `CUS-${row.quote.customerId}` : null,
    customerQrValue:        row.quote.customerId ? `CUS-${row.quote.customerId}` : null,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${q.quoteNumber}.pdf"`);
  res.setHeader("Content-Length", pdfBuffer.length);
  res.send(pdfBuffer);
});

// POST /quotes/:id/send-email
router.post("/quotes/:id/send-email", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = SendQuoteEmailParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  const merchantId = req.session.merchantId!;
  const bodyParsed = SendQuoteEmailBody.safeParse(req.body);
  if (!bodyParsed.success) { res.status(400).json({ error: bodyParsed.error.message }); return; }
  const { email, template } = bodyParsed.data;

  const row = await loadQuoteRow(id, merchantId);
  if (!row) { res.status(404).json({ error: "Quote not found" }); return; }

  const [merchant, bp, tplRow] = await Promise.all([
    db.select().from(merchantsTable).where(eq(merchantsTable.id, merchantId)).then((r) => r[0]),
    db.select().from(businessProfileTable).where(eq(businessProfileTable.merchantId, merchantId)).then((r) => r[0]),
    db.select().from(salesTemplatesTable).where(and(eq(salesTemplatesTable.merchantId, merchantId), eq(salesTemplatesTable.templateType, "Quote"))).then((r) => r[0]),
  ]);
  const bizName = merchant?.businessName ?? "KoaPOS";
  const q = fmtRow(row);
  const cName = q.customerName;
  const lines = (q.items as LineItem[]) ?? [];

  const tpl = (template ?? {}) as Record<string, string | undefined>;
  const brandColor = tpl.brandColor || (() => { try { return (JSON.parse(bp?.brandColors || "[]") as string[])[0]; } catch { return undefined; } })() || "#4f46e5";
  const totalStr = `$${q.total.toFixed(2)}`;
  const greeting = cName ? `Hi ${cName.split(" ")[0]},` : "Hi,";
  const validLine = q.expiryDate ? ` It is valid until ${new Date(q.expiryDate).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}.` : "";

  const itemRows = lines.map((l) =>
    `<tr>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;">${l.description}</td>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;text-align:center;">${l.quantity}</td>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;text-align:right;">$${(l.quantity * l.unitPrice).toFixed(2)}</td>
    </tr>`
  ).join("");

  const logoBlock = (bp?.logo) ? `<img src="${bp.logo}" alt="${bizName}" style="max-height:48px;max-width:140px;display:block;margin-bottom:8px"/>` : "";

  // Saved Quote template row. Read before the body so the emailed QR and the QR
  // on the attached PDF are always the one code.
  const tplOpts = (tplRow?.options ?? {}) as Record<string, unknown>;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#222;">
      <div style="border-bottom:3px solid ${brandColor};padding-bottom:12px;margin-bottom:20px;">${logoBlock}<h2 style="margin:0;font-size:18px;">${bizName}</h2></div>
      <p style="margin:0 0 12px;font-size:14px;">${greeting}</p>
      <p style="margin:0 0 16px;font-size:13px;color:#555;">Please find quote <strong>${q.quoteNumber}</strong> attached.${validLine}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
        <thead><tr>
          <th style="text-align:left;padding-bottom:8px;border-bottom:2px solid #eee;color:#555;font-size:12px;">Description</th>
          <th style="text-align:center;padding-bottom:8px;border-bottom:2px solid #eee;color:#555;font-size:12px;">Qty</th>
          <th style="text-align:right;padding-bottom:8px;border-bottom:2px solid #eee;color:#555;font-size:12px;">Amount</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div style="margin-top:16px;text-align:right;font-size:13px;color:#555;">
        <div>Subtotal: $${q.subtotal.toFixed(2)}</div>
        <div>GST (incl): $${q.taxTotal.toFixed(2)}</div>
        ${q.discountTotal ? `<div style="color:#d97706;">Discount: −$${q.discountTotal.toFixed(2)}</div>` : ""}
        <div style="font-size:16px;font-weight:bold;margin-top:8px;color:${brandColor};">Total: ${totalStr}</div>
      </div>
      ${q.notes ? `<p style="margin-top:24px;font-size:13px;color:#555;border-top:1px solid #eee;padding-top:16px;">${q.notes}</p>` : ""}
      ${customQrEmailBlock(tplOpts)}
      <p style="margin-top:28px;font-size:13px;color:#444;">— The team at ${bizName}</p>
    </div>`;

  const billingAddr = [row.customerBillingStreet, row.customerBillingCity, row.customerBillingState, row.customerBillingPostcode].filter(Boolean).join(", ")
    || row.customerAddress || null;
  let bpBrandColors: string[] = [];
  try { bpBrandColors = JSON.parse(bp?.brandColors || "[]"); } catch { /* default */ }

  const pdfBuffer = await buildInvoicePdf({
    title:         "Quote",
    dueDateLabel:  "Valid until",
    invoiceNumber: q.quoteNumber,
    status:        q.status ?? "draft",
    createdAt:     q.createdAt,
    dueDate:       q.expiryDate,
    paidAt:        null,
    items:         lines,
    subtotal:      q.subtotal,
    taxTotal:      q.taxTotal,
    total:         q.total,
    amountPaid:    0,
    discountTotal: q.discountTotal,
    discountType:  q.discountType,
    discountValue: q.discountValue,
    notes:         q.notes,
    customerName:  cName,
    customerEmail: q.customerEmail,
    customerPhone: q.customerPhone,
    customerAddress: billingAddr,
    customerCompany: q.customerCompany,
    businessName:    bizName,
    businessPhone:   merchant?.phone ?? null,
    businessAddress: merchant?.address ?? null,
    businessCity:    merchant?.city ?? null,
    businessAbn:     bp?.abn || null,
    businessWebsite: bp?.website || null,
    businessEmail:   bp?.contactEmail || null,
    brandColor:      bpBrandColors[0] || null,
    logoUrl:         bp?.logo || null,
    showLogo:              tplRow ? tplRow.showLogo : true,
    showGstBreakdown:      tplOpts.showGstBreakdown !== undefined ? Boolean(tplOpts.showGstBreakdown) : true,
    showCustomQr:          Boolean(tplOpts.showCustomQr),
    customQrImage:         (tplOpts.customQrImage as string | undefined) || null,
    customQrCaption:       (tplOpts.customQrCaption as string | undefined) || null,
    fontFamily:            tplRow?.fontFamily || null,
    styleVariant:          tplRow?.selectedStyle || null,
  });

  const result = await sendEmail(merchantId, {
    to: email,
    subject: `Quote ${q.quoteNumber} from ${bizName}`,
    html,
    text: `${greeting}\n\nQuote ${q.quoteNumber} from ${bizName}\nTotal: ${totalStr}\n\n— The team at ${bizName}`,
    attachments: [{ filename: `${q.quoteNumber}.pdf`, content: pdfBuffer, contentType: "application/pdf" }],
  });

  if (!result.success) {
    req.log.warn({ quoteId: id, email, error: result.error }, "Quote email failed");
    res.status(400).json({ error: result.error ?? "Failed to send quote email" });
    return;
  }

  // Promote a draft quote to "sent" once emailed, and flag the linked job as
  // waiting on the customer's approval.
  if (q.status === "draft") {
    await db.update(quotesTable).set({ status: "sent" }).where(eq(quotesTable.id, id));
    await markJobAwaitingApproval(merchantId, q.serviceJobId ?? null);
  }
  await appendQuoteEvent(id, merchantId, { type: "email", timestamp: new Date().toISOString(), detail: email });

  req.log.info({ quoteId: id, email }, "Quote emailed");
  res.json({ success: true });
});

// POST /quotes/:id/convert — mark a quote converted to a sale (cart hydration is client-side)
router.post("/quotes/:id/convert", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = ConvertQuoteParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  const bodyParsed = ConvertQuoteBody.safeParse(req.body ?? {});
  if (!bodyParsed.success) { res.status(400).json({ error: bodyParsed.error.message }); return; }
  const { transactionId } = bodyParsed.data;
  const merchantId = req.session.merchantId!;

  const updates: Record<string, unknown> = { status: "converted" };
  if (transactionId != null) updates.convertedTransactionId = transactionId;

  const [updated] = await db
    .update(quotesTable)
    .set(updates)
    .where(and(eq(quotesTable.id, id), eq(quotesTable.merchantId, merchantId)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Quote not found" }); return; }

  await appendQuoteEvent(id, merchantId, {
    type: "converted",
    timestamp: new Date().toISOString(),
    ...(transactionId != null ? { detail: `transaction:${transactionId}` } : {}),
  });

  const row = await loadQuoteRow(id, merchantId);
  const body = row ? fmtRow(row) : fmt(updated);
  assertValidQuoteResponse(ConvertQuoteResponse, body, "POST /quotes/:id/convert");
  res.json(body);
});

// POST /quotes/:id/approve — staff records an in-store/verbal estimate approval.
// Marks the quote accepted and drives the linked repair job forward.
router.post("/quotes/:id/approve", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const merchantId = req.session.merchantId!;

  const [quote] = await db.select().from(quotesTable)
    .where(and(eq(quotesTable.id, id), eq(quotesTable.merchantId, merchantId))).limit(1);
  if (!quote) { res.status(404).json({ error: "Quote not found" }); return; }
  if (quote.status === "converted" || quote.status === "declined") {
    res.status(409).json({ error: "This quote can no longer be approved" }); return;
  }

  const existingEvents = (quote.events as QuoteEvent[] | null) ?? [];
  await db.update(quotesTable)
    .set({ status: "accepted", events: [...existingEvents, { type: "accepted", timestamp: new Date().toISOString(), detail: "recorded in-store" }] })
    .where(and(eq(quotesTable.id, id), eq(quotesTable.merchantId, merchantId)));

  await applyEstimateApprovalToJob(merchantId, quote, "in-store");

  const row = await loadQuoteRow(id, merchantId);
  const body = row ? fmtRow(row) : fmt({ ...quote, status: "accepted" });
  res.json(body);
});

// POST /quotes/:id/event — record a client-side event (download, print, etc.)
router.post("/quotes/:id/event", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = AddQuoteEventParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  const merchantId = req.session.merchantId!;
  const bodyParsed = AddQuoteEventBody.safeParse(req.body);
  if (!bodyParsed.success) { res.status(400).json({ error: bodyParsed.error.message }); return; }
  const { type, detail } = bodyParsed.data;

  const [existing] = await db
    .select({ events: quotesTable.events })
    .from(quotesTable)
    .where(and(eq(quotesTable.id, id), eq(quotesTable.merchantId, merchantId)));
  if (!existing) { res.status(404).json({ error: "Quote not found" }); return; }

  const events: QuoteEvent[] = [
    ...((existing.events as QuoteEvent[] | null) ?? []),
    { type, timestamp: new Date().toISOString(), ...(detail ? { detail } : {}) },
  ];
  await db.update(quotesTable).set({ events }).where(eq(quotesTable.id, id));

  const row = await loadQuoteRow(id, merchantId);
  if (!row) { res.status(404).json({ error: "Quote not found" }); return; }
  const body = fmtRow(row);
  assertValidQuoteResponse(AddQuoteEventResponse, body, "POST /quotes/:id/event");
  res.json(body);
});

export default router;
