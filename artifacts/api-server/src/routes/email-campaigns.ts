import { Router, type IRouter } from "express";
import { db, emailCampaignsTable, customersTable, merchantsTable, businessProfileTable } from "@workspace/db";
import { eq, and, isNotNull } from "drizzle-orm";
import { createHmac } from "crypto";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/requireAuth";
import { sendEmail } from "../services/email";

function makeUnsubToken(merchantId: number, customerId: number): string {
  const secret = process.env.UNSUBSCRIBE_SECRET ?? process.env.SESSION_SECRET ?? "koapos-unsub-secret";
  const payload = `${merchantId}:${customerId}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex").slice(0, 16);
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

function campaignFooterHtml(bizName: string, bizAddress: string, unsub: string): string {
  return `
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;line-height:1.6;">
  <p>${bizName}${bizAddress ? ` · ${bizAddress}` : ""}</p>
  <p>You are receiving this email because you opted in to marketing communications.</p>
  <p><a href="${unsub}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a> from marketing emails.</p>
</div>`;
}

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
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
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
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(emailCampaignsTable).where(and(eq(emailCampaignsTable.id, id), eq(emailCampaignsTable.merchantId, merchantId)));
  res.status(204).end();
});

router.post("/email-campaigns/:id/send", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db.select().from(emailCampaignsTable)
    .where(and(eq(emailCampaignsTable.id, id), eq(emailCampaignsTable.merchantId, merchantId)))
    .limit(1);
  if (!row) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (!row.subject || !row.body) { res.status(400).json({ error: "Campaign subject and body are required before sending" }); return; }

  // Fetch merchant identity for legal footer (Spam Act 2003 s 17)
  const [[merchant], [bp]] = await Promise.all([
    db.select({ name: merchantsTable.businessName, address: merchantsTable.address, city: merchantsTable.city })
      .from(merchantsTable).where(eq(merchantsTable.id, merchantId)),
    db.select({ state: businessProfileTable.state, postcode: businessProfileTable.postcode })
      .from(businessProfileTable).where(eq(businessProfileTable.merchantId, merchantId)),
  ]);
  const bizName = merchant?.name ?? "Our Business";
  const bizAddress = [merchant?.address, merchant?.city, bp?.state, bp?.postcode].filter(Boolean).join(", ");
  const baseUrl = process.env.APP_BASE_URL ?? "https://app.koastal.com.au";

  // Build recipient list — only customers who have explicitly opted in (Spam Act 2003 s 16)
  let customers = await db
    .select({ id: customersTable.id, firstName: customersTable.firstName, email: customersTable.email })
    .from(customersTable)
    .where(and(
      eq(customersTable.merchantId, merchantId),
      isNotNull(customersTable.email),
      eq(customersTable.agreedToMarketing, "true"),
    ));

  // Apply audience filter
  if (row.audience === "no_purchase_30d") {
    // filtered further on the server — keep all opted-in for now; refined queries can be added
  } else if (row.audience === "single" && row.customerId != null) {
    customers = customers.filter(c => c.id === row.customerId);
  }

  let sent = 0;
  let failed = 0;
  const sentAt = new Date().toISOString();

  for (const c of customers) {
    if (!c.email) continue;
    const firstName = c.firstName ?? "Valued Customer";
    const personalBody = row.body
      .replace(/\{\{first_name\}\}/g, firstName)
      .replace(/\{\{business_name\}\}/g, bizName);
    const unsub = `${baseUrl}/api/unsubscribe?t=${makeUnsubToken(merchantId, c.id)}`;
    const html = personalBody + campaignFooterHtml(bizName, bizAddress, unsub);
    const text = personalBody.replace(/<[^>]+>/g, "") + `\n\nTo unsubscribe: ${unsub}`;
    const result = await sendEmail(merchantId, { to: c.email, subject: row.subject, html, text });
    if (result.success) sent++; else failed++;
  }

  const [updated] = await db.update(emailCampaignsTable)
    .set({ status: "sent", sentAt, recipientCount: sent })
    .where(and(eq(emailCampaignsTable.id, id), eq(emailCampaignsTable.merchantId, merchantId)))
    .returning();

  res.json({ success: true, sentAt, sent, failed, campaign: updated });
});

export default router;
