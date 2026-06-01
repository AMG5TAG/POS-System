import { pgTable, text, serial, timestamp, integer, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { merchantsTable } from "./merchants";
import { customersTable } from "./customers";

export const parkedSalesTable = pgTable("parked_sales", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  customerId: integer("customer_id").references(() => customersTable.id),
  reference:  text("reference").notNull(),
  note:       text("note"),
  saleNote:   text("sale_note"),
  items:      jsonb("items").notNull().default([]),
  total:      numeric("total", { precision: 10, scale: 2 }).notNull().default("0"),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertParkedSaleSchema = createInsertSchema(parkedSalesTable).omit({ id: true, createdAt: true });
export type InsertParkedSale = z.infer<typeof insertParkedSaleSchema>;
export type ParkedSale = typeof parkedSalesTable.$inferSelect;
