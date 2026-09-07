import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { productsTable } from "./products";
import { transactionsTable } from "./transactions";

/* Backorder ledger. One row is written each time a sale drives an
   inventory-tracked product's stock further below zero (an "oversell"): stock is
   allowed to go negative, and this records which sale caused it and by how many
   units. `remaining` is FIFO-decremented as stock is later replenished (PO
   receipt, refund, manual correction). When a Purchase Order containing the
   product is received, the still-outstanding rows here drive the "this item is
   short" warning, naming each sale's receipt number.

   Invariant: SUM(remaining) over unresolved rows for a product === max(0, -stockQuantity). */
export const productOversellLedgerTable = pgTable("product_oversell_ledger", {
  id:            serial("id").primaryKey(),
  merchantId:    integer("merchant_id").notNull().references(() => merchantsTable.id),
  productId:     integer("product_id").notNull().references(() => productsTable.id),
  // The sale that oversold. transactionId may be null for non-sale oversells
  // (e.g. complimentary items added to a completed sale); receiptNumber is the
  // human-facing identifier shown in the PO-receipt warning.
  transactionId: integer("transaction_id").references(() => transactionsTable.id),
  receiptNumber: text("receipt_number"),
  // Units this event oversold by (immutable), and the units still uncovered.
  quantity:      integer("quantity").notNull(),
  remaining:     integer("remaining").notNull(),
  saleAt:        timestamp("sale_at",    { withTimezone: true }).notNull().defaultNow(),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt:    timestamp("resolved_at", { withTimezone: true }),
}, (t) => [
  index("product_oversell_ledger_merchant_idx").on(t.merchantId),
  index("product_oversell_ledger_open_idx").on(t.merchantId, t.productId, t.remaining),
]);

export type ProductOversellLedger = typeof productOversellLedgerTable.$inferSelect;
export type InsertProductOversellLedger = typeof productOversellLedgerTable.$inferInsert;
