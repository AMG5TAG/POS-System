import { Router, type IRouter } from "express";
import { sql, eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import { db, endOfWeekReportsTable, merchantsTable, staffTable, salesSettingsTable, kpiTargetsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { requireManagerOrOwner } from "../middlewares/requireManagerOrOwner";
import { getDefaultTaxRate, splitGstInclusive } from "../lib/tax";
import {
  r2, daysInRange, defaultWeekRange, groupByBanking, computeDeposit,
  computeWages, computeSuper, shiftHours, mergeStaffCosts, sumStaffCosts,
  mergeCashPurchases, sumCashPurchases, staffCostTotal, weekBudget, parseYmd,
  type MethodTotal, type StaffCostRow, type CashPurchase, type BudgetKpi,
} from "../lib/end-of-week";
import { localDate } from "../lib/pre-orders";

/**
 * End of Week — Management › Marketing & Reports › End of Week.
 *
 * One report covering a customisable week (Fri → Thu by default): the trading
 * summary, the banking sheet, and the week's employee costs. It reads the same
 * report views the rest of Management does (`view_daily_sales_summary`,
 * `view_payment_method_breakdown`), so a week here can never disagree with the
 * Sales Overview or the Z-report for the same days — those views already span
 * POS sales + paid invoices + completed laybys.
 *
 * The merchant-entered half (float, cash purchases, employee costs, banking)
 * lives in `end_of_week_reports`; see that table's comment for why the computed
 * half is not stored until the week is finalised.
 */
const router: IRouter = Router();

const DateRange = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
  endDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD"),
});

/** A week is customisable, but not unbounded — this is a weekly banking sheet,
 *  not an ad-hoc range report, and the page renders a row per day. */
const MAX_RANGE_DAYS = 62;

function validateRange(startDate: string, endDate: string): string | null {
  const days = daysInRange(startDate, endDate);
  if (days <= 0) return "endDate must not be before startDate";
  if (days > MAX_RANGE_DAYS) return `Range must be ${MAX_RANGE_DAYS} days or fewer`;
  return null;
}

/**
 * The merchant's accounting convention for PAYG in the employee-cost total.
 *
 * Read per request rather than cached: it is one indexed row, and a merchant who
 * flips the toggle expects the page they are looking at to change. Absent row =
 * the default, which is what the report did before the option existed.
 */
interface EowSettings { includeTax: boolean; budgetKpis: BudgetKpi[] }

/** The PAYG convention above, and the KPIs the weekly budget is read from
 *  (Management › KPIs & Targets — see weekBudget in lib/end-of-week.ts). */
async function eowSettings(merchantId: number): Promise<EowSettings> {
  const [[row], kpis] = await Promise.all([
    db.select({ v: salesSettingsTable.eowIncludeTaxInStaffCost })
      .from(salesSettingsTable)
      .where(eq(salesSettingsTable.merchantId, merchantId))
      .limit(1),
    db.select().from(kpiTargetsTable)
      .where(and(eq(kpiTargetsTable.merchantId, merchantId), eq(kpiTargetsTable.metric, "net_profit"))),
  ]);
  const ids = (raw: string): number[] => { try { const v = JSON.parse(raw); return Array.isArray(v) ? v.map(Number).filter(Number.isFinite) : []; } catch { return []; } };
  return {
    includeTax: row?.v === "true",
    budgetKpis: kpis.map((k) => ({
      id: k.id, name: k.name, metric: k.metric, period: k.period,
      target: parseFloat(k.target) || 0,
      startDate: k.startDate || null, endDate: k.endDate || null,
      isActive: k.isActive === "true",
      staffIds: ids(k.staffIds),
    })),
  };
}

/**
 * The week that has just finished, in the shop's own time zone. The default
 * range used to be worked out from the UTC date, and on a Friday morning in
 * Sydney it is still Thursday in UTC — so the page opened on the week before
 * the one that had just closed, exactly when someone was about to bank it.
 */
async function currentDefaultWeek(merchantId: number): Promise<{ startDate: string; endDate: string }> {
  const [m] = await db.select({ timezone: merchantsTable.timezone }).from(merchantsTable).where(eq(merchantsTable.id, merchantId));
  return defaultWeekRange(parseYmd(localDate(m?.timezone)) ?? new Date());
}

/* ── The computed half ────────────────────────────────────────────────────── */

