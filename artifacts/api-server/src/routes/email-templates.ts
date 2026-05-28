import { Router, type IRouter } from "express";
import { db, emailTemplatesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/email-templates", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(emailTemplatesTable).where(eq(emailTemplatesTable.merchantId, merchantId));
  res.json({ items, total: items.length });
});

router.post("/email-templates", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { templateId, name, category = "Other", subject = "", body = "" } = req.body;
  if (!templateId || !name) { res.status(400).json({ error: "templateId and name are required" }); return; }
  const [row] = await db.insert(emailTemplatesTable).values({ merchantId, templateId, name, category, subject, body }).returning();
  res.status(201).json(row);
});

router.patch("/email-templates/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  const { name, category, subject, body } = req.body;
  const [row] = await db.update(emailTemplatesTable).set({ name, category, subject, body })
    .where(and(eq(emailTemplatesTable.id, id), eq(emailTemplatesTable.merchantId, merchantId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/email-templates/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  await db.delete(emailTemplatesTable).where(and(eq(emailTemplatesTable.id, id), eq(emailTemplatesTable.merchantId, merchantId)));
  res.status(204).end();
});

export default router;
