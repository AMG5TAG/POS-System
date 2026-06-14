import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const tyroSettingsTable = pgTable("tyro_settings", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id).unique(),
  host: text("host").notNull().default("192.168.1.100"),
  port: text("port").notNull().default("8080"),
  integrationKey: text("integration_key"),
  tyroMerchantId: text("tyro_merchant_id"),
  terminalId: text("terminal_id"),
  posName: text("pos_name").notNull().default("KoaPOS"),
  autoSettle: text("auto_settle").notNull().default("true"),
  motoEnabled: text("moto_enabled").notNull().default("false"),
  testMode: text("test_mode").notNull().default("false"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type TyroSettings = typeof tyroSettingsTable.$inferSelect;
