import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";

export const pricingRulesTable = pgTable("pricing_rules", {
  id:             serial("id").primaryKey(),
  merchantId:     integer("merchant_id").notNull(),
  name:           text("name").notNull(),
  productId:      integer("product_id"),
  categoryId:     integer("category_id"),
  discountType:   text("discount_type").notNull().default("percent"),
  discountValue:  numeric("discount_value").notNull().default("0"),
  startTime:      text("start_time").notNull().default("00:00"),
  endTime:        text("end_time").notNull().default("23:59"),
  daysOfWeek:     text("days_of_week").notNull().default("1,2,3,4,5,6,7"),
  label:          text("label"),
  isActive:       text("is_active").notNull().default("true"),
  createdAt:      timestamp("created_at").defaultNow(),
  updatedAt:      timestamp("updated_at").defaultNow(),
});

export type PricingRule = typeof pricingRulesTable.$inferSelect;
export type NewPricingRule = typeof pricingRulesTable.$inferInsert;
