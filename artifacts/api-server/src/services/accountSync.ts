/**
 * accountSync — core logic for pushing KK POS customers/appointments to the
 * connected Apple iCloud account's contacts and calendar (CardDAV / CalDAV).
 * Extracted from the HTTP routes so both the manual sync endpoints AND the
 * background auto-sync scheduler can call the same code.
 *
 * Google and Microsoft account sync were removed; iCloud is the only provider.
 * `SyncProvider` stays a named type so the routes and the scheduler keep
 * validating the provider key they are handed.
 */
import type { Logger } from "pino";
import { db, customersTable, customerNotesTable, customerSettingsTable, appointmentsTable, contactSyncLinksTable, oauthTokenVaultTable } from "@workspace/db";
import { eq, and, desc, gte } from "drizzle-orm";
import { formatAddressParts } from "../lib/address";
import { readCredentialVault } from "./tokenVault";
import { customerToVCard, appleContactUid, type VCardPhoto } from "./vcardGenerator";
import { ObjectStorageService } from "../lib/objectStorage";
import { generateIcs } from "./icsGenerator";
import { openAppleCalendar, openAppleContacts, type AppleCreds } from "./appleDav";

const objectStorage = new ObjectStorageService();

/* A photo bigger than this is left off the contact rather than sent: iCloud
   rejects oversized cards, and uploads are already resized in the browser. */
const MAX_CONTACT_PHOTO_BYTES = 512 * 1024;

/* Read a customer photo — our object storage (/api/storage/objects/...) or an
   external URL. Null on any failure, so a broken photo never breaks the sync. */
async function readPhotoBytes(photoUrl: string): Promise<VCardPhoto | null> {
  try {
    let bytes: Buffer;
    let contentType: string;
    if (/^https?:\/\//i.test(photoUrl)) {
      const r = await fetch(photoUrl);
      if (!r.ok) return null;
      bytes = Buffer.from(await r.arrayBuffer());
      contentType = r.headers.get("content-type") || "image/jpeg";
    } else {
      const objectPath = photoUrl.replace(/^\/api\/storage/, "");
      if (!objectPath.startsWith("/objects/")) return null;
      const file = await objectStorage.getObjectEntityFile(objectPath);
      [bytes] = await file.download();
      const [md] = await file.getMetadata().catch(() => [{ contentType: "image/jpeg" }] as const);
      contentType = (md as { contentType?: string }).contentType || "image/jpeg";
    }
    if (!contentType.startsWith("image/") || bytes.length > MAX_CONTACT_PHOTO_BYTES) return null;
    return { bytes, contentType };
  } catch {
    return null;
  }
}

export type SyncProvider = "apple_icloud";
export type DuplicateStrategy = "overwrite" | "skip";

/** iCloud is reached via CalDAV/CardDAV with an app-specific password, not OAuth. */
export const APPLE_PROVIDER = "apple_icloud" as const;

/** Raised when the target account isn't connected / can't be refreshed (→ 401). */
export class AccountNotConnectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountNotConnectedError";
  }
}

export function isSyncProvider(v: unknown): v is SyncProvider {
  return v === "apple_icloud";
}

/** Human-readable account names — used wherever a provider key would otherwise
 *  leak into user-facing copy (auto-sync failures, the Sync screen's hints). */
export const SYNC_PROVIDER_LABELS: Record<SyncProvider, string> = {
  apple_icloud:       "Apple iCloud",
};

export const syncProviderLabel = (provider: string): string =>
  isSyncProvider(provider) ? SYNC_PROVIDER_LABELS[provider] : provider;

/**
 * True when the merchant currently has this sync account connected. Apple's
 * app-specific password lives in the OAuth vault, so a live connection is a
 * vault row that has been connected and not since invalidated — the same test
 * GET /integrations uses to render the account as "connected".
 */
export async function isAccountConnected(merchantId: number, provider: SyncProvider): Promise<boolean> {
  const [row] = await db
    .select({ connectedAt: oauthTokenVaultTable.connectedAt, disconnectedReason: oauthTokenVaultTable.disconnectedReason })
    .from(oauthTokenVaultTable)
    .where(and(eq(oauthTokenVaultTable.merchantId, merchantId), eq(oauthTokenVaultTable.provider, provider)));
  return Boolean(row?.connectedAt && !row.disconnectedReason);
}

/* ── Contacts ──────────────────────────────────────────────────────────────── */

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

/** Build the per-customer CRM-notes text pushed to a contact's notes field.
 *  Shared by the contact sync so notes read the same on every run. */
async function buildCustomerNotes(
  merchantId: number,
  includeNotes: boolean,
  notesConflict: "append" | "overwrite",
): Promise<Map<number, string>> {
  const notesByCustomer = new Map<number, string>();
  if (!includeNotes) return notesByCustomer;
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
      if (existing === "") notesByCustomer.set(note.customerId, `[KK POS Notes]\n• ${date}: ${note.note}`.slice(0, MAX_NOTE_CHARS));
    } else {
      const line = `• ${date}: ${note.note}`;
      const next = existing === "" ? `[KK POS Notes]\n${line}` : `${existing}\n${line}`;
      notesByCustomer.set(note.customerId, next.slice(0, MAX_NOTE_CHARS));
    }
  }
  return notesByCustomer;
}

/** Push the merchant's customers to the connected iCloud contacts. */
export async function syncContacts(
  merchantId: number,
  _provider: SyncProvider,
  opts: ContactSyncOptions,
  logger: Logger,
): Promise<ContactSyncResult> {
  return syncAppleContacts(merchantId, opts, logger);
}

/* ── Calendar ──────────────────────────────────────────────────────────────── */

