import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const smsCampaignsTable = pgTable("sms_campaigns", {
  id:             serial("id").primaryKey(),
  merchantId:     integer("merchant_id").notNull().references(() => merchantsTable.id),
  campaignId:     text("campaign_id").notNull(),
  name:           text("name").notNull(),
  audience:       text("audience").notNull().default("all"),
  audienceLabel:  text("audience_label").notNull().default("All Customers"),
  body:           text("body").notNull().default(""),
  linkUrl:        text("link_url").notNull().default(""),
  scheduled:      text("scheduled").notNull().default("false"),
  scheduledAt:    text("scheduled_at").notNull().default(""),
  status:         text("status").notNull().default("draft"),
  sentAt:         text("sent_at").notNull().default(""),
  delivered:      integer("delivered").notNull().default(0),
  failed:         integer("failed").notNull().default(0),
  recipientCount: integer("recipient_count").notNull().default(0),
  customerId:     integer("customer_id"),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SmsCampaign = typeof smsCampaignsTable.$inferSelect;
export type InsertSmsCampaign = typeof smsCampaignsTable.$inferInsert;
