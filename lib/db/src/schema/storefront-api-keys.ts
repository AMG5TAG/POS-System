import { pgTable, serial, integer, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

/**
 * Keys that let a merchant's own website (or the AI agent building it) read
 * their KoaPOS data through the Storefront Data API.
 *
 * This is the reverse of `online_store_thirdparty`, where the merchant pastes
 * *someone else's* credential so KoaPOS can call Shopify. Here KoaPOS issues
 * the credential and something outside calls in.
 *
 * Only the SHA-256 hash of a key is stored, like `password_reset_tokens` and
 * `customer_portal_tokens` — the plaintext is shown once at creation and never
 * again, so a leaked table row cannot be replayed. `keyPrefix` is the visible
 * fragment ("koa_live_3f9a…") that lets a merchant tell their keys apart in the
 * UI without the secret being recoverable from it.
 *
 * `scopes` is a comma-separated list rather than an array column, matching the
 * codebase's text-column convention. A key carries only what the merchant
 * ticked: a storefront needs `products:read` and `inventory:read`, while
 * `customers:read` and `sales:read` expose real customer PII and are opt-in.
 *
 * Revocation and expiry are nullable timestamps rather than text booleans so
 * they answer "when" as well as "whether".
 */
export const storefrontApiKeysTable = pgTable("storefront_api_keys", {
  id:            serial("id").primaryKey(),
  merchantId:    integer("merchant_id").notNull().references(() => merchantsTable.id),
  /** Merchant's label for where the key is used, e.g. "Next.js storefront". */
  name:          text("name").notNull().default(""),
  /** Visible fragment of the key, for identifying it in the UI. */
  keyPrefix:     text("key_prefix").notNull(),
  /** SHA-256 of the full key. The plaintext is never stored. */
  keyHash:       text("key_hash").notNull(),
  /** Comma-separated scopes, e.g. "products:read,inventory:read". */
  scopes:        text("scopes").notNull().default("products:read,inventory:read"),
  lastUsedAt:    timestamp("last_used_at", { withTimezone: true }),
  requestCount:  integer("request_count").notNull().default(0),
  expiresAt:     timestamp("expires_at", { withTimezone: true }),
  revokedAt:     timestamp("revoked_at", { withTimezone: true }),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("storefront_api_keys_merchant_id_idx").on(t.merchantId),
  uniqueIndex("storefront_api_keys_key_hash_unique").on(t.keyHash),
]);

export type StorefrontApiKey = typeof storefrontApiKeysTable.$inferSelect;
export type InsertStorefrontApiKey = typeof storefrontApiKeysTable.$inferInsert;
