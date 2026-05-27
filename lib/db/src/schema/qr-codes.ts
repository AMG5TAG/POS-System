import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const qrCodesTable = pgTable("qr_codes", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  entryId:    text("entry_id").notNull(),
  label:      text("label").notNull(),
  url:        text("url").notNull().default(""),
  qrType:     text("qr_type").notNull().default("website"),
  content:    text("content").notNull().default("{}"),
  settings:   text("settings").notNull().default("{}"),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type QrCode = typeof qrCodesTable.$inferSelect;
export type InsertQrCode = typeof qrCodesTable.$inferInsert;
