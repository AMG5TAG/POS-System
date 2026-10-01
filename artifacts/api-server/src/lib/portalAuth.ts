import type { Request } from "express";
import { db, customersTable, merchantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Access control for a customer's account link (/c/<token>).
 *
 * The customer portal now lives in the online shop's account area; its link
 * signs the customer in there (POST /shop/auth/token) under these same rules,
 * and staff hand out wallet passes by token (routes/portal.ts).
 *
 * The portal began as token-only: whoever held the `portalToken` in the URL had
 * full read and write access to that customer. That is acceptable for a link
 * texted to the customer, but not for a QR printed on a service sticker that
 * stays on the device.
 *
 * So a merchant can require a password. The rules, in the order they're applied:
 *
 *   - merchant hasn't opted in    -> token alone admits, exactly as before
 *   - customer has no password yet -> token alone admits, and the account offers set-up
 *   - customer has a password      -> the token only IDENTIFIES the account;
 *                                     a session is required to read or write it
 *
 * The middle rule is what makes this safe to ship: turning the toggle on never
 * locks anybody out, it starts inviting them to set a password. Only once a
 * customer has one does their token stop being a credential.
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

/** Whether this customer's merchant has opted into portal passwords. */
export async function merchantRequiresPortalPassword(merchantId: number): Promise<boolean> {
  const [m] = await db
    .select({ require: merchantsTable.requirePortalPassword })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, merchantId));
  return m?.require === "true";
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
  if (!(await merchantRequiresPortalPassword(customer.merchantId))) return { ok: true, customer };

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
