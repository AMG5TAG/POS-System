import { boolean, integer, pgTable, serial, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const aiSettingsTable = pgTable("ai_settings", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().unique().references(() => merchantsTable.id, { onDelete: "cascade" }),
  aiEnabled: boolean("ai_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type AiSettings = typeof aiSettingsTable.$inferSelect;
