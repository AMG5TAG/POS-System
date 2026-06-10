import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

/**
 * payroll_leave_balances — local mirror of leave balances per employee per
 * leave type, as reported by the external provider. `balanceHours` /
 * `accruedHours` are stored as text to preserve the provider's decimal
 * precision (e.g. "76.40").
 */
export const payrollLeaveBalancesTable = pgTable("payroll_leave_balances", {
  id:                 serial("id").primaryKey(),
  merchantId:         integer("merchant_id").notNull().references(() => merchantsTable.id),
  staffId:            integer("staff_id"),
  providerEmployeeId: text("provider_employee_id").notNull(),
  employeeName:       text("employee_name").notNull().default(""),
  leaveType:          text("leave_type").notNull().default("annual"), // annual | personal | long_service | other
  leaveTypeName:      text("leave_type_name").notNull().default(""),  // provider's display label
  balanceHours:       text("balance_hours").notNull().default("0"),
  accruedHours:       text("accrued_hours"),
  asAtDate:           text("as_at_date"), // YYYY-MM-DD
  updatedAt:          timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("payroll_leave_balances_merchant_idx").on(t.merchantId),
  index("payroll_leave_balances_staff_idx").on(t.staffId),
]);

export type PayrollLeaveBalance       = typeof payrollLeaveBalancesTable.$inferSelect;
export type InsertPayrollLeaveBalance = typeof payrollLeaveBalancesTable.$inferInsert;
