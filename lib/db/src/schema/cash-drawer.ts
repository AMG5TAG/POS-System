import { pgTable, text, serial, timestamp, integer, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { merchantsTable } from "./merchants";

export const cashDrawerEntriesTable = pgTable("cash_drawer_entries", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  type:       text("type").notNull(), // opening_float | cash_in | cash_out | closing_count
  amount:     numeric("amount", { precision: 10, scale: 2 }).notNull(),
  note:       text("note"),
  shiftDate:  date("shift_date").notNull(), // YYYY-MM-DD for grouping by day
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCashDrawerEntrySchema = createInsertSchema(cashDrawerEntriesTable).omit({ id: true, createdAt: true });
export type InsertCashDrawerEntry = z.infer<typeof insertCashDrawerEntrySchema>;
export type CashDrawerEntry = typeof cashDrawerEntriesTable.$inferSelect;
