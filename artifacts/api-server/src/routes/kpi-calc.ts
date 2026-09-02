import {
  db, transactionsTable, invoicesTable, customersTable,
  appointmentsTable, serviceJobsTable, laybysTable,
} from "@workspace/db";
import { and, eq, gte, lte, ne, inArray, sql, type SQL } from "drizzle-orm";
import { getDefaultTaxRate, splitGstInclusive } from "../lib/tax";

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

const MONTH_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The period immediately before `now` for a KPI of the given `period`,
 *  expressed as a half-inclusive UTC window `[start, end]` in the merchant's
 *  timezone plus a human label. `start` is the previous period's local-midnight
 *  start; `end` is the last instant before the current period begins, so a
 *  `<= end` comparison captures exactly the completed period. Used to snapshot a
 *  just-finished period (day/week/month/quarter/year) into history. */
export function getPreviousPeriodWindow(
  period: string,
  weekStartDay = "monday",
  timeZone?: string | null,
  now: Date = new Date(),
): { start: Date; end: Date; label: string } {
  const tz = safeZone(timeZone);
  // Current period's start (handles weekly anchoring and calendar boundaries).
  const currentStart = getPeriodStartForKpi(period, weekStartDay, null, tz);
  const end = new Date(currentStart.getTime() - 1);
  // Local calendar date of the current period start.
  const c = getZonedParts(currentStart, tz);

  let py = c.year, pmo = c.month, pd = c.day;
  const shiftDays = (days: number) => {
    const proxy = new Date(Date.UTC(c.year, c.month - 1, c.day) - days * 86_400_000);
    py = proxy.getUTCFullYear(); pmo = proxy.getUTCMonth() + 1; pd = proxy.getUTCDate();
  };

  switch (period) {
    case "daily":  shiftDays(1); break;
    case "weekly": shiftDays(7); break;
    case "quarterly":
      pd = 1; pmo = c.month - 3;
      if (pmo < 1) { pmo += 12; py -= 1; }
      break;
    case "annual":
      pd = 1; pmo = 1; py = c.year - 1;
      break;
    case "monthly":
    default:
      pd = 1; pmo = c.month === 1 ? 12 : c.month - 1; py = c.month === 1 ? c.year - 1 : c.year;
      break;
  }

  const start = zonedWallClockToUtc(py, pmo, pd, 0, 0, 0, tz);

  let label: string;
  switch (period) {
    case "daily":     label = `${pd} ${MONTH_SHORT[pmo - 1]} ${py}`; break;
    case "weekly":    label = `Week of ${pd} ${MONTH_SHORT[pmo - 1]} ${py}`; break;
    case "quarterly": label = `Q${Math.floor((pmo - 1) / 3) + 1} ${py}`; break;
    case "annual":    label = `${py}`; break;
    case "monthly":
    default:          label = `${MONTH_LONG[pmo - 1]} ${py}`; break;
  }

  return { start, end, label };
}

/* ── Fixed budget windows (startDate/endDate) ────────────────────────────────
   A KPI can pin its tracking window to explicit dates instead of the rolling
   calendar period. When such a target is marked `repeats`, the window has to
   advance to the next period once it finishes — otherwise the KPI stays stuck
   on a window that has already ended. These helpers do the calendar arithmetic
   for that roll-forward, and describe a KPI's own window for archiving. */

interface Ymd { y: number; mo: number; d: number }

function parseYmd(s?: string | null): Ymd | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s ?? "").slice(0, 10));
  if (!m) return null;
  const v = { y: +m[1], mo: +m[2], d: +m[3] };
  if (v.mo < 1 || v.mo > 12 || v.d < 1 || v.d > daysInMonth(v.y, v.mo)) return null;
  return v;
}

const formatYmd = (v: Ymd) =>
  `${String(v.y).padStart(4, "0")}-${String(v.mo).padStart(2, "0")}-${String(v.d).padStart(2, "0")}`;

