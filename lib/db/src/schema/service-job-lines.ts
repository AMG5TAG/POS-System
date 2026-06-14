import { pgTable, serial, integer, text, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { merchantsTable } from "./merchants";
import { serviceJobsTable } from "./service-jobs";

/* Line items billed against a service/repair job: parts consumed (optionally
   linked to an inventory product), labour (quantity = hours, unitPrice = rate),
   and misc charges. Job totals (parts/labour/subtotal/tax/total/cost/profit) are
   derived from these rows in the API rather than stored, so they never drift. */
export const serviceJobLinesTable = pgTable("service_job_lines", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  serviceJobId: integer("service_job_id").notNull().references(() => serviceJobsTable.id),
  // part | labour | misc
  kind: text("kind").notNull().default("part"),
  // Optional link to an inventory product (parts pulled from stock).
  productId: integer("product_id"),
  description: text("description").notNull().default(""),
  // For labour lines, quantity is the number of hours.
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
  // Sell price per unit (per hour for labour).
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull().default("0"),
  // Cost per unit (for margin/profit; usually 0 for labour).
  unitCost: numeric("unit_cost", { precision: 10, scale: 2 }).notNull().default("0"),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("10"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("service_job_lines_job_idx").on(t.serviceJobId),
  index("service_job_lines_merchant_idx").on(t.merchantId),
]);

export const insertServiceJobLineSchema = createInsertSchema(serviceJobLinesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertServiceJobLine = z.infer<typeof insertServiceJobLineSchema>;
export type ServiceJobLine = typeof serviceJobLinesTable.$inferSelect;
