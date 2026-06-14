import { Router, type IRouter } from "express";
import { db, smsTemplatesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/sms-templates", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(smsTemplatesTable).where(eq(smsTemplatesTable.merchantId, merchantId));
  res.json({ items, total: items.length });
});

router.post("/sms-templates", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { templateId, name, category = "Other", body = "" } = req.body;
  if (!templateId || !name) { res.status(400).json({ error: "templateId and name are required" }); return; }
  const [row] = await db.insert(smsTemplatesTable).values({ merchantId, templateId, name, category, body }).returning();
  res.status(201).json(row);
});

router.patch("/sms-templates/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { name, category, body } = req.body;
  const [row] = await db.update(smsTemplatesTable).set({ name, category, body })
    .where(and(eq(smsTemplatesTable.id, id), eq(smsTemplatesTable.merchantId, merchantId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/sms-templates/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(smsTemplatesTable).where(and(eq(smsTemplatesTable.id, id), eq(smsTemplatesTable.merchantId, merchantId)));
  res.status(204).end();
});

export default router;
