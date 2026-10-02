import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/* The `state` parameter of every OAuth flow that returns to an unauthenticated
 * callback (Xero, Xero Payroll, Google, Apple, Intuit…).
 *
 * The production session cookie is SameSite=Strict, so the browser's return
 * from the provider arrives without it, and the callbacks have to learn which
 * business the flow belongs to from `state` alone. That value used to be the
 * bare merchant id — a small integer — so anyone could run the provider's
 * consent screen themselves with `state=<Koastal's id>` and have their own Xero
 * org (or Google account) attached to the business. Now `state` is signed: only
 * a staff session that started the flow could have produced it, it names the
 * integration it was issued for, and it expires.
 *
 *   <merchantId>.<expiresAtMs>.<nonce>.<hmac(purpose|merchantId|expires|nonce)>
 */

const TTL_MS = 15 * 60_000;

function key(): string {
  // Production refuses to boot without SESSION_SECRET (app.ts); the fallback is
  // the same dev-only value the session itself uses.
  return `oauth-state:${process.env.SESSION_SECRET ?? "koapos-dev-secret"}`;
}

function sign(purpose: string, merchantId: number, expires: number, nonce: string): string {
  return createHmac("sha256", key()).update(`${purpose}|${merchantId}|${expires}|${nonce}`).digest("base64url");
}

export function createOAuthState(purpose: string, merchantId: number): string {
  const expires = Date.now() + TTL_MS;
  const nonce = randomBytes(12).toString("base64url");
  return `${merchantId}.${expires}.${nonce}.${sign(purpose, merchantId, expires, nonce)}`;
}

/** The merchant a signed state was issued to, or null if it is forged,
 *  for another integration, malformed or expired. */
export function verifyOAuthState(purpose: string, state: string | undefined | null): number | null {
  if (typeof state !== "string") return null;
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const [mid, exp, nonce, mac] = parts as [string, string, string, string];
  if (!/^\d+$/.test(mid) || !/^\d+$/.test(exp)) return null;
  const merchantId = Number(mid);
  const expires = Number(exp);
  const expected = Buffer.from(sign(purpose, merchantId, expires, nonce));
  const given = Buffer.from(mac);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (Date.now() > expires) return null;
  return merchantId;
}
