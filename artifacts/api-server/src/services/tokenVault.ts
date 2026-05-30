/**
 * tokenVault — authenticated encrypt/decrypt for OAuth access & refresh tokens.
 *
 * New tokens are encrypted with AES-256-GCM, which carries an authentication tag.
 * Decryption verifies that tag, so a wrong key (or tampered ciphertext) fails
 * loudly instead of silently returning garbage — this is what makes the
 * key-rotation and invalidation logic trustworthy (no false-positive "decrypt
 * succeeded"). Legacy AES-256-CBC ciphertext (written before this change) is
 * still readable and is upgraded to GCM the next time it is re-encrypted.
 *
 * Key source:
 *   - `VAULT_ENCRYPTION_KEY` env var (required in production, PBKDF2-derived to 32 bytes).
 *   - In non-production environments only, falls back to a development-only key so local
 *     setups work without configuration. The fallback is NEVER used when
 *     `NODE_ENV === "production"` — the server refuses to start in that case
 *     (see `assertVaultKeyConfigured`).
 *
 * Ciphertext format stored in DB:
 *   - current (authenticated):  "v2:<iv-hex>:<tag-hex>:<ciphertext-hex>"  (AES-256-GCM)
 *   - legacy (reads only):      "<iv-hex>:<ciphertext-hex>"               (AES-256-CBC)
 */

import crypto from "crypto";
import { db, oauthTokenVaultTable } from "@workspace/db";
import { eq, and, isNotNull, or } from "drizzle-orm";
import { logger } from "../lib/logger";

const ALGORITHM_CBC = "aes-256-cbc"; // legacy format — decrypt only
const ALGORITHM_GCM = "aes-256-gcm"; // current format — authenticated
const GCM_PREFIX = "v2";
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

function deriveKey(secret: string): Buffer {
  return crypto.pbkdf2Sync(secret, SALT, 100_000, 32, "sha256");
}

/** The secret used to ENCRYPT new tokens (current key). */
function currentSecret(): string {
  const secret = process.env.VAULT_ENCRYPTION_KEY
    ?? (isDevFallbackAllowed() ? DEV_FALLBACK_KEY : undefined);
  if (!secret) {
    throw new Error(
      "Fatal: VAULT_ENCRYPTION_KEY environment variable is required in production mode.",
    );
  }
  return secret;
}

/**
 * The previous secret, used only to DECRYPT tokens written before a key
 * rotation. Set `VAULT_ENCRYPTION_KEY_PREVIOUS` to the old value when rotating
 * `VAULT_ENCRYPTION_KEY` so existing tokens remain readable and can be migrated
 * to the new key without forcing every merchant to reconnect.
 */
function previousSecret(): string | null {
  return process.env.VAULT_ENCRYPTION_KEY_PREVIOUS || null;
}

function decryptCbc(key: Buffer, ivHex: string, encHex: string): string {
  const decipher = crypto.createDecipheriv(ALGORITHM_CBC, key, Buffer.from(ivHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(encHex, "hex")), decipher.final()]).toString("utf8");
}

function decryptGcm(key: Buffer, ivHex: string, tagHex: string, encHex: string): string {
  const decipher = crypto.createDecipheriv(ALGORITHM_GCM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(encHex, "hex")), decipher.final()]).toString("utf8");
}

/**
 * Decrypt one stored ciphertext with a single key, dispatching on format.
 * GCM (`v2:`) verifies the auth tag and throws on a wrong key or tampering;
 * legacy CBC is supported for reads of tokens written before the GCM upgrade.
 */
function decryptWithKey(key: Buffer, ciphertext: string): string {
  if (ciphertext.startsWith(`${GCM_PREFIX}:`)) {
    const [, ivHex, tagHex, encHex] = ciphertext.split(":");
    if (!ivHex || !tagHex || !encHex) throw new Error("Malformed v2 ciphertext");
    return decryptGcm(key, ivHex, tagHex, encHex);
  }
  const parts = ciphertext.split(":");
  if (parts.length !== 2) throw new Error("Malformed ciphertext");
  return decryptCbc(key, parts[0], parts[1]);
}

