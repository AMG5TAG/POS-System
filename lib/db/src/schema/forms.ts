import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const formsTable = pgTable("forms", {
  id:          serial("id").primaryKey(),
  merchantId:  integer("merchant_id").notNull().references(() => merchantsTable.id),
  name:        text("name").notNull(),
  description: text("description"),
  fields:      jsonb("fields").notNull().default([]),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Form = typeof formsTable.$inferSelect;
export type InsertForm = typeof formsTable.$inferInsert;
