import { pgTable, text, serial, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const dashboardNotesTable = pgTable("dashboard_notes", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id, { onDelete: "cascade" }),
  text:       text("text").notNull(),
  isCritical: boolean("is_critical").notNull().default(false),
  createdAt:  timestamp("created_at",  { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp("updated_at",  { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("dashboard_notes_merchant_id_idx").on(t.merchantId),
]);

export type DashboardNote       = typeof dashboardNotesTable.$inferSelect;
export type InsertDashboardNote = typeof dashboardNotesTable.$inferInsert;
