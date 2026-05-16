import { Router, type IRouter } from "express";
import { db, merchantIntegrationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

/* ── Integration catalogue ────────────────────────────────────────────────
   Defines every supported integration. authType drives the UI behaviour:
   - "oauth"       → redirect-based OAuth flow
   - "credentials" → modal form with named fields
*/
export const INTEGRATIONS = [
  {
    key: "google_business",
    label: "Google Business Profile",
    description: "Keep your Google Maps listing accurate with business hours, posts, and offers.",
    authType: "oauth" as const,
    oauthProvider: "google",
  },
  {
    key: "stripe_own",
    label: "Stripe (Own Account)",
    description: "Connect your own Stripe account to accept card payments from customers.",
    authType: "oauth" as const,
    oauthProvider: "stripe",
  },
  {
    key: "australia_post",
    label: "Australia Post Shipping",
    description: "Calculate real-time postage rates at online checkout.",
    authType: "credentials" as const,
    fields: [
      { name: "apiKey",        label: "API Key",        type: "password" },
      { name: "accountNumber", label: "Account Number", type: "text" },
    ],
  },
  {
    key: "apple_wallet",
    label: "Apple Wallet",
    description: "Issue digital loyalty cards and coupons to Apple Wallet.",
    authType: "credentials" as const,
    fields: [
      { name: "passTypeId",        label: "Pass Type ID",           type: "text" },
      { name: "teamId",            label: "Apple Team ID",          type: "text" },
      { name: "certificateBase64", label: "Certificate (Base64)",   type: "password" },
    ],
  },
  {
    key: "commbank_eftpos",
    label: "CommBank EFTPOS",
    description: "Integrate with CommBank Smart terminal for card-present payments.",
    authType: "credentials" as const,
    fields: [
      { name: "merchantId", label: "Merchant ID",  type: "text" },
      { name: "terminalId", label: "Terminal ID",  type: "text" },
      { name: "apiKey",     label: "API Key",      type: "password" },
    ],
  },
  {
    key: "tyro_eftpos",
    label: "Tyro EFTPOS",
    description: "Australia's most popular independent EFTPOS provider. Supports contactless, Apple Pay & Google Pay.",
    authType: "credentials" as const,
    fields: [
      { name: "merchantId", label: "Merchant ID",  type: "text" },
      { name: "terminalId", label: "Terminal ID",  type: "text" },
      { name: "apiKey",     label: "API Key",      type: "password" },
    ],
  },
  {
    key: "square_terminal",
    label: "Square Terminal",
    description: "Accept in-store card payments via Square Terminal or Square Reader.",
    authType: "credentials" as const,
    fields: [
      { name: "accessToken", label: "Access Token", type: "password" },
      { name: "locationId",  label: "Location ID",  type: "text" },
    ],
  },
  {
    key: "paypal",
    label: "PayPal",
    description: "Accept PayPal in-store via QR code — customer scans with the PayPal app to pay.",
    authType: "credentials" as const,
    fields: [
      { name: "clientId",     label: "Client ID",     type: "text" },
      { name: "clientSecret", label: "Client Secret", type: "password" },
      { name: "merchantId",   label: "Merchant ID",   type: "text" },
    ],
  },
  {
    key: "wechat_alipay",
    label: "WeChat Pay & Alipay",
    description: "Display merchant QR codes for WeChat Pay and Alipay in-store.",
    authType: "credentials" as const,
    fields: [
      { name: "wechatMerchantId", label: "WeChat Merchant ID", type: "text" },
      { name: "wechatApiKey",     label: "WeChat API Key",     type: "password" },
      { name: "alipayMerchantId", label: "Alipay Merchant ID", type: "text" },
      { name: "alipayApiKey",     label: "Alipay API Key",     type: "password" },
    ],
  },
  {
    key: "openai",
    label: "OpenAI (Your Own Key)",
    description: "Use your own OpenAI API key for AI Insights, demand forecasting, and AI-generated content.",
    authType: "credentials" as const,
    fields: [
      { name: "apiKey", label: "API Key", type: "password" },
    ],
  },
] as const;

type IntegrationKey = typeof INTEGRATIONS[number]["key"];

/* ── Helpers ─────────────────────────────────────────────────────────────── */

async function getRow(merchantId: number, key: string) {
  const rows = await db
    .select()
    .from(merchantIntegrationsTable)
    .where(
      and(
        eq(merchantIntegrationsTable.merchantId, merchantId),
        eq(merchantIntegrationsTable.integrationKey, key),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

function buildOAuthStartUrl(key: string, req: import("express").Request): string | null {
  const proto = req.headers["x-forwarded-proto"] ?? req.protocol ?? "https";
  const host  = req.headers["x-forwarded-host"] ?? req.headers.host ?? "";
  const base  = `${proto}://${host}`;
  const callbackUrl = `${base}/api/integrations/oauth/${key}/callback`;

  if (key === "google_business") {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return null;
    const params = new URLSearchParams({
      client_id:     clientId,
      redirect_uri:  callbackUrl,
      response_type: "code",
      scope:         "https://www.googleapis.com/auth/business.manage",
      access_type:   "offline",
      prompt:        "consent",
      state:         String(req.session.merchantId),
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  if (key === "stripe_own") {
    const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
    if (!clientId) return null;
    const params = new URLSearchParams({
      response_type: "code",
      client_id:     clientId,
      scope:         "read_write",
      redirect_uri:  callbackUrl,
      state:         String(req.session.merchantId),
    });
    return `https://connect.stripe.com/oauth/authorize?${params}`;
  }

  return null;
}

/* ── GET /integrations ───────────────────────────────────────────────────── */

router.get("/integrations", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;

  const rows = await db
    .select()
    .from(merchantIntegrationsTable)
    .where(eq(merchantIntegrationsTable.merchantId, merchantId));

  const rowMap = new Map(rows.map((r) => [r.integrationKey, r]));

  const result = INTEGRATIONS.map((intg) => {
    const row = rowMap.get(intg.key);
    return {
      key:         intg.key,
      label:       intg.label,
      description: intg.description,
      authType:    intg.authType,
      fields:      "fields" in intg ? intg.fields : [],
      status:      row?.status ?? "disconnected",
      connectedAt: row?.connectedAt?.toISOString() ?? null,
      oauthConfigured:
        intg.authType === "oauth"
          ? intg.oauthProvider === "google"
            ? !!process.env.GOOGLE_CLIENT_ID
            : !!process.env.STRIPE_CONNECT_CLIENT_ID
          : null,
    };
  });

  res.json(result);
});

/* ── POST /integrations/:key/connect (credential-based) ─────────────────── */

router.post("/integrations/:key/connect", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { key }    = req.params as { key: IntegrationKey };
  const intg       = INTEGRATIONS.find((i) => i.key === key);

  if (!intg) {
    res.status(404).json({ error: "Unknown integration" });
    return;
  }
  if (intg.authType !== "credentials") {
    res.status(400).json({ error: "Use OAuth flow for this integration" });
    return;
  }

  const credentials = JSON.stringify(req.body ?? {});
  const existing    = await getRow(merchantId, key);

  if (existing) {
    await db
      .update(merchantIntegrationsTable)
      .set({ status: "connected", credentials, connectedAt: new Date() })
      .where(eq(merchantIntegrationsTable.id, existing.id));
  } else {
    await db.insert(merchantIntegrationsTable).values({
      merchantId,
      integrationKey: key,
      status:         "connected",
      credentials,
      connectedAt:    new Date(),
    });
  }

  res.json({ status: "connected" });
});

/* ── DELETE /integrations/:key ───────────────────────────────────────────── */

router.delete("/integrations/:key", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { key }    = req.params;
  const existing   = await getRow(merchantId, key);

  if (existing) {
    await db
      .update(merchantIntegrationsTable)
      .set({
        status:       "disconnected",
        credentials:  null,
        accessToken:  null,
        refreshToken: null,
        connectedAt:  null,
      })
      .where(eq(merchantIntegrationsTable.id, existing.id));
  }

  res.json({ status: "disconnected" });
});

/* ── GET /integrations/oauth/:key/start ─────────────────────────────────── */

router.get("/integrations/oauth/:key/start", requireAuth, (req, res): void => {
  const { key } = req.params;
  const url     = buildOAuthStartUrl(key, req);

  if (!url) {
    // OAuth not configured — redirect back with error
    res.redirect(`/management/integrations?error=${key}_oauth_not_configured`);
    return;
  }

  res.redirect(url);
});

/* ── GET /integrations/oauth/:key/callback ───────────────────────────────── */

router.get("/integrations/oauth/:key/callback", async (req, res): Promise<void> => {
  const { key }  = req.params;
  const { code, state, error } = req.query as Record<string, string>;

  if (error || !code || !state) {
    res.redirect(`/management/integrations?error=${key}_oauth_denied`);
    return;
  }

  const merchantId = parseInt(state, 10);
  if (isNaN(merchantId)) {
    res.redirect(`/management/integrations?error=${key}_invalid_state`);
    return;
  }

  try {
    let accessToken  = "";
    let refreshToken = "";
    let expiresAt: Date | null = null;

    const proto = req.headers["x-forwarded-proto"] ?? req.protocol ?? "https";
    const host  = req.headers["x-forwarded-host"] ?? req.headers.host ?? "";
    const callbackUrl = `${proto}://${host}/api/integrations/oauth/${key}/callback`;

    if (key === "google_business") {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id:     process.env.GOOGLE_CLIENT_ID ?? "",
          client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
          redirect_uri:  callbackUrl,
          grant_type:    "authorization_code",
        }),
      });
      const data = await tokenRes.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
      accessToken  = data.access_token ?? "";
      refreshToken = data.refresh_token ?? "";
      if (data.expires_in) {
        expiresAt = new Date(Date.now() + data.expires_in * 1000);
      }
    }

    if (key === "stripe_own") {
      const tokenRes = await fetch("https://connect.stripe.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_secret: process.env.STRIPE_SECRET_KEY ?? "",
        }),
      });
      const data = await tokenRes.json() as { access_token?: string; refresh_token?: string; stripe_user_id?: string };
      accessToken  = data.access_token ?? "";
      refreshToken = data.refresh_token ?? "";
    }

    const existing = await getRow(merchantId, key);
    if (existing) {
      await db
        .update(merchantIntegrationsTable)
        .set({ status: "connected", accessToken, refreshToken, tokenExpiresAt: expiresAt, connectedAt: new Date() })
        .where(eq(merchantIntegrationsTable.id, existing.id));
    } else {
      await db.insert(merchantIntegrationsTable).values({
        merchantId,
        integrationKey: key,
        status: "connected",
        accessToken,
        refreshToken,
        tokenExpiresAt: expiresAt,
        connectedAt: new Date(),
      });
    }

    res.redirect(`/management/integrations?success=${key}`);
  } catch {
    res.redirect(`/management/integrations?error=${key}_token_exchange_failed`);
  }
});

export default router;
