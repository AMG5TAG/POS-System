/* ─── Phone fields on the way in ──────────────────────────────────────────────
 *
 * Every phone number a merchant saves passes through here and comes out in
 * E.164: "0412 345 678" typed at the till is stored as "+61412345678".
 *
 * It is a middleware rather than a call in each route handler for the same
 * reason auto-capitalisation lives in the frontend's base `Input` — there are
 * ~140 routers and a phone number is written by a dozen of them, so a rule
 * applied per-handler is a rule that is missing from the handler somebody adds
 * next month. This way "a saved number carries its country code" is a property
 * of the API, not a habit.
 *
 * Three things keep that from being reckless:
 *
 * - It matches on **field name**, from a fixed list, never on the shape of a
 *   value. A note that happens to read like a number is not a phone number.
 * - It only ever hands a value to `normalisePhone`, which returns anything it
 *   can't confidently read as a number completely untouched.
 * - It runs only for a request carrying a merchant session, because that is what
 *   says which country to assume. Public write paths (the booking form, a
 *   storefront order, the customer portal) know their merchant by other means
 *   and normalise explicitly in the handler.
 */

import type { Request, Response, NextFunction } from "express";
import { normalisePhone } from "@workspace/phone-shared";
import { merchantPhoneCountry } from "../lib/phone";

/**
 * Field names holding a dialable number. Exact matches only — `whatsappSameAsPhone`
 * is a "true"/"false" flag and must not be caught by a loose "…phone" test, and
 * `defaultPhoneCountry` is the setting that drives all of this.
 */
const PHONE_FIELDS: ReadonlySet<string> = new Set([
  "phone",
  "phoneNumber",
  "mobile",
  "mobileNumber",
  "telephone",
  "contactPhone",
  "customerPhone",
  "businessPhone",
  "supplierPhone",
  "recipientPhone",
  "billingPhone",
  "shippingPhone",
  "whatsapp",
  "whatsappNumber",
  // The QR designer's tel:/sms: payloads, which are only scannable in E.164.
  "vcPhone",
  "smsTo",
  // The number an SMS gateway sends from; Twilio rejects anything else.
  "fromNumber",
]);

/** Deep enough for `{ rows: [{ contact: { phone } }] }`, shallow enough to bound. */
const MAX_DEPTH = 8;

type Container = Record<string, unknown> | unknown[];

/** Collect every phone-named string in the body, in place, without touching the DB. */
function collect(node: unknown, depth: number, out: { parent: Container; key: string | number }[]): void {
  if (depth > MAX_DEPTH || node === null || typeof node !== "object") return;

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const child = node[i];
      if (child !== null && typeof child === "object") collect(child, depth + 1, out);
    }
    return;
  }

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (typeof value === "string") {
      if (PHONE_FIELDS.has(key) && value.trim()) out.push({ parent: node as Container, key });
    } else if (value !== null && typeof value === "object") {
      collect(value, depth + 1, out);
    }
  }
}

export async function normalisePhoneFields(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const merchantId = req.session?.merchantId;
  const body = req.body as unknown;

  if (
    !merchantId ||
    (req.method !== "POST" && req.method !== "PUT" && req.method !== "PATCH") ||
    body === null ||
    typeof body !== "object"
  ) {
    next();
    return;
  }

  const found: { parent: Container; key: string | number }[] = [];
  collect(body, 0, found);
  if (found.length === 0) {
    next();
    return;
  }

  try {
    const country = await merchantPhoneCountry(merchantId);
    for (const { parent, key } of found) {
      const container = parent as Record<string | number, unknown>;
      container[key] = normalisePhone(container[key] as string, country);
    }
  } catch (err) {
    // Losing the merchant's country is not a reason to lose their save. The
    // number goes through as typed, which is exactly what happened before this
    // middleware existed.
    req.log?.warn({ err, merchantId }, "Phone normalisation skipped");
  }

  next();
}
