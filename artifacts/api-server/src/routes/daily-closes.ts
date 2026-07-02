import { Router } from "express";
import { eq, and, gte, lt, desc, sql, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/requireAuth";
import { requireManagerOrOwner } from "../middlewares/requireManagerOrOwner";
import { db, dailyClosesTable, transactionsTable, merchantsTable, invoicesTable, posRegisterSessionsTable } from "@workspace/db";
import type { DailyClose } from "@workspace/db";
import { getDefaultTaxRate, splitGstInclusive } from "../lib/tax";

const router = Router();

// ── helpers ────────────────────────────────────────────────────────────────

function toLocalDateKey(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: tz,
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dayBounds(dateKey: string, tz: string): { start: Date; end: Date } {
  const [y, m, d] = dateKey.split("-").map(Number);
  const start = new Date(
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date(`${dateKey}T00:00:00`))
  );
  const formatter = new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, timeZone: tz,
  });
  const parseLocal = (localStr: string): Date => {
    const d = new Date(localStr + " UTC");
    const offset = d.getTime() - new Date(formatter.format(d)).getTime();
    return new Date(new Date(localStr).getTime() + offset);
  };
  const startUtc = (() => {
    for (let h = -14; h <= 14; h++) {
      const candidate = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - h * 3600000);
      if (toLocalDateKey(candidate, tz) === dateKey) {
        const prev = new Date(candidate.getTime() - 60000);
        if (toLocalDateKey(prev, tz) !== dateKey) return candidate;
      }
    }
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  })();
  const endUtc = new Date(startUtc.getTime() + 24 * 3600000);
  return { start: startUtc, end: endUtc };
}

// cash-equivalent methods for expected-cash calculation
const CASH_METHODS = new Set(["cash"]);
// card-equivalent methods
const CARD_METHODS = new Set(["card", "eftpos"]);

// ── GET /daily-closes/current ───────────────────────────────────────────────
// Returns today's calculated breakdown (NOT saved yet); used to pre-fill the
// Close Day dialog.
router.get("/daily-closes/current", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;

  const [merchantRow] = await db
    .select({ timezone: merchantsTable.timezone })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, merchantId))
    .limit(1);
  const tz = merchantRow?.timezone ?? "Australia/Sydney";

  const today = toLocalDateKey(new Date(), tz);
  const { start, end } = dayBounds(today, tz);

  const txns = await db
    .select()
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.merchantId, merchantId),
      gte(transactionsTable.createdAt, start),
      lt(transactionsTable.createdAt, end),
    ));

  let grossSales = 0;
  let taxTotal = 0;
  let discountTotal = 0;
  let refundTotal = 0;
  let transactionCount = 0;
  const byMethod: Record<string, number> = {};

  for (const t of txns) {
    const total = parseFloat(t.total ?? "0");
    const tax = parseFloat(t.taxTotal ?? "0");
    const discount = parseFloat(t.discountTotal ?? "0");
    const method = t.paymentMethod ?? "cash";

    if (t.status === "refunded" || t.status === "partial_refund") {
      refundTotal += total;
    } else if (t.status === "completed") {
      grossSales += total;
      taxTotal += tax;
      discountTotal += discount;
      transactionCount += 1;
      byMethod[method] = (byMethod[method] ?? 0) + total;
    }
  }

  // Invoices settled today count as takings too (parity with POS). Gross/tax/
  // count come from the invoice rows; the per-method split comes from the
  // payment-legs view so split payments land under each method tendered.
  const paidInvoices = await db
    .select({ total: invoicesTable.total, taxTotal: invoicesTable.taxTotal, discountTotal: invoicesTable.discountTotal })
    .from(invoicesTable)
    .where(and(
      eq(invoicesTable.merchantId, merchantId),
      eq(invoicesTable.status, "paid"),
      gte(invoicesTable.paidAt, start),
      lt(invoicesTable.paidAt, end),
    ));
  for (const invRow of paidInvoices) {
    grossSales += parseFloat(invRow.total ?? "0");
    taxTotal += parseFloat(invRow.taxTotal ?? "0");
    discountTotal += parseFloat(invRow.discountTotal ?? "0");
    transactionCount += 1;
  }
  const invLegs = await db.execute<{ method: string; total: number }>(sql`
    SELECT method, COALESCE(SUM(amount), 0)::float AS total
    FROM view_invoice_payment_legs
    WHERE merchant_id = ${merchantId} AND paid_at >= ${start} AND paid_at < ${end}
    GROUP BY method
  `);
  for (const leg of invLegs.rows) {
    byMethod[leg.method || "invoice"] = (byMethod[leg.method || "invoice"] ?? 0) + Number(leg.total);
  }

  // Laybys completed today count as takings too (parity with POS). Laybys carry
  // no GST split, so derive it; per-method split comes from the legs view.
  const completedLaybys = await db.execute<{ total: number }>(sql`
    SELECT COALESCE(SUM(total_amount::numeric), 0)::float AS total, COUNT(*)::int AS cnt
    FROM laybys l
    WHERE l.merchant_id = ${merchantId} AND l.status = 'completed'
      AND COALESCE(l.completed_at, l.updated_at) >= ${start}
      AND COALESCE(l.completed_at, l.updated_at) < ${end}
  `);
  const layRow = completedLaybys.rows[0] as { total: number; cnt: number } | undefined;
  const layGross = Number(layRow?.total ?? 0);
  if (layGross > 0) {
    const rate = await getDefaultTaxRate(merchantId);
    grossSales += layGross;
    taxTotal += splitGstInclusive(layGross, rate).gst;
    transactionCount += Number(layRow?.cnt ?? 0);
    const layLegs = await db.execute<{ method: string; total: number }>(sql`
      SELECT method, COALESCE(SUM(amount), 0)::float AS total
      FROM view_layby_payment_legs
      WHERE merchant_id = ${merchantId} AND completed_at >= ${start} AND completed_at < ${end}
      GROUP BY method
    `);
    for (const leg of layLegs.rows) {
      byMethod[leg.method || "layby"] = (byMethod[leg.method || "layby"] ?? 0) + Number(leg.total);
    }
  }

  const netSales = grossSales - taxTotal;
  const expectedCash = byMethod["cash"] ?? 0;

  const breakdown: Record<string, number> = {
    cash: byMethod["cash"] ?? 0,
    card: (byMethod["card"] ?? 0) + (byMethod["eftpos"] ?? 0),
    giftCard: byMethod["gift_card"] ?? 0,
    other: Object.entries(byMethod)
      .filter(([k]) => !CASH_METHODS.has(k) && !CARD_METHODS.has(k) && k !== "gift_card")
      .reduce((s, [, v]) => s + v, 0),
  };

  res.json({
    date: today,
    grossSales: parseFloat(grossSales.toFixed(2)),
    netSales: parseFloat(netSales.toFixed(2)),
    taxTotal: parseFloat(taxTotal.toFixed(2)),
    discountTotal: parseFloat(discountTotal.toFixed(2)),
    refundTotal: parseFloat(refundTotal.toFixed(2)),
    transactionCount,
    byPaymentMethod: breakdown,
    expectedCash: parseFloat(expectedCash.toFixed(2)),
  });
});

