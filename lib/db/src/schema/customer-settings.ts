import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const customerSettingsTable = pgTable("customer_settings", {
  id:                      serial("id").primaryKey(),
  merchantId:              integer("merchant_id").notNull().references(() => merchantsTable.id),
  groups:                  text("groups").notNull().default("[]"),
  requiredFields:          text("required_fields").notNull().default("{}"),
  defaultGroup:            text("default_group").notNull().default("Standard"),
  loyaltyPointsPerDollar:  integer("loyalty_points_per_dollar").notNull().default(1),
  enableLoyalty:           text("enable_loyalty").notNull().default("true"),
  weeklyDigestOptIn:       text("weekly_digest_opt_in").notNull().default("false"),
  weeklyDigestSendDay:     integer("weekly_digest_send_day").notNull().default(1),
  updatedAt:               timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type CustomerSettings = typeof customerSettingsTable.$inferSelect;
export type InsertCustomerSettings = typeof customerSettingsTable.$inferInsert;
