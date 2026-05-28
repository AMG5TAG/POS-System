import { pgTable, text, serial, integer, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { giftCardsTable } from "./gift-cards";

export const giftCardLedgerTable = pgTable("gift_card_ledger", {
  id:            serial("id").primaryKey(),
  merchantId:    integer("merchant_id").notNull().references(() => merchantsTable.id),
  giftCardId:    integer("gift_card_id").notNull().references(() => giftCardsTable.id),
  type:          text("type").notNull(),
  amount:        numeric("amount",        { precision: 10, scale: 2 }).notNull(),
  balanceAfter:  numeric("balance_after", { precision: 10, scale: 2 }).notNull(),
  note:          text("note"),
  transactionId: integer("transaction_id"),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  cardIdx:     index("gift_card_ledger_card_idx").on(t.giftCardId),
  merchantIdx: index("gift_card_ledger_merchant_idx").on(t.merchantId),
}));

export type GiftCardLedger = typeof giftCardLedgerTable.$inferSelect;
export type InsertGiftCardLedger = typeof giftCardLedgerTable.$inferInsert;
