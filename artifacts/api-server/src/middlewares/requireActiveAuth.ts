import { Request, Response, NextFunction } from "express";
import { db, merchantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Stricter variant of requireAuth that also verifies the merchant account
 * is still active in the database. Returns 403 (not 401) for authenticated
 * sessions belonging to inactive accounts so that the session state is not
 * revealed to the caller.
 */
export async function requireActiveAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.session?.merchantId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [merchant] = await db
    .select({ status: merchantsTable.status })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, req.session.merchantId));

  if (!merchant || merchant.status !== "active") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  next();
}
