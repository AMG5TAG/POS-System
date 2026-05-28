import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const businessProfileTable = pgTable("business_profile", {
  id:             serial("id").primaryKey(),
  merchantId:     integer("merchant_id").notNull().references(() => merchantsTable.id),
  abn:            text("abn").notNull().default(""),
  tagline:        text("tagline").notNull().default(""),
  description:    text("description").notNull().default(""),
  openingDate:    text("opening_date").notNull().default(""),
  categories:     text("categories").notNull().default("[]"),
  logo:           text("logo").notNull().default(""),
  brandFont:      text("brand_font").notNull().default(""),
  brandColors:    text("brand_colors").notNull().default("[]"),
  bgColors:       text("bg_colors").notNull().default("[]"),
  textColors:     text("text_colors").notNull().default("[]"),
  contactEmail:   text("contact_email").notNull().default(""),
  website:        text("website").notNull().default(""),
  state:          text("state").notNull().default(""),
  postcode:       text("postcode").notNull().default(""),
  openingHours:   text("opening_hours").notNull().default("{}"),
  paymentTypes:   text("payment_types").notNull().default("[]"),
  socialLinks:    text("social_links").notNull().default("{}"),
  customLinks:    text("custom_links").notNull().default("[]"),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type BusinessProfile = typeof businessProfileTable.$inferSelect;
export type InsertBusinessProfile = typeof businessProfileTable.$inferInsert;
