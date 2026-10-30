import { requireManagerOrOwner } from "../middlewares/requireManagerOrOwner";
import { Router, type IRouter } from "express";
import { db, serviceSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { UpdateServiceSettingsBody } from "@workspace/api-zod";

const router: IRouter = Router();

/* Management › Invoices & Services › Services. One row per merchant in
   `service_settings`; `config` may still carry the section toggles of the
   removed Service Options page, which a save keeps untouched. */

export type ServiceCustomNote = { id: string; text: string };

const MAX_NOTES = 100;
const MAX_NOTE_LENGTH = 2000;

/** Trim, drop blanks and duplicate ids, and cap — a stored config may be
 *  partial or hand-edited, so the read path cleans as hard as the write. */
export function cleanCustomNotes(raw: unknown): ServiceCustomNote[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ServiceCustomNote[] = [];
  for (const n of raw) {
    if (!n || typeof n !== "object") continue;
    const id = typeof (n as { id?: unknown }).id === "string" ? (n as { id: string }).id.trim() : "";
    const text = typeof (n as { text?: unknown }).text === "string" ? (n as { text: string }).text.trim() : "";
    if (!id || !text || seen.has(id)) continue;
    seen.add(id);
    out.push({ id: id.slice(0, 64), text: text.slice(0, MAX_NOTE_LENGTH) });
    if (out.length >= MAX_NOTES) break;
  }
  return out;
}

function formatSettings(row: typeof serviceSettingsTable.$inferSelect | undefined) {
  const c = (row?.config ?? {}) as { customNotes?: unknown };
  return { customNotes: cleanCustomNotes(c.customNotes) };
}

router.get("/service-settings", requireAuth, async (req, res): Promise<void> => {
  const [row] = await db
    .select()
    .from(serviceSettingsTable)
    .where(eq(serviceSettingsTable.merchantId, req.session.merchantId!));
  res.json(formatSettings(row));
});

router.put("/service-settings", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const parsed = UpdateServiceSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(serviceSettingsTable)
    .where(eq(serviceSettingsTable.merchantId, req.session.merchantId!));

  const patch: Record<string, unknown> = {};
  if (parsed.data.customNotes !== undefined) patch.customNotes = cleanCustomNotes(parsed.data.customNotes);
  const config = { ...((existing?.config ?? {}) as object), ...patch };

  let row: typeof serviceSettingsTable.$inferSelect;
  if (existing) {
    [row] = await db
      .update(serviceSettingsTable)
      .set({ config })
      .where(eq(serviceSettingsTable.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(serviceSettingsTable)
      .values({ merchantId: req.session.merchantId!, config })
      .returning();
  }

  res.json(formatSettings(row));
});

export default router;
