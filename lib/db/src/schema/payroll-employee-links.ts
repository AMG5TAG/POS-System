import { pgTable, text, serial, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

/**
 * payroll_employee_links — maps a KoaPOS staff member to the corresponding
 * employee record in the external payroll provider. Keeping this mapping in its
 * own table (rather than a column on `staff`) keeps the adapter provider-agnostic
 * and lets a single staff member map across providers over time.
 */
export const payrollEmployeeLinksTable = pgTable("payroll_employee_links", {
  id:                 serial("id").primaryKey(),
  merchantId:         integer("merchant_id").notNull().references(() => merchantsTable.id),
  staffId:            integer("staff_id").notNull(),
  providerKey:        text("provider_key").notNull().default("xero_payroll"),
  providerEmployeeId: text("provider_employee_id").notNull(),
  status:             text("status").notNull().default("linked"), // linked | error
  lastSyncedAt:       timestamp("last_synced_at", { withTimezone: true }),
  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("payroll_emp_link_merchant_staff_provider_idx").on(t.merchantId, t.staffId, t.providerKey),
  index("payroll_emp_link_merchant_idx").on(t.merchantId),
]);

export type PayrollEmployeeLink       = typeof payrollEmployeeLinksTable.$inferSelect;
export type InsertPayrollEmployeeLink = typeof payrollEmployeeLinksTable.$inferInsert;
