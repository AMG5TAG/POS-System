import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const qrSettingsTable = pgTable("qr_settings", {
  id:                 serial("id").primaryKey(),
  merchantId:         integer("merchant_id").notNull().references(() => merchantsTable.id),
  patternColor:       text("pattern_color").notNull().default("#000000"),
  eyeColor:           text("eye_color").notNull().default("#000000"),
  eyeDotColor:        text("eye_dot_color").notNull().default("#000000"),
  bgColor:            text("bg_color").notNull().default("#ffffff"),
  dotStyle:           text("dot_style").notNull().default("square"),
  cornerSquareStyle:  text("corner_square_style").notNull().default("square"),
  cornerDotStyle:     text("corner_dot_style").notNull().default("square"),
  template:           text("template").notNull().default("standard"),
  size:               integer("size").notNull().default(256),
  level:              text("level").notNull().default("M"),
  logoUrl:            text("logo_url").notNull().default(""),
  updatedAt:          timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type QrSettings = typeof qrSettingsTable.$inferSelect;
export type InsertQrSettings = typeof qrSettingsTable.$inferInsert;
