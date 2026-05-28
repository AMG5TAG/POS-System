import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const posReceiptSettingsTable = pgTable("pos_receipt_settings", {
  id:           serial("id").primaryKey(),
  merchantId:   integer("merchant_id").notNull().references(() => merchantsTable.id),
  paperSize:    text("paper_size").notNull().default("80mm"),
  showLogo:     text("show_logo").notNull().default("true"),
  showBarcode:  text("show_barcode").notNull().default("true"),
  footerText:   text("footer_text").notNull().default(""),
  headerText:   text("header_text").notNull().default(""),
});

export type PosReceiptSettings = typeof posReceiptSettingsTable.$inferSelect;
export type InsertPosReceiptSettings = typeof posReceiptSettingsTable.$inferInsert;
