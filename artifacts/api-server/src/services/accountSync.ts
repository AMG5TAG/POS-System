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
import { db, customersTable, customerNotesTable, appointmentsTable, contactSyncLinksTable } from "@workspace/db";
import { eq, and, desc, gte } from "drizzle-orm";
import { formatAddressParts } from "../lib/address";
import { getValidMicrosoftToken, MicrosoftNotConnectedError } from "./microsoftToken";
import { getValidGoogleToken, GoogleNotConnectedError } from "./googleToken";
import { ObjectStorageService } from "../lib/objectStorage";

const MS_CONTACTS_SCOPE = "Contacts.ReadWrite Calendars.ReadWrite offline_access";

const objectStorage = new ObjectStorageService();

/* Read a customer's profile picture and return raw bytes + content type, whether
   it lives in our object storage (/api/storage/objects/...) or at an external URL.
   Returns null on any failure so a missing/broken photo never breaks the sync. */
async function readPhotoBytes(photoUrl: string): Promise<{ buf: Buffer; contentType: string } | null> {
  try {
    if (/^https?:\/\//i.test(photoUrl)) {
      const r = await fetch(photoUrl);
      if (!r.ok) return null;
      return { buf: Buffer.from(await r.arrayBuffer()), contentType: r.headers.get("content-type") || "image/jpeg" };
    }
    const objectPath = photoUrl.replace(/^\/api\/storage/, "");
    if (!objectPath.startsWith("/objects/")) return null;
    const file = await objectStorage.getObjectEntityFile(objectPath);
    const [buf] = await file.download();
    const [md] = await file.getMetadata().catch(() => [{ contentType: "image/jpeg" }] as const);
    return { buf, contentType: (md as { contentType?: string }).contentType || "image/jpeg" };
  } catch {
    return null;
  }
}

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

/** A contact on the remote provider. `key` is its stable id (MS id / Google resourceName). */
type ContactRef = { id?: string; resourceName?: string; etag?: string };

/**
 * Snapshot of the remote address book, indexed two ways:
 *  - `byEmail`: lowercased email → ref (used to adopt contacts we never created).
 *  - `byId`:    stable remote id → ref (used to resolve a stored sync link and,
 *               for Google, pick up the *current* etag needed to update).
 */
type RemoteIndex = { byEmail: Map<string, ContactRef>; byId: Map<string, ContactRef> };

/** The stable remote id for a ref: Microsoft contact id, or Google resourceName. */
const refKey = (ref: ContactRef): string | undefined => ref.id ?? ref.resourceName;

/** List & index every existing Microsoft contact (by email and by id). */
async function fetchMicrosoftContactIndex(accessToken: string): Promise<RemoteIndex> {
  const byEmail = new Map<string, ContactRef>();
  const byId = new Map<string, ContactRef>();
  let url: string | null = "https://graph.microsoft.com/v1.0/me/contacts?$select=id,emailAddresses&$top=100";
  for (let page = 0; url && page < 100; page++) {
    const r: Response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!r.ok) throw new Error(`Microsoft contacts list failed (${r.status})`);
    const d = await r.json() as { value?: Array<{ id?: string; emailAddresses?: Array<{ address?: string }> }>; "@odata.nextLink"?: string };
    for (const ct of d.value ?? []) {
      if (!ct.id) continue;
      const ref: ContactRef = { id: ct.id };
      byId.set(ct.id, ref);
      for (const e of ct.emailAddresses ?? []) {
        const key = e.address?.trim().toLowerCase();
        if (key && !byEmail.has(key)) byEmail.set(key, ref);
      }
    }
    const next = d["@odata.nextLink"] ?? null;
    // Only follow pagination links that stay on Microsoft Graph — never let a
    // response redirect our Bearer token to an arbitrary host (SSRF / token leak).
    url = next && next.startsWith("https://graph.microsoft.com/") ? next : null;
  }
  return { byEmail, byId };
}

