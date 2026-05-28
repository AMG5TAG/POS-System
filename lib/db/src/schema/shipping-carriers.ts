import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const shippingCarriersTable = pgTable("shipping_carriers", {
  id:          serial("id").primaryKey(),
  merchantId:  integer("merchant_id").notNull().references(() => merchantsTable.id),
  carrierId:   text("carrier_id").notNull(),
  connected:   text("connected").notNull().default("false"),
  connectedAt: text("connected_at").notNull().default(""),
  apiKey:      text("api_key").notNull().default(""),
  webhookSecret: text("webhook_secret").notNull().default(""),
  config:      text("config").notNull().default("{}"),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ShippingCarrier = typeof shippingCarriersTable.$inferSelect;
export type InsertShippingCarrier = typeof shippingCarriersTable.$inferInsert;
