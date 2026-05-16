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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CustomerFile = typeof customerFilesTable.$inferSelect;
export type InsertCustomerFile = typeof customerFilesTable.$inferInsert;
