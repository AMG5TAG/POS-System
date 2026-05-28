import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const posStaffSessionsTable = pgTable("pos_staff_sessions", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  registerId: text("register_id").notNull().default("default"),
  staffId:    integer("staff_id").notNull(),
  staffName:  text("staff_name").notNull().default(""),
  staffPin:   text("staff_pin").notNull().default(""),
  loggedInAt: timestamp("logged_in_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PosStaffSession = typeof posStaffSessionsTable.$inferSelect;
export type InsertPosStaffSession = typeof posStaffSessionsTable.$inferInsert;
