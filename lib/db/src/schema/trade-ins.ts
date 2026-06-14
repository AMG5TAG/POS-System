import { pgTable, serial, integer, text, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { customersTable } from "./customers";

/* Used-device trade-ins / buy-backs. A device is intake-graded and valued, the
   customer is paid out (cash or store credit), and it can be re-listed as
   refurbished stock (createdProductId links the resulting product). */
export const tradeInsTable = pgTable("trade_ins", {
  id:             serial("id").primaryKey(),
  merchantId:     integer("merchant_id").notNull().references(() => merchantsTable.id),
  customerId:     integer("customer_id").references(() => customersTable.id),
  staffId:        integer("staff_id"),
  deviceName:     text("device_name").notNull(),
  identifier:     text("identifier"), // IMEI / serial
  // A | B | C | D condition grade
  conditionGrade: text("condition_grade").notNull().default("B"),
  notes:          text("notes"),
  valuationAmount: numeric("valuation_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  // quoted | accepted | listed
  status:         text("status").notNull().default("quoted"),
  payoutMethod:   text("payout_method"), // cash | store_credit
  acceptedAt:     timestamp("accepted_at", { withTimezone: true }),
  createdProductId: integer("created_product_id"),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("trade_ins_merchant_idx").on(t.merchantId),
  index("trade_ins_status_idx").on(t.merchantId, t.status),
]);

export type TradeIn = typeof tradeInsTable.$inferSelect;
export type InsertTradeIn = typeof tradeInsTable.$inferInsert;
