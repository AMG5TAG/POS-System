import { pgTable, text, serial, timestamp, integer, numeric, uniqueIndex, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { customersTable } from "./customers";

/**
 * One row per referred customer whose referral has qualified: the record that
 * their referrer (and they) were rewarded, so a reward is never paid twice.
 * The POS referral programme's rules and the payout are in
 * api-server/src/lib/referral-rewards.ts.
 *
 *   status "paid"            — credited to both loyalty balances by the system
 *   status "pre_automation"  — had already qualified when automation began
 *                              (staff may have rewarded it by hand); never paid
 *
 * Values are in the loyalty programme's unit (points or dollars) at the time.
 * Created by scripts/src/add-referral-rewards.ts.
 */
export const referralRewardsTable = pgTable("referral_rewards", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  refereeCustomerId: integer("referee_customer_id").notNull().references(() => customersTable.id),
  referrerCustomerId: integer("referrer_customer_id").references(() => customersTable.id),
  referrerValue: numeric("referrer_value", { precision: 12, scale: 2 }).notNull().default("0"),
  refereeValue: numeric("referee_value", { precision: 12, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("paid"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("referral_rewards_referee_uniq").on(t.merchantId, t.refereeCustomerId),
  index("referral_rewards_referrer_idx").on(t.merchantId, t.referrerCustomerId),
]);

export type ReferralReward = typeof referralRewardsTable.$inferSelect;
