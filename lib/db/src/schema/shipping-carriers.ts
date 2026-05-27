import { pgTable, text, serial, integer } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const shippingCarriersTable = pgTable("shipping_carriers", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  carrierId:  text("carrier_id").notNull(),
  connected:  text("connected").notNull().default("false"),
});

export type ShippingCarrier = typeof shippingCarriersTable.$inferSelect;
export type InsertShippingCarrier = typeof shippingCarriersTable.$inferInsert;
