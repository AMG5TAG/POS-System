/**
 * tokenVault — AES-256-CBC encrypt/decrypt for OAuth access & refresh tokens.
 *
 * Key source:
 *   - `VAULT_ENCRYPTION_KEY` env var (required in production, PBKDF2-derived to 32 bytes).
 *   - In non-production environments only, falls back to a development-only key so local
 *     setups work without configuration. The fallback is NEVER used when
 *     `NODE_ENV === "production"` — the server refuses to start in that case
 *     (see `assertVaultKeyConfigured`).
 *
 * Ciphertext format stored in DB:  "<iv-hex>:<ciphertext-hex>"
 */

import crypto from "crypto";
import { db, oauthTokenVaultTable } from "@workspace/db";
import { eq, and, isNotNull, or } from "drizzle-orm";
import { logger } from "../lib/logger";

const ALGORITHM = "aes-256-cbc";
const SALT = "koapos-vault-v1";
const DEV_FALLBACK_KEY = "dev-only-insecure-vault-key-do-not-use-in-prod";

/**
 * The hardcoded dev fallback is only honoured when NODE_ENV is explicitly
 * "development" or blank/undefined. Any other value (including "production",
 * "staging", "test", etc.) requires `VAULT_ENCRYPTION_KEY` to be set.
 */
function isDevFallbackAllowed(): boolean {
  const env = process.env.NODE_ENV;
  return env === "development" || env === undefined || env === "";
}

/**
 * Throws if `VAULT_ENCRYPTION_KEY` is missing in production. Call this at server
 * startup so the process fails fast rather than silently encrypting tokens with
 * an insecure dev key.
 */
export function assertVaultKeyConfigured(): void {
  if (process.env.NODE_ENV === "production" && !process.env.VAULT_ENCRYPTION_KEY) {
    throw new Error(
      "Fatal: VAULT_ENCRYPTION_KEY environment variable is required in production mode.",
    );
  }
}

function deriveKey(): Buffer {
  const secret = process.env.VAULT_ENCRYPTION_KEY
    ?? (isDevFallbackAllowed() ? DEV_FALLBACK_KEY : undefined);
  if (!secret) {
    throw new Error(
      "Fatal: VAULT_ENCRYPTION_KEY environment variable is required in production mode.",
    );
  }
  return crypto.pbkdf2Sync(secret, SALT, 100_000, 32, "sha256");
}

