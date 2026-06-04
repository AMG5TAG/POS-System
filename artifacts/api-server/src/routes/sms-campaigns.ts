import { Router, type IRouter } from "express";
import { db, smsCampaignsTable, customersTable } from "@workspace/db";
import { eq, and, isNotNull } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/requireAuth";
import { sendSms } from "../services/sms";

const PostSmsCampaign = z.object({
  campaignId:     z.string().min(1),
  name:           z.string().min(1),
  audience:       z.string().default("all"),
  audienceLabel:  z.string().default("All Customers"),
  body:           z.string().default(""),
  linkUrl:        z.string().default(""),
  scheduled:      z.string().default("false"),
  scheduledAt:    z.string().default(""),
  status:         z.string().default("draft"),
  sentAt:         z.string().default(""),
  delivered:      z.number().int().min(0).default(0),
  failed:         z.number().int().min(0).default(0),
  recipientCount: z.number().int().min(0).default(0),
  customerId:     z.number().int().nullable().default(null),
});

const PatchSmsCampaign = z.object({
  name: z.string(), audience: z.string(), audienceLabel: z.string(),
  body: z.string(), linkUrl: z.string(), scheduled: z.string(),
  scheduledAt: z.string(), status: z.string(), sentAt: z.string(),
  delivered: z.number(), failed: z.number(), recipientCount: z.number(),
  customerId: z.number().nullable(),
}).partial();

const router: IRouter = Router();

router.get("/sms-campaigns", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const items = await db.select().from(smsCampaignsTable).where(eq(smsCampaignsTable.merchantId, merchantId));
  res.json({ items, total: items.length });
});

router.post("/sms-campaigns", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const parsed = PostSmsCampaign.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { campaignId, name, audience, audienceLabel, body, linkUrl,
    scheduled, scheduledAt, status, sentAt, delivered, failed, recipientCount, customerId } = parsed.data;
  const [row] = await db.insert(smsCampaignsTable).values({
    merchantId, campaignId, name, audience, audienceLabel, body, linkUrl,
    scheduled, scheduledAt, status, sentAt, delivered, failed, recipientCount, customerId,
  }).returning();
  res.status(201).json(row);
});

router.patch("/sms-campaigns/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = PatchSmsCampaign.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(smsCampaignsTable)
    .set(parsed.data)
    .where(and(eq(smsCampaignsTable.id, id), eq(smsCampaignsTable.merchantId, merchantId))).returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

router.delete("/sms-campaigns/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(smsCampaignsTable).where(and(eq(smsCampaignsTable.id, id), eq(smsCampaignsTable.merchantId, merchantId)));
  res.status(204).end();
});

router.post("/sms-campaigns/:id/send", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db.select().from(smsCampaignsTable)
    .where(and(eq(smsCampaignsTable.id, id), eq(smsCampaignsTable.merchantId, merchantId)))
    .limit(1);
  if (!row) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (!row.body) { res.status(400).json({ error: "Campaign body is required before sending" }); return; }

  let customers = await db
    .select({ id: customersTable.id, firstName: customersTable.firstName, phone: customersTable.phone })
    .from(customersTable)
    .where(and(
      eq(customersTable.merchantId, merchantId),
      isNotNull(customersTable.phone),
      eq(customersTable.agreedToMarketing, "true"),
    ));

  if (row.audience === "single" && row.customerId != null) {
    customers = customers.filter((c) => c.id === row.customerId);
  }

  let delivered = 0;
  let failed = 0;
  const sentAt = new Date().toISOString();

  for (const c of customers) {
    if (!c.phone) continue;
    const firstName = c.firstName ?? "Valued Customer";
    const personalBody = row.body.replace(/\{\{first_name\}\}/g, firstName);
    const messageBody = row.linkUrl ? `${personalBody}\n${row.linkUrl}` : personalBody;
    const result = await sendSms({ to: c.phone, body: messageBody }, merchantId);
    if (result.success) delivered++; else failed++;
  }

  const [updated] = await db.update(smsCampaignsTable)
    .set({ status: "sent", sentAt, recipientCount: delivered, delivered, failed })
    .where(and(eq(smsCampaignsTable.id, id), eq(smsCampaignsTable.merchantId, merchantId)))
    .returning();

  res.json({ success: true, sentAt, delivered, failed, campaign: updated });
});

export default router;
