import { Router, type IRouter } from "express";
import { db, posTemplatesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/pos-templates", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(posTemplatesTable).where(eq(posTemplatesTable.merchantId, merchantId));
  res.json({ items, total: items.length });
});

router.post("/pos-templates", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { templateId, name, category = "receipt", body = "", options = "{}", isActive = "true" } = req.body;
  if (!templateId || !name) { res.status(400).json({ error: "templateId and name are required" }); return; }
  const [row] = await db.insert(posTemplatesTable).values({
    merchantId, templateId, name, category, body, options, isActive,
  }).returning();
  res.status(201).json(row);
});

router.patch("/pos-templates/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  const body = req.body as Partial<typeof posTemplatesTable.$inferInsert>;
  const [row] = await db.update(posTemplatesTable).set(body)
    .where(and(eq(posTemplatesTable.id, id), eq(posTemplatesTable.merchantId, merchantId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/pos-templates/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  await db.delete(posTemplatesTable)
    .where(and(eq(posTemplatesTable.id, id), eq(posTemplatesTable.merchantId, merchantId)));
  res.status(204).end();
});

export default router;