export function encryptToken(plaintext: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptToken(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 2) return "";
  const [ivHex, encHex] = parts;
  const key = deriveKey();
  const iv = Buffer.from(ivHex, "hex");
  const enc = Buffer.from(encHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

function tryDecrypt(ciphertext: string | null): boolean {
  if (!ciphertext) return true;
  try {
    decryptToken(ciphertext);
    return true;
  } catch {
    return false;
  }
}

/**
 * One-shot startup migration: deletes vault rows whose tokens cannot be decrypted
 * with the currently-configured `VAULT_ENCRYPTION_KEY`. Such rows were encrypted
 * under an older key (e.g. the legacy `SESSION_SECRET`/hardcoded fallback) and
 * are unrecoverable; merchants will need to reconnect the affected integrations.
 */
export async function invalidateUnreadableVaultEntries(): Promise<number> {
  const rows = await db
    .select({
      id: oauthTokenVaultTable.id,
      merchantId: oauthTokenVaultTable.merchantId,
      provider: oauthTokenVaultTable.provider,
      encryptedAccessToken: oauthTokenVaultTable.encryptedAccessToken,
      encryptedRefreshToken: oauthTokenVaultTable.encryptedRefreshToken,
    })
    .from(oauthTokenVaultTable)
    .where(or(
      isNotNull(oauthTokenVaultTable.encryptedAccessToken),
      isNotNull(oauthTokenVaultTable.encryptedRefreshToken),
    ));

  const unreadable = rows.filter((r) =>
    !tryDecrypt(r.encryptedAccessToken) || !tryDecrypt(r.encryptedRefreshToken)
  );

  for (const row of unreadable) {
    // Preserve the row (and accountHandle) so the UI can show "needs reconnect".
    await db.update(oauthTokenVaultTable)
      .set({
        encryptedAccessToken:  null,
        encryptedRefreshToken: null,
        tokenExpiresAt:        null,
        disconnectedReason:    "key_rotated",
        disconnectedAt:        new Date(),
      })
      .where(eq(oauthTokenVaultTable.id, row.id));
    logger.warn(
      { merchantId: row.merchantId, provider: row.provider },
      "Invalidated OAuth vault entry encrypted with old key; merchant must reconnect",
    );
  }

  if (unreadable.length > 0) {
    logger.warn(
      { count: unreadable.length },
      "Invalidated unreadable OAuth vault entries on startup",
    );
  }
  return unreadable.length;
}

/* ── Vault CRUD helpers ────────────────────────────────────────────────────── */

export interface VaultEntry {
  provider: string;
  accountId?: string;
  accountHandle?: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  scope?: string;
}

export async function upsertVault(merchantId: number, entry: VaultEntry): Promise<void> {
  const encAccess  = entry.accessToken  ? encryptToken(entry.accessToken)  : null;
  const encRefresh = entry.refreshToken ? encryptToken(entry.refreshToken) : null;

  const existing = await db
    .select({ id: oauthTokenVaultTable.id })
    .from(oauthTokenVaultTable)
    .where(and(
      eq(oauthTokenVaultTable.merchantId, merchantId),
      eq(oauthTokenVaultTable.provider, entry.provider),
    ))
    .limit(1);

  if (existing.length > 0) {
    await db.update(oauthTokenVaultTable)
      .set({
        accountId:            entry.accountId ?? null,
        accountHandle:        entry.accountHandle ?? null,
        encryptedAccessToken: encAccess,
        encryptedRefreshToken:encRefresh,
        tokenExpiresAt:       entry.tokenExpiresAt ?? null,
        scope:                entry.scope ?? null,
        connectedAt:          new Date(),
        disconnectedReason:   null,
        disconnectedAt:       null,
      })
      .where(and(
        eq(oauthTokenVaultTable.merchantId, merchantId),
        eq(oauthTokenVaultTable.provider, entry.provider),
      ));
  } else {
    await db.insert(oauthTokenVaultTable).values({
      merchantId,
      provider:              entry.provider,
      accountId:             entry.accountId ?? null,
      accountHandle:         entry.accountHandle ?? null,
      encryptedAccessToken:  encAccess,
      encryptedRefreshToken: encRefresh,
      tokenExpiresAt:        entry.tokenExpiresAt ?? null,
      scope:                 entry.scope ?? null,
      connectedAt:           new Date(),
      disconnectedReason:    null,
      disconnectedAt:        null,
    });
  }
}

export async function readVault(merchantId: number, provider: string): Promise<{ accessToken: string; refreshToken: string; accountId: string | null; accountHandle: string | null } | null> {
  const [row] = await db
    .select()
    .from(oauthTokenVaultTable)
    .where(and(
      eq(oauthTokenVaultTable.merchantId, merchantId),
      eq(oauthTokenVaultTable.provider, provider),
    ))
    .limit(1);

  if (!row) return null;

  return {
    accessToken:   row.encryptedAccessToken  ? decryptToken(row.encryptedAccessToken)  : "",
    refreshToken:  row.encryptedRefreshToken ? decryptToken(row.encryptedRefreshToken) : "",
    accountId:     row.accountId ?? null,
    accountHandle: row.accountHandle ?? null,
  };
}

export async function deleteVault(merchantId: number, provider: string): Promise<void> {
  await db.delete(oauthTokenVaultTable).where(and(
    eq(oauthTokenVaultTable.merchantId, merchantId),
    eq(oauthTokenVaultTable.provider, provider),
  ));
}
