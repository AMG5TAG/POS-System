import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { customersTable } from "./customers";

export const customerNotesTable = pgTable("customer_notes", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  customerId: integer("customer_id").notNull().references(() => customersTable.id),
  note: text("note").notNull(),
  popupOnBooking: boolean("popup_on_booking").notNull().default(false),
  popupOnSale: boolean("popup_on_sale").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CustomerNote = typeof customerNotesTable.$inferSelect;
export type InsertCustomerNote = typeof customerNotesTable.$inferInsert;
