import { Router, type IRouter } from "express";
import { db, staffLinksTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/requireAuth";

const PatchStaffLink = z.object({
  label: z.string(), url: z.string(), category: z.string(),
}).partial();

const router: IRouter = Router();

router.get("/staff-links", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(staffLinksTable).where(eq(staffLinksTable.merchantId, merchantId));
  res.json({ items, total: items.length });
});

router.post("/staff-links", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { linkId, label, url, category = "general" } = req.body;
  if (!linkId || !label || !url) { res.status(400).json({ error: "linkId, label, and url are required" }); return; }
  const [row] = await db.insert(staffLinksTable).values({
    merchantId, linkId, label, url, category,
  }).returning();
  res.status(201).json(row);
});

router.patch("/staff-links/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  const parsed = PatchStaffLink.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(staffLinksTable)
    .set(parsed.data)
    .where(and(eq(staffLinksTable.id, id), eq(staffLinksTable.merchantId, merchantId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/staff-links/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  await db.delete(staffLinksTable)
    .where(and(eq(staffLinksTable.id, id), eq(staffLinksTable.merchantId, merchantId)));
  res.status(204).end();
});

export default router;
