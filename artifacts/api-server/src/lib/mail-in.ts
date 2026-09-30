import crypto from "node:crypto";

/**
 * Mail-in repair rules, kept away from `db` and `req` so they can be pinned by
 * tests (mail-in.test.ts). routes/mail-in.ts does the reading and writing.
 */

export const MAIL_IN_STATUSES = ["awaiting_postage", "in_transit", "received", "cancelled"] as const;
export type MailInStatus = (typeof MAIL_IN_STATUSES)[number];

/** Still on its way to us: the customer may add or correct tracking, staff may cancel. */
export const OPEN_MAIL_IN_STATUSES: ReadonlySet<string> = new Set(["awaiting_postage", "in_transit"]);

/**
 * Carrier ids match the POS's `lib/order-tracking.ts`, so Online › Mail-In can
 * link a consignment to the carrier's tracking page with the same helper
 * Online › Orders uses. The shop has its own copy of the names.
 */
export const MAIL_IN_CARRIERS = ["auspost", "startrack", "couriers", "fastway", "tnt", "dhl", "fedex", "sendle", "other"] as const;

/**
 * Device types a mail-in may be — the same list, in the same order, as the
 * POS's service booking form (DEVICE_TYPES in koapos service-jobs-new.tsx), so
 * the job a received parcel becomes carries a type staff already use.
 * Change both together.
 */
export const SERVICE_DEVICE_TYPES = [
  "AIO", "Desktop", "Laptop", "Tablet", "Smartphone", "Printer", "Network Device",
  "VHS Tape", "DVD", "Cassette Tape", "Game Console", "Pictures", "External Hard Drive", "Other",
] as const;

/** Media sent as a batch rather than one device (MEDIA_DEVICE_TYPES in the POS). */
export const MEDIA_DEVICE_TYPES: readonly string[] = ["VHS Tape", "DVD", "Cassette Tape", "Pictures"];

/** What a customer ticks before submitting. Stored as one timestamp (agreedAt):
 *  the form can't be sent without all of them, so "agreed" means all four.
 *  `{business}` is the business name as saved in Business Details. */
export const MAIL_IN_TERMS = [
  "I have backed up my data. {business} is not responsible for any data lost during diagnosis or repair.",
  "I have removed SIM and memory cards, cases and accessories — anything sent that isn't listed on this form is at my own risk.",
  "My device is my responsibility until it arrives with {business}. I understand registered, tracked post is strongly recommended.",
  "Diagnostics are free. No repair goes ahead until I have approved a quote.",
] as const;

export function mailInTerms(businessName: string): string[] {
  const name = businessName.trim() || "us";
  return MAIL_IN_TERMS.map((t) => t.replaceAll("{business}", name));
}

/** Where a request may be moved by staff. `received` is not here: it is reached
 *  only through "Received", which also creates the service job. */
export function canStaffSetStatus(from: string, to: string): boolean {
  if (from === to) return true;
  if (to === "cancelled") return OPEN_MAIL_IN_STATUSES.has(from);
  if (to === "awaiting_postage" || to === "in_transit") return OPEN_MAIL_IN_STATUSES.has(from) || from === "cancelled";
  return false;
}

/** Status after the customer adds tracking: adding it is what "in transit" means. */
export function statusAfterTracking(from: string): string | null {
  return OPEN_MAIL_IN_STATUSES.has(from) ? "in_transit" : null;
}

/** MI-1001, MI-1002, … — max+1 per merchant; the unique index settles a race. */
export function nextMailInReference(existing: string[], tryIndex = 0): string {
  const max = existing.reduce((m, r) => {
    const n = /^MI-(\d+)$/.exec(r)?.[1];
    return n ? Math.max(m, Number(n)) : m;
  }, 1000);
  return `MI-${max + 1 + tryIndex}`;
}

export function newMailInToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(24).toString("hex");
  return { token, tokenHash: hashMailInToken(token) };
}

export function hashMailInToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export const isMailInToken = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{48}$/.test(v);

/** A tracking number as a carrier prints it: letters, digits, spaces, hyphens. */
export function cleanTrackingNumber(v: string): string | null {
  const n = v.trim().replace(/\s+/g, " ").toUpperCase();
  return /^[A-Z0-9][A-Z0-9 -]{3,39}$/.test(n) ? n : null;
}

/** The service job's device line, e.g. "Phone — iPhone 13 Pro". */
export function jobDeviceDescription(r: { deviceType: string; brandModel: string }): string {
  return `${r.deviceType} — ${r.brandModel}`;
}

/** The return address as one line, for the job's returnAddress. */
export function returnAddressLine(r: { street: string; suburb: string; state: string; postcode: string }): string {
  return `${r.street}, ${r.suburb} ${r.state} ${r.postcode}`;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function time12(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  return `${h % 12 || 12}${m[2] === "00" ? "" : `:${m[2]}`}${h < 12 ? "am" : "pm"}`;
}

/** Business Details stores hours as { Monday: { enabled, open, close }, … }. */
export function formatOpeningHours(raw: unknown): { day: string; hours: string }[] {
  if (!raw || typeof raw !== "object") return [];
  const src = raw as Record<string, unknown>;
  return DAYS.filter((d) => d in src).map((day) => {
    const v = src[day];
    if (typeof v === "string") return { day, hours: v || "Closed" };
    const o = (v ?? {}) as { enabled?: boolean; open?: string; close?: string };
    return { day, hours: o.enabled && o.open && o.close ? `${time12(o.open)} – ${time12(o.close)}` : "Closed" };
  });
}