async function computeWeek(merchantId: number, startDate: string, endDate: string) {
  const [
    dailyRows, methodRows, refundRows, invoiceRows, serviceRows,
    serviceMoneyRows, customerRows, topProductRows, drawerRows,
    floatRows, staffRows, timesheetRows, kpiRows, laybyRows, taxRate,
  ] = await Promise.all([
    /* Daily trading — POS + paid invoices + completed laybys, already merged. */
    db.execute<{
      sale_date: string; transaction_count: string; gross_revenue: string;
      ex_gst_revenue: string; tax_collected: string; discount_total: string;
      total_cogs: string; net_profit: string; refund_total: string; surcharge_cost: string;
    }>(sql`
      SELECT sale_date::text, transaction_count, gross_revenue, ex_gst_revenue,
             tax_collected, discount_total, total_cogs, net_profit, refund_total, surcharge_cost
      FROM view_daily_sales_summary
      WHERE merchant_id = ${merchantId}
        AND sale_date BETWEEN ${startDate}::date AND ${endDate}::date
      ORDER BY sale_date
    `),

    /* Takings per tender — the banking list. */
    db.execute<{ payment_method: string; transaction_count: string; total_amount: string }>(sql`
      SELECT payment_method,
             SUM(transaction_count)::int AS transaction_count,
             COALESCE(SUM(total_amount), 0) AS total_amount
      FROM view_payment_method_breakdown
      WHERE merchant_id = ${merchantId}
        AND sale_date BETWEEN ${startDate}::date AND ${endDate}::date
      GROUP BY payment_method
      ORDER BY total_amount DESC
    `),

    /* Refunds, split by the tender they were paid back on — a cash refund is
       cash out of the drawer and must reduce the deposit; a card refund is not. */
    db.execute<{ payment_method: string; cnt: string; amount: string; tax: string }>(sql`
      SELECT payment_method,
             COUNT(*)::int AS cnt,
             COALESCE(SUM(ABS(total::numeric)), 0)     AS amount,
             COALESCE(SUM(ABS(tax_total::numeric)), 0) AS tax
      FROM transactions
      WHERE merchant_id = ${merchantId}
        AND status IN ('refunded', 'partial_refund')
        AND created_at::date BETWEEN ${startDate}::date AND ${endDate}::date
      GROUP BY payment_method
    `),

    /* Invoices: raised this week, settled this week, and still owing. */
    db.execute<{
      issued_count: string; issued_total: string;
      paid_count: string; paid_total: string;
      outstanding_count: string; outstanding_total: string;
      overdue_count: string; overdue_total: string;
    }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at::date BETWEEN ${startDate}::date AND ${endDate}::date
                           AND status <> 'draft')                                     AS issued_count,
        COALESCE(SUM(total::numeric) FILTER (WHERE created_at::date BETWEEN ${startDate}::date AND ${endDate}::date
                           AND status <> 'draft'), 0)                                 AS issued_total,
        COUNT(*) FILTER (WHERE status = 'paid' AND paid_at::date BETWEEN ${startDate}::date AND ${endDate}::date) AS paid_count,
        COALESCE(SUM(total::numeric) FILTER (WHERE status = 'paid'
                           AND paid_at::date BETWEEN ${startDate}::date AND ${endDate}::date), 0) AS paid_total,
        COUNT(*) FILTER (WHERE status NOT IN ('paid', 'draft', 'cancelled', 'void'))  AS outstanding_count,
        COALESCE(SUM(total::numeric - amount_paid::numeric)
                   FILTER (WHERE status NOT IN ('paid', 'draft', 'cancelled', 'void')), 0) AS outstanding_total,
        COUNT(*) FILTER (WHERE status NOT IN ('paid', 'draft', 'cancelled', 'void')
                           AND due_date IS NOT NULL AND due_date < now())             AS overdue_count,
        COALESCE(SUM(total::numeric - amount_paid::numeric)
                   FILTER (WHERE status NOT IN ('paid', 'draft', 'cancelled', 'void')
                           AND due_date IS NOT NULL AND due_date < now()), 0)         AS overdue_total
      FROM invoices
      WHERE merchant_id = ${merchantId}
    `),

    /* Service / repair jobs: booked in, completed, and still on the bench. */
    db.execute<{ booked_in: string; completed: string; open_now: string }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at::date BETWEEN ${startDate}::date AND ${endDate}::date) AS booked_in,
        COUNT(*) FILTER (WHERE status = 'completed'
                           AND COALESCE(completed_at, updated_at)::date
                               BETWEEN ${startDate}::date AND ${endDate}::date)                  AS completed,
        COUNT(*) FILTER (WHERE status NOT IN ('completed', 'cancelled', 'collected'))            AS open_now
      FROM service_jobs
      WHERE merchant_id = ${merchantId}
    `),

    /* What the jobs completed this week were worth. Job totals are derived from
       the lines rather than stored (see service_job_lines), so they are summed
       the same way here. */
    db.execute<{ revenue: string; cost: string; parts: string; labour: string }>(sql`
      SELECT
        COALESCE(SUM(l.quantity::numeric * l.unit_price::numeric), 0) AS revenue,
        COALESCE(SUM(l.quantity::numeric * l.unit_cost::numeric), 0)  AS cost,
        COALESCE(SUM(l.quantity::numeric * l.unit_price::numeric) FILTER (WHERE l.kind = 'part'), 0)   AS parts,
        COALESCE(SUM(l.quantity::numeric * l.unit_price::numeric) FILTER (WHERE l.kind = 'labour'), 0) AS labour
      FROM service_job_lines l
      JOIN service_jobs j ON j.id = l.service_job_id AND j.merchant_id = l.merchant_id
      WHERE l.merchant_id = ${merchantId}
        AND j.status = 'completed'
        AND COALESCE(j.completed_at, j.updated_at)::date BETWEEN ${startDate}::date AND ${endDate}::date
    `),

    /* New customers signed up this week. */
    db.execute<{ new_customers: string; total_customers: string }>(sql`
      SELECT
        COUNT(*) FILTER (WHERE created_at::date BETWEEN ${startDate}::date AND ${endDate}::date) AS new_customers,
        COUNT(*)                                                                                AS total_customers
      FROM customers
      WHERE merchant_id = ${merchantId}
    `),

    /* Best sellers for the week. */
    db.execute<{ product_name: string; sku: string; quantity_sold: string; total_revenue: string; gross_profit: string }>(sql`
      SELECT product_name, sku,
             SUM(quantity_sold)  AS quantity_sold,
             SUM(total_revenue)  AS total_revenue,
             SUM(gross_profit)   AS gross_profit
      FROM view_product_performance_ledger
      WHERE merchant_id = ${merchantId}
        AND sale_date BETWEEN ${startDate}::date AND ${endDate}::date
      GROUP BY product_name, sku
      ORDER BY SUM(total_revenue) DESC
      LIMIT 10
    `),

    /* Cash moved in and out of the drawer by hand. */
    db.execute<{ id: number; type: string; amount: string; note: string | null; shift_date: string }>(sql`
      SELECT id, type, amount, note, shift_date::text
      FROM cash_drawer_entries
      WHERE merchant_id = ${merchantId}
        AND shift_date BETWEEN ${startDate}::date AND ${endDate}::date
        AND type IN ('cash_in', 'cash_out')
      ORDER BY shift_date, id
    `),

    /* The float in each till — the LAST session opened per register in the week,
       not the sum of every session, because the same physical float is counted
       into the drawer again each morning. */
    db.execute<{ register_id: string; opening_float: string }>(sql`
      SELECT DISTINCT ON (register_id) register_id, opening_float
      FROM pos_register_sessions
      WHERE merchant_id = ${merchantId}
        AND opened_at::date BETWEEN ${startDate}::date AND ${endDate}::date
      ORDER BY register_id, opened_at DESC
    `),

    db.execute<{ id: number; name: string; role: string; pay_rate: string | null; loading_rate: string | null; super_rate: string | null }>(sql`
      SELECT id, name, role, pay_rate, loading_rate, super_rate
      FROM staff
      WHERE merchant_id = ${merchantId} AND is_active = 'true'
      ORDER BY name
    `),

    db.execute<{ staff_id: number; staff_name: string; clock_in: string; clock_out: string | null }>(sql`
      SELECT staff_id, staff_name, clock_in, clock_out
      FROM staff_timesheets
      WHERE merchant_id = ${merchantId}
        AND date BETWEEN ${startDate} AND ${endDate}
    `),

    /* KPI money: rewards on KPI periods that CLOSED inside this week and were
       hit. A KPI still running is not yet earned, so it is not a cost yet. */
    db.execute<{ staff_ids: string; reward: string; name: string; target: string; actual: string | null }>(sql`
      SELECT staff_ids, reward, name, target, actual
      FROM kpi_history
      WHERE merchant_id = ${merchantId}
        AND period_end::date BETWEEN ${startDate}::date AND ${endDate}::date
    `),

    /* Laybys completed this week — takings the summary already counts, listed
       separately so the week in review shows where they came from. */
    db.execute<{ cnt: string; gross: string }>(sql`
      SELECT COUNT(*)::int AS cnt, COALESCE(SUM(total_amount::numeric), 0) AS gross
      FROM laybys
      WHERE merchant_id = ${merchantId} AND status = 'completed'
        AND COALESCE(completed_at, updated_at)::date BETWEEN ${startDate}::date AND ${endDate}::date
    `),

    getDefaultTaxRate(merchantId),
  ]);

  /* ── Sales ──────────────────────────────────────────────────────────────── */
  const daily = dailyRows.rows.map((d) => ({
    date:             d.sale_date,
    transactionCount: Number(d.transaction_count),
    grossRevenue:     r2(d.gross_revenue),
    exGstRevenue:     r2(d.ex_gst_revenue),
    taxCollected:     r2(d.tax_collected),
    discountTotal:    r2(d.discount_total),
    totalCogs:        r2(d.total_cogs),
    netProfit:        r2(d.net_profit),
    refundTotal:      r2(d.refund_total),
    surchargeCost:    r2(d.surcharge_cost),
  }));

  const sum = (k: keyof (typeof daily)[number]) => r2(daily.reduce((s, d) => s + Number(d[k] ?? 0), 0));
  const grossRevenue  = sum("grossRevenue");
  const exGstRevenue  = sum("exGstRevenue");
  const taxCollected  = sum("taxCollected");
  const totalCogs     = sum("totalCogs");
  const netProfit     = sum("netProfit");
  const surchargeCost = sum("surchargeCost");
  const discountTotal = sum("discountTotal");
  const transactionCount = daily.reduce((s, d) => s + d.transactionCount, 0);

  const refundList = refundRows.rows.map((r) => ({
    method: r.payment_method || "other",
    count:  Number(r.cnt),
    amount: r2(r.amount),
    tax:    r2(r.tax),
  }));
  const refundTotal = r2(refundList.reduce((s, r) => s + r.amount, 0));
  const refundCount = refundList.reduce((s, r) => s + r.count, 0);
  const cashRefunds = r2(refundList.filter((r) => r.method === "cash").reduce((s, r) => s + r.amount, 0));

  /* ── Banking ────────────────────────────────────────────────────────────── */
  const byMethod: MethodTotal[] = methodRows.rows.map((m) => ({
    method: m.payment_method || "other",
    count:  Number(m.transaction_count),
    total:  r2(m.total_amount),
  }));
  const groups = groupByBanking(byMethod);

  const drawerCashIn  = r2(drawerRows.rows.filter((e) => e.type === "cash_in").reduce((s, e) => s + Number(e.amount), 0));
  const drawerCashOuts = drawerRows.rows
    .filter((e) => e.type === "cash_out")
    .map((e) => ({ id: e.id, amount: r2(e.amount), note: e.note, shiftDate: e.shift_date }));
  const tillFloats = floatRows.rows.map((f) => ({ registerId: f.register_id, openingFloat: r2(f.opening_float) }));
  const tillFloatTotal = r2(tillFloats.reduce((s, f) => s + f.openingFloat, 0));

  /* ── Employee costs ─────────────────────────────────────────────────────── */
  const hoursByStaff = new Map<number, number>();
  for (const t of timesheetRows.rows) {
    const h = shiftHours(t.clock_in, t.clock_out);
    hoursByStaff.set(t.staff_id, (hoursByStaff.get(t.staff_id) ?? 0) + h);
  }

  // A dollar-value reward on a KPI that closed this week and was achieved.
  const kpiByStaff = new Map<number, number>();
  const kpiAwards: { name: string; amount: number; staffIds: number[] }[] = [];
  for (const k of kpiRows.rows) {
    let reward: { type?: string; value?: number } | null = null;
    try { reward = k.reward ? JSON.parse(k.reward) : null; } catch { reward = null; }
    if (!reward || (reward.type !== "cash" && reward.type !== "voucher")) continue;
    const value = Number(reward.value ?? 0);
    if (!(value > 0)) continue;
    // Not achieved (or not computable) means not earned.
    if (k.actual === null || Number(k.actual) < Number(k.target)) continue;
    let staffIds: number[] = [];
    try {
      const parsed: unknown = JSON.parse(k.staff_ids || "[]");
      staffIds = Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
    } catch { staffIds = []; }
    kpiAwards.push({ name: k.name, amount: r2(value), staffIds });
    for (const id of staffIds) kpiByStaff.set(id, r2((kpiByStaff.get(id) ?? 0) + value));
  }

  const computedStaffCosts: StaffCostRow[] = staffRows.rows.map((s) => {
    const hours       = Math.round((hoursByStaff.get(s.id) ?? 0) * 100) / 100;
    const payRate     = Number(s.pay_rate ?? 0) || 0;
    const loadingRate = Number(s.loading_rate ?? 0) || 0;
    const superRate   = Number(s.super_rate ?? 0) || 0;
    const wages       = computeWages(hours, payRate, loadingRate);
    return {
      staffId: s.id,
      name: s.name,
      role: s.role,
      hours,
      wages,
      tax: 0,                                   // PAYG is never guessed — see StaffCostRow.
      superannuation: computeSuper(wages, superRate),
      bonus: 0,
      extras: 0,
      kpi: kpiByStaff.get(s.id) ?? 0,
      edited: false,
    };
  });

  /* ── Services + laybys ──────────────────────────────────────────────────── */
  const svc  = serviceRows.rows[0];
  const svcM = serviceMoneyRows.rows[0];
  const lay  = laybyRows.rows[0];
  const layGross = r2(lay?.gross ?? 0);
  const inv  = invoiceRows.rows[0];
  const cust = customerRows.rows[0];

  return {
    sales: {
      grossRevenue,
      discountTotal,
      refundTotal,
      refundCount,
      netSales:      r2(grossRevenue - refundTotal),
      exGstRevenue,
      taxCollected,
      totalCogs,
      grossProfit:   r2(exGstRevenue - totalCogs),
      netProfit,
      surchargeCost,
      transactionCount,
      avgSale:       transactionCount > 0 ? r2(grossRevenue / transactionCount) : 0,
      grossMarginPct: exGstRevenue > 0 ? r2((exGstRevenue - totalCogs) / exGstRevenue * 100) : 0,
      dailyBreakdown: daily,
    },
    refunds: { total: refundTotal, count: refundCount, cash: cashRefunds, byMethod: refundList },
    banking: {
      byMethod,
      cashTakings:          groups.cash,
      eftposTakings:        groups.eftpos,
      directDepositTakings: groups.directDeposit,
      nonBankingTakings:    groups.nonBanking,
      otherTakings:         groups.other,
      cashRefunds,
      drawerCashIn,
      drawerCashOuts,
      tillFloats,
      tillFloatTotal,
    },
    invoices: {
      issuedCount:      Number(inv?.issued_count ?? 0),
      issuedTotal:      r2(inv?.issued_total),
      paidCount:        Number(inv?.paid_count ?? 0),
      paidTotal:        r2(inv?.paid_total),
      outstandingCount: Number(inv?.outstanding_count ?? 0),
      outstandingTotal: r2(inv?.outstanding_total),
      overdueCount:     Number(inv?.overdue_count ?? 0),
      overdueTotal:     r2(inv?.overdue_total),
    },
    services: {
      bookedIn:   Number(svc?.booked_in ?? 0),
      completed:  Number(svc?.completed ?? 0),
      openNow:    Number(svc?.open_now ?? 0),
      revenue:    r2(svcM?.revenue),
      cost:       r2(svcM?.cost),
      profit:     r2(Number(svcM?.revenue ?? 0) - Number(svcM?.cost ?? 0)),
      partsValue: r2(svcM?.parts),
      labourValue: r2(svcM?.labour),
    },
    laybys: {
      completedCount: Number(lay?.cnt ?? 0),
      completedTotal: layGross,
      taxCollected:   layGross > 0 ? r2(splitGstInclusive(layGross, taxRate).gst) : 0,
    },
    customers: {
      newCustomers:   Number(cust?.new_customers ?? 0),
      totalCustomers: Number(cust?.total_customers ?? 0),
    },
    topProducts: topProductRows.rows.map((p) => ({
      name:     p.product_name ?? "—",
      sku:      p.sku ?? "",
      quantity: r2(p.quantity_sold),
      revenue:  r2(p.total_revenue),
      profit:   r2(p.gross_profit),
    })),
    kpiAwards,
    computedStaffCosts,
  };
}

