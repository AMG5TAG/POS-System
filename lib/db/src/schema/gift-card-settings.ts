import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const giftCardSettingsTable = pgTable("gift_card_settings", {
  id:                      serial("id").primaryKey(),
  merchantId:              integer("merchant_id").notNull().references(() => merchantsTable.id),
  expiryMonths:            integer("expiry_months"),
  allowPartialRedemptions: text("allow_partial_redemptions").notNull().default("true"),
  prefix:                  text("prefix").notNull().default("GC"),
});

export type GiftCardSettings = typeof giftCardSettingsTable.$inferSelect;
export type InsertGiftCardSettings = typeof giftCardSettingsTable.$inferInsert;