export interface CalendarSyncResult {
  synced: number;
  failed: number;
  total: number;
}

/** Push the merchant's upcoming appointments to the connected iCloud calendar. */
export async function syncCalendar(
  merchantId: number,
  _provider: SyncProvider,
  logger: Logger,
): Promise<CalendarSyncResult> {
  return syncAppleCalendar(merchantId, logger);
}

/* ── Apple / iCloud (CalDAV + CardDAV) ───────────────────────────────────────
   Apple has no OAuth REST API for iCloud data, so contacts/calendar are pushed
   over CardDAV/CalDAV using the merchant's Apple ID + app-specific password
   (stored via upsertCredentialVault under provider "apple_icloud"). Objects are
   PUT at a deterministic URL so re-syncing overwrites rather than duplicates. */

/** Read and validate the stored Apple credentials, or raise not-connected. */
async function requireAppleCreds(merchantId: number): Promise<AppleCreds> {
  const creds = await readCredentialVault<AppleCreds>(merchantId, APPLE_PROVIDER);
  if (!creds?.appleId || !creds?.appPassword) {
    throw new AccountNotConnectedError("Apple iCloud account isn't connected. Reconnect it on the Sync page and try again.");
  }
  return creds;
}

async function syncAppleContacts(merchantId: number, opts: ContactSyncOptions, logger: Logger): Promise<ContactSyncResult> {
  const includeNotes  = opts.includeNotes ?? false;
  const notesConflict = opts.notesConflict ?? "append";
  const creds = await requireAppleCreds(merchantId);

  const customers = await db.select().from(customersTable).where(eq(customersTable.merchantId, merchantId));
  if (customers.length === 0) return { ...EMPTY_CONTACT_RESULT };

  const notesByCustomer = await buildCustomerNotes(merchantId, includeNotes, notesConflict);

  // Prior links tell us whether a customer's card already exists (→ "updated").
  const links = await db
    .select()
    .from(contactSyncLinksTable)
    .where(and(eq(contactSyncLinksTable.merchantId, merchantId), eq(contactSyncLinksTable.provider, APPLE_PROVIDER)));
  const linkedCustomerIds = new Set(links.map((l) => l.customerId));

  const book = await openAppleContacts(creds);

  /* Each contact carries the customer's own photo, else the merchant's default
     customer image — the same fallback the app shows. Loaded once per URL. */
  const [settings] = await db
    .select({ defaultImage: customerSettingsTable.defaultCustomerImageUrl })
    .from(customerSettingsTable)
    .where(eq(customerSettingsTable.merchantId, merchantId));
  const defaultImage = settings?.defaultImage?.trim() ?? "";
  const photos = new Map<string, Promise<VCardPhoto | null>>();
  const photoFor = (url: string) => {
    if (!photos.has(url)) photos.set(url, readPhotoBytes(url));
    return photos.get(url)!;
  };

  let created = 0, updated = 0, failed = 0, notesSynced = 0;
  for (const c of customers) {
    const noteText = includeNotes ? (notesByCustomer.get(c.id) ?? "") : "";
    const photoUrl = c.photoUrl?.trim() || defaultImage;
    const vcard = customerToVCard(c, noteText, photoUrl ? await photoFor(photoUrl) : null);
    try {
      const { href } = await book.putContact(`${appleContactUid(c.id)}.vcf`, vcard);
      if (linkedCustomerIds.has(c.id)) updated++; else created++;
      if (includeNotes && noteText) notesSynced++;
      await db
        .insert(contactSyncLinksTable)
        .values({ merchantId, customerId: c.id, provider: APPLE_PROVIDER, remoteContactId: href, remoteEtag: null, lastSyncedAt: new Date() })
        .onConflictDoUpdate({
          target: [contactSyncLinksTable.merchantId, contactSyncLinksTable.customerId, contactSyncLinksTable.provider],
          set: { remoteContactId: href, lastSyncedAt: new Date() },
        });
    } catch (err) {
      logger.warn({ merchantId, provider: APPLE_PROVIDER, err, customerId: c.id }, "Apple contact push failed");
      failed++;
    }
  }

  return { needsConfirmation: false, duplicates: 0, total: customers.length, created, updated, skipped: 0, failed, notesSynced };
}

async function syncAppleCalendar(merchantId: number, logger: Logger): Promise<CalendarSyncResult> {
  const creds = await requireAppleCreds(merchantId);

  const now = new Date();
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

  const cal = await openAppleCalendar(creds);

  let synced = 0, failed = 0;
  for (const row of appointments) {
    const a = row.appt;
    const start = new Date(a.scheduledAt);
    const end   = new Date(start.getTime() + (a.durationMinutes ?? 30) * 60_000);
    const location = (row.custAddress ?? "").trim()
      || formatAddressParts(row.custBillingStreet, row.custBillingCity, row.custBillingState, row.custBillingPostcode);
    const baseNotes = a.description ?? a.notes ?? "";
    const mobile    = (row.custPhone ?? "").trim();
    const notes     = mobile ? `${baseNotes ? `${baseNotes}\n\n` : ""}Mobile: ${mobile}` : baseNotes;
    const uid = `koapos-appt-${a.id}`;
    // CalDAV objects must not carry a METHOD (that marks an iTIP message).
    const ics = generateIcs({ uid, summary: a.title, description: notes, location, startAt: start, endAt: end, method: null }).toString("utf-8");
    try {
      await cal.putEvent(`${uid}.ics`, ics);
      synced++;
    } catch (err) {
      logger.warn({ merchantId, provider: APPLE_PROVIDER, err, appointmentId: a.id }, "Apple calendar push failed");
      failed++;
    }
  }

  return { synced, failed, total: appointments.length };
}
