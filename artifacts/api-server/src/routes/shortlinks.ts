import { Router, type IRouter } from "express";
import { db, shortlinksTable, shortlinkSettingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/shortlinks", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(shortlinksTable).where(eq(shortlinksTable.merchantId, merchantId));
  res.json({ items, total: items.length });
});

router.post("/shortlinks", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { linkId, label, longUrl, slug, baseDomain = "", tags = "" } = req.body as { linkId: string; label: string; longUrl: string; slug: string; baseDomain?: string; tags?: string };
  if (!linkId || !label || !longUrl || !slug) { res.status(400).json({ error: "linkId, label, longUrl, and slug are required" }); return; }
  const [row] = await db.insert(shortlinksTable).values({ merchantId, linkId, label, longUrl, slug, baseDomain, tags }).returning();
  res.status(201).json(row);
});

router.delete("/shortlinks/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
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
