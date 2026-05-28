import { pgTable, text, serial, integer, numeric, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const giftCardsTable = pgTable("gift_cards", {
  id:             serial("id").primaryKey(),
  merchantId:     integer("merchant_id").notNull().references(() => merchantsTable.id),
  cardNumber:     text("card_number").notNull(),
  initialValue:   numeric("initial_value",   { precision: 10, scale: 2 }).notNull(),
  currentBalance: numeric("current_balance", { precision: 10, scale: 2 }).notNull(),
  status:         text("status").notNull().default("active"),
  expiryDate:     timestamp("expiry_date", { withTimezone: true }),
  issuedTo:       text("issued_to"),
  note:           text("note"),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  cardNumberIdx: uniqueIndex("gift_cards_merchant_card_number_idx").on(t.merchantId, t.cardNumber),
  merchantIdx:   index("gift_cards_merchant_idx").on(t.merchantId),
}));

export type GiftCard = typeof giftCardsTable.$inferSelect;
export type InsertGiftCard = typeof giftCardsTable.$inferInsert;
