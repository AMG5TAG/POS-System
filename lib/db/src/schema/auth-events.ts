import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const authEventsTable = pgTable("auth_events", {
  id:          serial("id").primaryKey(),
  merchantId:  integer("merchant_id").references(() => merchantsTable.id),
  ipAddress:   text("ip_address"),
  userAgent:   text("user_agent"),
  outcome:     text("outcome").notNull(), // success | bad_password | not_found | locked | account_hold
  status:      text("status").notNull().default("new"), // new | acknowledged | flagged
  flagReason:  text("flag_reason"), // null | "manual" | "new_ip"
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuthEvent = typeof authEventsTable.$inferSelect;
export type InsertAuthEvent = typeof authEventsTable.$inferInsert;
