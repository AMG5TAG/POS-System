import { customersTable, transactionsTable, laybysTable } from "@workspace/db";
import { and, eq, gte, lt, isNotNull, ne, sql, type SQL } from "drizzle-orm";

/**
 * Who a marketing campaign goes to — the one rule for both sending and the
 * count the Marketing pages show, so "Send to N recipients" is the number that
 * is actually sent.
 *
 * Before this, the send routes only knew "all" and "single" while the pages
 * saved "specific", "loyalty", "new", … — so a campaign addressed to one
 * customer, or to any segment, went to every opted-in customer, and the page's
 * count was a guess over the first 500 customers. An audience this module
 * doesn't know is now refused rather than widened to everyone.
 *
 * Every audience is limited to customers who agreed to marketing (Spam Act
 * 2003 s 16) and have the channel's contact detail.
 */

export type Channel = "email" | "sms";

export const CAMPAIGN_AUDIENCES = [
  "all", "specific", "loyalty", "new", "inactive", "layby", "high_value", "no_email",
  // Older names still on saved campaigns.
  "single", "no_purchase_30d",
] as const;

export function isKnownAudience(a: string): boolean {
  return (CAMPAIGN_AUDIENCES as readonly string[]).includes(a);
}

const DAY_MS = 24 * 60 * 60 * 1000;

const hasContact = (channel: Channel): SQL =>
  channel === "email"
    ? and(isNotNull(customersTable.email), ne(customersTable.email, ""))!
    : and(isNotNull(customersTable.phone), ne(customersTable.phone, ""))!;

const boughtSince = (since: Date): SQL => sql`EXISTS (
  SELECT 1 FROM ${transactionsTable} t
  WHERE t.customer_id = ${customersTable.id} AND t.status = 'completed' AND t.created_at >= ${since.toISOString()}::timestamptz
)`;

/**
 * The WHERE clause for an audience, or null when the audience is unknown
 * (callers refuse those). `now` is injectable for tests.
 */
export function audienceWhere(
  merchantId: number,
  channel: Channel,
  audience: string,
  customerId: number | null | undefined,
  now = new Date(),
): SQL | null {
  const base = and(
    eq(customersTable.merchantId, merchantId),
    eq(customersTable.agreedToMarketing, "true"),
    hasContact(channel),
  )!;
  switch (audience) {
    case "all":
      return base;
    case "specific":
    case "single":
      // No customer chosen means no one — never everyone.
      return customerId ? and(base, eq(customersTable.id, customerId))! : sql`false`;
    case "loyalty":
      return and(base, sql`${customersTable.loyaltyPoints} > 0`)!;
    case "new":
      return and(base, gte(customersTable.createdAt, new Date(now.getTime() - 30 * DAY_MS)))!;
    case "inactive":
      // Known for 90+ days and no completed sale in the last 90.
      return and(base, lt(customersTable.createdAt, new Date(now.getTime() - 90 * DAY_MS)), sql`NOT ${boughtSince(new Date(now.getTime() - 90 * DAY_MS))}`)!;
    case "no_purchase_30d":
      return and(base, sql`NOT ${boughtSince(new Date(now.getTime() - 30 * DAY_MS))}`)!;
    case "layby":
      return and(base, sql`EXISTS (SELECT 1 FROM ${laybysTable} l WHERE l.customer_id = ${customersTable.id} AND l.status = 'active')`)!;
    case "high_value":
      return and(base, sql`${customersTable.totalSpent} >= 500`)!;
    case "no_email":
      // Listed on the email page to show who is skipped; it sends to no one.
      return sql`false`;
    default:
      return null;
  }
}
