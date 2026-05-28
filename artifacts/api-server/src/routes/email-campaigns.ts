import { Router, type IRouter } from "express";
import { db, emailCampaignsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/email-campaigns", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(emailCampaignsTable).where(eq(emailCampaignsTable.merchantId, merchantId));
  res.json({ items, total: items.length });
});

router.post("/email-campaigns", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const {
    campaignId, name, audience = "all", audienceLabel = "All Customers",
    subject = "", body = "", ctaEnabled = "false", ctaLabel = "", ctaUrl = "",
    scheduled = "false", scheduledAt = "", status = "draft", sentAt = "",
    opens = 0, bounces = 0, recipientCount = 0, customerId,
  } = req.body;
  if (!campaignId || !name) { res.status(400).json({ error: "campaignId and name are required" }); return; }
  const [row] = await db.insert(emailCampaignsTable).values({
    merchantId, campaignId, name, audience, audienceLabel, subject, body,
    ctaEnabled, ctaLabel, ctaUrl, scheduled, scheduledAt, status, sentAt,
    opens, bounces, recipientCount, customerId,
  }).returning();
  res.status(201).json(row);
});

router.patch("/email-campaigns/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  const body = req.body as Partial<typeof emailCampaignsTable.$inferInsert>;
  const [row] = await db.update(emailCampaignsTable).set(body)
    .where(and(eq(emailCampaignsTable.id, id), eq(emailCampaignsTable.merchantId, merchantId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/email-campaigns/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  await db.delete(emailCampaignsTable).where(and(eq(emailCampaignsTable.id, id), eq(emailCampaignsTable.merchantId, merchantId)));
  res.status(204).end();
});

export default router;
