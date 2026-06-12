import { Router, type IRouter } from "express";
import { db, shortlinksTable, shortlinkSettingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { validateEnding, normalizeEnding, SHORT_DOMAIN } from "@workspace/shortlinks-shared";

const router: IRouter = Router();

// Postgres unique_violation — the (merchant_id, slug) index lost a race.
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
}

router.get("/shortlinks", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(shortlinksTable).where(eq(shortlinksTable.merchantId, merchantId));
  res.json({ items, total: items.length });
});

router.post("/shortlinks", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { linkId, label, longUrl, slug, tags = "" } = req.body as { linkId: string; label: string; longUrl: string; slug: string; baseDomain?: string; tags?: string };
  if (!linkId || !label || !longUrl || !slug) { res.status(400).json({ error: "linkId, label, longUrl, and slug are required" }); return; }
  const slugError = validateEnding(slug, { requireValue: true });
  if (slugError) { res.status(400).json({ error: slugError }); return; }
  const ending = normalizeEnding(slug);
  // Endings are unique per merchant.
  const [taken] = await db.select().from(shortlinksTable).where(and(eq(shortlinksTable.merchantId, merchantId), eq(shortlinksTable.slug, ending))).limit(1);
  if (taken) { res.status(409).json({ error: `"${ending}" is already in use` }); return; }
  try {
    const [row] = await db.insert(shortlinksTable).values({ merchantId, linkId, label, longUrl, slug: ending, baseDomain: SHORT_DOMAIN, tags }).returning();
    res.status(201).json(row);
  } catch (err) {
    if (isUniqueViolation(err)) { res.status(409).json({ error: `"${ending}" is already in use` }); return; }
    throw err;
  }
});

router.get("/shortlinks/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(shortlinksTable).where(and(eq(shortlinksTable.id, id), eq(shortlinksTable.merchantId, merchantId))).limit(1);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.patch("/shortlinks/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { label, longUrl, slug, tags } = req.body as Partial<{ label: string; longUrl: string; slug: string; baseDomain: string; tags: string }>;
  const update: Partial<{ label: string; longUrl: string; slug: string; baseDomain: string; tags: string }> = {};
  if (label !== undefined) update.label = label;
  if (longUrl !== undefined) update.longUrl = longUrl;
  if (slug !== undefined) {
    const slugError = validateEnding(slug, { requireValue: true });
    if (slugError) { res.status(400).json({ error: slugError }); return; }
    const ending = normalizeEnding(slug);
    const [taken] = await db.select().from(shortlinksTable).where(and(eq(shortlinksTable.merchantId, merchantId), eq(shortlinksTable.slug, ending))).limit(1);
    if (taken && taken.id !== id) { res.status(409).json({ error: `"${ending}" is already in use` }); return; }
    update.slug = ending;
  }
  if (tags !== undefined) update.tags = tags;
  try {
    const [row] = await db.update(shortlinksTable).set(update).where(and(eq(shortlinksTable.id, id), eq(shortlinksTable.merchantId, merchantId))).returning();
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    res.json(row);
  } catch (err) {
    if (isUniqueViolation(err)) { res.status(409).json({ error: `"${update.slug}" is already in use` }); return; }
    throw err;
  }
});

router.delete("/shortlinks/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(shortlinksTable).where(and(eq(shortlinksTable.id, id), eq(shortlinksTable.merchantId, merchantId)));
  res.status(204).end();
});

router.get("/shortlink-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(shortlinkSettingsTable).where(eq(shortlinkSettingsTable.merchantId, merchantId)).limit(1);
  if (!row) {
    const [created] = await db.insert(shortlinkSettingsTable).values({ merchantId }).returning();
    res.json(created); return;
  }
  res.json(row);
});

router.put("/shortlink-settings", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { baseDomain, prefix } = req.body;
  const [existing] = await db.select().from(shortlinkSettingsTable).where(eq(shortlinkSettingsTable.merchantId, merchantId)).limit(1);
  if (existing) {
    const [updated] = await db.update(shortlinkSettingsTable).set({ baseDomain, prefix }).where(eq(shortlinkSettingsTable.merchantId, merchantId)).returning();
    res.json(updated); return;
  }
  const [created] = await db.insert(shortlinkSettingsTable).values({ merchantId, baseDomain, prefix }).returning();
  res.json(created);
});

export default router;
