import { pgTable, text, serial, integer, numeric, jsonb, date, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { staffTable } from "./staff";

/**
 * end_of_week_reports — the merchant-entered half of the End of Week report.
 *
 * Everything the report *computes* (sales, GST, COGS, takings by method, new
 * customers, service jobs) is derived live from the ledgers on every load and is
 * deliberately NOT stored here — a stored copy would drift the moment a refund
 * or a backdated invoice landed. What lives here is the part no ledger knows:
 * how much cash was held back as float, what was bought out of the till, what
 * each employee actually cost, and what was banked.
 *
 * One row per (merchant, startDate, endDate) — the unique index is what makes
 * saving a draft an upsert rather than a pile of duplicate weeks.
 *
 * `snapshot` is written ONCE, at finalise, and holds the computed figures as
 * they stood when the week was banked. That is the whole point of finalising: a
 * refund processed next Tuesday against last week's sale must not silently
 * change a week whose cash is already at the bank. A draft row has no snapshot
 * and always renders live figures.
 */
export const endOfWeekReportsTable = pgTable("end_of_week_reports", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  startDate:  date("start_date").notNull(),
  endDate:    date("end_date").notNull(),
  // draft | finalised
  status:     text("status").notNull().default("draft"),

  /* ── Banking inputs ────────────────────────────────────────────────────── */
  // Cash kept in the tills as next week's float — deducted from the deposit.
  floatRetained: numeric("float_retained", { precision: 12, scale: 2 }).notNull().default("0"),
  // Cash actually counted out of the drawer(s), when the merchant counts it.
  // Null (not 0) means "not counted" so an uncounted week shows no variance.
  cashCounted:   numeric("cash_counted", { precision: 12, scale: 2 }),
  // What was actually taken to the bank, once it has been. Null until deposited.
  bankedAmount:  numeric("banked_amount", { precision: 12, scale: 2 }),

  // Purchases paid for out of the till: [{ id, description, amount, date, source }].
  // `source` is "drawer" for a row pulled from a cash_drawer_entries cash-out
  // (so it can be re-pulled without duplicating) or "manual" for a typed line.
  cashPurchases: jsonb("cash_purchases").$type<unknown[]>().notNull().default([]),

  /* ── Employee costs ────────────────────────────────────────────────────── */
  // [{ staffId, name, wages, tax, super, bonus, extras, kpi }] — pre-filled from
  // timesheets/pay rates/KPI rewards on first open, then merchant-editable. Once
  // a row is saved it wins over the computed default, so an edit is never
  // overwritten by a later recompute.
  staffCosts: jsonb("staff_costs").$type<unknown[]>().notNull().default([]),

  notes: text("notes").notNull().default(""),

  /* ── Finalisation ──────────────────────────────────────────────────────── */
  snapshot:        jsonb("snapshot"),
  finalisedAt:     timestamp("finalised_at", { withTimezone: true }),
  finalisedBy:     integer("finalised_by").references(() => staffTable.id),
  finalisedByName: text("finalised_by_name"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("end_of_week_reports_merchant_idx").on(t.merchantId),
  uniqueIndex("end_of_week_reports_merchant_range_idx").on(t.merchantId, t.startDate, t.endDate),
]);

export type EndOfWeekReport       = typeof endOfWeekReportsTable.$inferSelect;
export type InsertEndOfWeekReport = typeof endOfWeekReportsTable.$inferInsert;
