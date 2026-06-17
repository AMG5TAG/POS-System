/**
 * accountSync — core logic for pushing KoaPOS customers/appointments to a
 * connected account's contacts and calendar (Google or Microsoft). Extracted
 * from the HTTP routes so both the manual sync endpoints AND the background
 * auto-sync scheduler can call the same code.
 *
 * Token handling: Microsoft and Google access tokens are short-lived, so we
 * always resolve a freshly-refreshed token via the per-provider helpers.
 */
import type { Logger } from "pino";
import { db, customersTable, customerNotesTable, appointmentsTable } from "@workspace/db";
import { eq, and, desc, gte } from "drizzle-orm";
import { getValidMicrosoftToken, MicrosoftNotConnectedError } from "./microsoftToken";
import { getValidGoogleToken, GoogleNotConnectedError } from "./googleToken";

const MS_CONTACTS_SCOPE = "Contacts.ReadWrite Calendars.ReadWrite offline_access";

export type SyncProvider = "google_contacts" | "microsoft_contacts";
export type DuplicateStrategy = "overwrite" | "skip";

/** Raised when the target account isn't connected / can't be refreshed (→ 401). */
export class AccountNotConnectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountNotConnectedError";
  }
}

export function isSyncProvider(v: unknown): v is SyncProvider {
  return v === "google_contacts" || v === "microsoft_contacts";
}

/** Resolve a valid (refreshed) access token, normalising "not connected" errors. */
export async function resolveAccountToken(merchantId: number, provider: SyncProvider): Promise<string> {
  try {
    return provider === "microsoft_contacts"
      ? await getValidMicrosoftToken(merchantId, provider, MS_CONTACTS_SCOPE)
      : await getValidGoogleToken(merchantId, provider);
  } catch (err) {
    if (err instanceof MicrosoftNotConnectedError || err instanceof GoogleNotConnectedError) {
      throw new AccountNotConnectedError(err.message);
    }
    throw err;
  }
}

/* ── Contacts ──────────────────────────────────────────────────────────────── */

/** A matched existing contact on the remote provider, keyed by email. */
type ContactRef = { id?: string; resourceName?: string; etag?: string };

/** Index every existing Microsoft contact by lowercased email → { id }. */
async function fetchMicrosoftContactIndex(accessToken: string): Promise<Map<string, ContactRef>> {
  const index = new Map<string, ContactRef>();
  let url: string | null = "https://graph.microsoft.com/v1.0/me/contacts?$select=id,emailAddresses&$top=100";
  for (let page = 0; url && page < 100; page++) {
    const r: Response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!r.ok) throw new Error(`Microsoft contacts list failed (${r.status})`);
    const d = await r.json() as { value?: Array<{ id?: string; emailAddresses?: Array<{ address?: string }> }>; "@odata.nextLink"?: string };
    for (const ct of d.value ?? []) {
      for (const e of ct.emailAddresses ?? []) {
        const key = e.address?.trim().toLowerCase();
        if (key && ct.id && !index.has(key)) index.set(key, { id: ct.id });
      }
    }
    url = d["@odata.nextLink"] ?? null;
  }
  return index;
}

