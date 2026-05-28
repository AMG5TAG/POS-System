import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const socialFeedSettingsTable = pgTable("social_feed_settings", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().unique().references(() => merchantsTable.id),
  showFacebook: boolean("show_facebook").notNull().default(true),
  showInstagram: boolean("show_instagram").notNull().default(true),
  showTwitter: boolean("show_twitter").notNull().default(true),
  showLinkedin: boolean("show_linkedin").notNull().default(true),
  facebookEnabled: boolean("facebook_enabled").notNull().default(false),
  instagramEnabled: boolean("instagram_enabled").notNull().default(false),
  twitterEnabled: boolean("twitter_enabled").notNull().default(false),
  tiktokEnabled: boolean("tiktok_enabled").notNull().default(false),
  linkedinEnabled: boolean("linkedin_enabled").notNull().default(false),
  refreshIntervalMinutes: integer("refresh_interval_minutes").notNull().default(60),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
