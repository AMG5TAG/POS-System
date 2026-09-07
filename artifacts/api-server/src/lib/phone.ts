/* ─── Phone normalisation, server side ────────────────────────────────────────
 *
 * The browser rewrites a phone field as soon as the operator leaves it, but the
 * browser is not the guarantee: an import, the public booking form, a storefront
 * order and the API all write phone numbers without ever touching that code.
 * This module — and the middleware built on it — is where "a stored phone number
 * carries its country code" is actually true.
 *
 * See @workspace/phone-shared for the conversion rule itself.
 */

import { db, merchantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  formatPhoneDisplay,
  normalisePhone,
  phoneCountry,
  resolvePhoneCountry,
  type PhoneCountry,
  type PhoneDisplayMode,
} from "@workspace/phone-shared";

/**
 * The merchant's setting is read on nearly every write, and it changes about
 * once in the life of an account, so it is cached exactly like the merchant
 * status cache in requireAuth: short TTL, no invalidation needed beyond the one
 * the settings route does after a change.
 */
const CACHE_TTL_MS = 60_000;

interface PhoneSettings { country: PhoneCountry; display: PhoneDisplayMode }
const countryCache = new Map<number, { settings: PhoneSettings; expiresAt: number }>();

/** Drop a merchant's cached default (call after changing the setting). */
export function invalidatePhoneCountryCache(merchantId: number): void {
  countryCache.delete(merchantId);
}

/** A merchant's phone country and how they want numbers displayed. */
export async function merchantPhoneSettings(merchantId: number): Promise<PhoneSettings> {
  const cached = countryCache.get(merchantId);
  if (cached && cached.expiresAt > Date.now()) return cached.settings;

  const [row] = await db
    .select({
      defaultPhoneCountry: merchantsTable.defaultPhoneCountry,
      phoneDisplay: merchantsTable.phoneDisplay,
    })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, merchantId));

  const settings: PhoneSettings = {
    country: resolvePhoneCountry(row?.defaultPhoneCountry),
    display: row?.phoneDisplay === "national" ? "national" : "international",
  };
  countryCache.set(merchantId, { settings, expiresAt: Date.now() + CACHE_TTL_MS });
  return settings;
}

/** The country whose dialling code this merchant's numbers default to. */
export async function merchantPhoneCountry(merchantId: number): Promise<PhoneCountry> {
  return (await merchantPhoneSettings(merchantId)).country;
}

/**
 * A formatter for numbers this merchant is about to *read* — on a printed
 * receipt, an invoice PDF, a job docket.
 *
 * Resolved once per document rather than per field, because a document renders
 * many numbers and the merchant's setting cannot change halfway down the page.
 *
 * Display only. Never put the result where a machine will dial it: an SMS
 * recipient, a `tel:` href and an integration payload all take the stored E.164.
 */
export async function phoneFormatterFor(
  merchantId: number,
): Promise<(value: string | null | undefined) => string> {
  const { country, display } = await merchantPhoneSettings(merchantId);
  return (value) => formatPhoneDisplay(value, country, display);
}

/**
 * Normalise one number on a merchant's behalf. Safe on "", null and prose, and
 * costs nothing when there is no number — callers pass an optional field
 * straight in. A blank comes back as "" rather than as the whitespace it was, so
 * a caller's `phone || null` still stores null.
 */
export async function normalisePhoneFor(
  merchantId: number,
  raw: string | null | undefined,
): Promise<string> {
  const value = String(raw ?? "");
  if (!value.trim()) return "";
  return normalisePhone(value, await merchantPhoneCountry(merchantId));
}

/**
 * Validate a country code coming from a settings form. "" is meaningful — it
 * means "no choice made, use the default" — so it is accepted; anything we have
 * no dialling code for is rejected rather than silently stored, since a stored
 * value we can't resolve would quietly fall back to the default while the
 * settings screen showed something else.
 */
export function isValidPhoneCountry(code: unknown): code is string {
  if (typeof code !== "string") return false;
  return code === "" || phoneCountry(code) !== undefined;
}
