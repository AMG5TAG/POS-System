import { Router, type IRouter } from "express";
import { db, pcCompatRulesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/pc-compat-rules", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const rows = await db.select().from(pcCompatRulesTable).where(eq(pcCompatRulesTable.merchantId, merchantId));
  res.json(rows);
});

router.put("/pc-compat-rules", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { ruleKey, partType = "", socket = "", specs = "" } = req.body as {
    ruleKey: string; partType?: string; socket?: string; specs?: string;
  };
  if (!ruleKey) { res.status(400).json({ error: "ruleKey is required" }); return; }
  const [existing] = await db.select().from(pcCompatRulesTable)
    .where(and(eq(pcCompatRulesTable.merchantId, merchantId), eq(pcCompatRulesTable.ruleKey, ruleKey))).limit(1);
  if (existing) {
    const [updated] = await db.update(pcCompatRulesTable)
      .set({ partType, socket, specs })
      .where(and(eq(pcCompatRulesTable.merchantId, merchantId), eq(pcCompatRulesTable.ruleKey, ruleKey)))
      .returning();
    res.json(updated!); return;
  }
  const [created] = await db.insert(pcCompatRulesTable).values({ merchantId, ruleKey, partType, socket, specs }).returning();
  res.json(created!);
});

router.delete("/pc-compat-rules/:ruleKey", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { ruleKey } = req.params;
  await db.delete(pcCompatRulesTable)
    .where(and(eq(pcCompatRulesTable.merchantId, merchantId), eq(pcCompatRulesTable.ruleKey, ruleKey as string)));
  res.status(204).end();
});

export default router;
