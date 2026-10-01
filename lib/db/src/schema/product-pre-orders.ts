import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { productsTable } from "./products";

export const productPreOrdersTable = pgTable("product_pre_orders", {
  id:            serial("id").primaryKey(),
  merchantId:    integer("merchant_id").notNull().references(() => merchantsTable.id),
  poNumber:      text("po_number").notNull(),
  customerId:    integer("customer_id"),
  customerName:  text("customer_name").notNull(),
  // Legacy single-product columns. A pre-order now carries multiple products in
  // productPreOrderItemsTable; these are kept for backward compatibility and are
  // mirrored from the first line item on write (productName is NOT NULL, and
  // older code / reports may still read them).
  productId:     integer("product_id"),
  productName:   text("product_name").notNull(),
  quantity:      integer("quantity").notNull().default(1),
  depositAmount: numeric("deposit_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  // "Awaiting stock" → "Arrived" → "Collected" | "Shipped", or "Cancelled".
  // Older manual rows may hold Pending / Confirmed / Ready (lib/pre-orders.ts).
  status:        text("status").notNull().default("Pending"),
  expectedDate:  text("expected_date"),
  notes:         text("notes"),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // ── Added for sale-linked pre-orders (scripts/src/add-pre-order-sales.ts) ──
  // "manual" (typed on the Pre-Orders screen), "pos" (a till sale) or "online".
  source:                 text("source").notNull().default("manual"),
  // The sale that took the money (full price, or the deposit).
  transactionId:          integer("transaction_id"),
  // Price × quantity; depositAmount above is what has been paid so far.
  totalAmount:            numeric("total_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  // Units set aside from purchase-order receiving, oldest pre-order first.
  allocatedQuantity:      integer("allocated_quantity").notNull().default(0),
  arrivedAt:              timestamp("arrived_at", { withTimezone: true }),
  notifiedAt:             timestamp("notified_at", { withTimezone: true }),
  collectedAt:            timestamp("collected_at", { withTimezone: true }),
  // The till sale that took the balance at collection (deposit pre-orders).
  collectedTransactionId: integer("collected_transaction_id"),
});

// One row per product on a pre-order (mirrors purchase_order_items).
export const productPreOrderItemsTable = pgTable("product_pre_order_items", {
  id:          serial("id").primaryKey(),
  preOrderId:  integer("pre_order_id").notNull().references(() => productPreOrdersTable.id),
  productId:   integer("product_id").references(() => productsTable.id),
  productName: text("product_name").notNull(),
  quantity:    integer("quantity").notNull().default(1),
  unitPrice:   numeric("unit_price", { precision: 10, scale: 2 }).notNull().default("0"),
});

export type ProductPreOrder = typeof productPreOrdersTable.$inferSelect;
export type InsertProductPreOrder = typeof productPreOrdersTable.$inferInsert;
export type ProductPreOrderItem = typeof productPreOrderItemsTable.$inferSelect;
export type InsertProductPreOrderItem = typeof productPreOrderItemsTable.$inferInsert;
