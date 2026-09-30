import { Router, type IRouter, type Request } from "express";
import crypto from "node:crypto";
import { db, dashboardAppSettingsTable, dashboardAppDevicesTable, merchantsTable, staffTable } from "@workspace/db";
import { and, desc, eq, gt } from "drizzle-orm";
import { PENDING_LIVE_MS } from "../lib/dashboard-devices";
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
    requireApproval:      s.requireApproval,
    updatedAt:            s.updatedAt.toISOString(),
  };
}

/** The public Dashboard app URL, /d/dashboard/<access code>. The code is the
 *  only thing between a visitor and the data, so it defaults to a random
 *  48-char token; an owner can choose their own (see PUT /dashboard-app/access-code),
 *  and wrong guesses are rate-limited on the public route. The older /d/<code>
 *  form still resolves. Null when no code has been generated. */
export function buildDashboardUrl(req: Request, token: string | null): string | null {
  if (!token) return null;
  return `https://${publicDomain(req)}/d/dashboard/${encodeURIComponent(token)}`;
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
  requireApproval:      z.boolean().optional(),
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

/* ── Access code ─────────────────────────────────────────────────────── */

// Letters, digits and hyphens: it sits in a URL path segment. Six characters is
// the floor; the public route's attempt limit is what makes a short code viable.
const AccessCodeBody = z.object({ code: z.string().trim().regex(/^[A-Za-z0-9-]{6,64}$/) });

router.put("/dashboard-app/access-code", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const parsed = AccessCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Use 6–64 letters, numbers or hyphens." });
    return;
  }
  await getOrCreateSettings(req.session.merchantId!);
  try {
    const [updated] = await db
      .update(dashboardAppSettingsTable)
      .set({ publicToken: parsed.data.code })
      .where(eq(dashboardAppSettingsTable.merchantId, req.session.merchantId!))
      .returning();
    res.json({ url: buildDashboardUrl(req, updated!.publicToken) });
  } catch {
    // public_token is unique across the table.
    res.status(409).json({ error: "That code is already in use — choose another." });
  }
});

/* ── Screen approval ─────────────────────────────────────────────────────
   Screens that opened the link while approval is required (see
   lib/dashboard-devices.ts). Pending ones are listed only while still polling,
   so a request from a screen that has since been closed doesn't linger. */

function formatDevice(d: typeof dashboardAppDevicesTable.$inferSelect) {
  return {
    id: d.id,
    status: d.status,
    pairCode: d.pairCode,
    ipAddress: d.ipAddress,
    userAgent: d.userAgent,
    decidedBy: d.decidedBy,
    decidedAt: d.decidedAt?.toISOString() ?? null,
    requestedAt: d.requestedAt.toISOString(),
    lastSeenAt: d.lastSeenAt.toISOString(),
  };
}

router.get("/dashboard-app/devices", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(dashboardAppDevicesTable)
    .where(eq(dashboardAppDevicesTable.merchantId, req.session.merchantId!))
    .orderBy(desc(dashboardAppDevicesTable.requestedAt));
  const cutoff = Date.now() - PENDING_LIVE_MS;
  res.json(rows.filter((d) => d.status !== "pending" || d.lastSeenAt.getTime() > cutoff).map(formatDevice));
});

/** What the POS-wide approval banner polls. Empty when approval is off. */
router.get("/dashboard-app/devices/pending", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(dashboardAppDevicesTable)
    .where(and(
      eq(dashboardAppDevicesTable.merchantId, req.session.merchantId!),
      eq(dashboardAppDevicesTable.status, "pending"),
      gt(dashboardAppDevicesTable.lastSeenAt, new Date(Date.now() - PENDING_LIVE_MS)),
    ))
    .orderBy(desc(dashboardAppDevicesTable.requestedAt));
  res.json(rows.map(formatDevice));
});

async function deciderName(req: Request): Promise<string> {
  if (req.session.staffId) {
    const [s] = await db.select({ name: staffTable.name }).from(staffTable)
      .where(and(eq(staffTable.id, req.session.staffId), eq(staffTable.merchantId, req.session.merchantId!))).limit(1);
    if (s?.name) return s.name;
  }
  return req.session.staffRole === "owner" ? "Owner" : "Manager";
}

const DecisionBody = z.object({ decision: z.enum(["approved", "denied"]) });

router.post("/dashboard-app/devices/:id/decision", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const parsed = DecisionBody.safeParse(req.body);
  if (isNaN(id) || !parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }
  const [updated] = await db
    .update(dashboardAppDevicesTable)
    .set({ status: parsed.data.decision, decidedBy: await deciderName(req), decidedAt: new Date() })
    .where(and(eq(dashboardAppDevicesTable.id, id), eq(dashboardAppDevicesTable.merchantId, req.session.merchantId!)))
    .returning();
  if (!updated) { res.status(404).json({ error: "That screen is no longer waiting" }); return; }
  res.json(formatDevice(updated));
});

/** Forget a screen entirely: next time it opens the link it asks again. */
router.delete("/dashboard-app/devices/:id", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [gone] = await db
    .delete(dashboardAppDevicesTable)
    .where(and(eq(dashboardAppDevicesTable.id, id), eq(dashboardAppDevicesTable.merchantId, req.session.merchantId!)))
    .returning({ id: dashboardAppDevicesTable.id });
  if (!gone) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ok: true });
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
