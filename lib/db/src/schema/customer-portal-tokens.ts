import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { customersTable } from "./customers";

/**
 * Single-use tokens for customer-portal password set-up and reset.
 *
 * Mirrors `password_reset_tokens` (the merchant equivalent): only the SHA-256
 * hash is stored, so a leaked table row can't be replayed as a link.
 *
 * `purpose` distinguishes the two flows that share the mechanism. They differ
 * only in wording — "set up your account" the first time, "reset your password"
 * after — but the distinction matters for the neutral responses these flows
 * return: neither may reveal whether a customer already has a password.
 */
export const customerPortalTokensTable = pgTable("customer_portal_tokens", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customersTable.id),
  tokenHash: text("token_hash").notNull().unique(),
  /** "setup" | "reset" */
  purpose: text("purpose").notNull().default("setup"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("customer_portal_tokens_customer_id_idx").on(t.customerId),
]);

export type CustomerPortalToken = typeof customerPortalTokensTable.$inferSelect;
export type InsertCustomerPortalToken = typeof customerPortalTokensTable.$inferInsert;
