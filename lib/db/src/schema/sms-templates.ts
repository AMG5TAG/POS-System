import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const smsTemplatesTable = pgTable("sms_templates", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  templateId: text("template_id").notNull(),
  name:       text("name").notNull(),
  category:   text("category").notNull().default("Other"),
  body:       text("body").notNull().default(""),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SmsTemplate = typeof smsTemplatesTable.$inferSelect;
export type InsertSmsTemplate = typeof smsTemplatesTable.$inferInsert;
