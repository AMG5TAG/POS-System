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
  /* ── Payments & EFTPOS ─────────────────────────────────────────────────── */
  {
    key: "stripe_own",
    label: "Stripe (Own Account)",
    category: "Payments & EFTPOS",
    description: "Connect your own Stripe account to accept card payments from customers.",
    authType: "oauth" as const,
    oauthProvider: "stripe",
  },
  {
    key: "commbank_eftpos",
    label: "CommBank EFTPOS",
    category: "Payments & EFTPOS",
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
    category: "Payments & EFTPOS",
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
    category: "Payments & EFTPOS",
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
    category: "Payments & EFTPOS",
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
    category: "Payments & EFTPOS",
    description: "Display merchant QR codes for WeChat Pay and Alipay in-store — ideal for tourist-heavy and CBD locations.",
    authType: "credentials" as const,
    fields: [
      { name: "wechatMerchantId", label: "WeChat Merchant ID", type: "text" },
      { name: "wechatApiKey",     label: "WeChat API Key",     type: "password" },
      { name: "alipayMerchantId", label: "Alipay Merchant ID", type: "text" },
      { name: "alipayApiKey",     label: "Alipay API Key",     type: "password" },
    ],
  },
  /* ── Buy Now, Pay Later ────────────────────────────────────────────────── */
  {
    key: "afterpay",
    label: "Afterpay",
    category: "Buy Now, Pay Later",
    description: "Let customers split purchases into 4 fortnightly payments — Australia's leading BNPL with over 3.8 million users.",
    authType: "credentials" as const,
    fields: [] as { name: string; label: string; type: string }[],
    comingSoon: true,
  },
  {
    key: "zip",
    label: "Zip Pay",
    category: "Buy Now, Pay Later",
    description: "Offer interest-free pay-later and pay-over-time options at checkout with Zip.",
    authType: "credentials" as const,
    fields: [] as { name: string; label: string; type: string }[],
    comingSoon: true,
  },
  {
    key: "klarna",
    label: "Klarna",
    category: "Buy Now, Pay Later",
    description: "Give customers flexibility to pay in 4, pay later, or finance larger purchases with Klarna.",
    authType: "credentials" as const,
    fields: [] as { name: string; label: string; type: string }[],
    comingSoon: true,
  },
  /* ── Digital Wallets ───────────────────────────────────────────────────── */
  {
    key: "apple_wallet",
    label: "Apple Wallet",
    category: "Digital Wallets",
    description: "Issue digital loyalty cards, membership passes, and coupons directly to Apple Wallet.",
    authType: "credentials" as const,
    fields: [
      { name: "passTypeId",        label: "Pass Type ID",           type: "text" },
      { name: "teamId",            label: "Apple Team ID",          type: "text" },
      { name: "certificateBase64", label: "Certificate (Base64)",   type: "password" },
    ],
  },
  {
    key: "google_pay",
    label: "Google Wallet",
    category: "Digital Wallets",
    description: "Issue loyalty cards and offers to Google Wallet — reach Android users with passes and promotions.",
    authType: "credentials" as const,
    fields: [] as { name: string; label: string; type: string }[],
    comingSoon: true,
  },
  /* ── Accounting & Finance ──────────────────────────────────────────────── */
  {
    key: "xero",
    label: "Xero",
    category: "Accounting & Finance",
    description: "Push sales, invoices, purchase orders, and contacts directly into Xero with GST mapped automatically.",
    authType: "oauth" as const,
    oauthProvider: "xero" as const,
  },
  {
    key: "myob",
    label: "MYOB",
    category: "Accounting & Finance",
    description: "Sync sales data and end-of-day takings directly to MYOB AccountRight or Essentials.",
    authType: "credentials" as const,
    fields: [] as { name: string; label: string; type: string }[],
    comingSoon: true,
  },
  /* ── Payroll & Staff ───────────────────────────────────────────────────── */
  {
    key: "deputy",
    label: "Deputy",
    category: "Payroll & Staff",
    description: "Sync staff rosters, clock-ins, and timesheets with Deputy for seamless Australian payroll.",
    authType: "credentials" as const,
    fields: [] as { name: string; label: string; type: string }[],
    comingSoon: true,
  },
  /* ── Shipping & Fulfilment ─────────────────────────────────────────────── */
  {
    key: "australia_post",
    label: "Australia Post",
    category: "Shipping & Fulfilment",
    description: "Calculate real-time postage rates, print labels, and book pickups at online checkout.",
    authType: "credentials" as const,
    fields: [
      { name: "apiKey",        label: "API Key",        type: "password" },
      { name: "accountNumber", label: "Account Number", type: "text" },
    ],
  },
  {
    key: "sendle",
    label: "Sendle",
    category: "Shipping & Fulfilment",
    description: "Book door-to-door parcel delivery across Australia with carbon-neutral Sendle — no fixed contracts.",
    authType: "credentials" as const,
    fields: [] as { name: string; label: string; type: string }[],
    comingSoon: true,
  },
  /* ── Marketing & CRM ──────────────────────────────────────────────────── */
  {
    key: "google_business",
    label: "Google Business Profile",
    category: "Marketing & CRM",
    description: "Keep your Google Maps listing accurate with business hours, special offers, and posts.",
    authType: "oauth" as const,
    oauthProvider: "google",
  },
  {
    key: "mailchimp",
    label: "Mailchimp",
    category: "Marketing & CRM",
    description: "Automatically add customers to Mailchimp audiences and trigger post-purchase email flows.",
    authType: "credentials" as const,
    fields: [] as { name: string; label: string; type: string }[],
    comingSoon: true,
  },
  {
    key: "meta_business",
    label: "Meta Business",
    category: "Marketing & CRM",
    description: "Sync your product catalogue and customer audiences to Facebook & Instagram for targeted ads.",
    authType: "credentials" as const,
    fields: [] as { name: string; label: string; type: string }[],
    comingSoon: true,
  },
  /* ── Backup & Storage ─────────────────────────────────────────────────── */
  {
    key: "google_drive",
    label: "Google Drive",
    category: "Backup & Storage",
    description: "Automatically back up sales reports, receipts, and exports to your Google Drive.",
    authType: "oauth" as const,
    oauthProvider: "google" as const,
  },
  {
    key: "onedrive",
    label: "Microsoft OneDrive",
    category: "Backup & Storage",
    description: "Back up your KoaPOS data to Microsoft OneDrive — ideal for businesses in the Microsoft 365 ecosystem.",
    authType: "oauth" as const,
    oauthProvider: "microsoft" as const,
  },
  {
    key: "dropbox",
    label: "Dropbox",
    category: "Backup & Storage",
    description: "Send automated backups of reports and exports directly to your Dropbox.",
    authType: "oauth" as const,
    oauthProvider: "dropbox" as const,
  },
  {
    key: "proton_drive",
    label: "Proton Drive",
    category: "Backup & Storage",
    description: "Store encrypted backups in Proton Drive for maximum privacy and security.",
    authType: "credentials" as const,
    fields: [] as { name: string; label: string; type: string }[],
    comingSoon: true,
  },
  /* ── Contacts & Calendar ───────────────────────────────────────────────── */
  {
    key: "google_contacts",
    label: "Google Account",
    category: "Contacts & Calendar",
    description: "Sync your customer list with Google Contacts and push appointments to Google Calendar.",
    authType: "oauth" as const,
    oauthProvider: "google" as const,
  },
  {
    key: "microsoft_contacts",
    label: "Microsoft Account",
    category: "Contacts & Calendar",
    description: "Sync customers to Outlook Contacts and push appointments to Microsoft Calendar / Teams.",
    authType: "oauth" as const,
    oauthProvider: "microsoft" as const,
  },
  {
    key: "apple_contacts",
    label: "Apple Account",
    category: "Contacts & Calendar",
    description: "Sync customers to iCloud Contacts and push appointments to Apple Calendar.",
    authType: "credentials" as const,
    fields: [] as { name: string; label: string; type: string }[],
    comingSoon: true,
  },
  /* ── AI & Automation ──────────────────────────────────────────────────── */
  {
    key: "openai",
    label: "OpenAI (Your Own Key)",
    category: "AI & Automation",
    description: "Use your own OpenAI API key for AI Insights, demand forecasting, and AI-generated product descriptions.",
    authType: "credentials" as const,
    fields: [
      { name: "apiKey", label: "API Key", type: "password" },
    ],
  },
  {
    key: "zapier",
    label: "Zapier",
    category: "AI & Automation",
    description: "Connect KoaPOS to 6,000+ apps — automate workflows triggered by sales, new customers, and inventory alerts.",
    authType: "credentials" as const,
    fields: [] as { name: string; label: string; type: string }[],
    comingSoon: true,
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

const GOOGLE_OAUTH_SCOPES: Record<string, string> = {
  google_business:  "https://www.googleapis.com/auth/business.manage",
  google_drive:     "https://www.googleapis.com/auth/drive.file",
  google_contacts:  "https://www.googleapis.com/auth/contacts https://www.googleapis.com/auth/calendar",
};

const MICROSOFT_OAUTH_SCOPES: Record<string, string> = {
  onedrive:             "Files.ReadWrite.AppFolder offline_access",
  microsoft_contacts:   "Contacts.ReadWrite Calendars.ReadWrite offline_access",
};

function buildOAuthStartUrl(key: string, req: import("express").Request): string | null {
  const proto = req.headers["x-forwarded-proto"] ?? req.protocol ?? "https";
  const host  = req.headers["x-forwarded-host"] ?? req.headers.host ?? "";
  const base  = `${proto}://${host}`;
  const callbackUrl = `${base}/api/integrations/oauth/${key}/callback`;

  /* ── Google (shared client, different scopes) ── */
  if (key in GOOGLE_OAUTH_SCOPES) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return null;
    const params = new URLSearchParams({
      client_id:     clientId,
      redirect_uri:  callbackUrl,
      response_type: "code",
      scope:         GOOGLE_OAUTH_SCOPES[key] ?? "",
      access_type:   "offline",
      prompt:        "consent",
      state:         String(req.session.merchantId),
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  /* ── Microsoft (shared client, different scopes) ── */
  if (key in MICROSOFT_OAUTH_SCOPES) {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    if (!clientId) return null;
    const params = new URLSearchParams({
      client_id:     clientId,
      redirect_uri:  callbackUrl,
      response_type: "code",
      scope:         MICROSOFT_OAUTH_SCOPES[key] ?? "",
      state:         String(req.session.merchantId),
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
  }

  /* ── Dropbox ── */
  if (key === "dropbox") {
    const appKey = process.env.DROPBOX_APP_KEY;
    if (!appKey) return null;
    const params = new URLSearchParams({
      client_id:         appKey,
      redirect_uri:      callbackUrl,
      response_type:     "code",
      token_access_type: "offline",
      state:             String(req.session.merchantId),
    });
    return `https://www.dropbox.com/oauth2/authorize?${params}`;
  }

  /* ── Stripe Connect ── */
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
    const row        = rowMap.get(intg.key);
    const comingSoon = "comingSoon" in intg ? (intg.comingSoon as boolean) : false;
    return {
      key:         intg.key,
      label:       intg.label,
      category:    intg.category,
      description: intg.description,
      authType:    intg.authType,
      fields:      "fields" in intg ? intg.fields : [],
      comingSoon,
      status:      comingSoon ? "disconnected" : (row?.status ?? "disconnected"),
      connectedAt: comingSoon ? null : (row?.connectedAt?.toISOString() ?? null),
      oauthConfigured:
        intg.authType === "oauth"
          ? intg.oauthProvider === "google"     ? !!process.env.GOOGLE_CLIENT_ID
          : intg.oauthProvider === "microsoft"  ? !!process.env.MICROSOFT_CLIENT_ID
          : intg.oauthProvider === "dropbox"    ? !!process.env.DROPBOX_APP_KEY
          : intg.oauthProvider === "stripe"     ? !!process.env.STRIPE_CONNECT_CLIENT_ID
          : intg.oauthProvider === "xero"       ? !!process.env.XERO_CLIENT_ID
          : false
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
  if ("comingSoon" in intg && intg.comingSoon) {
    res.status(400).json({ error: "This integration is coming soon" });
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
  const key        = String(req.params.key);
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
  const key = String(req.params.key);
  const url = buildOAuthStartUrl(key, req);

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

    if (key === "google_business" || key === "google_drive" || key === "google_contacts") {
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
      if (data.expires_in) expiresAt = new Date(Date.now() + data.expires_in * 1000);
    }

    if (key === "onedrive" || key === "microsoft_contacts") {
      const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id:     process.env.MICROSOFT_CLIENT_ID ?? "",
          client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
          redirect_uri:  callbackUrl,
          grant_type:    "authorization_code",
        }),
      });
      const data = await tokenRes.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
      accessToken  = data.access_token ?? "";
      refreshToken = data.refresh_token ?? "";
      if (data.expires_in) expiresAt = new Date(Date.now() + data.expires_in * 1000);
    }

    if (key === "dropbox") {
      const tokenRes = await fetch("https://api.dropboxapi.com/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id:     process.env.DROPBOX_APP_KEY ?? "",
          client_secret: process.env.DROPBOX_APP_SECRET ?? "",
          redirect_uri:  callbackUrl,
          grant_type:    "authorization_code",
        }),
      });
      const data = await tokenRes.json() as { access_token?: string; refresh_token?: string };
      accessToken  = data.access_token ?? "";
      refreshToken = data.refresh_token ?? "";
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
