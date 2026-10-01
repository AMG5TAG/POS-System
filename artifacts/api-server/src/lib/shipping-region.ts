/**
 * The online store ships within Australia only. One rule for every place a
 * delivery address enters the system — the shop account's delivery address,
 * online orders (Online › Orders) and mail-in return addresses (lib/mail-in.ts,
 * which already took only these states and 4-digit postcodes). Pinned by
 * shipping-region.test.ts.
 *
 * Only *delivery* addresses are held to it. A customer's own (billing) address
 * may be anywhere — an overseas visitor can still buy in store or collect.
 */

export const SHIPPING_COUNTRY = "Australia";
export const SHIPPING_ONLY_MESSAGE = "We only deliver within Australia. Please enter an Australian address.";

export const AU_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"] as const;
export type AuState = (typeof AU_STATES)[number];

const STATE_NAMES: Record<string, AuState> = {
  "new south wales": "NSW", "victoria": "VIC", "queensland": "QLD", "western australia": "WA",
  "south australia": "SA", "tasmania": "TAS", "australian capital territory": "ACT", "northern territory": "NT",
};

/** "nsw", "N.S.W." or "New South Wales" → "NSW"; anything else → null. */
export function auState(input: string | null | undefined): AuState | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  const code = raw.replace(/\./g, "").toUpperCase();
  if ((AU_STATES as readonly string[]).includes(code)) return code as AuState;
  return STATE_NAMES[raw.toLowerCase().replace(/\s+/g, " ")] ?? null;
}

/** Blank, "Australia", "AU" or "AUS" (any case) all mean Australia. */
export function isAustralia(country: string | null | undefined): boolean {
  const c = (country ?? "").trim().toLowerCase().replace(/\./g, "");
  return c === "" || c === "australia" || c === "au" || c === "aus";
}

export const isAuPostcode = (p: string | null | undefined) => /^\d{4}$/.test((p ?? "").trim());

export interface DeliveryAddress { street?: string | null; city?: string | null; state?: string | null; postcode?: string | null; country?: string | null }

const blank = (a: DeliveryAddress) => ![a.street, a.city, a.state, a.postcode].some((v) => (v ?? "").trim());

/**
 * Check a delivery address. An empty one (click & collect, or none given) is
 * fine. Otherwise it must be in Australia, with a real state and a 4-digit
 * postcode; on success the state comes back as its code and the country as
 * "Australia", so what is stored is uniform.
 */
export function checkDeliveryAddress(a: DeliveryAddress):
  | { ok: true; empty: boolean; state: AuState | null; country: string | null }
  | { ok: false; error: string } {
  if (blank(a)) return { ok: true, empty: true, state: null, country: null };
  if (!isAustralia(a.country)) return { ok: false, error: SHIPPING_ONLY_MESSAGE };
  const state = auState(a.state);
  if (!state) return { ok: false, error: "Please choose an Australian state or territory for the delivery address." };
  if (!isAuPostcode(a.postcode)) return { ok: false, error: "Please enter a 4-digit Australian postcode for the delivery address." };
  return { ok: true, empty: false, state, country: SHIPPING_COUNTRY };
}
