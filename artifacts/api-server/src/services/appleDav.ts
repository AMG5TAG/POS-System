/**
 * appleDav — CalDAV/CardDAV transport for pushing KoaPOS appointments and
 * customers to an Apple/iCloud account.
 *
 * Apple has NO OAuth REST API for iCloud Contacts/Calendar, so this uses the
 * standard CalDAV/CardDAV protocols against *.icloud.com, authenticated with the
 * merchant's Apple ID + an app-specific password (generated at appleid.apple.com;
 * requires 2FA). We use `tsdav` for the awkward part — principal/home-set
 * discovery — then do plain unconditional PUTs to a deterministic per-item object
 * URL so re-syncing overwrites the same object (idempotent, no etag dance).
 */
import { DAVClient } from "tsdav";

export interface AppleCreds {
  appleId: string;
  appPassword: string;
}

const CALDAV_URL = "https://caldav.icloud.com";
const CARDDAV_URL = "https://contacts.icloud.com";

function basicAuth(creds: AppleCreds): string {
  return "Basic " + Buffer.from(`${creds.appleId}:${creds.appPassword}`).toString("base64");
}

async function davLogin(creds: AppleCreds, accountType: "caldav" | "carddav"): Promise<DAVClient> {
  const client = new DAVClient({
    serverUrl: accountType === "caldav" ? CALDAV_URL : CARDDAV_URL,
    credentials: { username: creds.appleId, password: creds.appPassword },
    authMethod: "Basic",
    defaultAccountType: accountType,
  });
  await client.login();
  return client;
}

function joinUrl(base: string, filename: string): string {
  return base.endsWith("/") ? base + filename : `${base}/${filename}`;
}

/** Turn a low-level DAV/network error into a merchant-facing message. */
function normalizeAppleError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/40[13]|unauthor|forbidden/i.test(msg)) {
    return "Apple rejected these credentials. Check the Apple ID and that the app-specific password is correct and current (create one at appleid.apple.com → Sign-In & Security → App-Specific Passwords).";
  }
  return "Couldn't reach iCloud with these details. Check the Apple ID and app-specific password, then try again.";
}

/**
 * Validate an Apple ID + app-specific password by logging in to both iCloud
 * CalDAV and CardDAV and confirming at least one calendar and address book
 * exist. Used at connect time so a wrong/expired password fails loudly.
 */
export async function verifyAppleCredentials(appleId: string, appPassword: string): Promise<{ ok: boolean; error?: string }> {
  const creds: AppleCreds = { appleId, appPassword };
  try {
    const cal = await davLogin(creds, "caldav");
    const calendars = await cal.fetchCalendars();
    if (!calendars.length) return { ok: false, error: "No iCloud calendar was found for this Apple ID." };

    const card = await davLogin(creds, "carddav");
    const books = await card.fetchAddressBooks();
    if (!books.length) return { ok: false, error: "No iCloud address book was found for this Apple ID." };

    return { ok: true };
  } catch (err) {
    return { ok: false, error: normalizeAppleError(err) };
  }
}

export interface AppleCalendarConn {
  /** Create-or-overwrite a VEVENT object at a deterministic URL (idempotent). */
  putEvent(filename: string, iCalString: string): Promise<{ href: string }>;
}

/** Open a CalDAV connection and resolve the target calendar collection once. */
export async function openAppleCalendar(creds: AppleCreds): Promise<AppleCalendarConn> {
  const client = await davLogin(creds, "caldav");
  const calendars = await client.fetchCalendars();
  if (!calendars.length) throw new Error("No iCloud calendar available");
  // Prefer a calendar that accepts events; fall back to the first collection.
  const target = calendars.find((c) => !c.components || c.components.includes("VEVENT")) ?? calendars[0];
  const auth = basicAuth(creds);
  return {
    async putEvent(filename, iCalString) {
      const href = joinUrl(String(target.url), filename);
      const r = await fetch(href, {
        method: "PUT",
        headers: { Authorization: auth, "Content-Type": "text/calendar; charset=utf-8" },
        body: iCalString,
      });
      if (!r.ok) throw new Error(`CalDAV PUT failed (${r.status})`);
      return { href };
    },
  };
}

export interface AppleContactsConn {
  /** Create-or-overwrite a vCard object at a deterministic URL (idempotent). */
  putContact(filename: string, vCardString: string): Promise<{ href: string }>;
}

/** Open a CardDAV connection and resolve the target address book once. */
export async function openAppleContacts(creds: AppleCreds): Promise<AppleContactsConn> {
  const client = await davLogin(creds, "carddav");
  const books = await client.fetchAddressBooks();
  if (!books.length) throw new Error("No iCloud address book available");
  const target = books[0];
  const auth = basicAuth(creds);
  return {
    async putContact(filename, vCardString) {
      const href = joinUrl(String(target.url), filename);
      const r = await fetch(href, {
        method: "PUT",
        headers: { Authorization: auth, "Content-Type": "text/vcard; charset=utf-8" },
        body: vCardString,
      });
      if (!r.ok) throw new Error(`CardDAV PUT failed (${r.status})`);
      return { href };
    },
  };
}
