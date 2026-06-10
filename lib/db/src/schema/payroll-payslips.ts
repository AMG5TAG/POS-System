import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

/**
 * payroll_payslips — local mirror of per-employee payslip lines within a pay run.
 * Monetary amounts are stored in integer cents. `pdfRef` is an optional provider
 * payslip id / URL used to fetch the rendered PDF on demand.
 */
export const payrollPayslipsTable = pgTable("payroll_payslips", {
  id:                  serial("id").primaryKey(),
  merchantId:          integer("merchant_id").notNull().references(() => merchantsTable.id),
  payRunId:            integer("pay_run_id").notNull(), // FK → payroll_pay_runs.id
  staffId:             integer("staff_id"),             // null if no local staff match
  providerPayslipId:   text("provider_payslip_id").notNull(),
  providerEmployeeId:  text("provider_employee_id").notNull(),
  employeeName:        text("employee_name").notNull().default(""),
  grossCents:          integer("gross_cents").notNull().default(0),
  paygCents:           integer("payg_cents").notNull().default(0),
  superCents:          integer("super_cents").notNull().default(0),
  netCents:            integer("net_cents").notNull().default(0),
  leaveAccruedHours:   text("leave_accrued_hours"),     // free-form (e.g. "annual:6.2;personal:3.1")
  pdfRef:              text("pdf_ref"),
  createdAt:           timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("payroll_payslips_merchant_idx").on(t.merchantId),
  index("payroll_payslips_pay_run_idx").on(t.payRunId),
]);

export type PayrollPayslip       = typeof payrollPayslipsTable.$inferSelect;
export type InsertPayrollPayslip = typeof payrollPayslipsTable.$inferInsert;
