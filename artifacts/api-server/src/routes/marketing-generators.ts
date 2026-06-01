import { Router, type IRouter } from "express";
import { db, marketingGeneratorsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/requireAuth";

const PatchMarketingGenerator = z.object({
  name: z.string(), category: z.string(), prompt: z.string(), output: z.string(),
}).partial();

const router: IRouter = Router();

router.get("/marketing-generators", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(marketingGeneratorsTable).where(eq(marketingGeneratorsTable.merchantId, merchantId));
  res.json({ items, total: items.length });
});

router.post("/marketing-generators", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { generatorId, name, category = "general", prompt = "", output = "" } = req.body;
  if (!generatorId || !name) { res.status(400).json({ error: "generatorId and name are required" }); return; }
  const [row] = await db.insert(marketingGeneratorsTable).values({
    merchantId, generatorId, name, category, prompt, output,
  }).returning();
  res.status(201).json(row);
});

router.patch("/marketing-generators/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  const parsed = PatchMarketingGenerator.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(marketingGeneratorsTable)
    .set(parsed.data)
    .where(and(eq(marketingGeneratorsTable.id, id), eq(marketingGeneratorsTable.merchantId, merchantId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/marketing-generators/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  await db.delete(marketingGeneratorsTable)
    .where(and(eq(marketingGeneratorsTable.id, id), eq(marketingGeneratorsTable.merchantId, merchantId)));
  res.status(204).end();
});

export default router;
