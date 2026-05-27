/**
 * tokenVault — AES-256-CBC encrypt/decrypt for OAuth access & refresh tokens.
 *
 * Key source (in priority order):
 *   1. VAULT_ENCRYPTION_KEY env var  (any string; PBKDF2-derived to 32 bytes)
 *   2. SESSION_SECRET env var        (fallback for dev environments)
 *
 * Ciphertext format stored in DB:  "<iv-hex>:<ciphertext-hex>"
 */

import crypto from "crypto";
import { db, oauthTokenVaultTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const ALGORITHM = "aes-256-cbc";
const SALT = "koapos-vault-v1";

function deriveKey(): Buffer {
  const secret = process.env.VAULT_ENCRYPTION_KEY ?? process.env.SESSION_SECRET ?? "dev-insecure-fallback-please-set-env";
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
