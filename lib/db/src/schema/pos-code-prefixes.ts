import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const posCodePrefixesTable = pgTable("pos_code_prefixes", {
  id:            serial("id").primaryKey(),
  merchantId:    integer("merchant_id").notNull().references(() => merchantsTable.id),
  receiptPrefix: text("receipt_prefix").notNull().default("KR"),
  receiptDigits: integer("receipt_digits").notNull().default(5),
  invoicePrefix: text("invoice_prefix").notNull().default("INV"),
  invoiceDigits: integer("invoice_digits").notNull().default(5),
  servicePrefix: text("service_prefix").notNull().default("SJ"),
  serviceDigits: integer("service_digits").notNull().default(5),
});

export type PosCodePrefixes = typeof posCodePrefixesTable.$inferSelect;
export type InsertPosCodePrefixes = typeof posCodePrefixesTable.$inferInsert;
