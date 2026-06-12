import {
  db, transactionsTable, invoicesTable, customersTable,
  appointmentsTable, serviceJobsTable,
} from "@workspace/db";
import { and, eq, gte, lte, ne, inArray, sql, type SQL } from "drizzle-orm";

/* ──────────────────────────────────────────────────────────────────────────
 * Shared KPI actual-value calculation.
 *
 * This is the single source of truth for "how far has a KPI progressed".
 * Both the dashboard tile (GET /kpi-targets/dashboard-kpi) and the KPI pages
 * (GET /kpi-targets/progress) call computeActual(), so every surface agrees.
 * Previously the dashboard endpoint and the two React pages each re-implemented
 * this, and they disagreed on staff scoping, the end-of-budget boundary, and
 * the definition of "items per transaction".
 * ────────────────────────────────────────────────────────────────────────── */

const WEEK_START_DAY: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};
const WEEKDAY_IDX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const DEFAULT_TZ = "Australia/Sydney";

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ── Timezone-aware date helpers ─────────────────────────────────────────────
   Period boundaries must be anchored to the merchant's local calendar, not the
   server's (which runs in UTC). For an AU merchant a "daily" target otherwise
   starts ~10 hours late. We read the local wall-clock with Intl and convert a
   local wall-clock back to a UTC instant via a one-step offset correction. */

interface ZonedParts { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number; }

function getZonedParts(instant: Date, timeZone: string): ZonedParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) p[part.type] = part.value;
  return {
    year: +p.year, month: +p.month, day: +p.day,
    hour: +p.hour % 24, minute: +p.minute, second: +p.second,
    weekday: WEEKDAY_IDX[p.weekday] ?? 0,
  };
}

/** Offset (ms) between the zone's wall clock and UTC at the given instant. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const p = getZonedParts(instant, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - instant.getTime();
}

/** The UTC instant for a wall-clock time in `timeZone`. */
function zonedWallClockToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, timeZone: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  return new Date(guess - tzOffsetMs(new Date(guess), timeZone));
}

function safeZone(timeZone?: string | null): string {
  if (!timeZone) return DEFAULT_TZ;
  try { new Intl.DateTimeFormat("en-US", { timeZone }); return timeZone; } catch { return DEFAULT_TZ; }
}

/** Lower bound of the tracking window, in the merchant's timezone. A fixed
 *  start date wins (interpreted as local midnight); otherwise the current
 *  rolling period (day/week/month/quarter/year). */
export function getPeriodStartForKpi(period: string, weekStartDay = "monday", startDate?: string | null, timeZone?: string | null): Date {
  const tz = safeZone(timeZone);
  if (startDate) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(startDate);
    if (m) return zonedWallClockToUtc(+m[1], +m[2], +m[3], 0, 0, 0, tz);
  }
  const now = getZonedParts(new Date(), tz);
  switch (period) {
    case "daily":
      return zonedWallClockToUtc(now.year, now.month, now.day, 0, 0, 0, tz);
    case "weekly": {
      const startDow = WEEK_START_DAY[weekStartDay] ?? 1;
      const daysBack = (now.weekday - startDow + 7) % 7;
      // Walk back `daysBack` calendar days using a UTC proxy, then anchor to
      // local midnight of that date.
      const proxy = new Date(Date.UTC(now.year, now.month - 1, now.day) - daysBack * 86_400_000);
      return zonedWallClockToUtc(proxy.getUTCFullYear(), proxy.getUTCMonth() + 1, proxy.getUTCDate(), 0, 0, 0, tz);
    }
    case "monthly":
      return zonedWallClockToUtc(now.year, now.month, 1, 0, 0, 0, tz);
    case "quarterly":
      return zonedWallClockToUtc(now.year, Math.floor((now.month - 1) / 3) * 3 + 1, 1, 0, 0, 0, tz);
    case "annual":
      return zonedWallClockToUtc(now.year, 1, 1, 0, 0, 0, tz);
    default:
      return zonedWallClockToUtc(now.year, now.month, 1, 0, 0, 0, tz);
  }
}