type ComputedWeek = Awaited<ReturnType<typeof computeWeek>>;

/* ── Assembling the response ──────────────────────────────────────────────── */

interface SavedRow {
  id: number;
  status: string;
  floatRetained: string;
  cashCounted: string | null;
  bankedAmount: string | null;
  cashPurchases: unknown;
  staffCosts: unknown;
  notes: string;
  snapshot: unknown;
  finalisedAt: Date | null;
  finalisedByName: string | null;
}

const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function assemble(
  startDate: string, endDate: string,
  computed: ComputedWeek,
  saved: SavedRow | null,
  settings: EowSettings,
) {
  const includeTax = settings.includeTax;
  const isFirstOpen = saved === null;
  const cashPurchases = mergeCashPurchases(
    asArray<CashPurchase>(saved?.cashPurchases),
    computed.banking.drawerCashOuts,
    isFirstOpen,
  );
  const cashPurchasesTotal = sumCashPurchases(cashPurchases);

  // The float defaults to what the tills were actually opened with, so the
  // deposit is right before anyone types anything. Once saved, the merchant's
  // own figure stands — including a deliberate 0.
  const floatRetained = saved ? r2(saved.floatRetained) : computed.banking.tillFloatTotal;
  const cashCounted   = saved?.cashCounted === null || saved?.cashCounted === undefined
    ? null : r2(saved.cashCounted);
  const bankedAmount  = saved?.bankedAmount === null || saved?.bankedAmount === undefined
    ? null : r2(saved.bankedAmount);

  const deposit = computeDeposit({
    cashTakings:  computed.banking.cashTakings,
    cashRefunds:  computed.banking.cashRefunds,
    drawerCashIn: computed.banking.drawerCashIn,
    cashPurchasesTotal,
    floatRetained,
    cashCounted,
  });

  const staffCosts = mergeStaffCosts(
    computed.computedStaffCosts,
    asArray<Partial<StaffCostRow>>(saved?.staffCosts),
  );
  const staffCostRows = staffCosts.map((r) => ({ ...r, total: staffCostTotal(r, includeTax) }));
  const staffCostTotals = sumStaffCosts(staffCosts, includeTax);

  return {
    startDate,
    endDate,
    days: daysInRange(startDate, endDate),
    reportId:        saved?.id ?? null,
    status:          saved?.status ?? "draft",
    finalisedAt:     saved?.finalisedAt ? saved.finalisedAt.toISOString() : null,
    finalisedByName: saved?.finalisedByName ?? null,
    notes:           saved?.notes ?? "",

    sales:       computed.sales,
    refunds:     computed.refunds,
    invoices:    computed.invoices,
    services:    computed.services,
    laybys:      computed.laybys,
    customers:   computed.customers,
    topProducts: computed.topProducts,
    kpiAwards:   computed.kpiAwards,

    banking: {
      ...computed.banking,
      floatRetained,
      cashPurchases,
      cashPurchasesTotal,
      cashCounted,
      bankedAmount,
      ...deposit,
      /** Still to be deposited, once something has been banked. */
      bankingShortfall: bankedAmount === null ? null : r2(deposit.cashToBank - bankedAmount),
    },

    staffCosts: {
      rows: staffCostRows,
      totals: staffCostTotals,
      /** Whether PAYG is counted in each row's `total` and in the totals —
       *  `sales_settings.eowIncludeTaxInStaffCost`. */
      includeTax,
    },

    /** Trading profit less what the week's staff cost. The bottom line the
     *  report exists to produce. */
    profitAfterStaff: r2(computed.sales.netProfit - staffCostTotals.total),

    /** The week measured against its month's budget (null when no budget is
     *  set). Part of the snapshot, so a finalised week keeps the budget it was
     *  judged against even if the budget changes later. */
    budget: weekBudget(settings.budgetKpis, startDate, daysInRange(startDate, endDate),
      r2(computed.sales.netProfit - staffCostTotals.total)),
  };
}

