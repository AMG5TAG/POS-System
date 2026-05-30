import { pgTable, text, serial, timestamp, integer, numeric, jsonb, date, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { staffTable } from "./staff";

export const dailyClosesTable = pgTable("daily_closes", {
  id:           serial("id").primaryKey(),
  merchantId:   integer("merchant_id").notNull().references(() => merchantsTable.id),
  closeDate:    date("close_date").notNull(),
  closedBy:     integer("closed_by").references(() => staffTable.id),
  closedByName: text("closed_by_name"),
  expectedCash: numeric("expected_cash", { precision: 10, scale: 2 }).notNull().default("0"),
  countedCash:  numeric("counted_cash", { precision: 10, scale: 2 }).notNull().default("0"),
  variance:     numeric("variance", { precision: 10, scale: 2 }).notNull().default("0"),
  notes:        text("notes"),
  breakdown:    jsonb("breakdown").notNull().default({}),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("daily_closes_merchant_id_idx").on(t.merchantId),
  index("daily_closes_merchant_date_idx").on(t.merchantId, t.closeDate),
]);

export type DailyClose = typeof dailyClosesTable.$inferSelect;
export type InsertDailyClose = typeof dailyClosesTable.$inferInsert;
