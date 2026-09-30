import { db, merchantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * KoaPOS runs as in-house software for a single business. The merchants table
 * still holds every account that ever registered — their data is deliberately
 * kept — but only this one may sign in, by any route (owner login, staff email
 * login, Tech App, Mobile POS) or through an existing session.
 *
 * Matched on email because that is the one identifier that is the same in every
 * database (row ids differ between dev and production). Override with
 * SOLE_MERCHANT_EMAIL — e.g. to use the seeded demo account in development.
 */
export const SOLE_MERCHANT_EMAIL = (process.env.SOLE_MERCHANT_EMAIL ?? "admin@koastal.com.au")
  .trim()
  .toLowerCase();

export function isSoleMerchantEmail(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase() === SOLE_MERCHANT_EMAIL;
}

let cachedId: number | null = null;

/**
 * Row id of the one business this install runs, for public surfaces (the online
 * shop) that have no session to read a merchant from. Cached for the process:
 * the account behind SOLE_MERCHANT_EMAIL never changes while it runs.
 */
export async function soleMerchantId(): Promise<number | null> {
  if (cachedId != null) return cachedId;
  const [m] = await db
    .select({ id: merchantsTable.id })
    .from(merchantsTable)
    .where(eq(merchantsTable.email, SOLE_MERCHANT_EMAIL))
    .limit(1);
  cachedId = m?.id ?? null;
  return cachedId;
}
