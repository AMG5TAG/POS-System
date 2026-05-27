import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const floorPlanSettingsTable = pgTable("floor_plan_settings", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().unique().references(() => merchantsTable.id),
  elements:   text("elements").notNull().default("[]"),
  gridCols:   integer("grid_cols").notNull().default(20),
  gridRows:   integer("grid_rows").notNull().default(15),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
