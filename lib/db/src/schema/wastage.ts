import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { merchantsTable } from "./merchants";
import { productsTable } from "./products";

export const wastageTable = pgTable("wastage", {
  id:          serial("id").primaryKey(),
  merchantId:  integer("merchant_id").notNull().references(() => merchantsTable.id),
  productId:   integer("product_id").references(() => productsTable.id),
  productName: text("product_name").notNull(),
  quantity:    numeric("quantity", { precision: 10, scale: 2 }).notNull(),
  reason:      text("reason").notNull().default("damaged"), // damaged|expired|theft|other
  cost:        numeric("cost", { precision: 10, scale: 2 }),
  notes:       text("notes"),
  staffId:     integer("staff_id"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWastageSchema = createInsertSchema(wastageTable).omit({ id: true, createdAt: true });
export type InsertWastage = z.infer<typeof insertWastageSchema>;
export type Wastage = typeof wastageTable.$inferSelect;
