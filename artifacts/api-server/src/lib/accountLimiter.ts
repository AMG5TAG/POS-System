import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const MAX_FAILURES = parseInt(process.env.LOGIN_MAX_FAILURES ?? "10", 10);
const LOCKOUT_MINUTES = parseInt(process.env.LOGIN_LOCKOUT_MINUTES ?? "15", 10);
const LOCKOUT_MS = LOCKOUT_MINUTES * 60 * 1000;

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface LockStatus {
  locked: boolean;
  retryAfter?: Date;
}

export async function checkAccountLock(rawEmail: string): Promise<LockStatus> {
  const email = normaliseEmail(rawEmail);
  const result = await db.execute<{ locked_until: string | null }>(
    sql`SELECT locked_until FROM login_attempts WHERE email = ${email} LIMIT 1`
  );
  const row = result.rows[0];
  if (!row?.locked_until) return { locked: false };

  const lockedUntil = new Date(row.locked_until);
  if (lockedUntil > new Date()) {
    return { locked: true, retryAfter: lockedUntil };
  }

  return { locked: false };
}

/**
 * Record a failed login attempt. If the previous lockout has already expired,
 * the fail counter is reset to 1 (fresh window) rather than continuing to
 * increment from >=MAX_FAILURES — preventing permanent re-lock after cooldown.
 */
export async function recordFailedAttempt(rawEmail: string): Promise<void> {
  const email = normaliseEmail(rawEmail);
  const now = new Date();
  const lockoutUntil = new Date(now.getTime() + LOCKOUT_MS);

  await db.execute(sql`
    INSERT INTO login_attempts (email, fail_count, locked_until, updated_at)
    VALUES (${email}, 1, NULL, ${now.toISOString()})
    ON CONFLICT (email) DO UPDATE SET
      fail_count = CASE
        WHEN login_attempts.locked_until IS NOT NULL
             AND login_attempts.locked_until < NOW()
        THEN 1
        ELSE login_attempts.fail_count + 1
      END,
      locked_until = CASE
        WHEN (
          CASE
            WHEN login_attempts.locked_until IS NOT NULL
                 AND login_attempts.locked_until < NOW()
            THEN 1
            ELSE login_attempts.fail_count + 1
          END
        ) >= ${MAX_FAILURES}
        THEN ${lockoutUntil.toISOString()}::timestamptz
        ELSE NULL
      END,
      updated_at = ${now.toISOString()}
  `);
}

export async function clearFailedAttempts(rawEmail: string): Promise<void> {
  const email = normaliseEmail(rawEmail);
  await db.execute(sql`
    UPDATE login_attempts
    SET fail_count = 0, locked_until = NULL, updated_at = NOW()
    WHERE email = ${email}
  `);
}