/** List & index every existing Google contact (by email and by resourceName). */
async function fetchGoogleContactIndex(accessToken: string): Promise<RemoteIndex> {
  const byEmail = new Map<string, ContactRef>();
  const byId = new Map<string, ContactRef>();
  let pageToken: string | undefined;
  for (let page = 0; page < 100; page++) {
    const params = new URLSearchParams({ personFields: "emailAddresses", pageSize: "1000" });
    if (pageToken) params.set("pageToken", pageToken);
    const r = await fetch(`https://people.googleapis.com/v1/people/me/connections?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!r.ok) throw new Error(`Google contacts list failed (${r.status})`);
    const d = await r.json() as { connections?: Array<{ resourceName?: string; etag?: string; emailAddresses?: Array<{ value?: string }> }>; nextPageToken?: string };
    for (const ct of d.connections ?? []) {
      if (!ct.resourceName || !ct.etag) continue;
      const ref: ContactRef = { resourceName: ct.resourceName, etag: ct.etag };
      byId.set(ct.resourceName, ref);
      for (const e of ct.emailAddresses ?? []) {
        const key = e.value?.trim().toLowerCase();
        if (key && !byEmail.has(key)) byEmail.set(key, ref);
      }
    }
    pageToken = d.nextPageToken;
    if (!pageToken) break;
  }
  return { byEmail, byId };
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

  // Snapshot the remote address book (indexed by email and by remote id).
  const existingIndex = provider === "microsoft_contacts"
    ? await fetchMicrosoftContactIndex(accessToken)
    : await fetchGoogleContactIndex(accessToken);

  // Load the persisted customer → remote-contact links for this provider. These
  // are what make this a *true* sync: a customer we've pushed before is updated
  // by id, never re-created — even if their email is blank or has changed.
  const links = await db
    .select()
    .from(contactSyncLinksTable)
    .where(and(eq(contactSyncLinksTable.merchantId, merchantId), eq(contactSyncLinksTable.provider, provider)));
  const linkByCustomer = new Map<number, typeof contactSyncLinksTable.$inferSelect>();
  for (const l of links) linkByCustomer.set(l.customerId, l);

  const emailKey = (c: Customer) => (c.email ?? "").trim().toLowerCase();

  // Classify each customer against its stored link and the remote snapshot:
  //  - linked:  we created/own this contact already → update it in place.
  //  - matched: exists remotely by email but we never linked it (the user's own
  //             contact) → ambiguous, so confirm before overwriting.
  //  - fresh:   no link and no remote match → create it.
  type Plan = { c: Customer; ref?: ContactRef };
  const linked: Plan[] = [];
  const matched: Plan[] = [];
  const fresh: Plan[] = [];
  for (const c of customers) {
    const link = linkByCustomer.get(c.id);
    const linkedRef = link ? existingIndex.byId.get(link.remoteContactId) : undefined;
    if (linkedRef) { linked.push({ c, ref: linkedRef }); continue; }
    const k = emailKey(c);
    const emailRef = k ? existingIndex.byEmail.get(k) : undefined;
    if (emailRef) { matched.push({ c, ref: emailRef }); continue; }
    fresh.push({ c });
  }

  // Only *unlinked* remote matches are ambiguous; previously-synced contacts are
  // updated silently and never trigger the duplicate prompt.
  if (matched.length > 0 && duplicateStrategy == null) {
    return { ...EMPTY_CONTACT_RESULT, needsConfirmation: true, duplicates: matched.length, total: customers.length };
  }

  let created = 0, updated = 0, skipped = 0, failed = 0, notesSynced = 0;
  const notesFor = (c: Customer) => (includeNotes ? (notesByCustomer.get(c.id) ?? "") : "");

  /** Remember (or refresh) the link from a customer to the remote contact we wrote. */
  const upsertLink = async (customerId: number, ref: ContactRef): Promise<void> => {
    const remoteId = refKey(ref);
    if (!remoteId) return;
    await db
      .insert(contactSyncLinksTable)
      .values({ merchantId, customerId, provider, remoteContactId: remoteId, remoteEtag: ref.etag ?? null, lastSyncedAt: new Date() })
      .onConflictDoUpdate({
        target: [contactSyncLinksTable.merchantId, contactSyncLinksTable.customerId, contactSyncLinksTable.provider],
        set: { remoteContactId: remoteId, remoteEtag: ref.etag ?? null, lastSyncedAt: new Date() },
      });
  };

  type WriteResult = { ok: boolean; status: number; ref?: ContactRef };

  const createContact = async (c: Customer, notesText: string): Promise<WriteResult> => {
    if (provider === "google_contacts") {
      const body: Record<string, unknown> = {
        names:          [{ givenName: c.firstName ?? "", familyName: c.lastName ?? "" }],
        emailAddresses: c.email ? [{ value: c.email }] : [],
        phoneNumbers:   c.phone ? [{ value: c.phone, type: "mobile" }] : [],
      };
      if (includeNotes && notesText) body.biographies = [{ value: notesText, contentType: "TEXT_PLAIN" }];
      const r = await fetch("https://people.googleapis.com/v1/people:createContact", {
        method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r.ok) return { ok: false, status: r.status };
      const d = await r.json() as { resourceName?: string; etag?: string };
      return { ok: true, status: r.status, ref: { resourceName: d.resourceName, etag: d.etag } };
    }
    const fullName = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
    const body: Record<string, unknown> = {
      givenName:      c.firstName ?? "",
      surname:        c.lastName  ?? "",
      emailAddresses: c.email ? [{ address: c.email, name: fullName || c.email }] : [],
      mobilePhone:    c.phone || null,
      businessPhones: [],
    };
    if (includeNotes && notesText) body.personalNotes = notesText;
    const r = await fetch("https://graph.microsoft.com/v1.0/me/contacts", {
      method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!r.ok) return { ok: false, status: r.status };
    const d = await r.json() as { id?: string };
    return { ok: true, status: r.status, ref: { id: d.id } };
  };

  const updateContact = async (c: Customer, notesText: string, ref: ContactRef): Promise<WriteResult> => {
    if (provider === "google_contacts") {
      const fields = ["names", "emailAddresses", "phoneNumbers"];
      const body: Record<string, unknown> = {
        etag:           ref.etag,
        names:          [{ givenName: c.firstName ?? "", familyName: c.lastName ?? "" }],
        emailAddresses: c.email ? [{ value: c.email }] : [],
        phoneNumbers:   c.phone ? [{ value: c.phone, type: "mobile" }] : [],
      };
      if (includeNotes && notesText) { body.biographies = [{ value: notesText, contentType: "TEXT_PLAIN" }]; fields.push("biographies"); }
      const r = await fetch(`https://people.googleapis.com/v1/${ref.resourceName}:updateContact?updatePersonFields=${fields.join(",")}`, {
        method: "PATCH", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r.ok) return { ok: false, status: r.status };
      const d = await r.json() as { resourceName?: string; etag?: string };
      return { ok: true, status: r.status, ref: { resourceName: d.resourceName ?? ref.resourceName, etag: d.etag ?? ref.etag } };
    }
    const fullName = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
    const body: Record<string, unknown> = {
      givenName:      c.firstName ?? "",
      surname:        c.lastName  ?? "",
      emailAddresses: c.email ? [{ address: c.email, name: fullName || c.email }] : [],
      mobilePhone:    c.phone || null,
      businessPhones: [],
    };
    if (includeNotes && notesText) body.personalNotes = notesText;
    const r = await fetch(`https://graph.microsoft.com/v1.0/me/contacts/${ref.id}`, {
      method: "PATCH", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, status: r.status, ref: { id: ref.id } };
  };

  /* Push the customer's profile picture to the remote contact's photo. Contact
     photos aren't part of the create/update body, so each provider needs a
     dedicated call. Best-effort — failures are logged, never fatal. */
  const syncPhoto = async (c: Customer, ref: ContactRef): Promise<void> => {
    if (!c.photoUrl) return;
    const photo = await readPhotoBytes(c.photoUrl);
    if (!photo) return;
    try {
      if (provider === "google_contacts") {
        if (!ref.resourceName) return;
        await fetch(`https://people.googleapis.com/v1/${ref.resourceName}:updateContactPhoto`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ photoBytes: photo.buf.toString("base64") }),
        });
      } else {
        if (!ref.id) return;
        await fetch(`https://graph.microsoft.com/v1.0/me/contacts/${ref.id}/photo/$value`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": photo.contentType },
          body: photo.buf,
        });
      }
    } catch (err) {
      logger.warn({ merchantId, provider, err, customerId: c.id }, "Contact photo sync failed");
    }
  };

  // Brand-new customers → create the contact, then remember it so it is never
  // re-created on a later sync.
  for (const { c } of fresh) {
    const notesText = notesFor(c);
    try {
      const r = await createContact(c, notesText);
      if (r.ok) {
        created++;
        if (includeNotes && notesText) notesSynced++;
        if (r.ref) { await upsertLink(c.id, r.ref); await syncPhoto(c, r.ref); }
      } else { logger.warn({ merchantId, provider, status: r.status, email: c.email }, "Contact create failed"); failed++; }
    } catch (err) {
      logger.warn({ merchantId, provider, err, email: c.email }, "Contact create threw");
      failed++;
    }
  }

  // Already-linked contacts → keep them up to date in place.
  for (const { c, ref } of linked) {
    const notesText = notesFor(c);
    try {
      const r = await updateContact(c, notesText, ref!);
      if (r.ok) {
        updated++;
        if (includeNotes && notesText) notesSynced++;
        await upsertLink(c.id, r.ref ?? ref!);
        await syncPhoto(c, r.ref ?? ref!);
      } else { logger.warn({ merchantId, provider, status: r.status, email: c.email }, "Contact update failed"); failed++; }
    } catch (err) {
      logger.warn({ merchantId, provider, err, email: c.email }, "Contact update threw");
      failed++;
    }
  }

  // Remote contacts we just adopted by email: overwrite (and link) or skip.
  if (duplicateStrategy === "overwrite") {
    for (const { c, ref } of matched) {
      const notesText = notesFor(c);
      try {
        const r = await updateContact(c, notesText, ref!);
        if (r.ok) {
          updated++;
          if (includeNotes && notesText) notesSynced++;
          await upsertLink(c.id, r.ref ?? ref!); // link so future syncs are id-based
        } else { logger.warn({ merchantId, provider, status: r.status, email: c.email }, "Contact overwrite failed"); failed++; }
      } catch (err) {
        logger.warn({ merchantId, provider, err, email: c.email }, "Contact overwrite threw");
        failed++;
      }
    }
  } else {
    skipped = matched.length;
  }

  return { needsConfirmation: false, duplicates: matched.length, total: customers.length, created, updated, skipped, failed, notesSynced };
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
  // Join the customer so each event can carry the customer's address (as the
  // event location) and mobile (appended to the notes).
  const appointments = (await db
    .select({ appt: appointmentsTable, custAddress: customersTable.address, custPhone: customersTable.phone,
              custBillingStreet: customersTable.billingStreet, custBillingCity: customersTable.billingCity,
              custBillingState: customersTable.billingState, custBillingPostcode: customersTable.billingPostcode })
    .from(appointmentsTable)
    .leftJoin(customersTable, eq(appointmentsTable.customerId, customersTable.id))
    .where(and(eq(appointmentsTable.merchantId, merchantId), gte(appointmentsTable.scheduledAt, now)))
    .orderBy(appointmentsTable.scheduledAt))
    .filter((r) => r.appt.status !== "cancelled");

  if (appointments.length === 0) return { synced: 0, failed: 0, total: 0 };

  // Microsoft Graph wants a naive ISO timestamp paired with a separate timeZone.
  const toGraphTime = (d: Date) => new Date(d).toISOString().replace(/\.\d{3}Z$/, "");

  let synced = 0;
  let failed = 0;

  for (const row of appointments) {
    const a = row.appt;
    const start = new Date(a.scheduledAt);
    const end   = new Date(start.getTime() + (a.durationMinutes ?? 30) * 60_000);
    // Customer address → event location; customer mobile → appended to notes.
    // Fall back to the structured billing address when the free-text address is blank.
    const location  = (row.custAddress ?? "").trim()
      || formatAddressParts(row.custBillingStreet, row.custBillingCity, row.custBillingState, row.custBillingPostcode);
    const baseNotes = a.description ?? a.notes ?? "";
    const mobile    = (row.custPhone ?? "").trim();
    const notes     = mobile ? `${baseNotes ? `${baseNotes}\n\n` : ""}Mobile: ${mobile}` : baseNotes;
    try {
      if (provider === "microsoft_contacts") {
        const r = await fetch("https://graph.microsoft.com/v1.0/me/events", {
          method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            subject:       a.title,
            body:          { contentType: "text", content: notes },
            ...(location ? { location: { displayName: location } } : {}),
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
            description: notes,
            ...(location ? { location } : {}),
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