/* ── GET /end-of-week ─────────────────────────────────────────────────────── */
// Omitting the dates returns the most recent completed Fri → Thu week.
router.get("/end-of-week", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;

  let startDate: string, endDate: string;
  if (req.query.startDate === undefined && req.query.endDate === undefined) {
    ({ startDate, endDate } = await currentDefaultWeek(merchantId));
  } else {
    const parsed = DateRange.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    ({ startDate, endDate } = parsed.data);
  }
  const rangeError = validateRange(startDate, endDate);
  if (rangeError) { res.status(400).json({ error: rangeError }); return; }

  const [saved] = await db
    .select()
    .from(endOfWeekReportsTable)
    .where(and(
      eq(endOfWeekReportsTable.merchantId, merchantId),
      eq(endOfWeekReportsTable.startDate, startDate),
      eq(endOfWeekReportsTable.endDate, endDate),
    ))
    .limit(1);

  // A finalised week renders the figures as they stood when it was banked, not
  // as they stand now — that is what finalising is for.
  if (saved?.status === "finalised" && saved.snapshot) {
    res.json({ ...(saved.snapshot as object), status: "finalised", reportId: saved.id,
               finalisedAt: saved.finalisedAt?.toISOString() ?? null,
               finalisedByName: saved.finalisedByName ?? null });
    return;
  }

  const [computed, settings] = await Promise.all([
    computeWeek(merchantId, startDate, endDate),
    eowSettings(merchantId),
  ]);
  res.json(assemble(startDate, endDate, computed, (saved as SavedRow | undefined) ?? null, settings));
});

