import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const staffTimesheetsTable = pgTable("staff_timesheets", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  staffId:    integer("staff_id").notNull(),
  staffName:  text("staff_name").notNull().default(""),
  date:       text("date").notNull(),        // YYYY-MM-DD
  clockIn:    text("clock_in").notNull(),    // HH:MM
  clockOut:   text("clock_out"),             // HH:MM or null
  note:       text("note"),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("staff_timesheets_merchant_id_idx").on(t.merchantId),
  index("staff_timesheets_staff_id_date_idx").on(t.staffId, t.date),
]);

export type StaffTimesheet       = typeof staffTimesheetsTable.$inferSelect;
export type InsertStaffTimesheet = typeof staffTimesheetsTable.$inferInsert;
