import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const staffRosteringSettingsTable = pgTable("staff_rostering_settings", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  defaultWeekStart: text("default_week_start").notNull().default("Monday"),
  defaultShiftLength: text("default_shift_length").notNull().default("8h"),
  publishRosters: text("publish_rosters").notNull().default("true"),
});

export type StaffRosteringSettings = typeof staffRosteringSettingsTable.$inferSelect;
export type InsertStaffRosteringSettings = typeof staffRosteringSettingsTable.$inferInsert;
