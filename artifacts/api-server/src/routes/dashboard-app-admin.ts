import { Router, type IRouter, type Request } from "express";
import crypto from "node:crypto";
import { db, dashboardAppSettingsTable, merchantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/requireAuth";
import { requireManagerOrOwner } from "../middlewares/requireManagerOrOwner";
import { sendEmail } from "../services/email";
import { sendSms } from "../services/sms";
import { publicDomain } from "../lib/publicUrl";

/**
 * Management-side administration for the public Dashboard app
 * (Management > Staff & Operations > Apps > Dashboard).
 *
 * Mirrors the Tech App admin: a shareable link, an email/SMS sender, and
 * field-visibility settings. Unlike the Tech App the Dashboard link is public
 * (no sign-in) — `enabled` gates it and the per-widget flags control exactly
 * what a visitor can see.
 */

const router: IRouter = Router();

/** 48-char hex token that addresses the public dashboard link. */
function newPublicToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

async function getOrCreateSettings(merchantId: number) {
  const [row] = await db
    .select()
    .from(dashboardAppSettingsTable)
    .where(eq(dashboardAppSettingsTable.merchantId, merchantId))
    .limit(1);
  if (row) {
    // Lazily backfill a token for rows created before token-based links existed.
    if (!row.publicToken) {
      const [updated] = await db
        .update(dashboardAppSettingsTable)
        .set({ publicToken: newPublicToken() })
        .where(eq(dashboardAppSettingsTable.merchantId, merchantId))
        .returning();
      return updated;
    }
    return row;
  }
  const [created] = await db
    .insert(dashboardAppSettingsTable)
    .values({ merchantId, publicToken: newPublicToken() })
    .returning();
  return created;
}

function formatSettings(s: typeof dashboardAppSettingsTable.$inferSelect) {
  return {
    enabled:              s.enabled,
    showStatusTiles:      s.showStatusTiles,
    showMetricTiles:      s.showMetricTiles,
    showOverdueBanner:    s.showOverdueBanner,
    showNotifications:    s.showNotifications,
    showServiceJobsPanel: s.showServiceJobsPanel,
    showCalendar:         s.showCalendar,
    showReferralRevenue:  s.showReferralRevenue,
    updatedAt:            s.updatedAt.toISOString(),
  };
}

/** The public Dashboard app URL, addressed by an unguessable token (not the
 *  guessable business username). Null when no token has been generated. */
export function buildDashboardUrl(req: Request, token: string | null): string | null {
  if (!token) return null;
  return `https://${publicDomain(req)}/d/${token}`;
}

/* ── Settings ────────────────────────────────────────────────────────── */

router.get("/dashboard-app/settings", requireAuth, async (req, res): Promise<void> => {
  const settings = await getOrCreateSettings(req.session.merchantId!);
  res.json(formatSettings(settings));
});

const UpdateSettingsBody = z.object({
  enabled:              z.boolean().optional(),
  showStatusTiles:      z.boolean().optional(),
  showMetricTiles:      z.boolean().optional(),
  showOverdueBanner:    z.boolean().optional(),
  showNotifications:    z.boolean().optional(),
  showServiceJobsPanel: z.boolean().optional(),
  showCalendar:         z.boolean().optional(),
  showReferralRevenue:  z.boolean().optional(),
});

router.put("/dashboard-app/settings", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const merchantId = req.session.merchantId!;
  await getOrCreateSettings(merchantId);
  const patch: Partial<typeof dashboardAppSettingsTable.$inferInsert> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) (patch as Record<string, boolean>)[key] = value;
  }
  const [updated] = await db
    .update(dashboardAppSettingsTable)
    .set(patch)
    .where(eq(dashboardAppSettingsTable.merchantId, merchantId))
    .returning();
  res.json(formatSettings(updated));
});

/* ── Link info ───────────────────────────────────────────────────────── */

router.get("/dashboard-app/link", requireAuth, async (req, res): Promise<void> => {
  const settings = await getOrCreateSettings(req.session.merchantId!);
  const [merchant] = await db
    .select({ username: merchantsTable.username })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, req.session.merchantId!));
  res.json({
    username: merchant?.username ?? null,
    url: buildDashboardUrl(req, settings.publicToken),
  });
});

/* ── Send Link (email / SMS) ─────────────────────────────────────────── */

const SendLinkBody = z.object({
  method: z.enum(["email", "sms"]),
  to:     z.string().min(3).max(254),
});

router.post("/dashboard-app/send-link", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const parsed = SendLinkBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid email address or phone number is required" });
    return;
  }
  const merchantId = req.session.merchantId!;
  const settings = await getOrCreateSettings(merchantId);
  const [merchant] = await db
    .select({ businessName: merchantsTable.businessName })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, merchantId));
  const url = buildDashboardUrl(req, settings.publicToken);
  if (!url) {
    res.status(400).json({ error: "Could not generate a Dashboard link — please try again" });
    return;
  }
  const businessName = merchant?.businessName ?? "your business";

  if (parsed.data.method === "email") {
    const result = await sendEmail(merchantId, {
      to: parsed.data.to,
      subject: `${businessName} — Dashboard link`,
      html: `
        <p>Hi,</p>
        <p>Here is the live <strong>${businessName}</strong> Dashboard — a read-only view of today's activity.</p>
        <p><a href="${url}">${url}</a></p>
        <p>Open it on any screen; no sign-in is required. Tip: add it to your home screen or pin it on a wall display.</p>
        <p>— ${businessName}</p>
      `,
      text: `Here is the live ${businessName} Dashboard (read-only, no sign-in required).\n\n${url}`,
    });
    if (!result.success) {
      res.status(502).json({ error: result.error ?? "Failed to send email — check your email settings in Management" });
      return;
    }
  } else {
    const result = await sendSms(
      { to: parsed.data.to, body: `${businessName} live Dashboard (read-only): ${url}` },
      merchantId,
    );
    if (!result.success) {
      res.status(502).json({ error: result.error ?? "Failed to send SMS — check your SMS settings in Management" });
      return;
    }
  }
  res.json({ ok: true });
});

export default router;
