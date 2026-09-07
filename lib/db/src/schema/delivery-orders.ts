import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

export const deliveryOrdersTable = pgTable("delivery_orders", {
  id:             serial("id").primaryKey(),
  merchantId:     integer("merchant_id").notNull().references(() => merchantsTable.id),
  orderId:        text("order_id").notNull(),
  number:         text("number").notNull(),
  channel:        text("channel").notNull().default("website"),
  customer:       text("customer").notNull().default(""),
  customerEmail:  text("customer_email").notNull().default(""),
  phone:          text("phone").notNull().default(""),
  address:        text("address").notNull().default(""),
  city:           text("city").notNull().default(""),
  postcode:       text("postcode").notNull().default(""),
  state:          text("state").notNull().default(""),
  shippingMethod: text("shipping_method").notNull().default(""),
  status:         text("status").notNull().default("new"),
  placedAt:       text("placed_at").notNull().default(""),
  total:          numeric("total", { precision: 10, scale: 2 }).notNull().default("0"),
  items:          text("items").notNull().default("[]"),
  notes:          text("notes").notNull().default(""),
  /* ── Commerce breakdown (online-store checkout) ──────────────────────────
   * Added so storefront orders carry a full money breakdown, not just `total`.
   * All defaulted so the additive push is safe for existing delivery rows. */
  subtotal:        numeric("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
  discountCode:    text("discount_code").notNull().default(""),
  discountTotal:   numeric("discount_total", { precision: 10, scale: 2 }).notNull().default("0"),
  taxTotal:        numeric("tax_total", { precision: 10, scale: 2 }).notNull().default("0"),
  shippingTotal:   numeric("shipping_total", { precision: 10, scale: 2 }).notNull().default("0"),
  currency:        text("currency").notNull().default("AUD"),
  /** pending → paid → refunded; storefront orders start "pending" (manual confirm). */
  paymentStatus:   text("payment_status").notNull().default("pending"),
  paymentProvider: text("payment_provider").notNull().default(""),
  paymentRef:      text("payment_ref").notNull().default(""),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DeliveryOrder = typeof deliveryOrdersTable.$inferSelect;
export type InsertDeliveryOrder = typeof deliveryOrdersTable.$inferInsert;
