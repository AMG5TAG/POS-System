import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const serviceJobTemplatesTable = pgTable("service_job_templates", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  templateId: text("template_id").notNull(),
  name:       text("name").notNull(),
  category:   text("category").notNull().default("sms"),
  body:       text("body").notNull().default(""),
  options:    text("options").notNull().default("{}"),
  isActive:   text("is_active").notNull().default("true"),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ServiceJobTemplate = typeof serviceJobTemplatesTable.$inferSelect;
export type InsertServiceJobTemplate = typeof serviceJobTemplatesTable.$inferInsert;
