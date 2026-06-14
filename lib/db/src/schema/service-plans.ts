import { pgTable, serial, integer, text, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { customersTable } from "./customers";

/* IT / MSP managed-service plans: recurring service contracts/retainers with an
   SLA and a billing cycle. "Bill now" generates an invoice for the fee and
   advances the next bill date. */
export const servicePlansTable = pgTable("service_plans", {
  id:           serial("id").primaryKey(),
  merchantId:   integer("merchant_id").notNull().references(() => merchantsTable.id),
  customerId:   integer("customer_id").references(() => customersTable.id),
  name:         text("name").notNull(),
  feeAmount:    numeric("fee_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  // weekly | fortnightly | monthly | quarterly | yearly
  billingCycle: text("billing_cycle").notNull().default("monthly"),
  // active | paused | cancelled
  status:       text("status").notNull().default("active"),
  slaHours:     integer("sla_hours"),
  startDate:    text("start_date"),
  nextBillDate: text("next_bill_date"),
  notes:        text("notes"),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("service_plans_merchant_idx").on(t.merchantId),
  index("service_plans_status_idx").on(t.merchantId, t.status),
]);

export type ServicePlan = typeof servicePlansTable.$inferSelect;
export type InsertServicePlan = typeof servicePlansTable.$inferInsert;
