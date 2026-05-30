import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const staffNotesTable = pgTable("staff_notes", {
  id:          serial("id").primaryKey(),
  merchantId:  integer("merchant_id").notNull().references(() => merchantsTable.id),
  title:       text("title").notNull(),
  content:     text("content").notNull(),
  isImportant: text("is_important").notNull().default("false"),
  isPinned:    text("is_pinned").notNull().default("false"),
  visibleTo:   text("visible_to").notNull().default("all"),
  createdBy:   text("created_by").notNull().default(""),
  createdAt:   timestamp("created_at",  { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at",  { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("staff_notes_merchant_id_idx").on(t.merchantId),
]);

export type StaffNote       = typeof staffNotesTable.$inferSelect;
export type InsertStaffNote = typeof staffNotesTable.$inferInsert;
