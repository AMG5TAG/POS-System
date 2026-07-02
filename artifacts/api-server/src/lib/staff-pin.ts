import bcrypt from "bcryptjs";

/* Staff register PINs are stored bcrypt-hashed at rest (a DB read must not
 * disclose usable PINs). PINs are also used as a lookup key ("who has this
 * PIN?"), which a salted hash can't serve via a WHERE clause — so callers load
 * the merchant's staff and compare each with `matchStaffByPin`.
 *
 * Verification tolerates legacy plaintext rows that predate hashing so nobody is
 * locked out before/if the one-off backfill (`hash-staff-pins`) runs. */

/** True when the stored value is already a bcrypt hash (`$2a$` / `$2b$` / `$2y$`). */
export function isHashedPin(pin: string | null | undefined): boolean {
  return typeof pin === "string" && /^\$2[aby]\$/.test(pin);
}

/** Hash a PIN for storage. Same cost factor as staff passwords (lib/auth.ts). */
export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

/** Compare a submitted PIN against a stored value. Uses bcrypt for hashed rows
 *  and a plain equality fallback for legacy plaintext rows. */
export async function pinMatches(submitted: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored || !submitted) return false;
  return isHashedPin(stored) ? bcrypt.compare(submitted, stored) : stored === submitted;
}

/** Return the first staff member from `staff` whose PIN matches `submitted`
 *  (undefined if none). Replaces the old plaintext `find`/`WHERE pin = ?`. */
export async function matchStaffByPin<T extends { pin: string | null }>(
  staff: T[],
  submitted: string,
): Promise<T | undefined> {
  for (const s of staff) {
    if (await pinMatches(submitted, s.pin)) return s;
  }
  return undefined;
}
