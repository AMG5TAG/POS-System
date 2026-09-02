import { Router, type IRouter, type Request } from "express";
import { db, mobilePosAppSettingsTable, merchantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/requireAuth";
import { requireManagerOrOwner } from "../middlewares/requireManagerOrOwner";
import { sendEmail } from "../services/email";
import { sendSms } from "../services/sms";
import { publicDomain } from "../lib/publicUrl";

/**
 * Management-side administration for the Mobile POS web app
 * (Management > Staff & Operations > Mobile POS). Mirrors tech-app-admin.
 */

const router: IRouter = Router();

async function getOrCreateSettings(merchantId: number) {
  const [row] = await db
    .select()
    .from(mobilePosAppSettingsTable)
    .where(eq(mobilePosAppSettingsTable.merchantId, merchantId))
    .limit(1);
  if (row) return row;
  const [created] = await db.insert(mobilePosAppSettingsTable).values({ merchantId }).returning();
  return created;
}

function formatSettings(s: typeof mobilePosAppSettingsTable.$inferSelect) {
  return {
    enabled:      s.enabled === "true",
    showSell:     s.showSell === "true",
    showInvoices: s.showInvoices === "true",
    showProducts: s.showProducts === "true",
    updatedAt:    s.updatedAt.toISOString(),
  };
}

/** The public Mobile POS URL for a merchant, or null when no username is set. */
export function buildMobilePosUrl(req: Request, username: string | null): string | null {
  if (!username) return null;
  return `https://${publicDomain(req)}/b/${username}/t/posapp`;
}

/* ── Settings ────────────────────────────────────────────────────────── */
router.get("/mobile-pos-app/settings", requireAuth, async (req, res): Promise<void> => {
  const settings = await getOrCreateSettings(req.session.merchantId!);
  res.json(formatSettings(settings));
});

const UpdateSettingsBody = z.object({
  enabled:      z.boolean().optional(),
  showSell:     z.boolean().optional(),
  showInvoices: z.boolean().optional(),
  showProducts: z.boolean().optional(),
});

router.put("/mobile-pos-app/settings", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const merchantId = req.session.merchantId!;
  await getOrCreateSettings(merchantId);
  const patch: Partial<typeof mobilePosAppSettingsTable.$inferInsert> = {};
  if (parsed.data.enabled      !== undefined) patch.enabled      = String(parsed.data.enabled);
  if (parsed.data.showSell     !== undefined) patch.showSell     = String(parsed.data.showSell);
  if (parsed.data.showInvoices !== undefined) patch.showInvoices = String(parsed.data.showInvoices);
  if (parsed.data.showProducts !== undefined) patch.showProducts = String(parsed.data.showProducts);
  const [updated] = await db
    .update(mobilePosAppSettingsTable)
    .set(patch)
    .where(eq(mobilePosAppSettingsTable.merchantId, merchantId))
    .returning();
  res.json(formatSettings(updated));
});

/* ── Link info ───────────────────────────────────────────────────────── */
router.get("/mobile-pos-app/link", requireAuth, async (req, res): Promise<void> => {
  const [merchant] = await db
    .select({ username: merchantsTable.username })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, req.session.merchantId!));
  res.json({ username: merchant?.username ?? null, url: buildMobilePosUrl(req, merchant?.username ?? null) });
});

/* ── Send Link (email / SMS) ─────────────────────────────────────────── */
const SendLinkBody = z.object({ method: z.enum(["email", "sms"]), to: z.string().min(3).max(254) });

router.post("/mobile-pos-app/send-link", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const parsed = SendLinkBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "A valid email address or phone number is required" }); return; }
  const merchantId = req.session.merchantId!;
  const [merchant] = await db
    .select({ username: merchantsTable.username, businessName: merchantsTable.businessName })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, merchantId));
  const url = buildMobilePosUrl(req, merchant?.username ?? null);
  if (!url) { res.status(400).json({ error: "Set a business username first (Settings > Account) — it forms the Mobile POS address" }); return; }
  const businessName = merchant?.businessName ?? "your business";

  if (parsed.data.method === "email") {
    const result = await sendEmail(merchantId, {
      to: parsed.data.to,
      subject: `${businessName} — Mobile POS access`,
      html: `
        <p>Hi,</p>
        <p>You've been given access to the <strong>${businessName}</strong> Mobile POS — a phone-friendly till for ringing up sales, viewing invoices and browsing products.</p>
        <p><a href="${url}">${url}</a></p>
        <p>Open the link on your phone and sign in with your staff PIN. Tip: add it to your home screen for quick access.</p>
        <p>— ${businessName}</p>
      `,
      text: `You've been given access to the ${businessName} Mobile POS.\n\n${url}\n\nOpen the link on your phone and sign in with your staff PIN.`,
    });
    if (!result.success) { res.status(502).json({ error: result.error ?? "Failed to send email — check your email settings in Management" }); return; }
  } else {
    const result = await sendSms({ to: parsed.data.to, body: `${businessName} Mobile POS — sign in with your staff PIN: ${url}` }, merchantId);
    if (!result.success) { res.status(502).json({ error: result.error ?? "Failed to send SMS — check your SMS settings in Management" }); return; }
  }
  res.json({ ok: true });
});

export default router;
