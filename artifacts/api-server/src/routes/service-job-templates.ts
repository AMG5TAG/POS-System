import { Router, type IRouter } from "express";
import { db, serviceJobTemplatesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/requireAuth";

const PostServiceJobTemplate = z.object({
  templateId: z.string().min(1),
  name: z.string().min(1),
  category: z.string().default("sms"),
  body: z.string().default(""),
  options: z.string().default("{}"),
  isActive: z.string().default("true"),
});

const PatchServiceJobTemplate = z.object({
  name: z.string(), category: z.string(), body: z.string(),
  options: z.string(), isActive: z.string(),
}).partial();

const router: IRouter = Router();

router.get("/service-job-templates", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(serviceJobTemplatesTable).where(eq(serviceJobTemplatesTable.merchantId, merchantId));
  res.json({ items, total: items.length });
});

router.post("/service-job-templates", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const parsed = PostServiceJobTemplate.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { templateId, name, category, body, options, isActive } = parsed.data;
  const [row] = await db.insert(serviceJobTemplatesTable).values({
    merchantId, templateId, name, category, body, options, isActive,
  }).returning();
  res.status(201).json(row);
});

router.patch("/service-job-templates/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = PatchServiceJobTemplate.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { body: bodyField, ...rest } = parsed.data;
  const [row] = await db.update(serviceJobTemplatesTable)
    .set({ ...rest, body: bodyField })
    .where(and(eq(serviceJobTemplatesTable.id, id), eq(serviceJobTemplatesTable.merchantId, merchantId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/service-job-templates/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(serviceJobTemplatesTable)
    .where(and(eq(serviceJobTemplatesTable.id, id), eq(serviceJobTemplatesTable.merchantId, merchantId)));
  res.status(204).end();
});

export default router;
