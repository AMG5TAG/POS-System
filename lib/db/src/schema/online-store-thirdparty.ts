import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const onlineStoreThirdpartyTable = pgTable("online_store_thirdparty", {
  id:          serial("id").primaryKey(),
  merchantId:  integer("merchant_id").notNull().references(() => merchantsTable.id),
  providerId:  text("provider_id").notNull().default(""),
  storeUrl:    text("store_url").notNull().default(""),
  apiKey:      text("api_key").notNull().default(""),
  connected:   text("connected").notNull().default("false"),
  connectedAt: text("connected_at").notNull().default(""),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type OnlineStoreThirdparty = typeof onlineStoreThirdpartyTable.$inferSelect;
export type InsertOnlineStoreThirdparty = typeof onlineStoreThirdpartyTable.$inferInsert;
