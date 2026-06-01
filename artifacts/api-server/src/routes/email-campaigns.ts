import { Router, type IRouter } from "express";
import { db, emailCampaignsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/requireAuth";

const PostEmailCampaign = z.object({
  campaignId: z.string().min(1),
  name: z.string().min(1),
  audience: z.string().default("all"),
  audienceLabel: z.string().default("All Customers"),
  subject: z.string().default(""),
  body: z.string().default(""),
  ctaEnabled: z.string().default("false"),
  ctaLabel: z.string().default(""),
  ctaUrl: z.string().default(""),
  scheduled: z.string().default("false"),
  scheduledAt: z.string().default(""),
  status: z.string().default("draft"),
  sentAt: z.string().default(""),
  opens: z.number().int().min(0).default(0),
  bounces: z.number().int().min(0).default(0),
  recipientCount: z.number().int().min(0).default(0),
  customerId: z.number().int().nullable().default(null),
});

const PatchEmailCampaign = z.object({
  name: z.string(), audience: z.string(), audienceLabel: z.string(),
  subject: z.string(), body: z.string(), ctaEnabled: z.string(),
  ctaLabel: z.string(), ctaUrl: z.string(), scheduled: z.string(),
  scheduledAt: z.string(), status: z.string(), sentAt: z.string(),
  opens: z.number(), bounces: z.number(), recipientCount: z.number(),
  customerId: z.number().nullable(),
}).partial();

const router: IRouter = Router();

router.get("/email-campaigns", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(emailCampaignsTable).where(eq(emailCampaignsTable.merchantId, merchantId));
  res.json({ items, total: items.length });
});

router.post("/email-campaigns", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const parsed = PostEmailCampaign.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { campaignId, name, audience, audienceLabel, subject, body,
    ctaEnabled, ctaLabel, ctaUrl, scheduled, scheduledAt, status, sentAt,
    opens, bounces, recipientCount, customerId } = parsed.data;
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
  const parsed = PatchEmailCampaign.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { body: bodyField, ...rest } = parsed.data;
  const [row] = await db.update(emailCampaignsTable)
    .set({ ...rest, body: bodyField })
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

router.post("/email-campaigns/:id/send", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  const [row] = await db.select().from(emailCampaignsTable)
    .where(and(eq(emailCampaignsTable.id, id), eq(emailCampaignsTable.merchantId, merchantId)))
    .limit(1);
  if (!row) { res.status(404).json({ error: "Campaign not found" }); return; }
  const sentAt = new Date().toISOString();
  const [updated] = await db.update(emailCampaignsTable)
    .set({ status: "sent", sentAt })
    .where(and(eq(emailCampaignsTable.id, id), eq(emailCampaignsTable.merchantId, merchantId)))
    .returning();
  res.json({ success: true, sentAt, campaign: updated });
});

export default router;
