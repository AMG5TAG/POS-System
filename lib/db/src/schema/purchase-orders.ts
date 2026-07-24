import { pgTable, text, serial, timestamp, integer, numeric, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { merchantsTable } from "./merchants";
import { suppliersTable } from "./suppliers";
import { productsTable } from "./products";

// Status lifecycle: Draft → Ordered → Partially Received → Fully Received
export const purchaseOrdersTable = pgTable("purchase_orders", {
  id:           serial("id").primaryKey(),
  merchantId:   integer("merchant_id").notNull().references(() => merchantsTable.id),
  supplierId:   integer("supplier_id").references(() => suppliersTable.id),
  poNumber:     text("po_number").notNull(),
  orderNumber:  text("order_number"),
  status:       text("status").notNull().default("Draft"), // Draft|Ordered|Partially Received|Fully Received|Cancelled
  orderDate:    text("order_date").notNull(),
  expectedDate: text("expected_date"),
  receivedDate: text("received_date"),
  notes:        text("notes"),
  invoiceUrls:  text("invoice_urls"),
  totalCost:       numeric("total_cost",       { precision: 10, scale: 2 }).notNull().default("0"),
  deliveryCharge:  numeric("delivery_charge",  { precision: 10, scale: 2 }).notNull().default("0"),
  deliveryTaxMode: text("delivery_tax_mode").notNull().default("exclusive"),
  // Supplier payment recorded against this order. amountPaid is a running total
  // (numeric, like invoices); paymentStatus is unpaid|partial|paid; paidAt is
  // stamped when the order is settled in full. These are optional — a PO with no
  // payment stays "unpaid" with amountPaid "0".
  amountPaid:      numeric("amount_paid",       { precision: 10, scale: 2 }).notNull().default("0"),
  paymentStatus:   text("payment_status").notNull().default("unpaid"), // unpaid|partial|paid
  paymentMethod:   text("payment_method"),
  paidAt:          timestamp("paid_at", { withTimezone: true }),
  // When "true", the delivery/shipping charge is allocated across line items
  // (by value) and folded into each product's cost price (landed cost).
  distributeDelivery: text("distribute_delivery").notNull().default("false"),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("purchase_orders_merchant_id_idx").on(t.merchantId),
  // PO numbers are unique per merchant — read-max+1 generator + retry on conflict.
  uniqueIndex("purchase_orders_merchant_po_number_unique").on(t.merchantId, t.poNumber),
]);

export const purchaseOrderItemsTable = pgTable("purchase_order_items", {
  id:          serial("id").primaryKey(),
  poId:        integer("po_id").notNull().references(() => purchaseOrdersTable.id),
  productId:   integer("product_id").references(() => productsTable.id),
  productName: text("product_name").notNull(),
  quantity:    integer("quantity").notNull().default(1),
  received:    integer("received").notNull().default(0),
  unitCost:    numeric("unit_cost", { precision: 10, scale: 2 }).notNull().default("0"),
  notes:       text("notes"),
});

export const purchaseOrderReceiptsTable = pgTable("purchase_order_receipts", {
  id:           serial("id").primaryKey(),
  poId:         integer("po_id").notNull().references(() => purchaseOrdersTable.id),
  merchantId:   integer("merchant_id").notNull().references(() => merchantsTable.id),
  processedBy:  text("processed_by").notNull(),
  processedAt:  timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  notes:        text("notes").notNull(),
});

export const insertPurchaseOrderSchema = createInsertSchema(purchaseOrdersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPurchaseOrderItemSchema = createInsertSchema(purchaseOrderItemsTable).omit({ id: true });
export const insertPurchaseOrderReceiptSchema = createInsertSchema(purchaseOrderReceiptsTable).omit({ id: true, processedAt: true });
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type InsertPurchaseOrderItem = z.infer<typeof insertPurchaseOrderItemSchema>;
export type InsertPurchaseOrderReceipt = z.infer<typeof insertPurchaseOrderReceiptSchema>;
export type PurchaseOrder = typeof purchaseOrdersTable.$inferSelect;
export type PurchaseOrderItem = typeof purchaseOrderItemsTable.$inferSelect;
export type PurchaseOrderReceipt = typeof purchaseOrderReceiptsTable.$inferSelect;
