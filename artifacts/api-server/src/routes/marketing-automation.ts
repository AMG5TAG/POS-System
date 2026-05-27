import { Router, type IRouter } from "express";
import { db, marketingAutomationRulesTable, marketingAutomationLogTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { runAutomationRule } from "../services/marketingAutomationScheduler";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function formatRule(r: typeof marketingAutomationRulesTable.$inferSelect) {
  return {
    id: r.id,
    merchantId: r.merchantId,
    name: r.name,
    isActive: r.isActive === "true",
    triggerEvent: r.triggerEvent,
    channel: r.channel,
    templateId: r.templateId ?? null,
    templateName: r.templateName ?? null,
    templateSubject: r.templateSubject ?? null,
    templateBody: r.templateBody ?? null,
    lastRunAt: r.lastRunAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// GET /marketing-automation
router.get("/marketing-automation", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const rules = await db
    .select()
    .from(marketingAutomationRulesTable)
    .where(eq(marketingAutomationRulesTable.merchantId, merchantId))
    .orderBy(desc(marketingAutomationRulesTable.createdAt));
  res.json(rules.map(formatRule));
});

// POST /marketing-automation
router.post("/marketing-automation", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { name, triggerEvent, channel, templateId, templateName, templateSubject, templateBody, isActive } = req.body;
  if (!name || !triggerEvent || !channel) {
    res.status(400).json({ error: "name, triggerEvent, and channel are required" });
    return;
  }
  const [rule] = await db
    .insert(marketingAutomationRulesTable)
    .values({
      merchantId,
      name,
      triggerEvent,
      channel,
      isActive: isActive === false ? "false" : "true",
      templateId: templateId ?? null,
      templateName: templateName ?? null,
      templateSubject: templateSubject ?? null,
      templateBody: templateBody ?? null,
    })
    .returning();
  res.status(201).json(formatRule(rule));
});

// PUT /marketing-automation/:id
router.put("/marketing-automation/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { name, triggerEvent, channel, templateId, templateName, templateSubject, templateBody, isActive } = req.body;
  const [rule] = await db
    .update(marketingAutomationRulesTable)
    .set({
      ...(name        ? { name }         : {}),
      ...(triggerEvent? { triggerEvent }  : {}),
      ...(channel     ? { channel }       : {}),
      isActive: isActive === false ? "false" : "true",
      templateId:      templateId ?? null,
      templateName:    templateName ?? null,
      templateSubject: templateSubject ?? null,
      templateBody:    templateBody ?? null,
    })
    .where(and(eq(marketingAutomationRulesTable.id, id), eq(marketingAutomationRulesTable.merchantId, merchantId)))
    .returning();
  if (!rule) { res.status(404).json({ error: "Not found" }); return; }
  res.json(formatRule(rule));
});

// DELETE /marketing-automation/:id
router.delete("/marketing-automation/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(marketingAutomationLogTable).where(eq(marketingAutomationLogTable.ruleId, id));
  await db
    .delete(marketingAutomationRulesTable)
    .where(and(eq(marketingAutomationRulesTable.id, id), eq(marketingAutomationRulesTable.merchantId, merchantId)));
  res.json({ success: true });
});

// POST /marketing-automation/:id/run  — manual trigger
router.post("/marketing-automation/:id/run", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [rule] = await db
    .select()
    .from(marketingAutomationRulesTable)
    .where(and(eq(marketingAutomationRulesTable.id, id), eq(marketingAutomationRulesTable.merchantId, merchantId)));
  if (!rule) { res.status(404).json({ error: "Not found" }); return; }
  const result = await runAutomationRule(merchantId, rule, logger);
  res.json(result);
});

// GET /marketing-automation/log
router.get("/marketing-automation/log", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const rows = await db
    .select()
    .from(marketingAutomationLogTable)
    .where(eq(marketingAutomationLogTable.merchantId, merchantId))
    .orderBy(desc(marketingAutomationLogTable.sentAt))
    .limit(100);
  res.json(rows.map((r) => ({
    id: r.id,
    ruleId: r.ruleId,
    customerId: r.customerId ?? null,
    recordType: r.recordType ?? null,
    recordId: r.recordId ?? null,
    channel: r.channel,
    status: r.status,
    error: r.error ?? null,
    sentAt: r.sentAt.toISOString(),
  })));
});

export default router;
