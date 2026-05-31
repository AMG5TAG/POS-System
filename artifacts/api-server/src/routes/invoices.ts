import { Router, type IRouter } from "express";
import { db, invoicesTable, customersTable, merchantsTable, businessProfileTable, loyaltySettingsTable, giftCardsTable, giftCardLedgerTable } from "@workspace/db";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { sendEmail } from "../services/email";
import { buildInvoicePdf } from "../services/invoicePdf";
import { computeNextSendDate } from "../services/recurringInvoiceScheduler";
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
} from "@workspace/api-zod";

const router: IRouter = Router();

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
type InvoiceEvent = { type: string; timestamp: string; detail?: string; method?: string; idempotencyKey?: string };

type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

function customerName(first: string | null, last: string | null): string | null {
  const n = [first, last].filter(Boolean).join(" ");
  return n || null;
}

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
    customerName: customerName(cFirst ?? null, cLast ?? null),
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

  res.json({
    items: rows.map((r) => fmt(r.invoice, r.customerFirstName, r.customerLastName, r.customerEmail, r.customerPhone, r.customerAddress, r.customerCompany, r.customerBillingStreet, r.customerBillingCity, r.customerBillingState, r.customerBillingPostcode)),
    total: Number(countResult.count),
  });
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
  res.json(fmt(row.invoice, row.customerFirstName, row.customerLastName, row.customerEmail, row.customerPhone, row.customerAddress, row.customerCompany, row.customerBillingStreet, row.customerBillingCity, row.customerBillingState, row.customerBillingPostcode));
});

// POST /invoices
router.post("/invoices", requireAuth, async (req, res): Promise<void> => {
  const bodyParsed = CreateInvoiceBody.safeParse(req.body);
  if (!bodyParsed.success) { res.status(400).json({ error: bodyParsed.error.message }); return; }
  const {
    customerId,
    dueDate,
    notes,
    items: lineItems,
    invoicePrefix,
    invoiceDigits,
    recurring,
    discount: discountInput,
  } = bodyParsed.data;

  const merchantId = req.session.merchantId!;
  const lines: LineItem[] = (lineItems as LineItem[] | undefined) ?? [];
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
    customerId: customerId ?? null,
    invoiceNumber: invNumber,
    status: "draft",
    subtotal: String(subtotal),
    taxTotal: String(taxTotal),
    total: String(total),
    discountType:  discountInput?.type ?? null,
    discountValue: discountInput?.value != null ? String(discountInput.value) : null,
    discountTotal: discountAmount > 0 ? String(discountAmount) : null,
    items: lines.length ? lines : null,
    dueDate: dueDate ?? null,
    notes: notes ?? null,
    isRecurring: recurring ? "true" : "false",
    recurringFrequency: recurring?.frequency ?? null,
    recurringOccurrences: recurring?.occurrences ?? null,
    recurringStartDate: recurring?.startDate ?? null,
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

  res.status(201).json(row ? fmt(row.invoice, row.customerFirstName, row.customerLastName, row.customerEmail, row.customerPhone, row.customerAddress, row.customerCompany, row.customerBillingStreet, row.customerBillingCity, row.customerBillingState, row.customerBillingPostcode) : fmt(inv));
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
  res.json(fmt(row.invoice, row.customerFirstName, row.customerLastName, row.customerEmail, row.customerPhone, row.customerAddress, row.customerCompany, row.customerBillingStreet, row.customerBillingCity, row.customerBillingState, row.customerBillingPostcode));
});

