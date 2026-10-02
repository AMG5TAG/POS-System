import { createHmac, timingSafeEqual } from "node:crypto";

/* Changing a shop account's email, confirmed from the new address.
 *
 * A shop account gathers every POS record sharing its email (buyerCustomerIds),
 * so the email IS the key to a customer's repairs, files and quotes. Switching
 * it to an address nobody had proved they own let a shopper claim records that
 * would later be created under that address. The change is now carried in a
 * signed, expiring link mailed to the new address and applied only when it is
 * opened. Nothing is stored: the link itself says who, what and until when.
 *
 * It also carries the record's `updatedAt` as of issue, and is honoured only
 * while that is unchanged — so asking for address B voids the link already
 * sent to A, as does any other edit to the record in between. */

const TTL_MS = 24 * 60 * 60 * 1000;

function key(): string {
  return `shop-email-change:${process.env.SESSION_SECRET ?? "koapos-dev-secret"}`;
}

function sign(payload: string): string {
  return createHmac("sha256", key()).update(payload).digest("base64url");
}

export function emailChangeToken(customerId: number, newEmail: string, recordUpdatedAt: Date | null, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ c: customerId, e: newEmail, u: recordUpdatedAt?.getTime() ?? 0, x: now + TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readEmailChangeToken(token: unknown, now = Date.now()): { customerId: number; email: string; recordUpdatedAt: number } | null {
  if (typeof token !== "string") return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const { c, e, u, x } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { c: unknown; e: unknown; u: unknown; x: unknown };
    if (typeof c !== "number" || typeof e !== "string" || typeof u !== "number" || typeof x !== "number" || now > x) return null;
    return { customerId: c, email: e, recordUpdatedAt: u };
  } catch {
    return null;
  }
}
