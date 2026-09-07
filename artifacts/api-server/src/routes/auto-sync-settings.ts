import { Router, type IRouter } from "express";
import { db, merchantAutoSyncSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { isSyncProvider, isAccountConnected, syncProviderLabel } from "../services/accountSync";

const router: IRouter = Router();
router.use(requireAuth);

/** Allowed automatic-sync frequencies. "instant" is event-driven; the rest poll. */
const FREQUENCIES = new Set(["disabled", "instant", "8h", "24h", "monthly"]);

type SyncTypeSettings = { provider: string; frequency: string; lastSyncAt: string | null; lastError: string | null; lastErrorAt: string | null };

function toResponse(row: typeof merchantAutoSyncSettingsTable.$inferSelect | undefined) {
  return {
    contacts: {
      provider: row?.contactsProvider ?? "",
      frequency: row?.contactsFrequency ?? "disabled",
      includeNotes: row?.contactsIncludeNotes ?? false,
      lastSyncAt: row?.contactsLastSyncAt?.toISOString() ?? null,
      lastError: row?.contactsLastError ?? null,
      lastErrorAt: row?.contactsLastErrorAt?.toISOString() ?? null,
    },
    calendar: {
      provider: row?.calendarProvider ?? "",
      frequency: row?.calendarFrequency ?? "disabled",
      lastSyncAt: row?.calendarLastSyncAt?.toISOString() ?? null,
      lastError: row?.calendarLastError ?? null,
      lastErrorAt: row?.calendarLastErrorAt?.toISOString() ?? null,
    },
  };
}

/* ── GET /integrations/auto-sync ──────────────────────────────────────────────
   Returns the merchant's automatic sync schedule for contacts and calendar. */
router.get("/integrations/auto-sync", async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db
    .select()
    .from(merchantAutoSyncSettingsTable)
    .where(eq(merchantAutoSyncSettingsTable.merchantId, merchantId));
  res.json({ ...toResponse(row), frequencies: [...FREQUENCIES] });
});

/* ── PUT /integrations/auto-sync ──────────────────────────────────────────────
   Saves the schedule. A non-"disabled" frequency requires a valid provider. */
router.put("/integrations/auto-sync", async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const body = (req.body ?? {}) as {
    contacts?: { provider?: string; frequency?: string; includeNotes?: boolean };
    calendar?: { provider?: string; frequency?: string };
  };

  const contactsFrequency = (body.contacts?.frequency ?? "disabled").trim();
  const contactsProvider  = (body.contacts?.provider ?? "").trim();
  const contactsIncludeNotes = Boolean(body.contacts?.includeNotes);
  const calendarFrequency = (body.calendar?.frequency ?? "disabled").trim();
  const calendarProvider  = (body.calendar?.provider ?? "").trim();

  for (const [label, freq, provider] of [
    ["contacts", contactsFrequency, contactsProvider] as const,
    ["calendar", calendarFrequency, calendarProvider] as const,
  ]) {
    if (!FREQUENCIES.has(freq)) {
      res.status(400).json({ error: `${label} frequency must be one of: ${[...FREQUENCIES].join(", ")}` });
      return;
    }
    if (freq !== "disabled" && !isSyncProvider(provider)) {
      res.status(400).json({ error: `${label} sync requires a connected account (Google, Microsoft or Apple iCloud)` });
      return;
    }
    // The target account must still be connected. Without this a merchant who
    // switched providers could keep a stale target saved, and every automatic
    // run would fail against an account that no longer exists.
    if (freq !== "disabled" && isSyncProvider(provider) && !(await isAccountConnected(merchantId, provider))) {
      res.status(400).json({ error: `${syncProviderLabel(provider)} isn't connected. Connect it above, or choose a connected account for ${label} sync.` });
      return;
    }
  }

  // Saving a schedule clears the previous failure for that kind: the failure
  // described the *old* target, so leaving it would keep alarming the merchant
  // about a setting they just changed. The next run records a fresh one if it
  // still fails.
  const values = {
    contactsProvider, contactsFrequency, contactsIncludeNotes,
    contactsLastError: null, contactsLastErrorAt: null,
    calendarProvider, calendarFrequency,
    calendarLastError: null, calendarLastErrorAt: null,
    updatedAt: new Date(),
  };

  const [existing] = await db
    .select({ id: merchantAutoSyncSettingsTable.id })
    .from(merchantAutoSyncSettingsTable)
    .where(eq(merchantAutoSyncSettingsTable.merchantId, merchantId));

  if (existing) {
    await db.update(merchantAutoSyncSettingsTable).set(values).where(eq(merchantAutoSyncSettingsTable.merchantId, merchantId));
  } else {
    await db.insert(merchantAutoSyncSettingsTable).values({ merchantId, ...values });
  }

  const [row] = await db
    .select()
    .from(merchantAutoSyncSettingsTable)
    .where(eq(merchantAutoSyncSettingsTable.merchantId, merchantId));
  res.json({ ok: true, ...toResponse(row) });
});

export type { SyncTypeSettings };
export default router;