// PATCH /invoices/:id
router.patch("/invoices/:id", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = UpdateInvoiceParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  const bodyParsed = UpdateInvoiceBody.safeParse(req.body);
  if (!bodyParsed.success) { res.status(400).json({ error: bodyParsed.error.message }); return; }
  const { status, notes, dueDate, customerId, items, recurring, discount } = bodyParsed.data;
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
  if (dueDate !== undefined) updates.dueDate = dueDate ?? null;
  if (customerId !== undefined) updates.customerId = customerId ?? null;
  if (items !== undefined || discount !== undefined) {
    // Fetch existing items/discount if only one was sent
    const [existing] = await db
      .select({ items: invoicesTable.items, discountType: invoicesTable.discountType, discountValue: invoicesTable.discountValue })
      .from(invoicesTable)
      .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, req.session.merchantId!)));
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
  await db.transaction(async (tx) => {
    let preInv: { status: string | null; customerId: number | null; total: string | null } | undefined;
    if (status === "paid") {
      const [cur] = await tx
        .select({ status: invoicesTable.status, customerId: invoicesTable.customerId, total: invoicesTable.total })
        .from(invoicesTable)
        .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, req.session.merchantId!)))
        .for("update");
      preInv = cur ?? undefined;
    }

    const [updated] = await tx
      .update(invoicesTable)
      .set(updates)
      .where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, req.session.merchantId!)))
      .returning();
    inv = updated;
    if (!updated) return;

    // ── Credit loyalty when an invoice transitions to paid for the first time ──
    if (
      status === "paid" &&
      preInv &&
      preInv.status !== "paid" &&
      preInv.customerId
    ) {
      await creditLoyaltyForPaidInvoice(tx, req.session.merchantId!, preInv.customerId, parseFloat(preInv.total ?? "0"));
    }
  });
  if (!inv) { res.status(404).json({ error: "Invoice not found" }); return; }

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

  res.json(row ? fmt(row.invoice, row.customerFirstName, row.customerLastName, row.customerEmail) : fmt(inv));
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
  const { amount, method, giftCardPayment, idempotencyKey: rawIdempotencyKey } = bodyParsed.data;
  const idempotencyKey =
    typeof rawIdempotencyKey === "string" && rawIdempotencyKey.trim() !== ""
      ? rawIdempotencyKey.trim()
      : undefined;
  const payInput = Number(amount);
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
  await db.transaction(async (tx) => {
    const [cur] = await tx
      .select({
        total: invoicesTable.total,
        amountPaid: invoicesTable.amountPaid,
        status: invoicesTable.status,
        customerId: invoicesTable.customerId,
        events: invoicesTable.events,
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

    const events: InvoiceEvent[] = [
      ...((cur.events as InvoiceEvent[] | null) ?? []),
      {
        type: "payment",
        timestamp: new Date().toISOString(),
        detail: fullyPaid
          ? `Payment of $${pay.toFixed(2)} recorded — paid in full`
          : `Payment of $${pay.toFixed(2)} recorded — balance $${balance.toFixed(2)} remaining`,
        ...(method ? { method } : {}),
        ...(idempotencyKey ? { idempotencyKey } : {}),
      },
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

    // Credit loyalty only when this payment settles the invoice in full for the first time.
    if (fullyPaid && cur.status !== "paid" && cur.customerId) {
      await creditLoyaltyForPaidInvoice(tx, merchantId, cur.customerId, total);
    }
  });

  if (notFound) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (payErrorStatus) { res.status(payErrorStatus).json({ error: payErrorMessage }); return; }
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
  res.json(fmt(row.invoice, row.customerFirstName, row.customerLastName, row.customerEmail, row.customerPhone, row.customerAddress, row.customerCompany, row.customerBillingStreet, row.customerBillingCity, row.customerBillingState, row.customerBillingPostcode));
});

// DELETE /invoices/:id
router.delete("/invoices/:id", requireAuth, async (req, res): Promise<void> => {
  const paramsResult = DeleteInvoiceParams.safeParse(req.params);
  if (!paramsResult.success) { res.status(400).json({ error: paramsResult.error.message }); return; }
  const { id } = paramsResult.data;
  await db.delete(invoicesTable).where(and(eq(invoicesTable.id, id), eq(invoicesTable.merchantId, req.session.merchantId!)));
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

  const [merchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.id, merchantId));
  const [bp]       = await db.select().from(businessProfileTable).where(eq(businessProfileTable.merchantId, merchantId));

  const inv = fmt(
    row.invoice,
    row.customerFirstName, row.customerLastName, row.customerEmail,
    row.customerPhone, row.customerAddress, row.customerCompany,
    row.customerBillingStreet, row.customerBillingCity, row.customerBillingState, row.customerBillingPostcode,
  );

  const billingAddr = [row.customerBillingStreet, row.customerBillingCity, row.customerBillingState, row.customerBillingPostcode].filter(Boolean).join(", ")
    || row.customerAddress
    || null;

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

  const [merchant, bp] = await Promise.all([
    db.select().from(merchantsTable).where(eq(merchantsTable.id, merchantId)).then((r) => r[0]),
    db.select().from(businessProfileTable).where(eq(businessProfileTable.merchantId, merchantId)).then((r) => r[0]),
  ]);
  const bizName = merchant?.businessName ?? "KoaPOS";
  const inv = row.invoice;
  const cName = customerName(row.customerFirstName, row.customerLastName);
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
  });

  const result = await sendEmail(merchantId, {
    to: email,
    subject,
    html,
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
  res.json(fmt(row.invoice, row.customerFirstName, row.customerLastName, row.customerEmail, row.customerPhone, row.customerAddress, row.customerCompany, row.customerBillingStreet, row.customerBillingCity, row.customerBillingState, row.customerBillingPostcode));
});

export default router;
