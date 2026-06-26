import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

/**
 * A sold Time Card and its live timer. Created when a "time_card" product is
 * sold through the POS; started/paused/stopped from the dashboard widget.
 *
 * Remaining time is derived, never stored: the server tracks accumulated
 * `elapsedSeconds` plus, while running, the wall-clock since `runningSince`.
 *   remaining = purchasedSeconds - (elapsedSeconds + (running ? now - runningSince : 0))
 */
export const timeCardSessionsTable = pgTable("time_card_sessions", {
  id:              serial("id").primaryKey(),
  merchantId:      integer("merchant_id").notNull().references(() => merchantsTable.id),
  transactionId:   integer("transaction_id"),
  productId:       integer("product_id"),
  customerId:      integer("customer_id"),
  customerName:    text("customer_name").notNull(),
  label:           text("label").notNull(),
  purchasedSeconds: integer("purchased_seconds").notNull().default(0),
  // ready (sold, not started) | running | paused | stopped (finished)
  status:          text("status").notNull().default("ready"),
  elapsedSeconds:  integer("elapsed_seconds").notNull().default(0),
  runningSince:    timestamp("running_since", { withTimezone: true }),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type TimeCardSession = typeof timeCardSessionsTable.$inferSelect;
export type InsertTimeCardSession = typeof timeCardSessionsTable.$inferInsert;
