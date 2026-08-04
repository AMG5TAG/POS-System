import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

/**
 * The rollover itself: when a repeating KPI's budget window has ended, the
 * scheduler must archive that window and move the target onto the next one with
 * its target intact. Drizzle and the DB are stubbed — what is asserted here is
 * which history rows get written and what the KPI row is updated to.
 */

/* ── Recorded DB effects ─────────────────────────────────────────────────── */
interface Inserted { periodStart: Date; periodLabel: string; target: string; actual: string | null }
let inserted: Inserted[] = [];
let updates: { startDate: string; endDate: string | null }[] = [];
/** period_start values treated as already archived, keyed by ISO string. */
let alreadyArchived = new Set<string>();
/** The `where` clause of the in-flight history lookup, so the stub can answer it. */
let pendingLookupStart: Date | null = null;

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => args,
  eq: (col: unknown, val: unknown) => {
    // The only Date-valued equality in this path is on period_start.
    if (val instanceof Date) pendingLookupStart = val;
    return { col, val };
  },
  inArray: () => ({}),
  desc: () => ({}),
  ne: () => ({}),
  gte: () => ({}),
  lte: () => ({}),
  sql: Object.assign(() => ({}), { raw: () => ({}) }),
}));

vi.mock("@workspace/db", () => {
  const table = new Proxy({}, { get: () => table });
  const selectChain = {
    from: () => selectChain,
    where: () => selectChain,
    limit: () =>
      Promise.resolve(
        pendingLookupStart && alreadyArchived.has(pendingLookupStart.toISOString())
          ? [{ id: 1 }]
          : [],
      ),
  };
  const db = {
    select: () => selectChain,
    insert: () => ({
      values: (v: Inserted) => ({
        onConflictDoNothing: () => {
          inserted.push(v);
          return Promise.resolve();
        },
      }),
    }),
    update: () => ({
      set: (v: { startDate: string; endDate: string | null }) => ({
        where: () => {
          updates.push(v);
          return Promise.resolve();
        },
      }),
    }),
  };
  return {
    db,
    pool: {},
    kpiTargetsTable: table,
    kpiHistoryTable: table,
    kpiSettingsTable: table,
    merchantsTable: table,
    transactionsTable: table,
    invoicesTable: table,
    customersTable: table,
    appointmentsTable: table,
    serviceJobsTable: table,
    laybysTable: table,
  };
});

// Real window math, stubbed actual — the sales figures aren't what's under test.
const computeActual = vi.fn(async () => 1234);
vi.mock("../routes/kpi-calc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../routes/kpi-calc")>()),
  computeActual,
}));

const { rollRepeatingKpi } = await import("../services/kpiResetScheduler");

const SYD = "Australia/Sydney";
const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() } as never;

function makeKpi(over: Record<string, unknown> = {}) {
  return {
    id: 1, merchantId: 7, targetId: "t-1", name: "Store Revenue", metric: "revenue",
    categoryId: "", period: "monthly", target: "50000.00", staffIds: "[]", reward: "null",
    notes: "", startDate: "2026-06-01", endDate: "2026-06-30", repeats: "true",
    isActive: "true", showOnDashboard: "false",
    createdAt: new Date("2026-01-01T00:00:00Z"), updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  } as never;
}

beforeEach(() => {
  inserted = [];
  updates = [];
  alreadyArchived = new Set();
  pendingLookupStart = null;
  computeActual.mockClear();
  // "Now" is mid-August 2026 — June and July have both finished.
  vi.setSystemTime(new Date("2026-08-15T03:00:00Z"));
});

// The pinned clock is what makes "June and July have finished" true — restore it
// so it can't bleed into anything else.
afterAll(() => { vi.useRealTimers(); });

