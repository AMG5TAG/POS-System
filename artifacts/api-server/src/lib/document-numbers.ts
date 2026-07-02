/* Helpers for generating per-merchant document numbers (invoice/quote/PO/job/
 * layby references, receipt numbers) safely under concurrency.
 *
 * Each such column now has a UNIQUE (merchantId, number) index, so a race that
 * would previously silently create two rows with the same number instead raises
 * a Postgres unique-violation. These helpers turn that into a bounded retry that
 * re-derives the next number, so concurrent creates land on distinct numbers
 * instead of surfacing a 500. */

/** Postgres unique-violation SQLSTATE. */
export const PG_UNIQUE_VIOLATION = "23505";

/** True when `err` is a Postgres unique violation. When `constraint` is given,
 *  only matches a violation of that specific index/constraint (so a receipt-number
 *  collision isn't confused with, say, an idempotency-key collision). */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = err as { code?: string; constraint?: string } | null | undefined;
  if (!e || e.code !== PG_UNIQUE_VIOLATION) return false;
  return constraint == null || e.constraint === constraint;
}

/** Highest numeric suffix across existing document numbers, + 1 (+ `offset`).
 *  Non-digit characters (prefixes/separators) are stripped before parsing, and
 *  0 is used when none exist. Using max+1 rather than count+1 means deleting a
 *  document never causes its number to be re-issued to a later one. */
export function nextSequential(existing: Array<string | null | undefined>, offset = 0): number {
  let max = 0;
  for (const s of existing) {
    if (!s) continue;
    const n = parseInt(s.replace(/\D/g, ""), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return max + 1 + offset;
}

/** Run `attempt`, retrying up to `maxAttempts` times if it fails with a unique
 *  violation on `constraint`. `attempt` receives the 0-based try index so it can
 *  push the candidate number past a row a concurrent request just inserted. Any
 *  non-matching error propagates immediately; the last violation is rethrown if
 *  every attempt collides. */
export async function withUniqueRetry<T>(
  constraint: string,
  attempt: (tryIndex: number) => Promise<T>,
  maxAttempts = 6,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await attempt(i);
    } catch (err) {
      if (!isUniqueViolation(err, constraint)) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}
