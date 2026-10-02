import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

/* Brute-force guard for staff PINs.
 *
 * A 4-digit PIN is 10,000 guesses, and "does ANY staff member have this PIN?"
 * divides that by the number of staff — so the only thing standing between the
 * internet and a Tech App / Mobile POS session is how many guesses we allow.
 * The old guard was an in-memory Map per merchant, checked before the bcrypt
 * compare and only written after it, so a burst of parallel requests all read
 * the same zero and got through; every autoscale instance also kept its own.
 *
 * Here every attempt is RESERVED in Postgres before the compare (one atomic
 * upsert per counter, so concurrent requests each see the count go up), and a
 * correct PIN hands its reservation back. The counters live in `login_attempts`
 * under a non-email key; `locked_until` holds the end of the current window,
 * which is also what the existing cleanup job ages rows out on.
 *
 * Two scopes, deliberately separate so one cannot be used to lock out the other:
 *  - "public":  Tech App + Mobile POS logins (anyone on the internet). Counted
 *               per caller IP and per business.
 *  - "session": PIN checks made from an already signed-in POS (staff switch,
 *               manager approval, timesheet clock-in/out). Counted per business.
 *               A typo-prone shop shares one IP, so no per-IP limit here.
 */

export type PinScope = "public" | "session";

interface Limit { max: number; windowMs: number }

const LIMITS: Record<PinScope, { perIp?: Limit; perBusiness: Limit }> = {
  public: {
    perIp: { max: 10, windowMs: 15 * 60_000 },
    perBusiness: { max: 40, windowMs: 60 * 60_000 },
  },
  session: {
    perBusiness: { max: 30, windowMs: 15 * 60_000 },
  },
};

function keysFor(scope: PinScope, merchantId: number, ip: string | undefined): Array<{ key: string; limit: Limit }> {
  const l = LIMITS[scope];
  // Per-IP first: a caller already over its own limit stops there and never
  // spends the business-wide budget, so one noisy address can't lock everyone out.
  const keys: Array<{ key: string; limit: Limit }> = [];
  if (l.perIp) keys.push({ key: `pin:${scope}:ip:${ip ?? "unknown"}`, limit: l.perIp });
  keys.push({ key: `pin:${scope}:m${merchantId}`, limit: l.perBusiness });
  return keys;
}

async function bump(key: string, windowMs: number): Promise<{ count: number; windowEnd: Date }> {
  const windowEnd = new Date(Date.now() + windowMs).toISOString();
  const result = await db.execute<{ fail_count: number | string; locked_until: string }>(sql`
    INSERT INTO login_attempts (email, fail_count, locked_until, updated_at)
    VALUES (${key}, 1, ${windowEnd}::timestamptz, NOW())
    ON CONFLICT (email) DO UPDATE SET
      fail_count = CASE
        WHEN login_attempts.locked_until IS NULL OR login_attempts.locked_until < NOW() THEN 1
        ELSE login_attempts.fail_count + 1
      END,
      locked_until = CASE
        WHEN login_attempts.locked_until IS NULL OR login_attempts.locked_until < NOW() THEN ${windowEnd}::timestamptz
        ELSE login_attempts.locked_until
      END,
      updated_at = NOW()
    RETURNING fail_count, locked_until
  `);
  const row = result.rows[0];
  return { count: Number(row?.fail_count ?? 1), windowEnd: new Date(row?.locked_until ?? windowEnd) };
}

async function refund(key: string): Promise<void> {
  await db.execute(sql`
    UPDATE login_attempts SET fail_count = GREATEST(fail_count - 1, 0), updated_at = NOW()
    WHERE email = ${key}
  `);
}

export type PinReservation =
  | { ok: true; release: () => Promise<void> }
  | { ok: false; retryAfter: Date };

/**
 * Reserve one PIN attempt. Call BEFORE comparing the PIN; if `ok` is false,
 * refuse without comparing. On a correct PIN call `release()` so honest use
 * never accumulates; a wrong PIN simply keeps its reservation.
 */
export async function reservePinAttempt(
  scope: PinScope,
  merchantId: number,
  ip: string | undefined,
): Promise<PinReservation> {
  const keys = keysFor(scope, merchantId, ip);
  const reserved: string[] = [];
  for (const { key, limit } of keys) {
    const { count, windowEnd } = await bump(key, limit.windowMs);
    if (count > limit.max) {
      // This attempt is refused: it shouldn't count against the earlier,
      // narrower budgets either (the IP keeps its own count of refusals).
      for (const k of reserved) await refund(k);
      return { ok: false, retryAfter: windowEnd };
    }
    reserved.push(key);
  }
  return {
    ok: true,
    release: async () => {
      for (const { key } of keys) await refund(key);
    },
  };
}

/** Human-readable wait for a 429 message. */
export function retryMessage(retryAfter: Date): string {
  const mins = Math.max(1, Math.ceil((retryAfter.getTime() - Date.now()) / 60_000));
  return `Too many incorrect PINs — try again in ${mins} minute${mins === 1 ? "" : "s"}`;
}