describe("rollRepeatingKpi", () => {
  it("archives the finished window and starts the next one with the target carried over", async () => {
    const kpi = makeKpi({ startDate: "2026-07-01", endDate: "2026-07-31" });
    const res = await rollRepeatingKpi(kpi, "monday", SYD, logger);

    expect(res.archived).toBe(1);
    expect(res.rolled).toBe(true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].periodLabel).toBe("July 2026");
    // The archived row keeps the target that applied during that window.
    expect(inserted[0].target).toBe("50000.00");
    expect(inserted[0].actual).toBe("1234");
    // The KPI now tracks August, target untouched.
    expect(updates).toEqual([{ startDate: "2026-08-01", endDate: "2026-08-31" }]);
  });

  it("leaves a still-running window completely alone", async () => {
    const kpi = makeKpi({ startDate: "2026-08-01", endDate: "2026-08-31" });
    const res = await rollRepeatingKpi(kpi, "monday", SYD, logger);

    expect(res).toEqual({ archived: 0, rolled: false });
    expect(inserted).toEqual([]);
    expect(updates).toEqual([]);
  });

  it("catches up in order across periods missed while the server was down", async () => {
    const kpi = makeKpi({ startDate: "2026-05-01", endDate: "2026-05-31" });
    const res = await rollRepeatingKpi(kpi, "monday", SYD, logger);

    expect(res.archived).toBe(3);
    expect(inserted.map((r) => r.periodLabel)).toEqual(["May 2026", "June 2026", "July 2026"]);
    expect(updates).toEqual([{ startDate: "2026-08-01", endDate: "2026-08-31" }]);
  });

  it("is idempotent — a window already in history is not archived twice", async () => {
    // June 2026 in Sydney starts 31 May 14:00 UTC.
    alreadyArchived.add(new Date("2026-05-31T14:00:00.000Z").toISOString());
    const kpi = makeKpi({ startDate: "2026-06-01", endDate: "2026-06-30" });
    const res = await rollRepeatingKpi(kpi, "monday", SYD, logger);

    expect(inserted.map((r) => r.periodLabel)).toEqual(["July 2026"]);
    expect(res.archived).toBe(1);
    // It still rolls forward past the already-archived window.
    expect(updates).toEqual([{ startDate: "2026-08-01", endDate: "2026-08-31" }]);
  });

  it("does not fabricate history for windows that closed before the KPI existed", async () => {
    const kpi = makeKpi({
      startDate: "2026-05-01", endDate: "2026-05-31",
      createdAt: new Date("2026-07-10T00:00:00Z"),
    });
    const res = await rollRepeatingKpi(kpi, "monday", SYD, logger);

    // May and June ended before the KPI was created; only July is archived.
    expect(inserted.map((r) => r.periodLabel)).toEqual(["July 2026"]);
    expect(res.archived).toBe(1);
    expect(updates).toEqual([{ startDate: "2026-08-01", endDate: "2026-08-31" }]);
  });

  it("rolls a start-date-only target without inventing an end date", async () => {
    const kpi = makeKpi({ startDate: "2026-07-01", endDate: null });
    await rollRepeatingKpi(kpi, "monday", SYD, logger);

    expect(inserted.map((r) => r.periodLabel)).toEqual(["July 2026"]);
    expect(updates).toEqual([{ startDate: "2026-08-01", endDate: null }]);
  });

  it("rolls non-monthly periods on their own cadence", async () => {
    vi.setSystemTime(new Date("2026-08-15T03:00:00Z"));
    const weekly = makeKpi({ period: "weekly", startDate: "2026-08-03", endDate: "2026-08-09" });
    await rollRepeatingKpi(weekly, "monday", SYD, logger);
    expect(inserted.map((r) => r.periodLabel)).toEqual(["Week of 3 Aug 2026"]);
    expect(updates).toEqual([{ startDate: "2026-08-10", endDate: "2026-08-16" }]);

    inserted = []; updates = [];
    const quarterly = makeKpi({ period: "quarterly", startDate: "2026-04-01", endDate: "2026-06-30" });
    await rollRepeatingKpi(quarterly, "monday", SYD, logger);
    expect(inserted.map((r) => r.periodLabel)).toEqual(["Q2 2026"]);
    expect(updates).toEqual([{ startDate: "2026-07-01", endDate: "2026-09-30" }]);
  });

  it("leaves the row untouched when the dates are unusable", async () => {
    const kpi = makeKpi({ startDate: "garbage", endDate: null });
    const res = await rollRepeatingKpi(kpi, "monday", SYD, logger);

    expect(res).toEqual({ archived: 0, rolled: false });
    expect(updates).toEqual([]);
  });
});
