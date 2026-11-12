import { pgTable, text, serial, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

/**
 * Long-lived API tokens for connected apps (e.g. Koastal Tech Support syncing service jobs).
 * Only a SHA-256 hash of the token is stored; the token itself is shown once when it's created.
 * Tokens never expire on their own - they stop working when revoked (revokedAt set).
 */
export const apiTokensTable = pgTable("api_tokens", {
  id:          serial("id").primaryKey(),
  merchantId:  integer("merchant_id").notNull().references(() => merchantsTable.id, { onDelete: "cascade" }),
  name:        text("name").notNull(),
  tokenHash:   text("token_hash").notNull(),
  tokenPrefix: text("token_prefix").notNull(),
  createdAt:   timestamp("created_at",   { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt:  timestamp("last_used_at", { withTimezone: true }),
  revokedAt:   timestamp("revoked_at",   { withTimezone: true }),
}, (t) => [
  index("api_tokens_merchant_id_idx").on(t.merchantId),
  uniqueIndex("api_tokens_token_hash_idx").on(t.tokenHash),
]);

export type ApiToken       = typeof apiTokensTable.$inferSelect;
export type InsertApiToken = typeof apiTokensTable.$inferInsert;
