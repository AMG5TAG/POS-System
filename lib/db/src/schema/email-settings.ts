import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { merchantsTable } from "./merchants";

export const emailSettingsTable = pgTable("email_settings", {
  id:                   serial("id").primaryKey(),
  merchantId:           integer("merchant_id").notNull().unique().references(() => merchantsTable.id),
  provider:             text("provider").notNull().default("none"), // none | smtp | resend | sendgrid
  fromName:             text("from_name"),
  fromEmail:            text("from_email"),
  smtpHost:             text("smtp_host"),
  smtpPort:             text("smtp_port"),
  smtpSecure:           text("smtp_secure").notNull().default("true"),
  smtpUser:             text("smtp_user"),
  smtpPass:             text("smtp_pass"),
  apiKey:               text("api_key"),
  receiptEmailsEnabled: text("receipt_emails_enabled").notNull().default("false"),
  createdAt:            timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:            timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEmailSettingsSchema = createInsertSchema(emailSettingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEmailSettings = z.infer<typeof insertEmailSettingsSchema>;
export type EmailSettings = typeof emailSettingsTable.$inferSelect;
