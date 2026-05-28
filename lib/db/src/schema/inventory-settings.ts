import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const inventorySettingsTable = pgTable("inventory_settings", {
  id:           serial("id").primaryKey(),
  merchantId:   integer("merchant_id").notNull().references(() => merchantsTable.id),
  skuPrefix:    text("sku_prefix").notNull().default("KP"),
  showCosts:    text("show_costs").notNull().default("false"),
  groupPricing: text("group_pricing").notNull().default("false"),
});

export type InventorySettings = typeof inventorySettingsTable.$inferSelect;
export type InsertInventorySettings = typeof inventorySettingsTable.$inferInsert;
