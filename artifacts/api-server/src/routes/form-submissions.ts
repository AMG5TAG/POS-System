import { Router, type IRouter } from "express";
import { db, formSubmissionsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/form-submissions", requireAuth, async (req, res): Promise<void> => {
  const { formId, customerId, sourceType, sourceId } = req.query as Record<string, string | undefined>;
  const conditions = [eq(formSubmissionsTable.merchantId, req.session.merchantId!)];
  if (formId)     conditions.push(eq(formSubmissionsTable.formId,    parseInt(formId)));
  if (customerId) conditions.push(eq(formSubmissionsTable.customerId, parseInt(customerId)));
  if (sourceType) conditions.push(eq(formSubmissionsTable.sourceType, sourceType));
  if (sourceId)   conditions.push(eq(formSubmissionsTable.sourceId,   parseInt(sourceId)));

  const submissions = await db
    .select()
    .from(formSubmissionsTable)
    .where(and(...conditions))
    .orderBy(desc(formSubmissionsTable.createdAt));
  res.json(submissions);
});

router.post("/form-submissions", requireAuth, async (req, res): Promise<void> => {
  const { formId, customerId, sourceType, sourceId, staffId, data } = req.body as {
    formId?: number; customerId?: number; sourceType?: string; sourceId?: number;
    staffId?: number; data?: Record<string, unknown>;
  };
  if (!formId) { res.status(400).json({ error: "formId is required" }); return; }
  const [submission] = await db
    .insert(formSubmissionsTable)
    .values({
      merchantId: req.session.merchantId!,
      formId,
      customerId:  customerId  ?? null,
      sourceType:  sourceType  ?? null,
      sourceId:    sourceId    ?? null,
      staffId:     staffId     ?? null,
      data:        data        ?? {},
    })
    .returning();
  res.status(201).json(submission);
});

router.get("/form-submissions/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"]), 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid id" }); return; }
  const [submission] = await db
    .select()
    .from(formSubmissionsTable)
    .where(and(eq(formSubmissionsTable.id, id), eq(formSubmissionsTable.merchantId, req.session.merchantId!)));
  if (!submission) { res.status(404).json({ error: "not found" }); return; }
  res.json(submission);
});

router.delete("/form-submissions/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params["id"]), 10);
  if (isNaN(id)) { res.status(400).json({ error: "invalid id" }); return; }
  await db
    .delete(formSubmissionsTable)
    .where(and(eq(formSubmissionsTable.id, id), eq(formSubmissionsTable.merchantId, req.session.merchantId!)));
  res.json({ success: true });
});

export default router;
