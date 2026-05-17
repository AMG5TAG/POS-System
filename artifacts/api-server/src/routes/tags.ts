import { Router, type IRouter } from "express";
import { db, tagsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/tags", requireAuth, async (req, res): Promise<void> => {
  const tags = await db.select().from(tagsTable).where(eq(tagsTable.merchantId, req.session.merchantId!)).orderBy(tagsTable.name);
  res.json({ items: tags, total: tags.length });
});

router.post("/tags", requireAuth, async (req, res): Promise<void> => {
  const { name, color } = req.body;
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const [tag] = await db.insert(tagsTable).values({ name, color: color || "#6366f1", merchantId: req.session.merchantId! }).returning();
  res.status(201).json(tag);
});

router.patch("/tags/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  const { name, color } = req.body;
  const [tag] = await db.update(tagsTable).set({ name, color }).where(and(eq(tagsTable.id, id), eq(tagsTable.merchantId, req.session.merchantId!))).returning();
  if (!tag) { res.status(404).json({ error: "Tag not found" }); return; }
  res.json(tag);
});

router.delete("/tags/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  await db.delete(tagsTable).where(and(eq(tagsTable.id, id), eq(tagsTable.merchantId, req.session.merchantId!)));
  res.sendStatus(204);
});

export default router;