// ── GET /daily-closes ───────────────────────────────────────────────────────
router.get("/daily-closes", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const limitVal = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
  const offsetVal = parseInt(String(req.query.offset ?? "0"), 10) || 0;
  if (req.query.limit !== undefined && isNaN(parseInt(String(req.query.limit), 10))) { res.status(400).json({ error: "Invalid limit" }); return; }
  if (req.query.offset !== undefined && isNaN(parseInt(String(req.query.offset), 10))) { res.status(400).json({ error: "Invalid offset" }); return; }

  const rows = await db
    .select()
    .from(dailyClosesTable)
    .where(eq(dailyClosesTable.merchantId, merchantId))
    .orderBy(desc(dailyClosesTable.closeDate))
    .limit(limitVal)
    .offset(offsetVal);

  res.json(rows.map((r: DailyClose) => ({
    ...r,
    expectedCash: parseFloat(r.expectedCash ?? "0"),
    countedCash: parseFloat(r.countedCash ?? "0"),
    variance: parseFloat(r.variance ?? "0"),
    createdAt: r.createdAt.toISOString(),
  })));
});

// ── POST /daily-closes ──────────────────────────────────────────────────────
// The unified "Close Day" action: records the store-wide cash reconciliation AND
// closes every open register session in one manager operation. Set
// closeOpenSessions:false to record the reconciliation without touching tills.
const CreateDailyCloseBody = z.object({
  closeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expectedCash: z.number(),
  countedCash: z.number(),
  notes: z.string().optional(),
  breakdown: z.record(z.string(), z.number()).optional(),
  closeOpenSessions: z.boolean().optional(),
});

router.post("/daily-closes", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const parsed = CreateDailyCloseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const merchantId = req.session.merchantId!;
  // Derive closer identity server-side — never trust client-supplied attribution
  // for a financial record. staffId is set when a staff member logs in via PIN;
  // it is absent for the merchant owner themselves.
  const sessionStaffId = req.session.staffId ?? null;

  // Look up merchant to resolve a display name for the closer
  const [merchant] = await db
    .select({ ownerName: merchantsTable.ownerName, businessName: merchantsTable.businessName })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, merchantId))
    .limit(1);
  const resolvedName = merchant?.ownerName || merchant?.businessName || null;

  const { closeDate, expectedCash, countedCash, notes, breakdown, closeOpenSessions } = parsed.data;
  const variance = parseFloat((countedCash - expectedCash).toFixed(2));

  const [row] = await db
    .insert(dailyClosesTable)
    .values({
      merchantId,
      closeDate,
      closedBy: sessionStaffId,
      closedByName: resolvedName,
      expectedCash: String(expectedCash),
      countedCash: String(countedCash),
      variance: String(variance),
      notes: notes ?? null,
      breakdown: breakdown ?? {},
    })
    .returning();

  // Close every open register session as part of the day close (default on).
  // Cardless/invoice-only stations carry no cash to count, so this just stamps
  // closedAt; the single cash drawer's counted Z-read is the reconciliation above.
  let registersClosed = 0;
  if (closeOpenSessions !== false) {
    const closed = await db
      .update(posRegisterSessionsTable)
      .set({ closedAt: new Date(), closingNotes: `Closed via Close Day (${closeDate})` })
      .where(and(
        eq(posRegisterSessionsTable.merchantId, merchantId),
        isNull(posRegisterSessionsTable.closedAt),
      ))
      .returning();
    registersClosed = closed.length;
  }

  res.status(201).json({
    ...row,
    expectedCash: parseFloat(row.expectedCash ?? "0"),
    countedCash: parseFloat(row.countedCash ?? "0"),
    variance: parseFloat(row.variance ?? "0"),
    createdAt: row.createdAt.toISOString(),
    registersClosed,
  });
});

export default router;
