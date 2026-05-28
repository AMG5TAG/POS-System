import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const staffLinksTable = pgTable("staff_links", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  linkId:     text("link_id").notNull(),
  label:      text("label").notNull(),
  url:        text("url").notNull(),
  category:   text("category").notNull().default("general"),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type StaffLink = typeof staffLinksTable.$inferSelect;
export type InsertStaffLink = typeof staffLinksTable.$inferInsert;
