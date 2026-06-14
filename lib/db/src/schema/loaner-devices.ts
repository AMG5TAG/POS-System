import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { customersTable } from "./customers";

/* Loaner / courtesy devices a shop lends to customers while their device is in
   for repair. Tracks who has it, the linked job, due-back date and condition. */
export const loanerDevicesTable = pgTable("loaner_devices", {
  id:                serial("id").primaryKey(),
  merchantId:        integer("merchant_id").notNull().references(() => merchantsTable.id),
  name:              text("name").notNull(),
  identifier:        text("identifier"), // serial / asset tag / IMEI
  // available | on_loan | retired
  status:            text("status").notNull().default("available"),
  assignedCustomerId: integer("assigned_customer_id").references(() => customersTable.id),
  assignedServiceJobId: integer("assigned_service_job_id"),
  assignedAt:        timestamp("assigned_at", { withTimezone: true }),
  dueBackAt:         timestamp("due_back_at", { withTimezone: true }),
  conditionOut:      text("condition_out"),
  conditionIn:       text("condition_in"),
  returnedAt:        timestamp("returned_at", { withTimezone: true }),
  notes:             text("notes"),
  createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("loaner_devices_merchant_idx").on(t.merchantId),
  index("loaner_devices_status_idx").on(t.merchantId, t.status),
]);

export type LoanerDevice = typeof loanerDevicesTable.$inferSelect;
export type InsertLoanerDevice = typeof loanerDevicesTable.$inferInsert;
