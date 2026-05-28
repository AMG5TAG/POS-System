import { pgTable, text, serial, integer, timestamp, numeric } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const posRegisterSessionsTable = pgTable("pos_register_sessions", {
  id:            serial("id").primaryKey(),
  merchantId:      integer("merchant_id").notNull().references(() => merchantsTable.id),
  registerId:      text("register_id").notNull().default("default"),
  openedAt:        timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  openedBy:        text("opened_by").notNull().default(""),
  openingFloat:      numeric("opening_float").notNull().default("0"),
  openingNotes:      text("opening_notes").notNull().default(""),
  sales:           text("sales").notNull().default("{}"),
  txCount:         integer("tx_count").notNull().default(0),
  closedAt:        timestamp("closed_at", { withTimezone: true }),
  cashCounted:       numeric("cash_counted").default("0"),
  eftposDeclared:    numeric("eftpos_declared").default("0"),
  closingNotes:      text("closing_notes").default(""),
});

export type PosRegisterSession = typeof posRegisterSessionsTable.$inferSelect;
export type InsertPosRegisterSession = typeof posRegisterSessionsTable.$inferInsert;
