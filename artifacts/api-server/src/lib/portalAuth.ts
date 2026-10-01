import type { Request } from "express";
import { db, customersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Access control for a customer's account link (/c/<token>).
 *
 * The customer portal now lives in the online shop's account area. Its link
 * never signs anyone in there by itself — POST /shop/auth/token
 * (routes/shop-account.ts) asks for the shop password, or for one to be set up,
 * because the same link is printed on a service sticker that stays on the
 * device. That was a business option ("require a customer password") until it
 * became the only behaviour; `merchants.require_portal_password` is left in
 * the table, unread.
 *
 * `resolvePortalAccess` guards the wallet-pass downloads staff hand out by token
 * (routes/portal.ts): a customer with a password needs a session; one without
 * is admitted by the token, which is how staff give a pass to a customer who
 * has not set up an account.
 */

declare module "express-session" {
  interface SessionData {
    /** Customer id for an authenticated customer-portal session. */
    portalCustomerId?: number;
  }
}

export type PortalCustomer = typeof customersTable.$inferSelect;

export type PortalAccess =
  | { ok: true; customer: PortalCustomer }
  | { ok: false; status: number; body: { error: string; reason?: string } };

/** The customer a portal token belongs to, or null. */
export async function findCustomerByPortalToken(token: string): Promise<PortalCustomer | null> {
  if (!token) return null;
  const [row] = await db.select().from(customersTable).where(eq(customersTable.portalToken, token));
  return row ?? null;
}

/** True when this request already holds a session for this customer. */
export function isPortalAuthenticated(req: Request, customer: PortalCustomer): boolean {
  return req.session?.portalCustomerId === customer.id;
}

/**
 * Resolve a portal token to its customer, enforcing the password rules above.
 * Every `/portal/:token/*` route funnels through this.
 */
export async function resolvePortalAccess(req: Request, token: string): Promise<PortalAccess> {
  const customer = await findCustomerByPortalToken(token);
  if (!customer) return { ok: false, status: 404, body: { error: "Portal not found" } };

  if (isPortalAuthenticated(req, customer)) return { ok: true, customer };
  if (!customer.portalPasswordHash) return { ok: true, customer };

  return {
    ok: false,
    status: 401,
    body: { error: "Please sign in to view your account.", reason: "password_required" },
  };
}

/**
 * "s•••@example.com" / "••• ••• 789". Enough for the customer to recognise
 * where the link went without printing an address a stranger could harvest.
 */
export function maskContact(email: string | null, phone: string | null): string | null {
  if (email) {
    const [user, domain] = email.split("@");
    if (domain) return `${user.slice(0, 1)}•••@${domain}`;
  }
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    if (digits.length >= 3) return `••• ••• ${digits.slice(-3)}`;
  }
  return null;
}