/* ── PUT /end-of-week ─────────────────────────────────────────────────────── */
// Upserts the merchant-entered half for one week. Refuses a finalised week.
const CashPurchaseBody = z.object({
  id:          z.string().min(1).max(120),
  description: z.string().max(200).default(""),
  amount:      z.number().finite(),
  date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  source:      z.enum(["manual", "drawer"]).default("manual"),
});

const StaffCostBody = z.object({
  staffId:        z.number().int().nullable().optional(),
  name:           z.string().max(200).default(""),
  role:           z.string().max(60).default(""),
  hours:          z.number().finite().optional(),
  wages:          z.number().finite().default(0),
  tax:            z.number().finite().default(0),
  superannuation: z.number().finite().default(0),
  bonus:          z.number().finite().default(0),
  extras:         z.number().finite().default(0),
  kpi:            z.number().finite().default(0),
});

const SaveBody = DateRange.extend({
  floatRetained: z.number().finite().min(0).optional(),
  cashCounted:   z.number().finite().nullable().optional(),
  bankedAmount:  z.number().finite().nullable().optional(),
  cashPurchases: z.array(CashPurchaseBody).max(200).optional(),
  staffCosts:    z.array(StaffCostBody).max(500).optional(),
  notes:         z.string().max(5000).optional(),
});

