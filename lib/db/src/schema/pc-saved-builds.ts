import { pgTable, text, serial, integer, jsonb, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const pcSavedBuildsTable = pgTable("pc_saved_builds", {
  id:            serial("id").primaryKey(),
  merchantId:    integer("merchant_id").notNull().references(() => merchantsTable.id),
  name:          text("name").notNull(),
  build:         jsonb("build").notNull().$type<Record<string, number | null>>().default({}),
  assemblyHours: numeric("assembly_hours", { precision: 6, scale: 2 }).notNull().default("0"),
  createdAt:     timestamp("created_at",   { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp("updated_at",   { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("pc_saved_builds_merchant_id_idx").on(t.merchantId),
]);

export type PcSavedBuild       = typeof pcSavedBuildsTable.$inferSelect;
export type InsertPcSavedBuild = typeof pcSavedBuildsTable.$inferInsert;