/** Inclusive upper bound of a fixed-budget window (end of the given local day),
 *  or null for a rolling period that runs up to "now". */
export function getPeriodEndForKpi(endDate?: string | null, timeZone?: string | null): Date | null {
  if (!endDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(endDate);
  if (!m) return null;
  const end = zonedWallClockToUtc(+m[1], +m[2], +m[3], 23, 59, 59, safeZone(timeZone));
  return new Date(end.getTime() + 999);
}

function parseStaffIds(raw: unknown): number[] {
  let arr: unknown = raw;
  if (typeof raw === "string") {
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr.map((x) => parseInt(String(x), 10)).filter((n) => !isNaN(n));
}

export interface KpiCalcInput {
  metric: string;
  period: string;
  startDate?: string | null;
  endDate?: string | null;
  categoryId?: string | null;
  staffIds?: unknown;
}

/**
 * Compute the current actual for a KPI target, scoped to its period window and
 * (where the data supports it) to its assigned staff.
 *
 * Returns `null` — rendered as "—" by the UI — when the metric cannot be
 * computed for this target rather than a misleading 0, specifically:
 *   • upsell_rate (no upsell signal is captured in the data model yet); and
 *   • new_customers / loyalty_signups when the target is assigned to specific
 *     staff (customers carry no staff attribution, so a per-staff figure would
 *     be fabricated).
 */
export async function computeActual(
  merchantId: number,
  kpi: KpiCalcInput,
  weekStartDay = "monday",
  timeZone?: string | null,
): Promise<number | null> {
  const periodStart = getPeriodStartForKpi(kpi.period, weekStartDay, kpi.startDate, timeZone);
  const periodEnd = getPeriodEndForKpi(kpi.endDate, timeZone);
  const staffIds = parseStaffIds(kpi.staffIds);
  const isStaff = staffIds.length > 0;
  const metric = kpi.metric;

  // Raw-SQL fragments mirroring the builder conditions (used by the jsonb
  // metrics below). staffIds are parsed integers, so interpolating them is safe.
  const endFragT = periodEnd ? sql`AND t.created_at <= ${periodEnd}` : sql``;
  const staffFragT = isStaff ? sql`AND t.staff_id IN (${sql.raw(staffIds.join(","))})` : sql``;

  // Builder conditions for a sales-transaction query (optionally a status).
  const txnWhere = (status?: string): SQL | undefined => {
    const c: SQL[] = [eq(transactionsTable.merchantId, merchantId), gte(transactionsTable.createdAt, periodStart)];
    if (periodEnd) c.push(lte(transactionsTable.createdAt, periodEnd));
    if (status)    c.push(eq(transactionsTable.status, status));
    if (isStaff)   c.push(inArray(transactionsTable.staffId, staffIds));
    return and(...c);
  };

  try {
    switch (metric) {
      /* ── Revenue family (POS + paid invoices) ────────────────────────────
         Invoices have no staff attribution, so a staff-scoped target counts
         POS transactions only. */
      case "revenue":
      case "transactions":
      case "avg_transaction": {
        const [txnAgg] = await db.select({
          totalSales: sql<string>`COALESCE(SUM(${transactionsTable.total}::numeric), 0)`,
          txnCount:   sql<string>`COUNT(*)`,
        }).from(transactionsTable).where(txnWhere("completed"));

        let totalSales = parseFloat(txnAgg?.totalSales ?? "0");
        let txnCount   = Number(txnAgg?.txnCount ?? 0);

        if (!isStaff) {
          const invC: SQL[] = [eq(invoicesTable.merchantId, merchantId), eq(invoicesTable.status, "paid"), gte(invoicesTable.paidAt, periodStart)];
          if (periodEnd) invC.push(lte(invoicesTable.paidAt, periodEnd));
          const [invAgg] = await db.select({
            invoiceSales: sql<string>`COALESCE(SUM(${invoicesTable.total}::numeric), 0)`,
            invCount:     sql<string>`COUNT(*)`,
          }).from(invoicesTable).where(and(...invC));
          totalSales += parseFloat(invAgg?.invoiceSales ?? "0");
          txnCount   += Number(invAgg?.invCount ?? 0);
        }

        if (metric === "revenue")      return round2(totalSales);
        if (metric === "transactions") return txnCount;
        return txnCount > 0 ? round2(totalSales / txnCount) : 0;
      }

      /* ── Items per transaction (total units ÷ transactions) ────────────── */
      case "items_per_transaction": {
        const [txnAgg] = await db.select({ txnCount: sql<string>`COUNT(*)` })
          .from(transactionsTable).where(txnWhere("completed"));
        const txnCount = Number(txnAgg?.txnCount ?? 0);
        if (txnCount === 0) return 0;
        const rows = await db.execute(sql`
          SELECT COALESCE(SUM((item->>'quantity')::numeric), 0)::float AS units
          FROM transactions t
          CROSS JOIN LATERAL jsonb_array_elements(t.items) AS item
          WHERE t.merchant_id = ${merchantId} AND t.status = 'completed'
            AND t.created_at >= ${periodStart} ${endFragT} ${staffFragT}
            AND jsonb_typeof(t.items) = 'array'
        `);
        const units = Number((rows.rows[0] as { units: number })?.units ?? 0);
        return round2(units / txnCount);
      }

      /* ── New customers (no staff attribution) ──────────────────────────── */
      case "new_customers": {
        if (isStaff) return null;
        const c: SQL[] = [eq(customersTable.merchantId, merchantId), gte(customersTable.createdAt, periodStart)];
        if (periodEnd) c.push(lte(customersTable.createdAt, periodEnd));
        const [r] = await db.select({ count: sql<string>`COUNT(*)` }).from(customersTable).where(and(...c));
        return Number(r?.count ?? 0);
      }

      /* ── Loyalty sign-ups: new customers in the window who are loyalty
           members (hold points or a tier). No staff attribution. ─────────── */
      case "loyalty_signups": {
        if (isStaff) return null;
        const c: SQL[] = [
          eq(customersTable.merchantId, merchantId),
          gte(customersTable.createdAt, periodStart),
          sql`(${customersTable.loyaltyPoints} > 0 OR ${customersTable.tierName} IS NOT NULL)`,
        ];
        if (periodEnd) c.push(lte(customersTable.createdAt, periodEnd));
        const [r] = await db.select({ count: sql<string>`COUNT(*)` }).from(customersTable).where(and(...c));
        return Number(r?.count ?? 0);
      }

      /* ── Appointments completed ────────────────────────────────────────── */
      case "appointments": {
        const c: SQL[] = [
          eq(appointmentsTable.merchantId, merchantId),
          eq(appointmentsTable.status, "completed"),
          gte(appointmentsTable.scheduledAt, periodStart),
        ];
        if (periodEnd) c.push(lte(appointmentsTable.scheduledAt, periodEnd));
        if (isStaff)   c.push(inArray(appointmentsTable.staffId, staffIds));
        const [r] = await db.select({ count: sql<string>`COUNT(*)` }).from(appointmentsTable).where(and(...c));
        return Number(r?.count ?? 0);
      }

      /* ── Service jobs completed ────────────────────────────────────────── */
      case "services": {
        const c: SQL[] = [
          eq(serviceJobsTable.merchantId, merchantId),
          eq(serviceJobsTable.status, "completed"),
          gte(serviceJobsTable.createdAt, periodStart),
        ];
        if (periodEnd) c.push(lte(serviceJobsTable.createdAt, periodEnd));
        if (isStaff)   c.push(inArray(serviceJobsTable.staffId, staffIds));
        const [r] = await db.select({ count: sql<string>`COUNT(*)` }).from(serviceJobsTable).where(and(...c));
        return Number(r?.count ?? 0);
      }

      /* ── Refund rate (%): refunded ÷ all non-voided sales. Inverse metric. ─ */
      case "refund_rate": {
        const c: SQL[] = [eq(transactionsTable.merchantId, merchantId), gte(transactionsTable.createdAt, periodStart), ne(transactionsTable.status, "voided")];
        if (periodEnd) c.push(lte(transactionsTable.createdAt, periodEnd));
        if (isStaff)   c.push(inArray(transactionsTable.staffId, staffIds));
        const [r] = await db.select({
          refunds: sql<string>`COUNT(*) FILTER (WHERE ${transactionsTable.status} IN ('refunded', 'partial_refund'))`,
          total:   sql<string>`COUNT(*)`,
        }).from(transactionsTable).where(and(...c));
        const total = Number(r?.total ?? 0);
        return total > 0 ? round2((Number(r?.refunds ?? 0) / total) * 100) : 0;
      }

      /* ── Category revenue: line-item revenue whose product belongs to the
           named category. categoryId on the target holds the category name. ── */
      case "category_revenue": {
        const name = (kpi.categoryId ?? "").trim();
        if (!name) return null;
        const rows = await db.execute(sql`
          SELECT COALESCE(SUM((item->>'totalPrice')::numeric), 0)::float AS revenue
          FROM transactions t
          CROSS JOIN LATERAL jsonb_array_elements(t.items) AS item
          JOIN products p ON p.id = (item->>'productId')::int AND p.merchant_id = t.merchant_id
          JOIN categories c ON c.id = p.category_id AND c.merchant_id = t.merchant_id
          WHERE t.merchant_id = ${merchantId} AND t.status = 'completed'
            AND t.created_at >= ${periodStart} ${endFragT} ${staffFragT}
            AND jsonb_typeof(t.items) = 'array'
            AND lower(c.name) = lower(${name})
        `);
        return round2(Number((rows.rows[0] as { revenue: number })?.revenue ?? 0));
      }

      /* ── Net profit / gross margin (POS only; COGS-derived) ──────────────
         Revenue is ex-GST to match the Profit & Loss / Margin reports. COGS
         prefers the line-item cost snapshot, falling back to the product's
         current cost price. */
      case "net_profit":
      case "gross_margin": {
        const [revAgg] = await db.select({
          exGst: sql<string>`COALESCE(SUM((${transactionsTable.total} - ${transactionsTable.taxTotal})::numeric), 0)`,
        }).from(transactionsTable).where(txnWhere("completed"));
        const totalRevenue = parseFloat(revAgg?.exGst ?? "0");

        const cogsRows = await db.execute(sql`
          SELECT COALESCE(SUM(
            (item->>'quantity')::numeric
            * COALESCE((item->>'costPrice')::numeric, p.cost_price::numeric, 0)
          ), 0)::float AS total_cogs
          FROM transactions t
          CROSS JOIN LATERAL jsonb_array_elements(t.items) AS item
          LEFT JOIN products p ON p.id = (item->>'productId')::int AND p.merchant_id = t.merchant_id
          WHERE t.merchant_id = ${merchantId} AND t.status = 'completed'
            AND t.created_at >= ${periodStart} ${endFragT} ${staffFragT}
            AND jsonb_typeof(t.items) = 'array'
        `);
        const totalCogs = Number((cogsRows.rows[0] as { total_cogs: number })?.total_cogs ?? 0);

        if (metric === "net_profit") return round2(totalRevenue - totalCogs);
        return totalRevenue > 0 ? round2(((totalRevenue - totalCogs) / totalRevenue) * 100) : 0;
      }

      /* ── Not yet derivable from captured data ───────────────────────────── */
      case "upsell_rate":
      default:
        return null;
    }
  } catch {
    return null;
  }
}