router.put("/end-of-week", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const parsed = SaveBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { startDate, endDate, ...input } = parsed.data;

  const rangeError = validateRange(startDate, endDate);
  if (rangeError) { res.status(400).json({ error: rangeError }); return; }

  const merchantId = req.session.merchantId!;
  const [existing] = await db
    .select({ id: endOfWeekReportsTable.id, status: endOfWeekReportsTable.status })
    .from(endOfWeekReportsTable)
    .where(and(
      eq(endOfWeekReportsTable.merchantId, merchantId),
      eq(endOfWeekReportsTable.startDate, startDate),
      eq(endOfWeekReportsTable.endDate, endDate),
    ))
    .limit(1);

  if (existing?.status === "finalised") {
    res.status(409).json({ error: "This week has been finalised. Reopen it to make changes." });
    return;
  }

  // Only fields actually sent are written, so a partial save (just the notes,
  // say) cannot blank the float or the employee costs.
  const values: Record<string, unknown> = {};
  if (input.floatRetained !== undefined) values.floatRetained = String(r2(input.floatRetained));
  if (input.cashCounted   !== undefined) values.cashCounted   = input.cashCounted === null ? null : String(r2(input.cashCounted));
  if (input.bankedAmount  !== undefined) values.bankedAmount  = input.bankedAmount === null ? null : String(r2(input.bankedAmount));
  if (input.cashPurchases !== undefined) values.cashPurchases = input.cashPurchases;
  if (input.staffCosts    !== undefined) values.staffCosts    = input.staffCosts;
  if (input.notes         !== undefined) values.notes         = input.notes;

  const [computed, settings] = await Promise.all([
    computeWeek(merchantId, startDate, endDate),
    eowSettings(merchantId),
  ]);

  if (existing) {
    if (Object.keys(values).length > 0) {
      await db.update(endOfWeekReportsTable).set(values).where(eq(endOfWeekReportsTable.id, existing.id));
    }
  } else {
    // The first save of ANY field is what creates the row, and creating it is
    // what ends the auto-pull of till cash-outs (see mergeCashPurchases). So a
    // row created by editing the float must be seeded with the lines the page
    // was already showing, or they would vanish on the next load.
    if (values.cashPurchases === undefined) {
      values.cashPurchases = mergeCashPurchases([], computed.banking.drawerCashOuts, true);
    }
    await db.insert(endOfWeekReportsTable).values({
      merchantId, startDate, endDate, status: "draft", ...values,
    });
  }

  const [saved] = await db
    .select()
    .from(endOfWeekReportsTable)
    .where(and(
      eq(endOfWeekReportsTable.merchantId, merchantId),
      eq(endOfWeekReportsTable.startDate, startDate),
      eq(endOfWeekReportsTable.endDate, endDate),
    ))
    .limit(1);
  res.json(assemble(startDate, endDate, computed, (saved as SavedRow | undefined) ?? null, settings));
});

