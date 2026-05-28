import { Router, type IRouter } from "express";
import { db, posCodePrefixesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/pos-code-prefixes", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(posCodePrefixesTable).where(eq(posCodePrefixesTable.merchantId, merchantId)).limit(1);
  if (!row) {
    const [created] = await db.insert(posCodePrefixesTable).values({ merchantId }).returning();
    res.json(created); return;
  }
  res.json(row);
});

router.put("/pos-code-prefixes", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const body = req.body as Partial<typeof posCodePrefixesTable.$inferInsert>;
  const [existing] = await db.select().from(posCodePrefixesTable).where(eq(posCodePrefixesTable.merchantId, merchantId)).limit(1);
  if (existing) {
    const [updated] = await db.update(posCodePrefixesTable).set(body).where(eq(posCodePrefixesTable.merchantId, merchantId)).returning();
    res.json(updated); return;
  }
  const [created] = await db.insert(posCodePrefixesTable).values({ merchantId, ...body }).returning();
  res.json(created);
});

export default router;
