import { Router, type IRouter } from "express";
import { db, marketingGeneratorsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

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
  const body = req.body as Partial<typeof marketingGeneratorsTable.$inferInsert>;
  const [row] = await db.update(marketingGeneratorsTable).set(body)
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
