import { db, customerSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * What a customer must fill in on their own profile in the shop account — the
 * same fields the POS can require (Settings › Customers › Required Fields,
 * `customer_settings.required_fields`), so the shop can never save a customer
 * the till would have refused. First name is always required.
 *
 * Also the "How did you hear about us?" choices, which the POS stores by name
 * in `customers.heard_from` (`customer_settings.heard_from_sources`).
 */

export type RequiredKey = "email" | "phone" | "dateOfBirth" | "company" | "abn" | "billingAddress";
export const REQUIRED_LABELS: Record<RequiredKey, string> = {
  email: "email",
  phone: "mobile number",
  dateOfBirth: "birthday",
  company: "business name",
  abn: "ABN",
  billingAddress: "address",
};
export type HeardFromSource = { name: string; requiresDetails: boolean };
export type ProfileRequirements = { required: Record<RequiredKey, boolean>; heardFromSources: HeardFromSource[] };

const NONE: Record<RequiredKey, boolean> = { email: false, phone: false, dateOfBirth: false, company: false, abn: false, billingAddress: false };

function parse<T>(raw: string | null | undefined, fallback: T): T {
  try { return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}

export async function profileRequirements(merchantId: number): Promise<ProfileRequirements> {
  const [row] = await db.select({ requiredFields: customerSettingsTable.requiredFields, heardFromSources: customerSettingsTable.heardFromSources })
    .from(customerSettingsTable).where(eq(customerSettingsTable.merchantId, merchantId));
  const req = parse<Partial<Record<RequiredKey, unknown>>>(row?.requiredFields, {});
  const sources = parse<Array<{ name?: unknown; requiresDetails?: unknown }>>(row?.heardFromSources, []);
  return {
    required: Object.fromEntries((Object.keys(NONE) as RequiredKey[]).map((k) => [k, req[k] === true])) as Record<RequiredKey, boolean>,
    heardFromSources: (Array.isArray(sources) ? sources : [])
      .filter((s) => typeof s?.name === "string" && s.name.trim())
      .map((s) => ({ name: String(s.name).trim(), requiresDetails: s.requiresDetails === true })),
  };
}

/** The required fields left blank, as words for the error ("mobile number, ABN"). */
export function missingRequired(
  required: Record<RequiredKey, boolean>,
  v: { email: string; phone: string; dateOfBirth: string | null; company: string; abn: string; address: { street: string; city: string; state: string; postcode: string } },
): string[] {
  const blank = (s: string | null | undefined) => !s || !s.trim();
  const out: string[] = [];
  if (required.email && blank(v.email)) out.push(REQUIRED_LABELS.email);
  if (required.phone && blank(v.phone)) out.push(REQUIRED_LABELS.phone);
  if (required.dateOfBirth && blank(v.dateOfBirth)) out.push(REQUIRED_LABELS.dateOfBirth);
  if (required.company && blank(v.company)) out.push(REQUIRED_LABELS.company);
  if (required.abn && blank(v.abn)) out.push(REQUIRED_LABELS.abn);
  if (required.billingAddress && [v.address.street, v.address.city, v.address.state, v.address.postcode].some(blank)) {
    out.push(REQUIRED_LABELS.billingAddress);
  }
  return out;
}
