import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const rosterShiftsTable = pgTable("roster_shifts", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  shiftId:    text("shift_id").notNull(),
  staffId:    text("staff_id").notNull(),
  date:       text("date").notNull(),
  startTime:  text("start_time").notNull().default("09:00"),
  endTime:    text("end_time").notNull().default("17:00"),
  note:       text("note").notNull().default(""),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type RosterShift = typeof rosterShiftsTable.$inferSelect;
export type InsertRosterShift = typeof rosterShiftsTable.$inferInsert;
