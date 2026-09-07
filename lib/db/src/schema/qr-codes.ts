import { pgTable, text, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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
  /** Set only for service QRs (30-day TTL); null = never expires (product/customer). */
  expiresAt:  timestamp("expires_at", { withTimezone: true }),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // One persisted QR per entity, so product/customer/service QRs are idempotent
  // and reusable regardless of when they're printed.
  uniqueIndex("qr_codes_merchant_entry_type_idx").on(t.merchantId, t.entryId, t.qrType),
]);

export type QrCode = typeof qrCodesTable.$inferSelect;
export type InsertQrCode = typeof qrCodesTable.$inferInsert;
