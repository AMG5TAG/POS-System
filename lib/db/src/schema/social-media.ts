import { pgTable, text, serial, timestamp, integer, json, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { marketingAutomationRulesTable } from "./marketing-automation";

/* ── Connected social accounts (Pages / profiles) ───────────────────────────
 * One row per publishable destination discovered via the Integrations OAuth
 * (e.g. a Facebook Page, an Instagram Business account, an X/LinkedIn profile).
 * `externalId` is the platform's id for the destination; `accessToken` is the
 * page/long-lived token used to publish (Facebook page tokens differ from the
 * user token). Populated by the /social/accounts/sync endpoint. */
export const socialAccountsTable = pgTable("social_accounts", {
  id:          serial("id").primaryKey(),
  merchantId:  integer("merchant_id").notNull().references(() => merchantsTable.id),
  platform:    text("platform").notNull(),            // facebook | instagram | twitter | linkedin
  externalId:  text("external_id").notNull(),         // page id / account id
  name:        text("name").notNull(),
  accessToken: text("access_token"),                  // publish token (page/long-lived)
  avatarUrl:   text("avatar_url"),
  status:      text("status").notNull().default("active"),  // active | revoked
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("soc_acct_merchant_idx").on(t.merchantId),
  index("soc_acct_platform_idx").on(t.merchantId, t.platform),
]);

/* ── Social posts ───────────────────────────────────────────────────────────
 * A single composed post fanned out to one or more platforms. `media` is a
 * JSON array of { url, type } (image|video); `targets` is the list of
 * { platform, accountId } chosen; `results` records per-target publish outcome
 * { platform, accountId, status, remoteId, permalink, error }. */
export const socialPostsTable = pgTable("social_posts", {
  id:            serial("id").primaryKey(),
  merchantId:    integer("merchant_id").notNull().references(() => merchantsTable.id),
  content:       text("content").notNull().default(""),
  media:         json("media"),                       // [{ url, type }]
  linkUrl:       text("link_url"),
  checkInName:   text("check_in_name"),               // place / location label
  targets:       json("targets"),                     // [{ platform, accountId }]
  results:       json("results"),                     // [{ platform, accountId, status, remoteId, permalink, error }]
  status:        text("status").notNull().default("draft"), // draft | scheduled | publishing | published | partial | failed
  scheduledAt:   timestamp("scheduled_at", { withTimezone: true }),
  publishedAt:   timestamp("published_at", { withTimezone: true }),
  isGiveaway:    text("is_giveaway").notNull().default("false"),
  giveawayPrize: text("giveaway_prize"),
  winnerEntryId: integer("winner_entry_id"),
  // Set when the post was created by a marketing-automation rule.
  automationRuleId: integer("automation_rule_id").references(() => marketingAutomationRulesTable.id),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("soc_post_merchant_idx").on(t.merchantId),
  index("soc_post_status_idx").on(t.status),
  index("soc_post_scheduled_idx").on(t.scheduledAt),
]);

/* ── Giveaway entrants ───────────────────────────────────────────────────────
 * Commenters pulled from a giveaway post's engagement (comment-to-enter). One
 * row per unique entrant per post; `isWinner` flags the drawn winner. */
export const socialGiveawayEntriesTable = pgTable("social_giveaway_entries", {
  id:            serial("id").primaryKey(),
  merchantId:    integer("merchant_id").notNull().references(() => merchantsTable.id),
  postId:        integer("post_id").notNull().references(() => socialPostsTable.id),
  platform:      text("platform").notNull(),
  externalUserId: text("external_user_id"),
  name:          text("name").notNull(),
  commentId:     text("comment_id"),
  commentText:   text("comment_text"),
  isWinner:      text("is_winner").notNull().default("false"),
  enteredAt:     timestamp("entered_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("soc_give_post_idx").on(t.postId),
  index("soc_give_comment_idx").on(t.postId, t.commentId),
]);

export type SocialAccount        = typeof socialAccountsTable.$inferSelect;
export type SocialPost           = typeof socialPostsTable.$inferSelect;
export type SocialGiveawayEntry  = typeof socialGiveawayEntriesTable.$inferSelect;
