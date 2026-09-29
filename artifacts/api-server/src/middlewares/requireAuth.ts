import { Request, Response, NextFunction } from "express";
import { db, merchantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { isSoleMerchantEmail } from "../lib/sole-merchant";

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

  next();
}
