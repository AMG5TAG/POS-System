/**
 * End of Week — the pure arithmetic behind the weekly banking sheet.
 *
 * Everything here is deliberately free of `db` and `req` so the money rules can
 * be unit tested directly (`src/__tests__/end-of-week.test.ts`). The route does
 * the querying; this module decides what the numbers mean.
 */

/* ── Week windows ─────────────────────────────────────────────────────────── */

/** Day names in `Date.getDay()` order, which is what `WEEK_END_DAYS` indexes. */
export const WEEK_DAY_NAMES = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
] as const;
export type WeekDayName = (typeof WEEK_DAY_NAMES)[number];

/** KoaPOS sells to Australian retail, where the trading week is Fri → Thu. */
export const DEFAULT_WEEK_END_DAY: WeekDayName = "thursday";

const pad = (n: number) => String(n).padStart(2, "0");
export const toYmd = (d: Date): string =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Parse `YYYY-MM-DD` into a UTC-midnight Date. Returns null for anything else. */
export function parseYmd(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whole days between two `YYYY-MM-DD` dates, inclusive of both ends. */
export function daysInRange(startDate: string, endDate: string): number {
  const s = parseYmd(startDate), e = parseYmd(endDate);
  if (!s || !e) return 0;
  return Math.floor((e.getTime() - s.getTime()) / 86_400_000) + 1;
}

/**
 * The most recent week that has fully finished, ending on `endDay`.
 *
 * "Fully finished" matters: a merchant banking on Friday morning wants last
 * Friday→Thursday, not the half-week they are standing in. So when today IS the
 * end day the week that just closed is still the one before it — the day's own
 * trading is not over when they open the page.
 */
export function defaultWeekRange(
  today: Date,
  endDay: WeekDayName = DEFAULT_WEEK_END_DAY,
): { startDate: string; endDate: string } {
  const endIdx = WEEK_DAY_NAMES.indexOf(endDay);
  const anchor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  // Days back to the last `endDay` strictly before today (1..7).
  const back = ((anchor.getUTCDay() - endIdx + 7) % 7) || 7;
  const end = new Date(anchor.getTime() - back * 86_400_000);
  const start = new Date(end.getTime() - 6 * 86_400_000);
  return { startDate: toYmd(start), endDate: toYmd(end) };
}

/** Shift a week window by whole weeks — powers the ◀ / ▶ buttons. */
export function shiftWeek(
  startDate: string,
  endDate: string,
  weeks: number,
): { startDate: string; endDate: string } {
  const s = parseYmd(startDate), e = parseYmd(endDate);
  if (!s || !e) return { startDate, endDate };
  const span = Math.max(1, daysInRange(startDate, endDate));
  const delta = weeks * span * 86_400_000;
  return { startDate: toYmd(new Date(s.getTime() + delta)), endDate: toYmd(new Date(e.getTime() + delta)) };
}

/* ── Rounding ─────────────────────────────────────────────────────────────── */

/** Round to cents. Every figure this module returns goes through it. */
export const r2 = (n: unknown): number => {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
};

/* ── Payment method grouping ──────────────────────────────────────────────── */

/** Tenders that put physical cash in the drawer. */
export const CASH_METHODS = new Set(["cash"]);
/** Tenders settled by the terminal — banked by the acquirer, not by hand. */
export const EFTPOS_METHODS = new Set(["eftpos", "card", "stripe", "zeller", "afterpay", "klarna"]);
/** Tenders that arrive in the bank account directly. */
export const DIRECT_DEPOSIT_METHODS = new Set(["direct_deposit", "bank_transfer", "invoice"]);
/** Tenders that move no new money — a liability already paid for is redeemed. */
export const NON_BANKING_METHODS = new Set(["gift_card", "voucher", "store_credit", "loyalty"]);

export type MethodTotal = { method: string; count: number; total: number };

export interface BankingGroups {
  cash: number;
  eftpos: number;
  directDeposit: number;
  /** Gift cards, vouchers, store credit, loyalty — redeemed, never banked. */
  nonBanking: number;
  /** Anything the merchant tenders that fits none of the above. */
  other: number;
}

/**
 * Split takings into the buckets a bank deposit actually cares about.
 *
 * `split` is never a bucket: the POS records a split sale's legs individually,
 * so a "split" row here would double-count the sale it belongs to. It is
 * dropped rather than bucketed as "other".
 */
export function groupByBanking(rows: readonly MethodTotal[]): BankingGroups {
  const g: BankingGroups = { cash: 0, eftpos: 0, directDeposit: 0, nonBanking: 0, other: 0 };
  for (const row of rows) {
    const m = (row.method || "other").toLowerCase();
    if (m === "split") continue;
    if (CASH_METHODS.has(m)) g.cash += row.total;
    else if (EFTPOS_METHODS.has(m)) g.eftpos += row.total;
    else if (DIRECT_DEPOSIT_METHODS.has(m)) g.directDeposit += row.total;
    else if (NON_BANKING_METHODS.has(m)) g.nonBanking += row.total;
    else g.other += row.total;
  }
  return {
    cash: r2(g.cash), eftpos: r2(g.eftpos), directDeposit: r2(g.directDeposit),
    nonBanking: r2(g.nonBanking), other: r2(g.other),
  };
}

/* ── The deposit ──────────────────────────────────────────────────────────── */

export interface CashPurchase {
  id: string;
  description: string;
  amount: number;
  date?: string;
  /** "drawer" for a line pulled from a cash_drawer_entries cash-out; else "manual". */
  source: "manual" | "drawer";
}

export interface DepositInput {
  /** Cash tendered on completed sales in the week. */
  cashTakings: number;
  /** Cash handed back on refunds in the week (a positive number). */
  cashRefunds: number;
  /** cash_drawer_entries `cash_in` — a float top-up or petty cash returned. */
  drawerCashIn: number;
  /** Cash spent out of the till on business purchases. */
  cashPurchasesTotal: number;
  /** Cash held back in the tills as next week's float. */
  floatRetained: number;
  /** Cash physically counted in the tills, float included. Null when not counted. */
  cashCounted: number | null;
}

export interface DepositResult {
  /** Net cash the week generated, on top of the float. */
  expectedCash: number;
  /** What should physically be sitting in the tills: float + expected. */
  expectedInTill: number;
  /** Counted − expected. Null when nothing was counted, so no false variance. */
  countVariance: number | null;
  /** The deposit: cash in the tills, less the float kept back. */
  cashToBank: number;
  /** True when cashToBank came off a physical count rather than the ledger. */
  fromCount: boolean;
}

/**
 * Work out what goes to the bank.
 *
 * The count wins when there is one. A drawer that was counted is the fact; the
 * ledger figure is a prediction of it, and banking a prediction is how a till
 * ends the week short. When nothing was counted the ledger figure stands in, and
 * `countVariance` stays null rather than reporting a variance against itself.
 *
 * Cash purchases are subtracted from the *expected* figure only. Money already
 * taken out of the drawer to buy something is money the count will not see, so
 * subtracting it from a counted total would deduct it twice.
 */
export function computeDeposit(i: DepositInput): DepositResult {
  const expectedCash = r2(i.cashTakings - i.cashRefunds + i.drawerCashIn - i.cashPurchasesTotal);
  const expectedInTill = r2(i.floatRetained + expectedCash);
  const counted = i.cashCounted;
  const hasCount = counted !== null && counted !== undefined && Number.isFinite(counted);
  return {
    expectedCash,
    expectedInTill,
    countVariance: hasCount ? r2(counted - expectedInTill) : null,
    cashToBank: r2((hasCount ? counted : expectedInTill) - i.floatRetained),
    fromCount: hasCount,
  };
}

/* ── Employee costs ───────────────────────────────────────────────────────── */

export interface StaffCostRow {
  staffId: number | null;
  name: string;
  role: string;
  /** Hours worked in the week, from timesheets. Informational. */
  hours: number;
  wages: number;
  /** PAYG withheld. Never derived — the merchant's accountant owns this figure. */
  tax: number;
  superannuation: number;
  bonus: number;
  extras: number;
  /** Dollar-value KPI rewards for KPI periods that closed inside the week. */
  kpi: number;
  /** True when the merchant has edited this row, so a recompute won't clobber it. */
  edited: boolean;
}

/**
 * What the employee cost the business.
 *
 * PAYG is excluded by default because it is withheld *out of* the wage, not paid
 * on top of it — adding it would count the same dollars twice. `includeTax` is
 * the merchant's accounting convention (`sales_settings.eowIncludeTaxInStaffCost`)
 * for shops that budget on the gross figure, or that remit PAYG as a separate
 * outgoing they want to see landing in the week.
 */
export function staffCostTotal(r: StaffCostRow, includeTax = false): number {
  return r2(r.wages + r.superannuation + r.bonus + r.extras + r.kpi + (includeTax ? r.tax : 0));
}

export interface StaffCostTotals {
  hours: number; wages: number; tax: number; superannuation: number;
  bonus: number; extras: number; kpi: number; total: number;
}

export function sumStaffCosts(rows: readonly StaffCostRow[], includeTax = false): StaffCostTotals {
  const t: StaffCostTotals = { hours: 0, wages: 0, tax: 0, superannuation: 0, bonus: 0, extras: 0, kpi: 0, total: 0 };
  for (const r of rows) {
    t.hours += r.hours; t.wages += r.wages; t.tax += r.tax;
    t.superannuation += r.superannuation; t.bonus += r.bonus;
    t.extras += r.extras; t.kpi += r.kpi;
    t.total += staffCostTotal(r, includeTax);
  }
  return {
    hours: Math.round(t.hours * 100) / 100, wages: r2(t.wages), tax: r2(t.tax),
    superannuation: r2(t.superannuation), bonus: r2(t.bonus), extras: r2(t.extras),
    kpi: r2(t.kpi), total: r2(t.total),
  };
}

/**
 * Hours between two `HH:MM` clock strings.
 *
 * A shift that clocks out earlier than it clocked in crossed midnight, so it
 * wraps to the next day rather than returning a negative shift. An open shift
 * (no clock-out) is 0 — it has not been worked yet, and guessing "until now"
 * would put a number into a wage bill that nobody entered.
 */
export function shiftHours(clockIn: string | null, clockOut: string | null): number {
  const parse = (s: string | null): number | null => {
    if (!s) return null;
    const m = /^(\d{1,2}):(\d{2})/.exec(s.trim());
    if (!m) return null;
    const h = Number(m[1]), mi = Number(m[2]);
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  };
  const a = parse(clockIn), b = parse(clockOut);
  if (a === null || b === null) return 0;
  const mins = b >= a ? b - a : b + 1440 - a;
  return Math.round((mins / 60) * 100) / 100;
}

/**
 * Wages for hours worked, including any casual loading the staff record carries.
 * `loadingRate` is a percentage on top of the base rate (25% casual loading is
 * the common Australian case).
 */
export function computeWages(hours: number, payRate: number, loadingRate: number): number {
  const base = hours * payRate;
  return r2(base + base * (loadingRate / 100));
}

/** Superannuation on wages, at the staff member's own rate. */
export function computeSuper(wages: number, superRate: number): number {
  return r2(wages * (superRate / 100));
}

/* ── Merging saved rows over computed ones ────────────────────────────────── */

/**
 * Lay the merchant's saved employee-cost rows over the freshly computed ones.
 *
 * A saved row wins outright: once someone has typed a PAYG figure or a bonus,
 * a later recompute must not quietly overwrite it. `hours` is the exception — it
 * is read-only information from the timesheets, so it always refreshes. Saved
 * rows for staff no longer in the computed list (a since-deactivated employee)
 * are kept, because their cost was still incurred that week.
 */
export function mergeStaffCosts(
  computed: readonly StaffCostRow[],
  saved: readonly Partial<StaffCostRow>[],
): StaffCostRow[] {
  const savedById = new Map<number | string, Partial<StaffCostRow>>();
  for (const s of saved) savedById.set(s.staffId ?? `name:${s.name ?? ""}`, s);

  const out: StaffCostRow[] = computed.map((c) => {
    const s = savedById.get(c.staffId ?? `name:${c.name}`);
    if (!s) return c;
    savedById.delete(c.staffId ?? `name:${c.name}`);
    return {
      ...c,
      wages:          num(s.wages, c.wages),
      tax:            num(s.tax, c.tax),
      superannuation: num(s.superannuation, c.superannuation),
      bonus:          num(s.bonus, c.bonus),
      extras:         num(s.extras, c.extras),
      kpi:            num(s.kpi, c.kpi),
      edited:         true,
    };
  });

  for (const s of savedById.values()) {
    out.push({
      staffId: s.staffId ?? null,
      name: s.name ?? "—",
      role: s.role ?? "",
      hours: num(s.hours, 0),
      wages: num(s.wages, 0),
      tax: num(s.tax, 0),
      superannuation: num(s.superannuation, 0),
      bonus: num(s.bonus, 0),
      extras: num(s.extras, 0),
      kpi: num(s.kpi, 0),
      edited: true,
    });
  }
  return out;
}

const num = (v: unknown, fallback: number): number =>
  v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? fallback : r2(v);

/* ── Cash purchases ───────────────────────────────────────────────────────── */

/**
 * Merge the week's drawer cash-outs into the merchant's saved purchase lines.
 *
 * A drawer line is identified by the entry id it came from, so re-opening the
 * page cannot duplicate it, and a line the merchant deleted stays deleted —
 * `keptDrawerIds` carries the ids still present on the saved row. Manual lines
 * are passed through untouched.
 */
export function mergeCashPurchases(
  saved: readonly CashPurchase[],
  drawerCashOuts: readonly { id: number; amount: number; note: string | null; shiftDate: string }[],
  isFirstOpen: boolean,
): CashPurchase[] {
  const savedList = saved.map((p) => ({ ...p, amount: r2(p.amount) }));
  const seen = new Set(savedList.filter((p) => p.source === "drawer").map((p) => p.id));
  // Only pull drawer entries in on the first open of a week. After that the
  // saved row is the record of what the merchant chose to keep.
  if (!isFirstOpen) return savedList;
  for (const e of drawerCashOuts) {
    const id = `drawer:${e.id}`;
    if (seen.has(id)) continue;
    savedList.push({
      id,
      description: e.note?.trim() || "Till cash-out",
      amount: r2(e.amount),
      date: e.shiftDate,
      source: "drawer",
    });
  }
  return savedList;
}

export const sumCashPurchases = (rows: readonly CashPurchase[]): number =>
  r2(rows.reduce((s, p) => s + (Number(p.amount) || 0), 0));

/* ── Weekly budget ────────────────────────────────────────────────────────
   The budget is the business's own KPI (Management › Staff & Operations ›
   KPIs & Targets): an active, business-wide (no staff assigned) Net Profit
   KPI, preferring one named "Budget". When several qualify, the one whose
   dated window covers the week wins, then an undated one, then the most recent
   window that started before the week — a "Budget" set for one month keeps
   applying until it is updated, and the page says which window it came from.
   Its target is spread by its own period (monthly × 12 ÷ 52, quarterly × 4 ÷
   52, annual ÷ 52, weekly as is, daily × 7), pro rata per day for a custom
   range. The week is measured on profit after staff. */

export interface BudgetKpi {
  id: number;
  name: string;
  metric: string;
  period: string;
  target: number;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  /** Staff the KPI is assigned to; a budget is business-wide, so empty. */
  staffIds: number[];
}

export interface WeekBudget {
  kpiId: number;
  kpiName: string;
  period: string;
  /** The KPI's target for its own period. */
  periodTarget: number;
  /** The KPI's dated window, when it has one ("2026-06-01 – 2026-06-30"). */
  windowStart: string | null;
  windowEnd: string | null;
  /** True when the week falls outside that window (the latest one was used). */
  outsideWindow: boolean;
  weeklyBudget: number;
  /** Profit after staff for the week. */
  actual: number;
  /** actual − weeklyBudget: positive = made over budget, negative = missed it. */
  difference: number;
}

const WEEKS_PER_PERIOD: Record<string, number> = {
  daily: 1 / 7, weekly: 1, monthly: 52 / 12, quarterly: 13, annual: 52,
};

/** The KPI window's end: the given end date, else one period after the start. */
function windowEnd(k: BudgetKpi): string | null {
  if (!k.startDate) return null;
  if (k.endDate && k.endDate >= k.startDate) return k.endDate;
  const s = parseYmd(k.startDate)!;
  const e = new Date(s);
  switch (k.period) {
    case "daily": break;
    case "weekly": e.setUTCDate(e.getUTCDate() + 6); break;
    case "quarterly": e.setUTCMonth(e.getUTCMonth() + 3); e.setUTCDate(e.getUTCDate() - 1); break;
    case "annual": e.setUTCFullYear(e.getUTCFullYear() + 1); e.setUTCDate(e.getUTCDate() - 1); break;
    default: e.setUTCMonth(e.getUTCMonth() + 1); e.setUTCDate(e.getUTCDate() - 1);
  }
  return toYmd(e);
}

export function pickBudgetKpi(kpis: readonly BudgetKpi[], weekStart: string): { kpi: BudgetKpi; outsideWindow: boolean } | null {
  const pool = kpis.filter((k) =>
    k.isActive && k.metric === "net_profit" && k.staffIds.length === 0 && k.target > 0 && WEEKS_PER_PERIOD[k.period] != null);
  if (!pool.length) return null;
  const named = pool.filter((k) => k.name.trim().toLowerCase() === "budget");
  const ranked = named.length ? named : pool;

  const covering = ranked.filter((k) => k.startDate && k.startDate <= weekStart && (windowEnd(k) ?? "") >= weekStart);
  if (covering.length) return { kpi: covering.sort((a, b) => (b.startDate! > a.startDate! ? 1 : -1))[0]!, outsideWindow: false };
  const undated = ranked.filter((k) => !k.startDate);
  if (undated.length) return { kpi: undated.sort((a, b) => b.id - a.id)[0]!, outsideWindow: false };
  const started = ranked.filter((k) => k.startDate && k.startDate <= weekStart)
    .sort((a, b) => (b.startDate! > a.startDate! ? 1 : -1));
  if (started.length) return { kpi: started[0]!, outsideWindow: true };
  return null; // only windows that start after this week
}

export function weekBudget(kpis: readonly BudgetKpi[], startDate: string, days: number, actual: number): WeekBudget | null {
  if (!(days > 0)) return null;
  const pick = pickBudgetKpi(kpis, startDate);
  if (!pick) return null;
  const { kpi, outsideWindow } = pick;
  const weeklyBudget = r2((kpi.target / WEEKS_PER_PERIOD[kpi.period]!) * (days / 7));
  return {
    kpiId: kpi.id,
    kpiName: kpi.name,
    period: kpi.period,
    periodTarget: r2(kpi.target),
    windowStart: kpi.startDate,
    windowEnd: windowEnd(kpi),
    outsideWindow,
    weeklyBudget,
    actual: r2(actual),
    difference: r2(actual - weeklyBudget),
  };
}
