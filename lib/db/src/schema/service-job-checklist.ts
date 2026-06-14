import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { serviceJobsTable } from "./service-jobs";

/* Per-job diagnostic / QC checklist items (e.g. screen test, battery health,
   water-damage check). Each row is one check with a pass/fail/na/pending result
   and an optional note. Templates are applied client-side; instances live here. */
export const serviceJobChecklistTable = pgTable("service_job_checklist", {
  id:           serial("id").primaryKey(),
  merchantId:   integer("merchant_id").notNull().references(() => merchantsTable.id),
  serviceJobId: integer("service_job_id").notNull().references(() => serviceJobsTable.id),
  label:        text("label").notNull(),
  // pending | pass | fail | na
  result:       text("result").notNull().default("pending"),
  // intake | outgoing — pre-repair vs post-repair QC
  phase:        text("phase").notNull().default("intake"),
  note:         text("note"),
  sortOrder:    integer("sort_order").notNull().default(0),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("service_job_checklist_job_idx").on(t.serviceJobId),
  index("service_job_checklist_merchant_idx").on(t.merchantId),
]);

export type ServiceJobChecklistItem = typeof serviceJobChecklistTable.$inferSelect;
export type InsertServiceJobChecklistItem = typeof serviceJobChecklistTable.$inferInsert;
