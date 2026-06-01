import { db, merchantSecuritySettingsTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";

const MAX_FAILURES = parseInt(process.env.LOGIN_MAX_FAILURES ?? "10", 10);
const LOCKOUT_MINUTES = parseInt(process.env.LOGIN_LOCKOUT_MINUTES ?? "15", 10);
export const LOCKOUT_MS = LOCKOUT_MINUTES * 60 * 1000;

const DEFAULT_ANOMALY_IP_THRESHOLD = parseInt(process.env.LOGIN_ANOMALY_IP_THRESHOLD ?? "3", 10);
const DEFAULT_ANOMALY_WINDOW_MINUTES = parseInt(process.env.LOGIN_ANOMALY_WINDOW_MINUTES ?? "10", 10);
const DEFAULT_ANOMALY_HOLD_HOURS = parseInt(process.env.LOGIN_ANOMALY_HOLD_HOURS ?? "24", 10);

async function getMerchantAnomalySettings(merchantId: number): Promise<{
  ipThreshold: number;
  windowMinutes: number;
  holdHours: number;
}> {
  const [row] = await db
    .select({
      anomalyIpThreshold:   merchantSecuritySettingsTable.anomalyIpThreshold,
      anomalyWindowMinutes: merchantSecuritySettingsTable.anomalyWindowMinutes,
      anomalyHoldHours:     merchantSecuritySettingsTable.anomalyHoldHours,
    })
    .from(merchantSecuritySettingsTable)
    .where(eq(merchantSecuritySettingsTable.merchantId, merchantId))
    .limit(1);

  return {
    ipThreshold:   row?.anomalyIpThreshold   ?? DEFAULT_ANOMALY_IP_THRESHOLD,
    windowMinutes: row?.anomalyWindowMinutes  ?? DEFAULT_ANOMALY_WINDOW_MINUTES,
    holdHours:     row?.anomalyHoldHours      ?? DEFAULT_ANOMALY_HOLD_HOURS,
  };
}

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export interface LockStatus {
  locked: boolean;
  retryAfter?: Date;
  isAnomalyHold?: boolean;
}

export async function checkAccountLock(rawEmail: string): Promise<LockStatus> {
  const email = normaliseEmail(rawEmail);
  const result = await db.execute<{ locked_until: string | null; account_hold_until: string | null }>(
    sql`SELECT locked_until, account_hold_until FROM login_attempts WHERE email = ${email} LIMIT 1`
  );
  const row = result.rows[0];
  if (!row) return { locked: false };

  if (row.account_hold_until) {
    const holdUntil = new Date(row.account_hold_until);
    if (holdUntil > new Date()) {
      return { locked: true, retryAfter: holdUntil, isAnomalyHold: true };
    }
  }

  if (row.locked_until) {
    const lockedUntil = new Date(row.locked_until);
    if (lockedUntil > new Date()) {
      return { locked: true, retryAfter: lockedUntil, isAnomalyHold: false };
    }
  }

  return { locked: false };
}

export async function setAccountHold(rawEmail: string, holdHours: number = DEFAULT_ANOMALY_HOLD_HOURS): Promise<void> {
  const email = normaliseEmail(rawEmail);
  const holdUntil = new Date(Date.now() + holdHours * 60 * 60 * 1000);
  await db.execute(sql`
    INSERT INTO login_attempts (email, fail_count, locked_until, account_hold_until, updated_at)
    VALUES (${email}, 0, NULL, ${holdUntil.toISOString()}::timestamptz, NOW())
    ON CONFLICT (email) DO UPDATE SET
      account_hold_until = ${holdUntil.toISOString()}::timestamptz,
      updated_at = NOW()
  `);
}

/**
 * Check if the anomaly threshold is met (distinct-IP count, time window, hold duration).
 * Reads per-merchant settings when available; falls back to global env var defaults.
 * If threshold is met, sets an account hold and returns true. Returns false if threshold
 * not met or the account is already held.
 */
export async function checkAndApplyAnomalyHold(rawEmail: string, merchantId: number): Promise<boolean> {
  const { ipThreshold, windowMinutes, holdHours } = await getMerchantAnomalySettings(merchantId);

  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
  const result = await db.execute<{ distinct_ips: string }>(
    sql`SELECT COUNT(DISTINCT ip_address)::int AS distinct_ips
        FROM auth_events
        WHERE merchant_id = ${merchantId}
          AND outcome = 'bad_password'
          AND ip_address IS NOT NULL
          AND created_at >= ${windowStart.toISOString()}::timestamptz`
  );
  const distinctIps = parseInt(result.rows[0]?.distinct_ips ?? "0", 10);
  if (distinctIps < ipThreshold) return false;

  const email = normaliseEmail(rawEmail);
  const existing = await db.execute<{ account_hold_until: string | null }>(
    sql`SELECT account_hold_until FROM login_attempts WHERE email = ${email} LIMIT 1`
  );
  const existingHold = existing.rows[0]?.account_hold_until;
  if (existingHold && new Date(existingHold) > new Date()) return false;

  await setAccountHold(rawEmail, holdHours);
  return true;
}

export interface FailedAttemptResult {
  failCount: number;
  attemptsRemaining: number;
}

/**
 * Record a failed login attempt. If the previous lockout has already expired,
 * the fail counter is reset to 1 (fresh window) rather than continuing to
 * increment from >=MAX_FAILURES — preventing permanent re-lock after cooldown.
 * Returns the new fail count and how many attempts remain before lockout.
 */
export async function recordFailedAttempt(rawEmail: string): Promise<FailedAttemptResult> {
  const email = normaliseEmail(rawEmail);
  const now = new Date();
  const lockoutUntil = new Date(now.getTime() + LOCKOUT_MS);

  const result = await db.execute<{ fail_count: string }>(sql`
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
    RETURNING fail_count
  `);

  const failCount = parseInt(result.rows[0]?.fail_count ?? "1", 10);
  const attemptsRemaining = Math.max(0, MAX_FAILURES - failCount);
  return { failCount, attemptsRemaining };
}

export async function clearFailedAttempts(rawEmail: string): Promise<void> {
  const email = normaliseEmail(rawEmail);
  await db.execute(sql`
    UPDATE login_attempts
    SET fail_count = 0, locked_until = NULL, account_hold_until = NULL, updated_at = NOW()
    WHERE email = ${email}
  `);
}
