import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const marketplaceConnectionsTable = pgTable("marketplace_connections", {
  id:            serial("id").primaryKey(),
  merchantId:    integer("merchant_id").notNull().references(() => merchantsTable.id),
  marketplaceId: text("marketplace_id").notNull(),
  connected:     text("connected").notNull().default("false"),
  connectedAt:   text("connected_at").notNull().default(""),
  lastSync:      text("last_sync").notNull().default(""),
  productsCount: integer("products_count").notNull().default(0),
  ordersCount:   integer("orders_count").notNull().default(0),
  config:        text("config").notNull().default("{}"),
});

export type MarketplaceConnection = typeof marketplaceConnectionsTable.$inferSelect;
export type InsertMarketplaceConnection = typeof marketplaceConnectionsTable.$inferInsert;
