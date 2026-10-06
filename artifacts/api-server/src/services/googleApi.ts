/**
 * Authenticated calls to Google APIs on behalf of a merchant, for the
 * Marketing › Google page (routes/google-insights.ts).
 *
 * The grant lives in the token vault under `GOOGLE_INSIGHTS_PROVIDER`. Google
 * access tokens last an hour, so each call refreshes one that has expired (or
 * is about to) using the stored refresh token; concurrent calls for the same
 * merchant share one refresh. A refresh Google refuses (`invalid_grant`: the
 * person revoked access, or a "Testing" OAuth app's 7-day refresh token ran
 * out) marks the vault row disconnected, so the Integrations page asks for a
 * reconnect instead of every card failing on its own.
 */
import { readVaultGrant, updateVaultAccessToken, markVaultDisconnected } from "./tokenVault";
import { classifyGoogleError, type ClassifiedError } from "../lib/google-insights";

export const GOOGLE_INSIGHTS_PROVIDER = "google_insights";

export class GoogleApiError extends Error {
  constructor(public readonly info: ClassifiedError) {
    super(info.message);
  }
}

const notConnected = () => new GoogleApiError({ code: "not_connected", status: 401, message: "Google isn't connected. Connect it under Management › Integrations." });

const refreshing = new Map<number, Promise<string>>();

async function refreshAccessToken(merchantId: number, refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const body = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !body.access_token) {
    const info = classifyGoogleError(res.status, body);
    if (info.code === "not_connected") await markVaultDisconnected(merchantId, GOOGLE_INSIGHTS_PROVIDER, "google_revoked");
    throw new GoogleApiError(info);
  }
  const expiresAt = new Date(Date.now() + (body.expires_in ?? 3600) * 1000);
  await updateVaultAccessToken(merchantId, GOOGLE_INSIGHTS_PROVIDER, body.access_token, expiresAt);
  return body.access_token;
}

async function accessToken(merchantId: number, force = false): Promise<string> {
  const grant = await readVaultGrant(merchantId, GOOGLE_INSIGHTS_PROVIDER);
  if (!grant) throw notConnected();
  const fresh = grant.tokenExpiresAt && grant.tokenExpiresAt.getTime() - Date.now() > 60_000;
  if (!force && grant.accessToken && fresh) return grant.accessToken;
  if (!grant.refreshToken) {
    // No refresh token: usable until it expires, then a reconnect is needed.
    if (!force && grant.accessToken && !grant.tokenExpiresAt) return grant.accessToken;
    throw notConnected();
  }
  let p = refreshing.get(merchantId);
  if (!p) {
    p = refreshAccessToken(merchantId, grant.refreshToken).finally(() => refreshing.delete(merchantId));
    refreshing.set(merchantId, p);
  }
  return p;
}

/**
 * JSON request to a Google API as the merchant. Retries once with a freshly
 * refreshed token on 401; any other failure is a GoogleApiError carrying what
 * it means (lib/google-insights.ts `classifyGoogleError`).
 */
export async function googleJson<T>(merchantId: number, url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const send = async (token: string) => fetch(url, {
    method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });

  let res = await send(await accessToken(merchantId));
  if (res.status === 401) res = await send(await accessToken(merchantId, true));
  const text = await res.text();
  const body = text ? (() => { try { return JSON.parse(text); } catch { return { error: { message: text.slice(0, 300) } }; } })() : {};
  if (!res.ok) throw new GoogleApiError(classifyGoogleError(res.status, body));
  return body as T;
}

/* ── Short cache ──────────────────────────────────────────────────────────────
   Report figures change daily at most, and the Business Profile APIs have a
   small per-minute quota, so a page opened by two people (or reloaded) should
   not ask Google twice. Keyed per merchant; cleared when the selection changes
   or a review is replied to. */
const CACHE_MS = 10 * 60_000;
const cache = new Map<string, { at: number; value: unknown }>();

export async function cached<T>(merchantId: number, key: string, load: () => Promise<T>): Promise<T> {
  const k = `${merchantId}|${key}`;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  const value = await load();
  cache.set(k, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  return value;
}

export function clearGoogleCache(merchantId: number, prefix = ""): void {
  for (const k of cache.keys()) if (k.startsWith(`${merchantId}|${prefix}`)) cache.delete(k);
}
