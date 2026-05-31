import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";

export const modifierGroupsTable = pgTable("modifier_groups", {
  id:             serial("id").primaryKey(),
  merchantId:     integer("merchant_id").notNull(),
  name:           text("name").notNull(),
  isRequired:     text("is_required").notNull().default("false"),
  minSelections:  integer("min_selections").notNull().default(0),
  maxSelections:  integer("max_selections").notNull().default(1),
  isActive:       text("is_active").notNull().default("true"),
  createdAt:      timestamp("created_at").defaultNow(),
  updatedAt:      timestamp("updated_at").defaultNow(),
});

export const modifiersTable = pgTable("modifiers", {
  id:               serial("id").primaryKey(),
  groupId:          integer("group_id").notNull(),
  merchantId:       integer("merchant_id").notNull(),
  name:             text("name").notNull(),
  priceAdjustment:  numeric("price_adjustment").notNull().default("0"),
  isDefault:        text("is_default").notNull().default("false"),
  isActive:         text("is_active").notNull().default("true"),
  sortOrder:        integer("sort_order").notNull().default(0),
  createdAt:        timestamp("created_at").defaultNow(),
});

export const productModifierGroupsTable = pgTable("product_modifier_groups", {
  id:         serial("id").primaryKey(),
  productId:  integer("product_id").notNull(),
  groupId:    integer("group_id").notNull(),
  merchantId: integer("merchant_id").notNull(),
  sortOrder:  integer("sort_order").notNull().default(0),
});

export type ModifierGroup    = typeof modifierGroupsTable.$inferSelect;
export type NewModifierGroup = typeof modifierGroupsTable.$inferInsert;
export type Modifier         = typeof modifiersTable.$inferSelect;
export type NewModifier      = typeof modifiersTable.$inferInsert;
