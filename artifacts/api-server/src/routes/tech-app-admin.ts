import { Router, type IRouter, type Request } from "express";
import { db, techAppSettingsTable, techAppEventsTable, merchantsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/requireAuth";
import { requireManagerOrOwner } from "../middlewares/requireManagerOrOwner";
import { sendEmail } from "../services/email";
import { sendSms } from "../services/sms";
import { publicDomain } from "../lib/publicUrl";

/**
 * Management-side administration for the technician web app
 * (Management > Staff & Operations > Tech App).
 *
 * - settings:  master enable + field-visibility toggles enforced by /api/tech
 * - link:      the merchant's tech app URL (requires a business username)
 * - send-link: email/SMS the tech app link to a technician
 * - activity:  per-user moderation trail recorded by the tech app routes
 */

const router: IRouter = Router();

async function getOrCreateSettings(merchantId: number) {
  const [row] = await db
    .select()
    .from(techAppSettingsTable)
    .where(eq(techAppSettingsTable.merchantId, merchantId))
    .limit(1);
  if (row) return row;
  const [created] = await db.insert(techAppSettingsTable).values({ merchantId }).returning();
  return created;
}

function formatSettings(s: typeof techAppSettingsTable.$inferSelect) {
  return {
    enabled:             s.enabled === "true",
    showCustomerContact: s.showCustomerContact === "true",
    showCredentials:     s.showCredentials === "true",
    allowStatusChange:   s.allowStatusChange === "true",
    updatedAt:           s.updatedAt.toISOString(),
  };
}

/** The public tech app URL for a merchant, or null when no username is set. */
export function buildTechAppUrl(req: Request, username: string | null): string | null {
  if (!username) return null;
  return `https://${publicDomain(req)}/b/${username}/t/techapp`;
}

/* ── Settings ────────────────────────────────────────────────────────── */

router.get("/tech-app/settings", requireAuth, async (req, res): Promise<void> => {
  const settings = await getOrCreateSettings(req.session.merchantId!);
  res.json(formatSettings(settings));
});

const UpdateSettingsBody = z.object({
  enabled:             z.boolean().optional(),
  showCustomerContact: z.boolean().optional(),
  showCredentials:     z.boolean().optional(),
  allowStatusChange:   z.boolean().optional(),
});

router.put("/tech-app/settings", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const merchantId = req.session.merchantId!;
  await getOrCreateSettings(merchantId);
  const patch: Partial<typeof techAppSettingsTable.$inferInsert> = {};
  if (parsed.data.enabled             !== undefined) patch.enabled             = String(parsed.data.enabled);
  if (parsed.data.showCustomerContact !== undefined) patch.showCustomerContact = String(parsed.data.showCustomerContact);
  if (parsed.data.showCredentials     !== undefined) patch.showCredentials     = String(parsed.data.showCredentials);
  if (parsed.data.allowStatusChange   !== undefined) patch.allowStatusChange   = String(parsed.data.allowStatusChange);
  const [updated] = await db
    .update(techAppSettingsTable)
    .set(patch)
    .where(eq(techAppSettingsTable.merchantId, merchantId))
    .returning();
  res.json(formatSettings(updated));
});

/* ── Link info ───────────────────────────────────────────────────────── */

router.get("/tech-app/link", requireAuth, async (req, res): Promise<void> => {
  const [merchant] = await db
    .select({ username: merchantsTable.username })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, req.session.merchantId!));
  res.json({
    username: merchant?.username ?? null,
    url: buildTechAppUrl(req, merchant?.username ?? null),
  });
});

/* ── Send Link (email / SMS) ─────────────────────────────────────────── */

const SendLinkBody = z.object({
  method: z.enum(["email", "sms"]),
  to:     z.string().min(3).max(254),
});

router.post("/tech-app/send-link", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const parsed = SendLinkBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid email address or phone number is required" });
    return;
  }
  const merchantId = req.session.merchantId!;
  const [merchant] = await db
    .select({ username: merchantsTable.username, businessName: merchantsTable.businessName })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, merchantId));
  const url = buildTechAppUrl(req, merchant?.username ?? null);
  if (!url) {
    res.status(400).json({ error: "Set a business username first (Settings > Account) — it forms the Tech App address" });
    return;
  }
  const businessName = merchant?.businessName ?? "your business";

  if (parsed.data.method === "email") {
    const result = await sendEmail(merchantId, {
      to: parsed.data.to,
      subject: `${businessName} — Tech App access`,
      html: `
        <p>Hi,</p>
        <p>You've been given access to the <strong>${businessName}</strong> Tech App — a mobile companion for viewing and scanning service jobs.</p>
        <p><a href="${url}">${url}</a></p>
        <p>Open the link on your phone and sign in with your staff PIN. Tip: add it to your home screen for quick access.</p>
        <p>— ${businessName}</p>
      `,
      text: `You've been given access to the ${businessName} Tech App.\n\n${url}\n\nOpen the link on your phone and sign in with your staff PIN.`,
    });
    if (!result.success) {
      res.status(502).json({ error: result.error ?? "Failed to send email — check your email settings in Management" });
      return;
    }
  } else {
    const result = await sendSms(
      { to: parsed.data.to, body: `${businessName} Tech App — sign in with your staff PIN: ${url}` },
      merchantId,
    );
    if (!result.success) {
      res.status(502).json({ error: result.error ?? "Failed to send SMS — check your SMS settings in Management" });
      return;
    }
  }
  res.json({ ok: true });
});

/* ── Activity / moderation trail ─────────────────────────────────────── */

router.get("/tech-app/activity", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const staffId = req.query.staffId ? parseInt(String(req.query.staffId), 10) : null;
  const where = staffId
    ? and(eq(techAppEventsTable.merchantId, merchantId), eq(techAppEventsTable.staffId, staffId))
    : eq(techAppEventsTable.merchantId, merchantId);
  const events = await db
    .select()
    .from(techAppEventsTable)
    .where(where)
    .orderBy(desc(techAppEventsTable.createdAt))
    .limit(300);
  res.json({
    items: events.map((e) => ({
      id: e.id,
      staffId: e.staffId,
      staffName: e.staffName,
      action: e.action,
      detail: e.detail,
      createdAt: e.createdAt.toISOString(),
    })),
  });
});

export default router;
