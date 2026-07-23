/**
 * autoSyncScheduler — drives automatic syncing of customers → account contacts
 * and appointments → account calendar.
 *
 *  - Polling frequencies ("8h" | "24h" | "monthly") run on an hourly tick once
 *    the interval has elapsed since the last run (mirrors backupScheduler).
 *  - "instant" is event-driven: callers invoke triggerInstantSync() after a
 *    customer/appointment write; runs are debounced to coalesce bursts.
 *
 * Automatic contact syncs always overwrite existing contacts (no interactive
 * duplicate prompt is possible in the background).
 */
import type { Logger } from "pino";
import { trackedInterval } from "../lib/shutdown";
import { db, merchantAutoSyncSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { syncContacts, syncCalendar, isSyncProvider, AccountNotConnectedError, type SyncProvider } from "./accountSync";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const POLL_INTERVAL_MS: Record<string, number> = {
  "8h": 8 * HOUR,
  "24h": 24 * HOUR,
  monthly: 30 * DAY,
};
const INSTANT_DEBOUNCE_MS = 30 * 1000;

export type SyncKind = "contacts" | "calendar";

let schedulerLogger: Logger | null = null;

function isPollDue(frequency: string, lastSyncAt: Date | null): boolean {
  const interval = POLL_INTERVAL_MS[frequency];
  if (!interval) return false; // "disabled" / "instant" are not polled
  if (!lastSyncAt) return true;
  return Date.now() - lastSyncAt.getTime() >= interval;
}

/** Persist a failure for the merchant's automatic sync so the Sync screen can
 *  surface it. A subsequent success clears it (see runSync). */
async function recordSyncFailure(merchantId: number, kind: SyncKind, message: string): Promise<void> {
  const patch = kind === "contacts"
    ? { contactsLastError: message, contactsLastErrorAt: new Date() }
    : { calendarLastError: message, calendarLastErrorAt: new Date() };
  await db.update(merchantAutoSyncSettingsTable).set(patch).where(eq(merchantAutoSyncSettingsTable.merchantId, merchantId));
}

/** Run one sync for a merchant + kind, then stamp the last-sync timestamp and
 *  clear any prior failure. On error, record the failure for the Sync screen. */
async function runSync(merchantId: number, kind: SyncKind, provider: SyncProvider, includeNotes: boolean, logger: Logger): Promise<void> {
  try {
    if (kind === "contacts") {
      const r = await syncContacts(merchantId, provider, { includeNotes, duplicateStrategy: "overwrite" }, logger);
      logger.info({ merchantId, provider, created: r.created, updated: r.updated, failed: r.failed }, "Auto contacts sync complete");
      await db.update(merchantAutoSyncSettingsTable).set({ contactsLastSyncAt: new Date(), contactsLastError: null, contactsLastErrorAt: null }).where(eq(merchantAutoSyncSettingsTable.merchantId, merchantId));
    } else {
      const r = await syncCalendar(merchantId, provider, logger);
      logger.info({ merchantId, provider, synced: r.synced, failed: r.failed }, "Auto calendar sync complete");
      await db.update(merchantAutoSyncSettingsTable).set({ calendarLastSyncAt: new Date(), calendarLastError: null, calendarLastErrorAt: null }).where(eq(merchantAutoSyncSettingsTable.merchantId, merchantId));
    }
  } catch (err) {
    if (err instanceof AccountNotConnectedError) {
      logger.warn({ merchantId, kind, provider }, "Auto sync skipped — account not connected");
      await recordSyncFailure(merchantId, kind, "Account disconnected — reconnect the account to resume automatic sync.");
      return;
    }
    logger.error({ merchantId, kind, provider, err }, "Auto sync failed");
    const message = err instanceof Error && err.message ? err.message : "The automatic sync failed. It will retry on the next run.";
    await recordSyncFailure(merchantId, kind, message).catch((e) => logger.error({ merchantId, kind, e }, "Failed to record auto sync failure"));
  }
}

/* ── Polling tick (8h / 24h / monthly) ───────────────────────────────────────── */

async function runDuePolls(logger: Logger): Promise<void> {
  const rows = await db.select().from(merchantAutoSyncSettingsTable);
  for (const row of rows) {
    if (POLL_INTERVAL_MS[row.contactsFrequency] && isSyncProvider(row.contactsProvider) && isPollDue(row.contactsFrequency, row.contactsLastSyncAt)) {
      await runSync(row.merchantId, "contacts", row.contactsProvider, row.contactsIncludeNotes, logger);
    }
    if (POLL_INTERVAL_MS[row.calendarFrequency] && isSyncProvider(row.calendarProvider) && isPollDue(row.calendarFrequency, row.calendarLastSyncAt)) {
      await runSync(row.merchantId, "calendar", row.calendarProvider, false, logger);
    }
  }
}

/* ── Instant (event-driven, debounced) ───────────────────────────────────────── */

const debounceTimers = new Map<string, NodeJS.Timeout>();
const running = new Set<string>();
const rerunRequested = new Set<string>();

/**
 * Request an instant sync after a customer (contacts) or appointment (calendar)
 * write. No-op unless the merchant has that kind set to "instant". Debounced and
 * serialised per merchant+kind so a burst of edits produces a single sync.
 */
export function triggerInstantSync(merchantId: number, kind: SyncKind): void {
  const logger = schedulerLogger;
  if (!logger) return; // scheduler not booted yet
  const key = `${merchantId}:${kind}`;

  const existing = debounceTimers.get(key);
  if (existing) clearTimeout(existing);

  debounceTimers.set(key, setTimeout(() => {
    debounceTimers.delete(key);
    void fireInstant(merchantId, kind, key, logger);
  }, INSTANT_DEBOUNCE_MS));
}

async function fireInstant(merchantId: number, kind: SyncKind, key: string, logger: Logger): Promise<void> {
  // Serialise per key; if one is already running, mark for a re-run afterwards.
  if (running.has(key)) { rerunRequested.add(key); return; }
  running.add(key);
  try {
    const [row] = await db.select().from(merchantAutoSyncSettingsTable).where(eq(merchantAutoSyncSettingsTable.merchantId, merchantId));
    if (!row) return;
    const frequency = kind === "contacts" ? row.contactsFrequency : row.calendarFrequency;
    const provider  = kind === "contacts" ? row.contactsProvider : row.calendarProvider;
    if (frequency !== "instant" || !isSyncProvider(provider)) return;
    await runSync(merchantId, kind, provider, kind === "contacts" ? row.contactsIncludeNotes : false, logger);
  } finally {
    running.delete(key);
    if (rerunRequested.delete(key)) triggerInstantSync(merchantId, kind);
  }
}

/* ── Bootstrap ───────────────────────────────────────────────────────────────── */

export function scheduleAutoSync(logger: Logger): void {
  schedulerLogger = logger;
  runDuePolls(logger).catch((err) => logger.error({ err }, "Auto sync scheduler startup run error"));
  trackedInterval(
    () => runDuePolls(logger).catch((err) => logger.error({ err }, "Auto sync scheduler run error")),
    HOUR,
  );
  logger.info("Auto sync scheduler started (hourly poll + instant triggers)");
}
