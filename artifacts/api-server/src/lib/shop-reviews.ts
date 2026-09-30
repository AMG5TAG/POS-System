import { db, customersTable, transactionsTable, invoicesTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";

/**
 * Online shop reviews: who may write one. A review needs a purchase of that
 * product recorded in the POS by this customer — a till sale, a paid online
 * order (booked as a sale, services/deliveryOrderSale.ts) or a paid invoice
 * line that names the product.
 *
 * The POS holds duplicate customer rows for one person, and shop login signs in
 * as one of them (routes/shop.ts), so every row sharing the signed-in
 * customer's email counts as the same buyer. The email is what the shop
 * account is proven against, so this lends nobody a purchase that isn't theirs.
 */

/** Sale statuses that mean the customer bought it. A refunded sale was still a
 *  purchase (and is often partial); a cancelled one never happened. */
export const PURCHASE_SALE_STATUSES = ["completed", "refunded"] as const;

export async function buyerCustomerIds(merchantId: number, customer: { id: number; email: string | null }): Promise<number[]> {
  const email = customer.email?.trim().toLowerCase();
  if (!email) return [customer.id];
  const rows = await db.select({ id: customersTable.id }).from(customersTable)
    .where(and(eq(customersTable.merchantId, merchantId), sql`lower(${customersTable.email}) = ${email}`));
  return [...new Set([customer.id, ...rows.map((r) => r.id)])];
}

export async function hasPurchased(merchantId: number, customer: { id: number; email: string | null }, productId: number): Promise<boolean> {
  const ids = await buyerCustomerIds(merchantId, customer);
  const line = JSON.stringify([{ productId }]);
  const [sale] = await db.select({ id: transactionsTable.id }).from(transactionsTable)
    .where(and(
      eq(transactionsTable.merchantId, merchantId),
      inArray(transactionsTable.customerId, ids),
      inArray(transactionsTable.status, [...PURCHASE_SALE_STATUSES]),
      sql`${transactionsTable.items} @> ${line}::jsonb`,
    )).limit(1);
  if (sale) return true;
  const [inv] = await db.select({ id: invoicesTable.id }).from(invoicesTable)
    .where(and(
      eq(invoicesTable.merchantId, merchantId),
      inArray(invoicesTable.customerId, ids),
      eq(invoicesTable.status, "paid"),
      sql`${invoicesTable.items}::jsonb @> ${line}::jsonb`,
    )).limit(1);
  return !!inv;
}

/** How a reviewer is shown publicly: first name and last initial, never the
 *  full name or email. */
export function reviewerName(firstName: string | null, lastName: string | null): string {
  const first = (firstName ?? "").trim();
  const initial = (lastName ?? "").trim().charAt(0);
  if (!first) return initial ? `${initial.toUpperCase()}.` : "Customer";
  return initial ? `${first} ${initial.toUpperCase()}.` : first;
}
