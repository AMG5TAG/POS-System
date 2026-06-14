import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

/* Saved scheduled-report definitions (emailed on a recurring cadence). Persisted
   server-side so they're shared across devices; a scheduler job dispatches them. */
export const scheduledReportsTable = pgTable("scheduled_reports", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  name:       text("name").notNull(),
  reportType: text("report_type").notNull(),
  frequency:  text("frequency").notNull().default("daily"), // daily | weekly | monthly
  format:     text("format").notNull().default("pdf"),       // pdf | csv
  email:      text("email").notNull(),
  enabled:    text("enabled").notNull().default("true"),
  lastRunAt:  timestamp("last_run_at", { withTimezone: true }),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("scheduled_reports_merchant_idx").on(t.merchantId),
]);

export type ScheduledReport = typeof scheduledReportsTable.$inferSelect;
export type InsertScheduledReport = typeof scheduledReportsTable.$inferInsert;
