import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const marketingGeneratorsTable = pgTable("marketing_generators", {
  id:         serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  generatorId: text("generator_id").notNull(),
  name:       text("name").notNull(),
  category:   text("category").notNull().default("general"),
  prompt:     text("prompt").notNull().default(""),
  output:     text("output").notNull().default(""),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type MarketingGenerator = typeof marketingGeneratorsTable.$inferSelect;
export type InsertMarketingGenerator = typeof marketingGeneratorsTable.$inferInsert;
