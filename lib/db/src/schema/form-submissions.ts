import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { customersTable } from "./customers";
import { formsTable } from "./forms";

export const formSubmissionsTable = pgTable("form_submissions", {
  id:          serial("id").primaryKey(),
  merchantId:  integer("merchant_id").notNull().references(() => merchantsTable.id),
  formId:      integer("form_id").notNull().references(() => formsTable.id),
  customerId:  integer("customer_id").references(() => customersTable.id),
  sourceType:  text("source_type"),    // "transaction" | "service_job" | "appointment" | "manual"
  sourceId:    integer("source_id"),
  staffId:     integer("staff_id"),
  data:        jsonb("data").notNull().default({}),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FormSubmission = typeof formSubmissionsTable.$inferSelect;
export type InsertFormSubmission = typeof formSubmissionsTable.$inferInsert;
