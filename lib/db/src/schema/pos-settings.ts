import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const posSettingsTable = pgTable("pos_settings", {
  id:                        serial("id").primaryKey(),
  merchantId:                integer("merchant_id").notNull().references(() => merchantsTable.id),
  enabledPaymentMethods:     text("enabled_payment_methods").notNull().default("[]"),
  enabledIntegrationPayments:text("enabled_integration_payments").notNull().default("[]"),
  /** Merchant-defined payment methods (JSON array of {id,label,description,icon,enabled}).
   *  Recorded at checkout as an "other" tender with an audit note carrying the label. */
  customPaymentMethods:      text("custom_payment_methods").notNull().default("[]"),
  gridColumns:               integer("grid_columns").notNull().default(3),
  gridTileSize:              text("grid_tile_size").notNull().default("normal"),
  gridShowPrices:            text("grid_show_prices").notNull().default("true"),
  gridShowStockBadges:       text("grid_show_stock_badges").notNull().default("false"),
  gridCartPosition:          text("grid_cart_position").notNull().default("right"),
  quickViewShowSupplier:     text("quick_view_show_supplier").notNull().default("true"),
  forceStaffLogin:           text("force_staff_login").notNull().default("false"),
  /** When "true", closing one register prompts the user to also close every other
   *  register still open for the merchant (across devices). */
  promptCloseAllRegisters:   text("prompt_close_all_registers").notNull().default("false"),
  staffLoginMessage:         text("staff_login_message").notNull().default("{}"),
  activeRegisterId:          text("active_register_id").notNull().default(""),
  hardwareConfig:            text("hardware_config").notNull().default("{}"),
  enabledShortcuts:          text("enabled_shortcuts").notNull().default("[]"),
  defaultSkuPrefix:          text("default_sku_prefix").notNull().default("KP"),
  mapProvider:               text("map_provider").notNull().default("google"),
  roleDiscountLimits:        text("role_discount_limits").notNull().default("{}"),
  buttonStyle:               text("button_style").notNull().default("icon_text"),
  updatedAt:                 timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type PosSettings = typeof posSettingsTable.$inferSelect;
export type InsertPosSettings = typeof posSettingsTable.$inferInsert;
