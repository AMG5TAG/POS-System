import { pgTable, text, serial, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { merchantsTable } from "./merchants";

/**
 * oauth_token_vault — encrypted per-merchant token storage for all OAuth integrations.
 *
 * accessToken and refreshToken are stored as AES-256-CBC ciphertext (iv:hex format).
 * accountId / accountHandle are non-sensitive identifiers stored in plain text.
 */
export const oauthTokenVaultTable = pgTable("oauth_token_vault", {
  id:                     serial("id").primaryKey(),
  merchantId:             integer("merchant_id").notNull().references(() => merchantsTable.id),
  provider:               text("provider").notNull(),
  accountId:              text("account_id"),
  accountHandle:          text("account_handle"),
  encryptedAccessToken:   text("encrypted_access_token"),
  encryptedRefreshToken:  text("encrypted_refresh_token"),
  tokenExpiresAt:         timestamp("token_expires_at", { withTimezone: true }),
  scope:                  text("scope"),
  connectedAt:            timestamp("connected_at", { withTimezone: true }),
  /**
   * If non-null, the integration is no longer usable and the merchant must
   * reconnect. Set by background processes that invalidate the stored tokens
   * (e.g. `key_rotated` after a `VAULT_ENCRYPTION_KEY` change).
   * Cleared on successful re-connect.
   */
  disconnectedReason:     text("disconnected_reason"),
  disconnectedAt:         timestamp("disconnected_at", { withTimezone: true }),
  createdAt:              timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:              timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  uniqueIndex("oauth_vault_merchant_provider_idx").on(t.merchantId, t.provider),
]);

export type OAuthTokenVault = typeof oauthTokenVaultTable.$inferSelect;
