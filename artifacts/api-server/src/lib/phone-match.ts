/* ─── Phone matching ──────────────────────────────────────────────────────────
 * Deciding whether two phone numbers are the same number, when they were typed
 * by different people on different days: "0400 000 000", "0400000000" and
 * "+61 400 000 000" are one customer, and a raw string comparison misses that.
 *
 * The rule is deliberately simple — compare the last 9 digits. That is enough to
 * span the AU trunk prefix (0…) and country code (+61…) for both mobiles and
 * landlines, without needing a full E.164 parser or the merchant's region.
 * Shorter numbers (an extension, a partly-typed one) compare whole.
 */

/** Digits are never enough to identify a customer below this length. */
const MIN_DIGITS = 6;

/** Last 9 digits span "04…" / "+614…" for mobiles and "02…" / "+612…" for landlines. */
export const PHONE_KEY_DIGITS = 9;

/**
 * Comparison key for a phone number, or "" when there is too little to match on.
 * Both sides of a comparison must be run through this.
 */
export function phoneMatchKey(phone: string | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < MIN_DIGITS) return "";
  return digits.length > PHONE_KEY_DIGITS ? digits.slice(-PHONE_KEY_DIGITS) : digits;
}

/** True when two typed numbers are the same number. */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = phoneMatchKey(a);
  return ka !== "" && ka === phoneMatchKey(b);
}