export function encryptToken(plaintext: string): string {
  const key = deriveKey(currentSecret());
  const iv = crypto.randomBytes(12); // 96-bit nonce, the standard size for GCM
  const cipher = crypto.createCipheriv(ALGORITHM_GCM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${GCM_PREFIX}:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts a stored token. Tries the current key first, then falls back to the
 * previous key (if `VAULT_ENCRYPTION_KEY_PREVIOUS` is set) so tokens survive a
 * key rotation until they are migrated by `reEncryptVaultEntries`.
 */
export function decryptToken(ciphertext: string): string {
  try {
    return decryptWithKey(deriveKey(currentSecret()), ciphertext);
  } catch (err) {
    const prev = previousSecret();
    if (prev) {
      return decryptWithKey(deriveKey(prev), ciphertext);
    }
    throw err;
  }
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

/**
 * Re-encrypt a single ciphertext field under the current key. Returns the
 * original value untouched if it is null, already current, or unreadable; only
 * fields that decrypt under the PREVIOUS key are re-encrypted.
 */
function reEncryptField(
  ciphertext: string | null,
  curKey: Buffer,
  prevKey: Buffer,
): { value: string | null; rotated: boolean } {
  if (!ciphertext) return { value: null, rotated: false };
  const isV2 = ciphertext.startsWith(`${GCM_PREFIX}:`);
  // Readable under the current key. If it's already authenticated (v2) there's
  // nothing to do; if it's a legacy CBC token, upgrade it to authenticated GCM.
  try {
    const plain = decryptWithKey(curKey, ciphertext);
    if (isV2) return { value: ciphertext, rotated: false };
    return { value: encryptToken(plain), rotated: true };
  } catch { /* fall through to previous key */ }
  // Encrypted under the previous key — migrate it to the current key (as v2).
  try {
    const plain = decryptWithKey(prevKey, ciphertext);
    return { value: encryptToken(plain), rotated: true };
  } catch {
    // Unreadable under either key; leave it for invalidateUnreadableVaultEntries.
    return { value: ciphertext, rotated: false };
  }
}

/**
 * One-shot startup migration for key rotation: when `VAULT_ENCRYPTION_KEY_PREVIOUS`
 * is set, finds vault rows whose tokens were encrypted under the previous key and
 * re-encrypts them under the current `VAULT_ENCRYPTION_KEY`. This lets operators
 * rotate the vault key without forcing merchants to reconnect their integrations.
 * After the migration runs, `VAULT_ENCRYPTION_KEY_PREVIOUS` can be removed.
 * Returns the number of rows re-encrypted.
 */
export async function reEncryptVaultEntries(): Promise<number> {
  const prev = previousSecret();
  if (!prev) return 0;

  const curKey = deriveKey(currentSecret());
  const prevKey = deriveKey(prev);

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

  let rotated = 0;
  for (const row of rows) {
    const access = reEncryptField(row.encryptedAccessToken, curKey, prevKey);
    const refresh = reEncryptField(row.encryptedRefreshToken, curKey, prevKey);
    if (!access.rotated && !refresh.rotated) continue;

    await db.update(oauthTokenVaultTable)
      .set({
        encryptedAccessToken: access.value,
        encryptedRefreshToken: refresh.value,
      })
      .where(eq(oauthTokenVaultTable.id, row.id));
    rotated += 1;
    logger.info(
      { merchantId: row.merchantId, provider: row.provider },
      "Re-encrypted OAuth vault entry under new key",
    );
  }

  if (rotated > 0) {
    logger.info({ count: rotated }, "Re-encrypted OAuth vault entries under rotated key");
  }
  return rotated;
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

/* ── Vault health status ───────────────────────────────────────────────────── */

export interface VaultStatus {
  /** Total vault rows with at least one encrypted token field. */
  total: number;
  /** Rows successfully decryptable with the current key. */
  current: number;
  /**
   * Rows decryptable only with the previous key (VAULT_ENCRYPTION_KEY_PREVIOUS).
   * These will be migrated on next server restart via reEncryptVaultEntries.
   */
  pendingRotation: number;
  /** Rows that cannot be decrypted with either key — require reconnection. */
  invalid: number;
  /** Whether VAULT_ENCRYPTION_KEY_PREVIOUS is currently set. */
  hasPreviousKey: boolean;
}

/**
 * Returns a per-merchant snapshot of vault health: how many token rows are
 * readable with the current key, how many need rotation, and how many are
 * unreadable. Used by the management integrations page to surface key-rotation
 * status to owners.
 */
export async function getVaultStatus(merchantId: number): Promise<VaultStatus> {
  const rows = await db
    .select({
      id:                    oauthTokenVaultTable.id,
      encryptedAccessToken:  oauthTokenVaultTable.encryptedAccessToken,
      encryptedRefreshToken: oauthTokenVaultTable.encryptedRefreshToken,
    })
    .from(oauthTokenVaultTable)
    .where(and(
      eq(oauthTokenVaultTable.merchantId, merchantId),
      or(
        isNotNull(oauthTokenVaultTable.encryptedAccessToken),
        isNotNull(oauthTokenVaultTable.encryptedRefreshToken),
      ),
    ));

  const curKey  = deriveKey(currentSecret());
  const prev    = previousSecret();
  const prevKey = prev ? deriveKey(prev) : null;

  let current = 0, pendingRotation = 0, invalid = 0;

  for (const row of rows) {
    const ct = row.encryptedAccessToken ?? row.encryptedRefreshToken;
    if (!ct) { invalid++; continue; }

    let readable = false;
    try { decryptWithKey(curKey, ct); readable = true; current++; } catch { /* try prev */ }

    if (!readable && prevKey) {
      try { decryptWithKey(prevKey, ct); readable = true; pendingRotation++; } catch { /* invalid */ }
    }

    if (!readable) invalid++;
  }

  return { total: rows.length, current, pendingRotation, invalid, hasPreviousKey: !!prev };
}
