import { Router } from "express";
import { eq, and, gte, lt, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/requireAuth";
import { requireManagerOrOwner } from "../middlewares/requireManagerOrOwner";
import { db, dailyClosesTable, transactionsTable, merchantsTable } from "@workspace/db";
import type { DailyClose } from "@workspace/db";

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
  const limitVal = Math.min(parseInt(String(req.query.limit ?? "50"), 10), 200);
  const offsetVal = parseInt(String(req.query.offset ?? "0"), 10);

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
const CreateDailyCloseBody = z.object({
  closeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expectedCash: z.number(),
  countedCash: z.number(),
  notes: z.string().optional(),
  breakdown: z.record(z.string(), z.number()).optional(),
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

  const { closeDate, expectedCash, countedCash, notes, breakdown } = parsed.data;
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

  res.status(201).json({
    ...row,
    expectedCash: parseFloat(row.expectedCash ?? "0"),
    countedCash: parseFloat(row.countedCash ?? "0"),
    variance: parseFloat(row.variance ?? "0"),
    createdAt: row.createdAt.toISOString(),
  });
});

export default router;