/** Index every existing Google contact by lowercased email → { resourceName, etag }. */
async function fetchGoogleContactIndex(accessToken: string): Promise<Map<string, ContactRef>> {
  const index = new Map<string, ContactRef>();
  let pageToken: string | undefined;
  for (let page = 0; page < 100; page++) {
    const params = new URLSearchParams({ personFields: "emailAddresses", pageSize: "1000" });
    if (pageToken) params.set("pageToken", pageToken);
    const r = await fetch(`https://people.googleapis.com/v1/people/me/connections?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!r.ok) throw new Error(`Google contacts list failed (${r.status})`);
    const d = await r.json() as { connections?: Array<{ resourceName?: string; etag?: string; emailAddresses?: Array<{ value?: string }> }>; nextPageToken?: string };
    for (const ct of d.connections ?? []) {
      for (const e of ct.emailAddresses ?? []) {
        const key = e.value?.trim().toLowerCase();
        if (key && ct.resourceName && ct.etag && !index.has(key)) index.set(key, { resourceName: ct.resourceName, etag: ct.etag });
      }
    }
    pageToken = d.nextPageToken;
    if (!pageToken) break;
  }
  return index;
}

type Customer = typeof customersTable.$inferSelect;

export interface ContactSyncOptions {
  includeNotes?: boolean;
  notesConflict?: "append" | "overwrite";
  /** Absent → if duplicates exist, return needsConfirmation rather than writing. */
  duplicateStrategy?: DuplicateStrategy;
}

export interface ContactSyncResult {
  needsConfirmation: boolean;
  duplicates: number;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  notesSynced: number;
}

const EMPTY_CONTACT_RESULT: ContactSyncResult = {
  needsConfirmation: false, duplicates: 0, total: 0, created: 0, updated: 0, skipped: 0, failed: 0, notesSynced: 0,
};

/** Push the merchant's customers to the provider's contacts. Resolves its own token. */
export async function syncContacts(
  merchantId: number,
  provider: SyncProvider,
  opts: ContactSyncOptions,
  logger: Logger,
): Promise<ContactSyncResult> {
  const includeNotes  = opts.includeNotes ?? false;
  const notesConflict = opts.notesConflict ?? "append";
  const duplicateStrategy = opts.duplicateStrategy;

  const accessToken = await resolveAccountToken(merchantId, provider);

  const customers = await db.select().from(customersTable).where(eq(customersTable.merchantId, merchantId));
  if (customers.length === 0) return { ...EMPTY_CONTACT_RESULT };

  // Build per-customer notes text when requested.
  const notesByCustomer = new Map<number, string>();
  if (includeNotes) {
    const MAX_NOTE_CHARS = 2000;
    const allNotes = await db
      .select()
      .from(customerNotesTable)
      .where(eq(customerNotesTable.merchantId, merchantId))
      .orderBy(desc(customerNotesTable.createdAt)); // newest first
    for (const note of allNotes) {
      const existing = notesByCustomer.get(note.customerId) ?? "";
      const date = new Date(note.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
      if (notesConflict === "overwrite") {
        if (existing === "") notesByCustomer.set(note.customerId, `[KoaPOS Notes]\n• ${date}: ${note.note}`.slice(0, MAX_NOTE_CHARS));
      } else {
        const line = `• ${date}: ${note.note}`;
        const next = existing === "" ? `[KoaPOS Notes]\n${line}` : `${existing}\n${line}`;
        notesByCustomer.set(note.customerId, next.slice(0, MAX_NOTE_CHARS));
      }
    }
  }

  // Detect existing contacts (by email) so callers can warn before overwriting.
  const existingIndex = provider === "microsoft_contacts"
    ? await fetchMicrosoftContactIndex(accessToken)
    : await fetchGoogleContactIndex(accessToken);

  const emailKey    = (c: Customer) => (c.email ?? "").trim().toLowerCase();
  const isDuplicate = (c: Customer) => { const k = emailKey(c); return k !== "" && existingIndex.has(k); };
  const duplicates  = customers.filter(isDuplicate);
  const fresh       = customers.filter((c) => !isDuplicate(c));

  // First pass with no explicit choice and duplicates present: stop and warn.
  if (duplicates.length > 0 && duplicateStrategy == null) {
    return { ...EMPTY_CONTACT_RESULT, needsConfirmation: true, duplicates: duplicates.length, total: customers.length };
  }

  let created = 0, updated = 0, skipped = 0, failed = 0, notesSynced = 0;
  const notesFor = (c: Customer) => (includeNotes ? (notesByCustomer.get(c.id) ?? "") : "");

  const createContact = (c: Customer, notesText: string): Promise<Response> => {
    if (provider === "google_contacts") {
      const body: Record<string, unknown> = {
        names:          [{ givenName: c.firstName ?? "", familyName: c.lastName ?? "" }],
        emailAddresses: c.email ? [{ value: c.email }] : [],
        phoneNumbers:   c.phone ? [{ value: c.phone }] : [],
      };
      if (includeNotes && notesText) body.biographies = [{ value: notesText, contentType: "TEXT_PLAIN" }];
      return fetch("https://people.googleapis.com/v1/people:createContact", {
        method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
    }
    const fullName = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
    const body: Record<string, unknown> = {
      givenName:      c.firstName ?? "",
      surname:        c.lastName  ?? "",
      emailAddresses: c.email ? [{ address: c.email, name: fullName || c.email }] : [],
      businessPhones: c.phone ? [c.phone] : [],
    };
    if (includeNotes && notesText) body.personalNotes = notesText;
    return fetch("https://graph.microsoft.com/v1.0/me/contacts", {
      method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  };

  const updateContact = (c: Customer, notesText: string, ref: ContactRef): Promise<Response> => {
    if (provider === "google_contacts") {
      const fields = ["names", "emailAddresses", "phoneNumbers"];
      const body: Record<string, unknown> = {
        etag:           ref.etag,
        names:          [{ givenName: c.firstName ?? "", familyName: c.lastName ?? "" }],
        emailAddresses: c.email ? [{ value: c.email }] : [],
        phoneNumbers:   c.phone ? [{ value: c.phone }] : [],
      };
      if (includeNotes && notesText) { body.biographies = [{ value: notesText, contentType: "TEXT_PLAIN" }]; fields.push("biographies"); }
      return fetch(`https://people.googleapis.com/v1/${ref.resourceName}:updateContact?updatePersonFields=${fields.join(",")}`, {
        method: "PATCH", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
    }
    const fullName = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
    const body: Record<string, unknown> = {
      givenName:      c.firstName ?? "",
      surname:        c.lastName  ?? "",
      emailAddresses: c.email ? [{ address: c.email, name: fullName || c.email }] : [],
      businessPhones: c.phone ? [c.phone] : [],
    };
    if (includeNotes && notesText) body.personalNotes = notesText;
    return fetch(`https://graph.microsoft.com/v1.0/me/contacts/${ref.id}`, {
      method: "PATCH", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  };

  for (const c of fresh) {
    const notesText = notesFor(c);
    try {
      const r = await createContact(c, notesText);
      if (r.ok) { created++; if (includeNotes && notesText) notesSynced++; }
      else { logger.warn({ merchantId, provider, status: r.status, email: c.email }, "Contact create failed"); failed++; }
    } catch (err) {
      logger.warn({ merchantId, provider, err, email: c.email }, "Contact create threw");
      failed++;
    }
  }

  if (duplicateStrategy === "overwrite") {
    for (const c of duplicates) {
      const ref = existingIndex.get(emailKey(c))!;
      const notesText = notesFor(c);
      try {
        const r = await updateContact(c, notesText, ref);
        if (r.ok) { updated++; if (includeNotes && notesText) notesSynced++; }
        else { logger.warn({ merchantId, provider, status: r.status, email: c.email }, "Contact overwrite failed"); failed++; }
      } catch (err) {
        logger.warn({ merchantId, provider, err, email: c.email }, "Contact overwrite threw");
        failed++;
      }
    }
  } else {
    skipped = duplicates.length;
  }

  return { needsConfirmation: false, duplicates: duplicates.length, total: customers.length, created, updated, skipped, failed, notesSynced };
}

/* ── Calendar ──────────────────────────────────────────────────────────────── */

export interface CalendarSyncResult {
  synced: number;
  failed: number;
  total: number;
}

/** Push the merchant's upcoming appointments to the provider's calendar. Resolves its own token. */
export async function syncCalendar(
  merchantId: number,
  provider: SyncProvider,
  logger: Logger,
): Promise<CalendarSyncResult> {
  const accessToken = await resolveAccountToken(merchantId, provider);

  const now = new Date();
  const appointments = (await db
    .select()
    .from(appointmentsTable)
    .where(and(eq(appointmentsTable.merchantId, merchantId), gte(appointmentsTable.scheduledAt, now)))
    .orderBy(appointmentsTable.scheduledAt))
    .filter((a) => a.status !== "cancelled");

  if (appointments.length === 0) return { synced: 0, failed: 0, total: 0 };

  // Microsoft Graph wants a naive ISO timestamp paired with a separate timeZone.
  const toGraphTime = (d: Date) => new Date(d).toISOString().replace(/\.\d{3}Z$/, "");

  let synced = 0;
  let failed = 0;

  for (const a of appointments) {
    const start = new Date(a.scheduledAt);
    const end   = new Date(start.getTime() + (a.durationMinutes ?? 30) * 60_000);
    try {
      if (provider === "microsoft_contacts") {
        const r = await fetch("https://graph.microsoft.com/v1.0/me/events", {
          method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            subject:       a.title,
            body:          { contentType: "text", content: a.description ?? a.notes ?? "" },
            start:         { dateTime: toGraphTime(start), timeZone: "UTC" },
            end:           { dateTime: toGraphTime(end),   timeZone: "UTC" },
            transactionId: `koapos-appt-${a.id}`,
          }),
        });
        if (r.ok) synced++;
        else { logger.warn({ merchantId, status: r.status, appointmentId: a.id }, "Microsoft Calendar create failed"); failed++; }
      } else {
        const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
          method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            id:          `koapos${a.id}`,
            summary:     a.title,
            description: a.description ?? a.notes ?? "",
            start:       { dateTime: start.toISOString() },
            end:         { dateTime: end.toISOString() },
          }),
        });
        if (r.ok || r.status === 409) synced++;
        else { logger.warn({ merchantId, status: r.status, appointmentId: a.id }, "Google Calendar create failed"); failed++; }
      }
    } catch (err) {
      logger.warn({ merchantId, err, appointmentId: a.id }, "Calendar event create threw");
      failed++;
    }
  }

  return { synced, failed, total: appointments.length };
}
