import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const kpiTargetsTable = pgTable("kpi_targets", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  targetId:   text("target_id").notNull(),
  name:       text("name").notNull(),
  metric:     text("metric").notNull(),
  categoryId: text("category_id").notNull().default(""),
  period:     text("period").notNull().default("monthly"),
  target:     numeric("target").notNull().default("0"),
  staffIds:   text("staff_ids").notNull().default("[]"),
  reward:     text("reward").notNull().default("null"),
  notes:      text("notes").notNull().default(""),
  isActive:   text("is_active").notNull().default("true"),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type KpiTarget = typeof kpiTargetsTable.$inferSelect;
export type InsertKpiTarget = typeof kpiTargetsTable.$inferInsert;
