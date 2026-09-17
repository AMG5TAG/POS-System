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
  /* What this cart was built from, kept so retrieving it restores the sale
     whole: the quote whose agreed prices the transaction has to be authorised
     against, and the service job the finished sale has to complete. Plain
     integers, not references — a quote or job deleted behind a parked sale
     must not block the park or the retrieval. */
  quoteId:      integer("quote_id"),
  serviceJobId: integer("service_job_id"),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertParkedSaleSchema = createInsertSchema(parkedSalesTable).omit({ id: true, createdAt: true });
export type InsertParkedSale = z.infer<typeof insertParkedSaleSchema>;
export type ParkedSale = typeof parkedSalesTable.$inferSelect;
