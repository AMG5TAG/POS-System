import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const qrSavedTemplatesTable = pgTable("qr_saved_templates", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  templateId: text("template_id").notNull(),
  name:       text("name").notNull(),
  settings:   text("settings").notNull().default("{}"),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type QrSavedTemplate = typeof qrSavedTemplatesTable.$inferSelect;
export type InsertQrSavedTemplate = typeof qrSavedTemplatesTable.$inferInsert;