/* ── POST /end-of-week/finalise ───────────────────────────────────────────── */
// Locks the week and freezes the computed figures as they stand right now.
router.post("/end-of-week/finalise", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const parsed = DateRange.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { startDate, endDate } = parsed.data;
  const rangeError = validateRange(startDate, endDate);
  if (rangeError) { res.status(400).json({ error: rangeError }); return; }

  const merchantId = req.session.merchantId!;
  const [existing] = await db
    .select()
    .from(endOfWeekReportsTable)
    .where(and(
      eq(endOfWeekReportsTable.merchantId, merchantId),
      eq(endOfWeekReportsTable.startDate, startDate),
      eq(endOfWeekReportsTable.endDate, endDate),
    ))
    .limit(1);

  if (existing?.status === "finalised") {
    res.status(409).json({ error: "This week is already finalised." });
    return;
  }

  // Attribution is derived server-side — never trust the client for who signed
  // off a financial record (same rule as POST /daily-closes).
  const sessionStaffId = req.session.staffId ?? null;
  const [merchant] = await db
    .select({ ownerName: merchantsTable.ownerName, businessName: merchantsTable.businessName })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, merchantId))
    .limit(1);
  let closedByName = merchant?.ownerName || merchant?.businessName || null;
  if (sessionStaffId !== null) {
    const [member] = await db
      .select({ name: staffTable.name })
      .from(staffTable)
      .where(and(eq(staffTable.id, sessionStaffId), eq(staffTable.merchantId, merchantId)))
      .limit(1);
    if (member?.name) closedByName = member.name;
  }

  const [computed, settings] = await Promise.all([
    computeWeek(merchantId, startDate, endDate),
    eowSettings(merchantId),
  ]);
  const snapshot = assemble(startDate, endDate, computed, (existing as SavedRow | undefined) ?? null, settings);

  const finalisedAt = new Date();
  const values = {
    status: "finalised",
    snapshot: { ...snapshot, status: "finalised" },
    finalisedAt,
    finalisedBy: sessionStaffId,
    finalisedByName: closedByName,
  };

  if (existing) {
    await db.update(endOfWeekReportsTable).set(values).where(eq(endOfWeekReportsTable.id, existing.id));
  } else {
    await db.insert(endOfWeekReportsTable).values({
      merchantId, startDate, endDate,
      floatRetained: String(snapshot.banking.floatRetained),
      cashPurchases: snapshot.banking.cashPurchases,
      staffCosts: snapshot.staffCosts.rows,
      ...values,
    });
  }

  res.json({
    ...snapshot,
    status: "finalised",
    finalisedAt: finalisedAt.toISOString(),
    finalisedByName: closedByName,
  });
});

