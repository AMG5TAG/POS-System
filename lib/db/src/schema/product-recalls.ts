import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const productRecallsTable = pgTable("product_recalls", {
  id:            serial("id").primaryKey(),
  merchantId:    integer("merchant_id").notNull().references(() => merchantsTable.id),
  recallId:      text("recall_id").notNull(),
  productId:     integer("product_id"),
  productName:   text("product_name").notNull(),
  reason:        text("reason").notNull(),
  severity:      text("severity").notNull().default("Medium"),
  status:        text("status").notNull().default("Active"),
  affectedBatch: text("affected_batch"),
  notes:         text("notes"),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProductRecall = typeof productRecallsTable.$inferSelect;
export type InsertProductRecall = typeof productRecallsTable.$inferInsert;
