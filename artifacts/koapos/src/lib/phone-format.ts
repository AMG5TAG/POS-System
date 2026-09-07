/**
 * The app-wide "a phone number keeps its country code" behaviour, applied by the
 * base `Input` when a phone field loses focus. Typing `0412 345 678` leaves
 * `+61412345678` in the box — the same value the server would have stored
 * anyway, shown before the operator hits Save rather than after.
 *
 * The conversion itself, and the country table behind it, live in
 * `@workspace/phone-shared` so the browser and the API server cannot disagree
 * about what a saved number looks like. This file is only the browser's half:
 * which fields to treat as phone fields, and what the merchant's default is.
 *
 * Opt a field out with `noPhoneFormat`.
 */

import {
  normalisePhone,
  resolvePhoneCountry,
  type PhoneCountry,
} from "@workspace/phone-shared";

/* ── The merchant's default ──────────────────────────────────────────────────
 *
 * Held in a module variable rather than read through a hook, because the field
 * that needs it is the base `Input` — which is also rendered on the login and
 * marketing pages, where there is no merchant and a settings query would be a
 * guaranteed 401 on every keystroke-free page load. `AuthProvider` pushes it here
 * once the signed-in merchant is known, and again whenever Regional Settings
 * changes it; until then it is the fallback.
 */
let current: PhoneCountry = resolvePhoneCountry(null);

export function setDefaultPhoneCountry(
  defaultPhoneCountry: string | null | undefined,
): void {
  current = resolvePhoneCountry(defaultPhoneCountry);
}

export function getDefaultPhoneCountry(): PhoneCountry {
  return current;
}

/** Normalise with the merchant's current default. */
export function formatPhoneForSave(value: string): string {
  return normalisePhone(value, current);
}

/* ── Which fields are phone fields ───────────────────────────────────────────*/

export interface PhoneFieldHints {
  name?: string;
  id?: string;
  autoComplete?: string;
  inputMode?: string;
  placeholder?: string;
}

/** Field names that hold a dialable number, matched as whole words. */
const PHONE_NAME_RE = /\b(phone|phone[-_]?number|mobile|telephone|tel|msisdn|whatsapp)\b/i;

/**
 * Fields that are digits but emphatically not phone numbers. An ABN, an IMEI, a
 * serial or a BSB is often given a digits-and-spaces placeholder, which is
 * exactly the shape `placeholderLooksLikeNumber` matches — so the name wins over
 * the placeholder whenever it says what the field really is.
 */
const NOT_PHONE_NAME_RE =
  /\b(abn|acn|bsb|account|postcode|post[-_]?code|zip|serial|imei|licen[cs]e|rego|vin|tax|vat|gst|sku|barcode|invoice|card|ccv|cvv|pin|otp|code)\b/i;

/**
 * A placeholder that is an *example number* rather than prose: "0400 000 000",
 * "+61 400 000 000", "04xx xxx xxx". Most phone fields in this app are plain
 * `<Input>`s with no name and no `type`, so the example is the only thing that
 * identifies them.
 *
 * The test is deliberately strict about what may appear: digits, the `x`
 * placeholders merchants recognise, and phone punctuation — nothing else. That
 * is what keeps "Search by name, email or phone…" out, which is a search box and
 * must never have its query rewritten.
 */
function placeholderLooksLikeNumber(placeholder?: string): boolean {
  if (!placeholder) return false;
  const p = placeholder.trim();
  if (!p || !/^[+()\-.\s\dxX]+$/.test(p)) return false;
  return (p.match(/[\dxX]/g)?.length ?? 0) >= 6;
}

export function isPhoneField(type?: string, hints?: PhoneFieldHints): boolean {
  if (type === "tel") return true;
  // Any other explicit input type is something else entirely (email, date, …).
  if (type && type !== "text") return false;
  if (hints?.inputMode === "tel") return true;
  if (hints?.autoComplete && /tel/i.test(hints.autoComplete)) return true;

  const named = `${hints?.name ?? ""} ${hints?.id ?? ""}`;
  if (PHONE_NAME_RE.test(named)) return true;
  if (NOT_PHONE_NAME_RE.test(named)) return false;

  return placeholderLooksLikeNumber(hints?.placeholder);
}

/* ── Applying it ─────────────────────────────────────────────────────────────*/

/**
 * Rewrite the input's value in place *and* tell React about it.
 *
 * Assigning to `el.value` alone is invisible to a controlled component: React
 * still holds the old string and paints it back over the top on the next render.
 * Going through the native value setter and dispatching `input` is what makes
 * the change arrive at the component's own `onChange`, so the form state and the
 * box agree.
 */
export function applyPhoneFormat(el: HTMLInputElement): boolean {
  const next = formatPhoneForSave(el.value);
  if (next === el.value) return false;

  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  if (setter) setter.call(el, next);
  else el.value = next;

  el.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}
