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
import { computeActual, getPreviousPeriodWindow } from "../routes/kpi-calc";

const HOUR = 60 * 60 * 1000;

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
  for (const kpi of kpis) {
    const tz = tzById.get(kpi.merchantId) ?? null;
    const weekStartDay = weekStartById.get(kpi.merchantId) ?? "monday";
    const win = getPreviousPeriodWindow(kpi.period, weekStartDay, tz);

    // Don't fabricate history for a period that ended before the KPI existed.
    if (kpi.createdAt && kpi.createdAt.getTime() > win.end.getTime()) continue;

    // Idempotency: skip if this KPI's previous period is already archived.
    const [existing] = await db
      .select({ id: kpiHistoryTable.id })
      .from(kpiHistoryTable)
      .where(and(
        eq(kpiHistoryTable.merchantId, kpi.merchantId),
        eq(kpiHistoryTable.targetId, kpi.targetId),
        eq(kpiHistoryTable.periodStart, win.start),
      ))
      .limit(1);
    if (existing) continue;

    try {
      const actual = await computeActual(kpi.merchantId, kpi, "monday", tz, { start: win.start, end: win.end });
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
      snapshotted++;
    } catch (err) {
      logger.error({ merchantId: kpi.merchantId, kpiId: kpi.id, err }, "KPI history snapshot failed");
    }
  }

  if (snapshotted > 0) logger.info({ snapshotted }, "Archived completed KPI periods to history");

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
