import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const emailCampaignsTable = pgTable("email_campaigns", {
  id:             serial("id").primaryKey(),
  merchantId:     integer("merchant_id").notNull().references(() => merchantsTable.id),
  campaignId:     text("campaign_id").notNull(),
  name:           text("name").notNull(),
  audience:       text("audience").notNull().default("all"),
  audienceLabel:  text("audience_label").notNull().default("All Customers"),
  subject:        text("subject").notNull().default(""),
  body:           text("body").notNull().default(""),
  ctaEnabled:     text("cta_enabled").notNull().default("false"),
  ctaLabel:       text("cta_label").notNull().default(""),
  ctaUrl:         text("cta_url").notNull().default(""),
  scheduled:      text("scheduled").notNull().default("false"),
  scheduledAt:    text("scheduled_at").notNull().default(""),
  status:         text("status").notNull().default("draft"),
  sentAt:         text("sent_at").notNull().default(""),
  opens:          integer("opens").notNull().default(0),
  bounces:        integer("bounces").notNull().default(0),
  recipientCount: integer("recipient_count").notNull().default(0),
  customerId:     integer("customer_id"),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmailCampaign = typeof emailCampaignsTable.$inferSelect;
export type InsertEmailCampaign = typeof emailCampaignsTable.$inferInsert;
