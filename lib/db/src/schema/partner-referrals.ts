import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const partnerReferralsTable = pgTable("partner_referrals", {
  id: serial("id").primaryKey(),
  referrerMerchantId: integer("referrer_merchant_id").notNull().references(() => merchantsTable.id),
  referredBusinessName: text("referred_business_name").notNull(),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  referredAt: timestamp("referred_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull().default("pending"),
  plan: text("plan"),
  bonusEarned: integer("bonus_earned").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("partner_referrals_referrer_merchant_id_idx").on(table.referrerMerchantId),
]);

export type PartnerReferral = typeof partnerReferralsTable.$inferSelect;
