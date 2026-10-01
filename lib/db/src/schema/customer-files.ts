import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";
import { customersTable } from "./customers";

export const customerFilesTable = pgTable("customer_files", {
  id: serial("id").primaryKey(),
  merchantId: integer("merchant_id").notNull().references(() => merchantsTable.id),
  customerId: integer("customer_id").notNull().references(() => customersTable.id),
  filename: text("filename").notNull(),
  fileKey: text("file_key").notNull(),
  contentType: text("content_type").notNull().default("application/octet-stream"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  /** "true" when the customer may see and download it from their shop
   *  account (GET /shop/account/files); otherwise staff only. Text, like every
   *  boolean here. Defaults to staff only, so nothing uploaded before the
   *  option existed became visible. Added by scripts/src/add-customer-file-visibility.ts. */
  visibleToCustomer: text("visible_to_customer").notNull().default("false"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CustomerFile = typeof customerFilesTable.$inferSelect;
export type InsertCustomerFile = typeof customerFilesTable.$inferInsert;
