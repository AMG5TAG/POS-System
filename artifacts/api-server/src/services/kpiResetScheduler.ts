/**
 * kpiResetScheduler — archives completed KPI periods into kpi_history.
 *
 * A KPI tracks its current period live (its "actual" is computed on the fly from
 * sales within the current day/week/month/quarter/year), so it effectively
 * resets on its own when the period rolls over. This scheduler captures the
 * just-finished period's final value before it is lost: on an hourly tick it
 * snapshots each active KPI's actual for its *previous* period into kpi_history.
 * The snapshot is idempotent (one row per KPI per period start), so repeated
 * ticks — and a server restart — never double-record a period.
 */
import type { Logger } from "pino";
import { trackedInterval } from "../lib/shutdown";
import { jitteredStart } from "../lib/scheduler-jitter";
import { db, kpiTargetsTable, kpiHistoryTable, kpiSettingsTable, merchantsTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { computeActual, getPreviousPeriodWindow, getDatedWindow, advanceDatedWindow } from "../routes/kpi-calc";
import type { DatedWindow } from "../routes/kpi-calc";

const HOUR = 60 * 60 * 1000;

// Upper bound on how many finished windows one repeating KPI catches up in a
// single tick. Only reachable if a KPI's start date sits far in the past (a
// daily target dormant for a year, say); the cap keeps one stale row from
// monopolising a tick, and the next tick picks up where this one stopped.
const MAX_CATCHUP_PERIODS = 500;

// Per-period retention: how many completed snapshots to keep per KPI. Daily
// KPIs archive far more often than annual ones, so each period keeps a
// period-appropriate span of history (≈90 days / 1 year / 3 years / 3 years /
// 10 years) and the table can't grow without bound.
const RETENTION: Record<string, number> = {
  daily: 90, weekly: 52, monthly: 36, quarterly: 12, annual: 10,
};
const DEFAULT_RETENTION = 36;

/** Delete snapshots beyond each KPI's per-period retention limit, keeping the
 *  most recent. Partitioned by (merchant, target, period) so a KPI whose period
 *  changed still prunes each period bucket correctly. */
async function pruneHistory(logger: Logger): Promise<void> {
  try {
    const res = await db.execute(sql`
      DELETE FROM kpi_history
      WHERE id IN (
        SELECT id FROM (
          SELECT id, period,
            row_number() OVER (
              PARTITION BY merchant_id, target_id, period
              ORDER BY period_start DESC, id DESC
            ) AS rn
          FROM kpi_history
        ) ranked
        WHERE rn > (CASE ranked.period
          WHEN 'daily'     THEN ${RETENTION.daily}
          WHEN 'weekly'    THEN ${RETENTION.weekly}
          WHEN 'monthly'   THEN ${RETENTION.monthly}
          WHEN 'quarterly' THEN ${RETENTION.quarterly}
          WHEN 'annual'    THEN ${RETENTION.annual}
          ELSE ${DEFAULT_RETENTION} END)::int
      )
      RETURNING id
    `);
    const pruned = res.rows?.length ?? 0;
    if (pruned > 0) logger.info({ pruned }, "Pruned old KPI history snapshots");
  } catch (err) {
    logger.error({ err }, "KPI history prune failed");
  }
}

type KpiRow = typeof kpiTargetsTable.$inferSelect;

/** Snapshot one completed window into kpi_history. Returns true when a row was
 *  actually written, so callers can count real archives. */
async function archiveWindow(
  kpi: KpiRow,
  win: { start: Date; end: Date; label: string },
  weekStartDay: string,
  tz: string | null,
): Promise<boolean> {
  // Don't fabricate history for a period that ended before the KPI existed.
  if (kpi.createdAt && kpi.createdAt.getTime() > win.end.getTime()) return false;

  // Idempotency: skip if this window is already archived.
  const [existing] = await db
    .select({ id: kpiHistoryTable.id })
    .from(kpiHistoryTable)
    .where(and(
      eq(kpiHistoryTable.merchantId, kpi.merchantId),
      eq(kpiHistoryTable.targetId, kpi.targetId),
      eq(kpiHistoryTable.periodStart, win.start),
    ))
    .limit(1);
  if (existing) return false;

  const actual = await computeActual(kpi.merchantId, kpi, weekStartDay, tz, { start: win.start, end: win.end });
  await db
    .insert(kpiHistoryTable)
    .values({
      merchantId:  kpi.merchantId,
      targetId:    kpi.targetId,
      kpiTargetId: kpi.id,
      name:        kpi.name,
      metric:      kpi.metric,
      categoryId:  kpi.categoryId,
      period:      kpi.period,
      target:      kpi.target,
      actual:      actual == null ? null : actual.toString(),
      staffIds:    kpi.staffIds,
      reward:      kpi.reward,
      periodStart: win.start,
      periodEnd:   win.end,
      periodLabel: win.label,
    })
    // The unique (merchant, target, period_start) index makes this a no-op
    // if a concurrent tick inserted it between the check and here.
    .onConflictDoNothing();
  return true;
}

/**
 * Roll a repeating dated KPI forward. A target with an explicit budget window
 * (startDate/endDate) and `repeats = "true"` doesn't reset on its own the way a
 * rolling period does — the window would sit there expired forever. So once the
 * window has ended: archive it under its own dates, advance to the next
 * contiguous window, and leave `target` untouched so the same goal carries over
 * into the new period.
 *
 * Loops rather than rolling once, so a server that was down for several periods
 * (or a KPI whose start date sits in the past) catches up in order instead of
 * skipping straight to today and losing the intervening history.
 */
export async function rollRepeatingKpi(
  kpi: KpiRow,
  weekStartDay: string,
  tz: string | null,
  logger: Logger,
): Promise<{ archived: number; rolled: boolean }> {
  let startDate = kpi.startDate as string;
  let endDate: string | null = kpi.endDate ?? null;
  let archived = 0;
  const now = Date.now();
  let capped = true;

  for (let i = 0; i < MAX_CATCHUP_PERIODS; i++) {
    const win: DatedWindow | null = getDatedWindow(kpi.period, startDate, endDate, tz);
    // Unparseable dates: nothing sensible to roll, leave the row alone.
    if (!win) { capped = false; break; }
    // The window is still running — this is the KPI's live period.
    if (now <= win.end.getTime()) { capped = false; break; }

    if (await archiveWindow(kpi, win, weekStartDay, tz)) archived++;

    const next = advanceDatedWindow(kpi.period, startDate, endDate, tz);
    // Guard against a window that fails to move forward, which would spin.
    if (!next || next.startDate === startDate) { capped = false; break; }
    startDate = next.startDate;
    endDate = next.endDate;
  }

  if (capped) {
    logger.warn(
      { merchantId: kpi.merchantId, kpiId: kpi.id, startDate },
      "KPI catch-up hit the per-tick period cap; resuming next tick",
    );
  }

  const rolled = startDate !== kpi.startDate || endDate !== (kpi.endDate ?? null);
  if (rolled) {
    await db.update(kpiTargetsTable)
      .set({ startDate, endDate })
      .where(eq(kpiTargetsTable.id, kpi.id));
  }
  return { archived, rolled };
}

async function runDueKpiResets(logger: Logger): Promise<void> {
  // Every active KPI across all merchants, regardless of period — each resets
  // and archives at the end of its own period (daily/weekly/monthly/…).
  const kpis = await db
    .select()
    .from(kpiTargetsTable)
    .where(eq(kpiTargetsTable.isActive, "true"));
  if (kpis.length === 0) return;

  const merchantIds = [...new Set(kpis.map((k) => k.merchantId))];
  const merchants = await db
    .select({ id: merchantsTable.id, timezone: merchantsTable.timezone })
    .from(merchantsTable)
    .where(inArray(merchantsTable.id, merchantIds));
  const tzById = new Map(merchants.map((m) => [m.id, m.timezone ?? null]));

  // Per-merchant week anchor (only weekly KPIs use it).
  const settings = await db
    .select({ merchantId: kpiSettingsTable.merchantId, weekStartDay: kpiSettingsTable.weekStartDay })
    .from(kpiSettingsTable)
    .where(inArray(kpiSettingsTable.merchantId, merchantIds));
  const weekStartById = new Map(settings.map((s) => [s.merchantId, s.weekStartDay ?? "monday"]));

  let snapshotted = 0;
  let rolledOver = 0;
  for (const kpi of kpis) {
    const tz = tzById.get(kpi.merchantId) ?? null;
    const weekStartDay = weekStartById.get(kpi.merchantId) ?? "monday";

    try {
      // A repeating fixed-budget target archives and advances its own window.
      // Everything else tracks the rolling calendar period, which resets by
      // itself — only its just-finished period needs capturing.
      if (kpi.repeats === "true" && kpi.startDate) {
        const { archived, rolled } = await rollRepeatingKpi(kpi, weekStartDay, tz, logger);
        snapshotted += archived;
        if (rolled) rolledOver++;
        continue;
      }

      const win = getPreviousPeriodWindow(kpi.period, weekStartDay, tz);
      if (await archiveWindow(kpi, win, weekStartDay, tz)) snapshotted++;
    } catch (err) {
      logger.error({ merchantId: kpi.merchantId, kpiId: kpi.id, err }, "KPI history snapshot failed");
    }
  }

  if (snapshotted > 0) logger.info({ snapshotted }, "Archived completed KPI periods to history");
  if (rolledOver > 0) logger.info({ rolledOver }, "Rolled repeating KPI budget windows to the next period");

  // Trim each KPI's history to its per-period retention limit.
  await pruneHistory(logger);
}

export function scheduleKpiResets(logger: Logger): void {
  jitteredStart(() => runDueKpiResets(logger).catch((err) =>
    logger.error({ err }, "KPI reset scheduler startup run error"),
  ));
  trackedInterval(
    () => runDueKpiResets(logger).catch((err) =>
      logger.error({ err }, "KPI reset scheduler run error"),
    ),
    HOUR,
  );
  logger.info("KPI reset scheduler started (hourly due-check)");
}