/** Days in a calendar month (day 0 of the next month is the last of this one). */
function daysInMonth(y: number, mo: number): number {
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

/** Shift a calendar date by whole days. Uses a UTC proxy purely as calendar
 *  arithmetic — no timezone is involved until the date is anchored to midnight. */
function shiftYmd(v: Ymd, days: number): Ymd {
  const p = new Date(Date.UTC(v.y, v.mo - 1, v.d) + days * 86_400_000);
  return { y: p.getUTCFullYear(), mo: p.getUTCMonth() + 1, d: p.getUTCDate() };
}

/** Add whole months, clamping the day to the target month's length so
 *  31 Jan + 1 month is 28/29 Feb rather than spilling into March. */
function addMonths(v: Ymd, n: number): Ymd {
  const total = v.y * 12 + (v.mo - 1) + n;
  const y = Math.floor(total / 12);
  const mo = (total % 12 + 12) % 12 + 1;
  return { y, mo, d: Math.min(v.d, daysInMonth(y, mo)) };
}

/** Advance a calendar date by exactly one KPI period. */
function addPeriod(v: Ymd, period: string): Ymd {
  switch (period) {
    case "daily":     return shiftYmd(v, 1);
    case "weekly":    return shiftYmd(v, 7);
    case "quarterly": return addMonths(v, 3);
    case "annual":    return addMonths(v, 12);
    case "monthly":
    default:          return addMonths(v, 1);
  }
}

const daysBetween = (a: Ymd, b: Ymd) =>
  Math.round((Date.UTC(b.y, b.mo - 1, b.d) - Date.UTC(a.y, a.mo - 1, a.d)) / 86_400_000);

/** Human label for a dated window. Windows that line up exactly with a calendar
 *  period get the same label the rolling path produces ("August 2026", "Q3 2026")
 *  so KPI History groups them together; anything offset gets a date range. */
function labelForDatedWindow(period: string, s: Ymd, e: Ymd): string {
  const sameYear = s.y === e.y;
  const spanDays = daysBetween(s, e) + 1;

  if (spanDays === 1) return `${s.d} ${MONTH_SHORT[s.mo - 1]} ${s.y}`;
  if (period === "weekly" && spanDays === 7) return `Week of ${s.d} ${MONTH_SHORT[s.mo - 1]} ${s.y}`;
  if (s.d === 1 && e.d === daysInMonth(e.y, e.mo)) {
    const months = (e.y - s.y) * 12 + (e.mo - s.mo) + 1;
    if (period === "monthly" && months === 1) return `${MONTH_LONG[s.mo - 1]} ${s.y}`;
    if (period === "quarterly" && months === 3 && (s.mo - 1) % 3 === 0) {
      return `Q${Math.floor((s.mo - 1) / 3) + 1} ${s.y}`;
    }
    if (period === "annual" && months === 12 && s.mo === 1) return `${s.y}`;
  }

  const startPart = sameYear
    ? `${s.d} ${MONTH_SHORT[s.mo - 1]}`
    : `${s.d} ${MONTH_SHORT[s.mo - 1]} ${s.y}`;
  return `${startPart} – ${e.d} ${MONTH_SHORT[e.mo - 1]} ${e.y}`;
}

export interface DatedWindow {
  /** UTC instant of local midnight on the window's first day. */
  start: Date;
  /** UTC instant of the last millisecond of the window's final local day. */
  end: Date;
  label: string;
  /** The window's local calendar bounds, as stored on the KPI row. */
  startDate: string;
  endDate: string;
}

/**
 * The budget window a dated KPI is currently tracking, resolved against the
 * merchant's timezone. When `endDate` is absent (or nonsensical — on or before
 * the start) the window is taken to be exactly one `period` long, so a target
 * pinned to "the 15th" tracks the 15th-to-14th month without the merchant
 * having to spell out an end date.
 *
 * Returns null when `startDate` is missing or unparseable — such a KPI has no
 * fixed window and follows the rolling calendar period instead.
 */
export function getDatedWindow(
  period: string,
  startDate?: string | null,
  endDate?: string | null,
  timeZone?: string | null,
): DatedWindow | null {
  const s = parseYmd(startDate);
  if (!s) return null;

  const explicitEnd = parseYmd(endDate);
  const e = explicitEnd && daysBetween(s, explicitEnd) >= 0
    ? explicitEnd
    : shiftYmd(addPeriod(s, period), -1);

  const tz = safeZone(timeZone);
  return {
    start: zonedWallClockToUtc(s.y, s.mo, s.d, 0, 0, 0, tz),
    end: new Date(zonedWallClockToUtc(e.y, e.mo, e.d, 23, 59, 59, tz).getTime() + 999),
    label: labelForDatedWindow(period, s, e),
    startDate: formatYmd(s),
    endDate: formatYmd(e),
  };
}

/**
 * The window immediately following a completed dated window. The next window
 * starts the day after this one ends and runs one full `period`, so successive
 * windows are contiguous with no gap or overlap: 1–31 Jul rolls to 1–31 Aug,
 * and 1–28 Feb rolls to 1–31 Mar (not 1–28 Mar).
 *
 * `endDate` comes back null when the KPI had none, preserving the merchant's
 * "start date only" setup rather than inventing an end date for them.
 */
export function advanceDatedWindow(
  period: string,
  startDate: string,
  endDate: string | null | undefined,
  timeZone?: string | null,
): { startDate: string; endDate: string | null } | null {
  const current = getDatedWindow(period, startDate, endDate, timeZone);
  if (!current) return null;

  const nextStart = shiftYmd(parseYmd(current.endDate)!, 1);
  const nextEnd = shiftYmd(addPeriod(nextStart, period), -1);
  return {
    startDate: formatYmd(nextStart),
    // Only carry an end date forward if the merchant set one.
    endDate: parseYmd(endDate) ? formatYmd(nextEnd) : null,
  };
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
  // Explicit window override — when provided, the actual is computed over this
  // fixed [start, end] window instead of the KPI's current rolling period. Used
  // to snapshot a completed period (e.g. last month) into history.
  window?: { start: Date; end: Date | null },
): Promise<number | null> {
  const periodStart = window ? window.start : getPeriodStartForKpi(kpi.period, weekStartDay, kpi.startDate, timeZone);
  const periodEnd = window ? window.end : getPeriodEndForKpi(kpi.endDate, timeZone);
  const staffIds = parseStaffIds(kpi.staffIds);
  const isStaff = staffIds.length > 0;
  const metric = kpi.metric;

  // Raw-SQL fragments mirroring the builder conditions (used by the jsonb
  // metrics below). staffIds are parsed integers, so interpolating them is safe.
  const endFragT = periodEnd ? sql`AND t.created_at <= ${periodEnd}` : sql``;
  const staffFragT = isStaff ? sql`AND t.staff_id IN (${sql.raw(staffIds.join(","))})` : sql``;
  // Invoice-side fragments. Invoices now carry staff attribution, so a
  // staff-scoped target counts that staff's paid invoices too (parity with POS).
  const invEndFrag = periodEnd ? sql`AND inv.paid_at <= ${periodEnd}` : sql``;
  const staffFragInv = isStaff ? sql`AND inv.staff_id IN (${sql.raw(staffIds.join(","))})` : sql``;
  // Layby-side fragments. A completed layby is a sale on its completion date
  // (COALESCE'd to updated_at for laybys completed before completed_at existed),
  // attributed to its staff member — full parity with POS + paid invoices.
  const laybyDate = sql`COALESCE(l.completed_at, l.updated_at)`;
  const laybyEndFrag = periodEnd ? sql`AND COALESCE(l.completed_at, l.updated_at) <= ${periodEnd}` : sql``;
  const staffFragLayby = isStaff ? sql`AND l.staff_id IN (${sql.raw(staffIds.join(","))})` : sql``;

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
      /* ── Revenue family (POS + paid invoices + completed laybys) ──────────
         All three sale types count equally; staff-scoped targets use each
         sale's staff attribution. */
      case "revenue":
      case "transactions":
      case "avg_transaction": {
        const [txnAgg] = await db.select({
          totalSales: sql<string>`COALESCE(SUM(${transactionsTable.total}::numeric), 0)`,
          txnCount:   sql<string>`COUNT(*)`,
        }).from(transactionsTable).where(txnWhere("completed"));

        let totalSales = parseFloat(txnAgg?.totalSales ?? "0");
        let txnCount   = Number(txnAgg?.txnCount ?? 0);

        const invC: SQL[] = [eq(invoicesTable.merchantId, merchantId), eq(invoicesTable.status, "paid"), gte(invoicesTable.paidAt, periodStart)];
        if (periodEnd) invC.push(lte(invoicesTable.paidAt, periodEnd));
        if (isStaff)   invC.push(inArray(invoicesTable.staffId, staffIds));
        const [invAgg] = await db.select({
          invoiceSales: sql<string>`COALESCE(SUM(${invoicesTable.total}::numeric), 0)`,
          invCount:     sql<string>`COUNT(*)`,
        }).from(invoicesTable).where(and(...invC));
        totalSales += parseFloat(invAgg?.invoiceSales ?? "0");
        txnCount   += Number(invAgg?.invCount ?? 0);

        const laybyAgg = await db.execute<{ sales: number; cnt: number }>(sql`
          SELECT COALESCE(SUM(l.total_amount::numeric), 0)::float AS sales, COUNT(*)::int AS cnt
          FROM laybys l
          WHERE l.merchant_id = ${merchantId} AND l.status = 'completed'
            AND ${laybyDate} >= ${periodStart} ${laybyEndFrag} ${staffFragLayby}
        `);
        totalSales += Number(laybyAgg.rows[0]?.sales ?? 0);
        txnCount   += Number(laybyAgg.rows[0]?.cnt ?? 0);

        if (metric === "revenue")      return round2(totalSales);
        if (metric === "transactions") return txnCount;
        return txnCount > 0 ? round2(totalSales / txnCount) : 0;
      }

      /* ── Items per transaction (total units ÷ sales) — POS + invoices + laybys ── */
      case "items_per_transaction": {
        const [txnAgg] = await db.select({ txnCount: sql<string>`COUNT(*)` })
          .from(transactionsTable).where(txnWhere("completed"));
        let saleCount = Number(txnAgg?.txnCount ?? 0);
        const posRows = await db.execute(sql`
          SELECT COALESCE(SUM((item->>'quantity')::numeric), 0)::float AS units
          FROM transactions t
          CROSS JOIN LATERAL jsonb_array_elements(t.items) AS item
          WHERE t.merchant_id = ${merchantId} AND t.status = 'completed'
            AND t.created_at >= ${periodStart} ${endFragT} ${staffFragT}
            AND jsonb_typeof(t.items) = 'array'
        `);
        let units = Number((posRows.rows[0] as { units: number })?.units ?? 0);

        const invC: SQL[] = [eq(invoicesTable.merchantId, merchantId), eq(invoicesTable.status, "paid"), gte(invoicesTable.paidAt, periodStart)];
        if (periodEnd) invC.push(lte(invoicesTable.paidAt, periodEnd));
        if (isStaff)   invC.push(inArray(invoicesTable.staffId, staffIds));
        const [invCntRow] = await db.select({ c: sql<string>`COUNT(*)` }).from(invoicesTable).where(and(...invC));
        saleCount += Number(invCntRow?.c ?? 0);
        const invUnits = await db.execute(sql`
          SELECT COALESCE(SUM((item->>'quantity')::numeric), 0)::float AS units
          FROM invoices inv
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(inv.items::jsonb) = 'array' THEN inv.items::jsonb ELSE '[]'::jsonb END
          ) AS item
          WHERE inv.merchant_id = ${merchantId} AND inv.status = 'paid'
            AND inv.paid_at >= ${periodStart} ${invEndFrag} ${staffFragInv}
        `);
        units += Number((invUnits.rows[0] as { units: number })?.units ?? 0);

        const laybyCnt = await db.execute<{ c: number }>(sql`
          SELECT COUNT(*)::int AS c FROM laybys l
          WHERE l.merchant_id = ${merchantId} AND l.status = 'completed'
            AND ${laybyDate} >= ${periodStart} ${laybyEndFrag} ${staffFragLayby}
        `);
        saleCount += Number(laybyCnt.rows[0]?.c ?? 0);
        const laybyUnits = await db.execute<{ units: number }>(sql`
          SELECT COALESCE(SUM((item->>'quantity')::numeric), 0)::float AS units
          FROM laybys l
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(l.items) = 'array' THEN l.items ELSE '[]'::jsonb END
          ) AS item
          WHERE l.merchant_id = ${merchantId} AND l.status = 'completed'
            AND ${laybyDate} >= ${periodStart} ${laybyEndFrag} ${staffFragLayby}
        `);
        units += Number(laybyUnits.rows[0]?.units ?? 0);

        return saleCount > 0 ? round2(units / saleCount) : 0;
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
          JOIN products p ON p.id = NULLIF(item->>'productId', '')::int AND p.merchant_id = t.merchant_id
          JOIN categories c ON c.id = p.category_id AND c.merchant_id = t.merchant_id
          WHERE t.merchant_id = ${merchantId} AND t.status = 'completed'
            AND t.created_at >= ${periodStart} ${endFragT} ${staffFragT}
            AND jsonb_typeof(t.items) = 'array'
            AND lower(c.name) = lower(${name})
        `);
        let revenue = Number((rows.rows[0] as { revenue: number })?.revenue ?? 0);

        // Paid invoices with product-linked lines in this category (invoice
        // lines store quantity × unitPrice rather than a totalPrice).
        const invRows = await db.execute(sql`
          SELECT COALESCE(SUM((item->>'quantity')::numeric * (item->>'unitPrice')::numeric), 0)::float AS revenue
          FROM invoices inv
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(inv.items::jsonb) = 'array' THEN inv.items::jsonb ELSE '[]'::jsonb END
          ) AS item
          JOIN products p ON p.id = NULLIF(item->>'productId', '')::int AND p.merchant_id = inv.merchant_id
          JOIN categories c ON c.id = p.category_id AND c.merchant_id = inv.merchant_id
          WHERE inv.merchant_id = ${merchantId} AND inv.status = 'paid'
            AND inv.paid_at >= ${periodStart} ${invEndFrag} ${staffFragInv}
            AND lower(c.name) = lower(${name})
        `);
        revenue += Number((invRows.rows[0] as { revenue: number })?.revenue ?? 0);

        // Completed laybys with product-linked lines in this category (layby
        // lines store quantity × price).
        const laybyRows = await db.execute(sql`
          SELECT COALESCE(SUM((item->>'quantity')::numeric * (item->>'price')::numeric), 0)::float AS revenue
          FROM laybys l
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(l.items) = 'array' THEN l.items ELSE '[]'::jsonb END
          ) AS item
          JOIN products p ON p.id = NULLIF(item->>'productId', '')::int AND p.merchant_id = l.merchant_id
          JOIN categories c ON c.id = p.category_id AND c.merchant_id = l.merchant_id
          WHERE l.merchant_id = ${merchantId} AND l.status = 'completed'
            AND ${laybyDate} >= ${periodStart} ${laybyEndFrag} ${staffFragLayby}
            AND lower(c.name) = lower(${name})
        `);
        revenue += Number((laybyRows.rows[0] as { revenue: number })?.revenue ?? 0);
        return round2(revenue);
      }

      /* ── Net profit / gross margin (POS + paid invoices + completed laybys) ─
         Revenue is ex-GST. COGS prefers the line-item cost snapshot, falling
         back to the product's current cost price. All three sale types are
         included and staff-scoped via their staff_id. Laybys carry no GST
         split, so their ex-GST revenue is derived from the merchant's default
         tax rate; layby lines carry no cost snapshot, so COGS uses the
         product's current cost price. */
      case "net_profit":
      case "gross_margin": {
        const [revAgg] = await db.select({
          exGst: sql<string>`COALESCE(SUM((${transactionsTable.total} - ${transactionsTable.taxTotal})::numeric), 0)`,
        }).from(transactionsTable).where(txnWhere("completed"));
        let totalRevenue = parseFloat(revAgg?.exGst ?? "0");

        const cogsRows = await db.execute(sql`
          SELECT COALESCE(SUM(
            (item->>'quantity')::numeric
            * COALESCE((item->>'costPrice')::numeric, 0)
          ), 0)::float AS total_cogs
          FROM transactions t
          CROSS JOIN LATERAL jsonb_array_elements(t.items) AS item
          LEFT JOIN products p ON p.id = NULLIF(item->>'productId', '')::int AND p.merchant_id = t.merchant_id
          WHERE t.merchant_id = ${merchantId} AND t.status = 'completed'
            AND t.created_at >= ${periodStart} ${endFragT} ${staffFragT}
            AND jsonb_typeof(t.items) = 'array'
        `);
        let totalCogs = Number((cogsRows.rows[0] as { total_cogs: number })?.total_cogs ?? 0);

        // Paid invoices contribute revenue and (now that lines carry a cost
        // snapshot) COGS, scoped to staff via the invoice's staff_id.
        const invRev = await db.execute(sql`
          SELECT COALESCE(SUM((inv.total - inv.tax_total)::numeric), 0)::float AS ex_gst
          FROM invoices inv
          WHERE inv.merchant_id = ${merchantId} AND inv.status = 'paid'
            AND inv.paid_at >= ${periodStart} ${invEndFrag} ${staffFragInv}
        `);
        totalRevenue += Number((invRev.rows[0] as { ex_gst: number })?.ex_gst ?? 0);

        const invCogs = await db.execute(sql`
          SELECT COALESCE(SUM(
            (item->>'quantity')::numeric
            * COALESCE((item->>'costPrice')::numeric, 0)
          ), 0)::float AS total_cogs
          FROM invoices inv
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(inv.items::jsonb) = 'array' THEN inv.items::jsonb ELSE '[]'::jsonb END
          ) AS item
          LEFT JOIN products p ON p.id = NULLIF(item->>'productId', '')::int AND p.merchant_id = inv.merchant_id
          WHERE inv.merchant_id = ${merchantId} AND inv.status = 'paid'
            AND inv.paid_at >= ${periodStart} ${invEndFrag} ${staffFragInv}
        `);
        totalCogs += Number((invCogs.rows[0] as { total_cogs: number })?.total_cogs ?? 0);

        // Completed laybys: ex-GST revenue derived from the merchant default
        // tax rate (layby totals are GST-inclusive), COGS from the at-sale cost
        // snapshot (no current-cost fallback).
        const laybyGross = await db.execute<{ gross: number }>(sql`
          SELECT COALESCE(SUM(l.total_amount::numeric), 0)::float AS gross
          FROM laybys l
          WHERE l.merchant_id = ${merchantId} AND l.status = 'completed'
            AND ${laybyDate} >= ${periodStart} ${laybyEndFrag} ${staffFragLayby}
        `);
        const laybyGrossTotal = Number(laybyGross.rows[0]?.gross ?? 0);
        if (laybyGrossTotal > 0) {
          const rate = await getDefaultTaxRate(merchantId);
          totalRevenue += splitGstInclusive(laybyGrossTotal, rate).exGst;
        }

        const laybyCogs = await db.execute<{ total_cogs: number }>(sql`
          SELECT COALESCE(SUM(
            (item->>'quantity')::numeric * COALESCE((item->>'costPrice')::numeric, 0)
          ), 0)::float AS total_cogs
          FROM laybys l
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(l.items) = 'array' THEN l.items ELSE '[]'::jsonb END
          ) AS item
          LEFT JOIN products p ON p.id = NULLIF(item->>'productId', '')::int AND p.merchant_id = l.merchant_id
          WHERE l.merchant_id = ${merchantId} AND l.status = 'completed'
            AND ${laybyDate} >= ${periodStart} ${laybyEndFrag} ${staffFragLayby}
        `);
        totalCogs += Number(laybyCogs.rows[0]?.total_cogs ?? 0);

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
