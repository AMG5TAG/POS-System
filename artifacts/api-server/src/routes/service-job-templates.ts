import { Router, type IRouter } from "express";
import { db, serviceJobTemplatesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/service-job-templates", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(serviceJobTemplatesTable).where(eq(serviceJobTemplatesTable.merchantId, merchantId));
  res.json({ items, total: items.length });
});

router.post("/service-job-templates", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { templateId, name, category = "sms", body = "", options = "{}", isActive = "true" } = req.body;
  if (!templateId || !name) { res.status(400).json({ error: "templateId and name are required" }); return; }
  const [row] = await db.insert(serviceJobTemplatesTable).values({
    merchantId, templateId, name, category, body, options, isActive,
  }).returning();
  res.status(201).json(row);
});

router.patch("/service-job-templates/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  const body = req.body as Partial<typeof serviceJobTemplatesTable.$inferInsert>;
  const [row] = await db.update(serviceJobTemplatesTable).set(body)
    .where(and(eq(serviceJobTemplatesTable.id, id), eq(serviceJobTemplatesTable.merchantId, merchantId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/service-job-templates/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  await db.delete(serviceJobTemplatesTable)
    .where(and(eq(serviceJobTemplatesTable.id, id), eq(serviceJobTemplatesTable.merchantId, merchantId)));
  res.status(204).end();
});

export default router;
