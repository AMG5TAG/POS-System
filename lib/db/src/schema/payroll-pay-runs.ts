import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

/**
 * payroll_pay_runs — local mirror of pay runs created in the external provider.
 * Lets the UI list/inspect pay runs without round-tripping the provider on every
 * page load. Monetary totals are stored in integer cents.
 */
export const payrollPayRunsTable = pgTable("payroll_pay_runs", {
  id:               serial("id").primaryKey(),
  merchantId:       integer("merchant_id").notNull().references(() => merchantsTable.id),
  providerKey:      text("provider_key").notNull().default("xero_payroll"),
  providerPayRunId: text("provider_pay_run_id").notNull(),
  periodStart:      text("period_start").notNull(),   // YYYY-MM-DD
  periodEnd:        text("period_end").notNull(),      // YYYY-MM-DD
  paymentDate:      text("payment_date"),              // YYYY-MM-DD
  status:           text("status").notNull().default("draft"), // draft | posted | filed | paid
  // Totals in integer cents.
  grossCents:       integer("gross_cents").notNull().default(0),
  paygCents:        integer("payg_cents").notNull().default(0),
  superCents:       integer("super_cents").notNull().default(0),
  netCents:         integer("net_cents").notNull().default(0),
  employeeCount:    integer("employee_count").notNull().default(0),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("payroll_pay_runs_merchant_idx").on(t.merchantId),
  index("payroll_pay_runs_merchant_provider_run_idx").on(t.merchantId, t.providerPayRunId),
]);

export type PayrollPayRun       = typeof payrollPayRunsTable.$inferSelect;
export type InsertPayrollPayRun = typeof payrollPayRunsTable.$inferInsert;
