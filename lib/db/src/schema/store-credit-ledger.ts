import { pgTable, text, serial, integer, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { customersTable } from "./customers";

/* Per-customer store-credit ledger. Balance is the running SUM of `amount`
   (positive = issued/refunded to the customer, negative = redeemed). Mirrors the
   gift-card ledger pattern; backs the `store_credit` POS payment method and
   trade-in payouts. */
export const storeCreditLedgerTable = pgTable("store_credit_ledger", {
  id:            serial("id").primaryKey(),
  merchantId:    integer("merchant_id").notNull().references(() => merchantsTable.id),
  customerId:    integer("customer_id").notNull().references(() => customersTable.id),
  // issue | redeem | adjust | refund | expire
  type:          text("type").notNull(),
  amount:        numeric("amount",        { precision: 10, scale: 2 }).notNull(),
  balanceAfter:  numeric("balance_after", { precision: 10, scale: 2 }).notNull(),
  note:          text("note"),
  transactionId: integer("transaction_id"),
  staffId:       integer("staff_id"),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("store_credit_ledger_customer_idx").on(t.customerId),
  index("store_credit_ledger_merchant_idx").on(t.merchantId),
]);

export type StoreCreditLedger = typeof storeCreditLedgerTable.$inferSelect;
export type InsertStoreCreditLedger = typeof storeCreditLedgerTable.$inferInsert;
