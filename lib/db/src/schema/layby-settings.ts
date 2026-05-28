import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const laybySettingsTable = pgTable("layby_settings", {
  id:                   serial("id").primaryKey(),
  merchantId:           integer("merchant_id").notNull().references(() => merchantsTable.id),
  durationValue:        integer("duration_value").notNull().default(12),
  durationUnit:         text("duration_unit").notNull().default("weeks"),
  paymentFrequency:     text("payment_frequency").notNull().default("fortnightly"),
  minimumDepositType:   text("minimum_deposit_type").notNull().default("percentage"),
  minimumDepositValue:  numeric("minimum_deposit_value").notNull().default("20"),
  allowPartialPayments: text("allow_partial_payments").notNull().default("true"),
  autoEmailOnCreation:  text("auto_email_on_creation").notNull().default("true"),
  printTermsOnReceipt:  text("print_terms_on_receipt").notNull().default("true"),
  termsAndConditions:   text("terms_and_conditions").notNull().default(""),
  updatedAt:            timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type LaybySettings = typeof laybySettingsTable.$inferSelect;
export type InsertLaybySettings = typeof laybySettingsTable.$inferInsert;
