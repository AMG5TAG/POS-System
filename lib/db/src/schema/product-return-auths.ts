import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { suppliersTable } from "./suppliers";

/**
 * Return Merchandise Authorisation (RMA) for returns the merchant sends back to
 * a SUPPLIER — faulty/warranty/replacement/credit stock, not customer refunds.
 * Each RMA links to a supplier and tracks what was sent back and the outcome
 * requested from the supplier.
 */
export const productReturnAuthsTable = pgTable("product_return_auths", {
  id:           serial("id").primaryKey(),
  merchantId:   integer("merchant_id").notNull().references(() => merchantsTable.id),
  raNumber:     text("ra_number").notNull(),
  supplierId:   integer("supplier_id").references(() => suppliersTable.id),
  supplierName: text("supplier_name").notNull(),
  items:        text("items").notNull(),
  quantity:     integer("quantity").notNull().default(1),
  reason:       text("reason"),
  // What the merchant is requesting from the supplier: Warranty / Replacement / Repair / Credit / Refund
  returnType:   text("return_type"),
  // The RMA/authorisation reference the supplier issues back to the merchant
  supplierRmaNumber: text("supplier_rma_number"),
  // Courier / tracking number for the goods shipped back to the supplier
  trackingNumber: text("tracking_number"),
  status:       text("status").notNull().default("Draft"),
  notes:        text("notes"),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProductReturnAuth = typeof productReturnAuthsTable.$inferSelect;
export type InsertProductReturnAuth = typeof productReturnAuthsTable.$inferInsert;
