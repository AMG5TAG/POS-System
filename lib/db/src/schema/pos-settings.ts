import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const posSettingsTable = pgTable("pos_settings", {
  id:                        serial("id").primaryKey(),
  merchantId:                integer("merchant_id").notNull().references(() => merchantsTable.id),
  enabledPaymentMethods:     text("enabled_payment_methods").notNull().default("[]"),
  enabledIntegrationPayments:text("enabled_integration_payments").notNull().default("[]"),
  gridColumns:               integer("grid_columns").notNull().default(3),
  gridTileSize:              text("grid_tile_size").notNull().default("normal"),
  gridShowPrices:            text("grid_show_prices").notNull().default("true"),
  gridShowStockBadges:       text("grid_show_stock_badges").notNull().default("false"),
  gridCartPosition:          text("grid_cart_position").notNull().default("right"),
  forceStaffLogin:           text("force_staff_login").notNull().default("false"),
  staffLoginMessage:         text("staff_login_message").notNull().default("{}"),
  activeRegisterId:          text("active_register_id").notNull().default(""),
  hardwareConfig:            text("hardware_config").notNull().default("{}"),
  enabledShortcuts:          text("enabled_shortcuts").notNull().default("[]"),
});

export type PosSettings = typeof posSettingsTable.$inferSelect;
export type InsertPosSettings = typeof posSettingsTable.$inferInsert;
