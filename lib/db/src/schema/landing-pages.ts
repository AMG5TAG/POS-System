import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const landingPagesTable = pgTable("landing_pages", {
  id:           serial("id").primaryKey(),
  merchantId:   integer("merchant_id").notNull().references(() => merchantsTable.id),
  pageId:       text("page_id").notNull(),
  slug:         text("slug").notNull(),
  title:        text("title").notNull(),
  subtitle:     text("subtitle").notNull().default(""),
  bio:          text("bio").notNull().default(""),
  profileImage: text("profile_image").notNull().default(""),
  bgType:       text("bg_type").notNull().default("gradient"),
  bgColor:      text("bg_color").notNull().default("#007b7d"),
  bgFrom:       text("bg_from").notNull().default("#007b7d"),
  bgTo:         text("bg_to").notNull().default("#1a2340"),
  bgDir:        text("bg_dir").notNull().default("to bottom"),
  bgImage:      text("bg_image").notNull().default(""),
  btnStyle:     text("btn_style").notNull().default("pill"),
  btnVariant:   text("btn_variant").notNull().default("filled"),
  btnBg:        text("btn_bg").notNull().default("#ffffff"),
  btnText:      text("btn_text").notNull().default("#000000"),
  btnBorder:    text("btn_border").notNull().default("#ffffff"),
  textColor:    text("text_color").notNull().default("#ffffff"),
  font:         text("font").notNull().default("Inter"),
  links:        text("links").notNull().default("[]"),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type LandingPage = typeof landingPagesTable.$inferSelect;
export type InsertLandingPage = typeof landingPagesTable.$inferInsert;
