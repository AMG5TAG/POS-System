import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { serviceJobsTable } from "./service-jobs";

/* Technician time logged against a repair job. A row with endedAt = null is a
   running timer; durationMinutes is stamped on stop (or directly for manual
   entries). Feeds labour-cost and tech-productivity reporting. */
export const serviceJobTimeTable = pgTable("service_job_time", {
  id:              serial("id").primaryKey(),
  merchantId:      integer("merchant_id").notNull().references(() => merchantsTable.id),
  serviceJobId:    integer("service_job_id").notNull().references(() => serviceJobsTable.id),
  staffId:         integer("staff_id"),
  startedAt:       timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt:         timestamp("ended_at", { withTimezone: true }),
  durationMinutes: integer("duration_minutes"),
  note:            text("note"),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("service_job_time_job_idx").on(t.serviceJobId),
  index("service_job_time_merchant_idx").on(t.merchantId),
  index("service_job_time_staff_idx").on(t.merchantId, t.staffId),
]);

export type ServiceJobTimeEntry = typeof serviceJobTimeTable.$inferSelect;
export type InsertServiceJobTimeEntry = typeof serviceJobTimeTable.$inferInsert;
