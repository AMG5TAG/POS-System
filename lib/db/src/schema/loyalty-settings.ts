import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const loyaltySettingsTable = pgTable("loyalty_settings", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  programType: text("program_type").notNull().default("cashback"),
  config: jsonb("config").notNull().default({}),
  isEnabled: text("is_enabled").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type LoyaltySettingsRow = typeof loyaltySettingsTable.$inferSelect;
