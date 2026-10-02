import { Request, Response, NextFunction } from "express";
import { db, merchantsTable, staffTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { isSoleMerchantEmail } from "../lib/sole-merchant";
import { sessionRole } from "../lib/auth";

// Per-merchant status cache: avoids a DB hit on every single request while
// still evicting suspended accounts within CACHE_TTL_MS.
const CACHE_TTL_MS = 60_000; // 60 seconds
const statusCache = new Map<number, { active: boolean; expiresAt: number }>();

export async function isMerchantActive(merchantId: number): Promise<boolean> {
  const cached = statusCache.get(merchantId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.active;
  }

  const [row] = await db
    .select({ status: merchantsTable.status, email: merchantsTable.email })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, merchantId));

  // Any other business account is kept in the database but locked out, so a
  // session opened before the single-business switch stops working too.
  const active = row?.status === "active" && isSoleMerchantEmail(row.email);
  statusCache.set(merchantId, { active, expiresAt: Date.now() + CACHE_TTL_MS });
  return active;
}

/** Invalidate cached status for a merchant (call after any status change). */
export function invalidateMerchantStatusCache(merchantId: number): void {
  statusCache.delete(merchantId);
}

/* The staff member a session acts as, re-read every STAFF_TTL_MS. A session
   used to carry the role it was opened with for its whole 7-day life, so a
   deactivated, deleted or demoted staff member kept their access. */
const STAFF_TTL_MS = 30_000;
type StaffStatus = { merchantId: number; active: boolean; role: "owner" | "manager" | "cashier" } | null;
const staffCache = new Map<number, { status: StaffStatus; expiresAt: number }>();

async function staffStatus(staffId: number): Promise<StaffStatus> {
  const cached = staffCache.get(staffId);
  if (cached && cached.expiresAt > Date.now()) return cached.status;
  const [row] = await db
    .select({ merchantId: staffTable.merchantId, isActive: staffTable.isActive, role: staffTable.role })
    .from(staffTable)
    .where(eq(staffTable.id, staffId));
  const status: StaffStatus = row
    ? { merchantId: row.merchantId, active: row.isActive === "true", role: sessionRole(row.role) }
    : null;
  staffCache.set(staffId, { status, expiresAt: Date.now() + STAFF_TTL_MS });
  return status;
}

/** Call after a staff member is edited, deactivated or deleted. */
export function invalidateStaffStatusCache(staffId: number): void {
  staffCache.delete(staffId);
}

/** Sign out every staff-email session of one staff member (password reset,
 *  deactivation). Till sessions opened with the owner's password are left. */
export async function destroyStaffEmailSessions(staffId: number): Promise<void> {
  await db.execute(sql`
    DELETE FROM session
    WHERE sess->>'authKind' = 'staff-email' AND sess->>'loginStaffId' = ${String(staffId)}
  `);
}

/** Sign out every session opened with the owner's password except `keepSid`
 *  (owner password change/reset): whoever held one under the old password —
 *  including a till signed in with it — has to sign in again. Staff members'
 *  own email logins are theirs and are left alone. */
export async function destroyOwnerSessions(merchantId: number, keepSid?: string): Promise<void> {
  await db.execute(sql`
    DELETE FROM session
    WHERE sess->>'merchantId' = ${String(merchantId)}
      AND coalesce(sess->>'authKind', 'owner') = 'owner'
      AND sid <> ${keepSid ?? ""}
  `);
}

/**
 * Requires an authenticated session AND confirms the merchant account is
 * still active in the database and is the single business this install runs
 * (see lib/sole-merchant.ts). Uses a 60-second in-process cache so a
 * suspended account loses API access within one cache window without adding
 * a DB round-trip to every request.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.session?.merchantId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const active = await isMerchantActive(req.session.merchantId);
  if (!active) {
    // Destroy the session so the client is forced to log in again
    req.session.destroy(() => {});
    res.status(403).json({ error: "This account has been suspended. Please contact support." });
    return;
  }

  const staffId = req.session.staffId;
  if (staffId) {
    const st = await staffStatus(staffId);
    const valid = !!st && st.active && st.merchantId === req.session.merchantId;
    const isEmailLogin = req.session.authKind === "staff-email";
    if (!valid) {
      if (isEmailLogin && staffId === req.session.loginStaffId) {
        // The person who signed in is gone or deactivated: the session ends.
        req.session.destroy(() => {});
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      if (isEmailLogin && req.session.loginStaffId) {
        // Someone else's day session on a staff member's own login: hand it
        // back to them (their role is re-read on the next request).
        req.session.staffId = req.session.loginStaffId;
        req.session.staffRole = "cashier";
      } else {
        // A day staff member deactivated mid-shift: nobody is signed in for the
        // day any more, so the till drops to the least privilege.
        delete req.session.staffId;
        req.session.staffRole = "cashier";
      }
    } else {
      // Follow role changes made since the session was opened.
      req.session.staffRole = st!.role;
    }
  }

  next();
}
