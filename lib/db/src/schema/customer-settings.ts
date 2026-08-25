import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const customerSettingsTable = pgTable("customer_settings", {
  id:                      serial("id").primaryKey(),
  merchantId:              integer("merchant_id").notNull().references(() => merchantsTable.id),
  groups:                  text("groups").notNull().default("[]"),
  requiredFields:          text("required_fields").notNull().default("{}"),
  heardFromSources:        text("heard_from_sources").notNull().default("[]"),
  defaultGroup:            text("default_group").notNull().default("Standard"),
  loyaltyPointsPerDollar:  integer("loyalty_points_per_dollar").notNull().default(1),
  enableLoyalty:           text("enable_loyalty").notNull().default("true"),
  weeklyDigestOptIn:       text("weekly_digest_opt_in").notNull().default("false"),
  weeklyDigestSendDay:     integer("weekly_digest_send_day").notNull().default(1),
  referralSettings:        text("referral_settings").notNull().default("{}"),
  // JSON-encoded GroupPricingRule[] — the automatic per-customer-group price
  // formula (e.g. Trade = cost ex GST + 40%, capped at RRP). Resolved when a
  // product is saved and by the POS; see koapos/src/lib/group-pricing.ts.
  groupPricing:            text("group_pricing").notNull().default("[]"),
  defaultCustomerImageUrl: text("default_customer_image_url").notNull().default(""),
  updatedAt:               timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type CustomerSettings = typeof customerSettingsTable.$inferSelect;
export type InsertCustomerSettings = typeof customerSettingsTable.$inferInsert;
