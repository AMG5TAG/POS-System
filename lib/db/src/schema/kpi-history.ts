import { pgTable, text, serial, integer, numeric, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

/**
 * kpi_history — archived snapshots of a KPI target's final result for a
 * completed period. A monthly KPI keeps tracking live for the current month;
 * once the month ends the scheduler records the month's final `actual` here so
 * it is preserved after the KPI "resets" into the new month. One row per
 * (merchant, KPI, period start) — the unique index makes snapshotting idempotent.
 */
export const kpiHistoryTable = pgTable("kpi_history", {
  id:          serial("id").primaryKey(),
  merchantId:  integer("merchant_id").notNull().references(() => merchantsTable.id),
  // The KPI's stable business id (kpi_targets.target_id) — links snapshots to
  // the KPI across resets even if the underlying row is later edited.
  targetId:    text("target_id").notNull(),
  // The kpi_targets.id at snapshot time (informational; the row persists).
  kpiTargetId: integer("kpi_target_id"),
  // Snapshot of the KPI's descriptive fields so history renders correctly even
  // if the KPI is later renamed, retargeted or deleted.
  name:        text("name").notNull(),
  metric:      text("metric").notNull(),
  categoryId:  text("category_id").notNull().default(""),
  period:      text("period").notNull().default("monthly"),
  target:      numeric("target", { precision: 12, scale: 2 }).notNull().default("0"),
  // The computed final value for the period. Null when the metric wasn't
  // computable for this target (mirrors the live progress "—").
  actual:      numeric("actual", { precision: 12, scale: 2 }),
  staffIds:    text("staff_ids").notNull().default("[]"),
  reward:      text("reward").notNull().default("null"),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd:   timestamp("period_end", { withTimezone: true }).notNull(),
  // Human label for the archived period, e.g. "July 2026".
  periodLabel: text("period_label").notNull().default(""),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("kpi_history_merchant_id_idx").on(t.merchantId),
  uniqueIndex("kpi_history_merchant_target_period_idx").on(t.merchantId, t.targetId, t.periodStart),
]);

export type KpiHistory = typeof kpiHistoryTable.$inferSelect;
export type InsertKpiHistory = typeof kpiHistoryTable.$inferInsert;