/* ── POST /end-of-week/reopen ─────────────────────────────────────────────── */
// Drops the snapshot so the week goes back to live figures. The merchant's
// inputs (float, purchases, employee costs, banking) are deliberately kept.
router.post("/end-of-week/reopen", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const parsed = DateRange.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { startDate, endDate } = parsed.data;
  const merchantId = req.session.merchantId!;

  const updated = await db
    .update(endOfWeekReportsTable)
    .set({ status: "draft", snapshot: null, finalisedAt: null, finalisedBy: null, finalisedByName: null })
    .where(and(
      eq(endOfWeekReportsTable.merchantId, merchantId),
      eq(endOfWeekReportsTable.startDate, startDate),
      eq(endOfWeekReportsTable.endDate, endDate),
    ))
    .returning({ id: endOfWeekReportsTable.id });

  if (updated.length === 0) { res.status(404).json({ error: "No saved report for that week" }); return; }

  const [computed, settings] = await Promise.all([
    computeWeek(merchantId, startDate, endDate),
    eowSettings(merchantId),
  ]);
  const [saved] = await db
    .select()
    .from(endOfWeekReportsTable)
    .where(eq(endOfWeekReportsTable.id, updated[0].id))
    .limit(1);
  res.json(assemble(startDate, endDate, computed, (saved as SavedRow | undefined) ?? null, settings));
});

/* ── GET /end-of-week/history ─────────────────────────────────────────────── */
// The weeks already saved, newest first — the banking history.
/* ── Status ───────────────────────────────────────────────────────────────── */
// For the Friday prompt when a register is opened: which week has just
// finished and whether it has been done. Any signed-in staff may ask (a
// cashier's prompt tells them to fetch a manager); it reveals no figures.
router.get("/end-of-week/status", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [m] = await db.select({ timezone: merchantsTable.timezone }).from(merchantsTable).where(eq(merchantsTable.id, merchantId));
  const today = localDate(m?.timezone);
  const { startDate, endDate } = defaultWeekRange(parseYmd(today) ?? new Date());
  const [saved] = await db.select({ status: endOfWeekReportsTable.status })
    .from(endOfWeekReportsTable)
    .where(and(
      eq(endOfWeekReportsTable.merchantId, merchantId),
      eq(endOfWeekReportsTable.startDate, startDate),
      eq(endOfWeekReportsTable.endDate, endDate),
    ))
    .limit(1);
  res.json({
    today,
    /** The shop's own day of the week, 0 = Sunday … 5 = Friday. */
    weekday: (parseYmd(today) ?? new Date()).getUTCDay(),
    startDate,
    endDate,
    status: saved?.status ?? "not-started",
  });
});

router.get("/end-of-week/history", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "26"), 10) || 26, 1), 200);

  const rows = await db.execute<{
    id: number; start_date: string; end_date: string; status: string;
    float_retained: string; cash_counted: string | null; banked_amount: string | null;
    finalised_at: string | null; finalised_by_name: string | null; snapshot: unknown;
  }>(sql`
    SELECT id, start_date::text, end_date::text, status, float_retained,
           cash_counted, banked_amount,
           to_char(finalised_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS finalised_at,
           finalised_by_name, snapshot
    FROM end_of_week_reports
    WHERE merchant_id = ${merchantId}
    ORDER BY start_date DESC
    LIMIT ${limit}
  `);

  res.json({
    items: rows.rows.map((r) => {
      const snap = r.snapshot as { sales?: { grossRevenue?: number; netProfit?: number }; banking?: { cashToBank?: number } } | null;
      return {
        id: r.id,
        startDate: r.start_date,
        endDate: r.end_date,
        status: r.status,
        floatRetained: r2(r.float_retained),
        cashCounted:  r.cash_counted  === null ? null : r2(r.cash_counted),
        bankedAmount: r.banked_amount === null ? null : r2(r.banked_amount),
        finalisedAt: r.finalised_at,
        finalisedByName: r.finalised_by_name,
        // Only a finalised week has figures to show here; a draft recomputes.
        grossRevenue: snap?.sales?.grossRevenue ?? null,
        netProfit:    snap?.sales?.netProfit ?? null,
        cashToBank:   snap?.banking?.cashToBank ?? null,
      };
    }),
  });
});

export default router;
