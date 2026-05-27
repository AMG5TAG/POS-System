import { Router, type IRouter } from "express";
import { db, merchantIntegrationsTable, oauthTokenVaultTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { upsertVault, deleteVault } from "../services/tokenVault";

const router: IRouter = Router();

/* ── Integration catalogue ─────────────────────────────────────────────────
   section: top-level UI grouping
   useVault: true → encrypted token vault storage; false → legacy credentials column
*/
export const INTEGRATIONS = [
  /* ── CLOUD STORAGE ─────────────────────────────────────────────────────── */
  { key: "google_drive",    label: "Google Drive",          section: "cloud_storage",    category: "Cloud Storage",           description: "Automatically back up sales reports, receipts, and exports to your Google Drive.",                              authType: "oauth" as const, oauthProvider: "google"    as const, useVault: true  },
  { key: "onedrive",        label: "Microsoft OneDrive",    section: "cloud_storage",    category: "Cloud Storage",           description: "Back up your KoaPOS data to Microsoft OneDrive — ideal for Microsoft 365 businesses.",                          authType: "oauth" as const, oauthProvider: "microsoft" as const, useVault: true  },
  { key: "dropbox",         label: "Dropbox",               section: "cloud_storage",    category: "Cloud Storage",           description: "Send automated backups of reports and exports directly to your Dropbox.",                                        authType: "oauth" as const, oauthProvider: "dropbox"   as const, useVault: true  },
  { key: "proton_drive",    label: "Proton Drive",          section: "cloud_storage",    category: "Cloud Storage",           description: "Store encrypted backups in Proton Drive for maximum privacy and security.",                                      authType: "credentials" as const, fields: [] as F[], comingSoon: true, useVault: false },

  /* ── BUSINESS & FINANCE ─────────────────────────────────────────────────── */
  { key: "xero",            label: "Xero",                  section: "business_finance", category: "Business & Finance",      description: "Push sales, invoices, purchase orders, and contacts into Xero with GST mapped automatically.",                    authType: "oauth" as const, oauthProvider: "xero"      as const, useVault: false },
  { key: "quickbooks",      label: "QuickBooks Online",     section: "business_finance", category: "Business & Finance",      description: "Sync daily sales summaries, invoices, and customer records with QuickBooks Online (Intuit).",                     authType: "oauth" as const, oauthProvider: "quickbooks" as const, useVault: true },
  { key: "myob",            label: "MYOB",                  section: "business_finance", category: "Business & Finance",      description: "Sync sales data and end-of-day takings directly to MYOB AccountRight or Essentials.",                            authType: "credentials" as const, fields: [] as F[], comingSoon: true, useVault: false },
  { key: "stripe_own",      label: "Stripe",                section: "business_finance", category: "Business & Finance",      description: "Connect your own Stripe account to accept card payments from customers.",                                         authType: "oauth" as const, oauthProvider: "stripe"    as const, useVault: true  },
  { key: "square_terminal", label: "Square",                section: "business_finance", category: "Business & Finance",      description: "Accept in-store card payments via Square Terminal or Square Reader.",                                             authType: "credentials" as const, fields: [{ name: "accessToken", label: "Access Token", type: "password" }, { name: "locationId", label: "Location ID", type: "text" }] as F[], useVault: false },
  { key: "shopify",         label: "Shopify",               section: "business_finance", category: "Business & Finance",      description: "Sync your Shopify online store inventory, orders, and customer data with KoaPOS.",                               authType: "credentials" as const, fields: [] as F[], comingSoon: true, useVault: false },

  /* ── SOCIAL MEDIA & MARKETING ─────────────────────────────────────────── */
  { key: "meta_business",       label: "Meta Business",        section: "social_marketing", category: "Social Media & Marketing", description: "Sync your product catalogue and customer audiences to Facebook & Instagram for targeted ads.",             authType: "oauth" as const, oauthProvider: "meta"      as const, useVault: true  },
  { key: "instagram_business",  label: "Instagram Business",   section: "social_marketing", category: "Social Media & Marketing", description: "Connect your Instagram Business account to schedule posts, manage DMs, and track insights.",            authType: "oauth" as const, oauthProvider: "meta"      as const, useVault: true  },
  { key: "twitter_x",           label: "Twitter / X",          section: "social_marketing", category: "Social Media & Marketing", description: "Post promotions, reply to mentions, and track brand sentiment on Twitter / X.",                         authType: "oauth" as const, oauthProvider: "twitter"   as const, useVault: true  },
  { key: "linkedin_business",   label: "LinkedIn",             section: "social_marketing", category: "Social Media & Marketing", description: "Share business updates and promotions to your LinkedIn company page.",                                  authType: "oauth" as const, oauthProvider: "linkedin"  as const, useVault: true  },
  { key: "tiktok_business",     label: "TikTok for Business",  section: "social_marketing", category: "Social Media & Marketing", description: "Connect your TikTok Business account to run ads and track campaign performance.",                       authType: "oauth" as const, oauthProvider: "tiktok"    as const, useVault: true  },
  { key: "google_business",     label: "Google Business Profile", section: "social_marketing", category: "Social Media & Marketing", description: "Keep your Google Maps listing accurate with business hours, special offers, and posts.",         authType: "oauth" as const, oauthProvider: "google"    as const, useVault: true  },
  { key: "mailchimp",           label: "Mailchimp",            section: "social_marketing", category: "Social Media & Marketing", description: "Automatically add customers to Mailchimp audiences and trigger post-purchase email flows.",            authType: "credentials" as const, fields: [] as F[], comingSoon: true, useVault: false },

  /* ── PAYMENTS & EFTPOS ──────────────────────────────────────────────────── */
  { key: "commbank_eftpos", label: "CommBank EFTPOS",      section: "payments",         category: "Payments & EFTPOS",       description: "Integrate with CommBank Smart terminal for card-present payments.",                                            authType: "credentials" as const, fields: [{ name: "merchantId", label: "Merchant ID", type: "text" }, { name: "terminalId", label: "Terminal ID", type: "text" }, { name: "apiKey", label: "API Key", type: "password" }] as F[], useVault: false },
  { key: "tyro_eftpos",     label: "Tyro EFTPOS",          section: "payments",         category: "Payments & EFTPOS",       description: "Australia's most popular independent EFTPOS provider. Supports contactless, Apple Pay & Google Pay.",            authType: "credentials" as const, fields: [{ name: "merchantId", label: "Merchant ID", type: "text" }, { name: "terminalId", label: "Terminal ID", type: "text" }, { name: "apiKey", label: "API Key", type: "password" }] as F[], useVault: false },
  { key: "paypal",          label: "PayPal",                section: "payments",         category: "Payments & EFTPOS",       description: "Accept PayPal in-store via QR code — customer scans with the PayPal app to pay.",                              authType: "credentials" as const, fields: [{ name: "clientId", label: "Client ID", type: "text" }, { name: "clientSecret", label: "Client Secret", type: "password" }, { name: "merchantId", label: "Merchant ID", type: "text" }] as F[], useVault: false },
  { key: "wechat_alipay",   label: "WeChat Pay & Alipay",  section: "payments",         category: "Payments & EFTPOS",       description: "Display merchant QR codes for WeChat Pay and Alipay in-store.",                                               authType: "credentials" as const, fields: [{ name: "wechatMerchantId", label: "WeChat Merchant ID", type: "text" }, { name: "wechatApiKey", label: "WeChat API Key", type: "password" }, { name: "alipayMerchantId", label: "Alipay Merchant ID", type: "text" }, { name: "alipayApiKey", label: "Alipay API Key", type: "password" }] as F[], useVault: false },

  /* ── BUY NOW PAY LATER ───────────────────────────────────────────────────── */
  { key: "afterpay", label: "Afterpay", section: "bnpl", category: "Buy Now, Pay Later", description: "Let customers split purchases into 4 fortnightly payments.",                              authType: "credentials" as const, fields: [] as F[], comingSoon: true, useVault: false },
  { key: "zip",      label: "Zip Pay",  section: "bnpl", category: "Buy Now, Pay Later", description: "Offer interest-free pay-later and pay-over-time options at checkout.",                    authType: "credentials" as const, fields: [] as F[], comingSoon: true, useVault: false },
  { key: "klarna",   label: "Klarna",   section: "bnpl", category: "Buy Now, Pay Later", description: "Flexible payment options — pay in 4, pay later, or finance larger purchases.",             authType: "credentials" as const, fields: [] as F[], comingSoon: true, useVault: false },

  /* ── DIGITAL WALLETS ─────────────────────────────────────────────────────── */
  { key: "apple_wallet", label: "Apple Wallet",  section: "wallets", category: "Digital Wallets", description: "Issue digital loyalty cards, membership passes, and coupons directly to Apple Wallet.", authType: "credentials" as const, fields: [{ name: "passTypeId", label: "Pass Type ID", type: "text" }, { name: "teamId", label: "Apple Team ID", type: "text" }, { name: "certificateBase64", label: "Certificate (Base64)", type: "password" }] as F[], useVault: false },
  { key: "google_pay",   label: "Google Wallet", section: "wallets", category: "Digital Wallets", description: "Issue loyalty cards and offers to Google Wallet.",                                    authType: "credentials" as const, fields: [] as F[], comingSoon: true, useVault: false },

  /* ── PAYROLL & STAFF ─────────────────────────────────────────────────────── */
  { key: "deputy", label: "Deputy", section: "payroll", category: "Payroll & Staff", description: "Sync staff rosters, clock-ins, and timesheets with Deputy for seamless Australian payroll.", authType: "credentials" as const, fields: [] as F[], comingSoon: true, useVault: false },

  /* ── SHIPPING ──────────────────────────────────────────────────────────── */
  { key: "australia_post", label: "Australia Post", section: "shipping", category: "Shipping & Fulfilment", description: "Calculate real-time postage rates, print labels, and book pickups at online checkout.", authType: "credentials" as const, fields: [{ name: "apiKey", label: "API Key", type: "password" }, { name: "accountNumber", label: "Account Number", type: "text" }] as F[], useVault: false },
  { key: "sendle",         label: "Sendle",          section: "shipping", category: "Shipping & Fulfilment", description: "Carbon-neutral door-to-door parcel delivery across Australia — no fixed contracts.",   authType: "credentials" as const, fields: [] as F[], comingSoon: true, useVault: false },

  /* ── CONTACTS & CALENDAR ─────────────────────────────────────────────────── */
  { key: "google_contacts",    label: "Google Account",    section: "contacts", category: "Contacts & Calendar", description: "Sync your customer list with Google Contacts and push appointments to Google Calendar.", authType: "oauth" as const, oauthProvider: "google"    as const, useVault: true  },
  { key: "microsoft_contacts", label: "Microsoft Account", section: "contacts", category: "Contacts & Calendar", description: "Sync customers to Outlook Contacts and push appointments to Microsoft Calendar.",        authType: "oauth" as const, oauthProvider: "microsoft" as const, useVault: true  },
  { key: "apple_contacts",     label: "Apple Account",     section: "contacts", category: "Contacts & Calendar", description: "Sync customers to iCloud Contacts and push appointments to Apple Calendar.",             authType: "credentials" as const, fields: [] as F[], comingSoon: true, useVault: false },

  /* ── AI & AUTOMATION ────────────────────────────────────────────────────── */
  { key: "openai", label: "OpenAI (Your Own Key)", section: "ai", category: "AI & Automation", description: "Use your own OpenAI API key for AI Insights, demand forecasting, and AI-generated product descriptions.", authType: "credentials" as const, fields: [{ name: "apiKey", label: "API Key", type: "password" }] as F[], useVault: false },
  { key: "zapier", label: "Zapier",                section: "ai", category: "AI & Automation", description: "Connect KoaPOS to 6,000+ apps — automate workflows triggered by sales, customers, and inventory.",        authType: "credentials" as const, fields: [] as F[], comingSoon: true, useVault: false },
] as const;

type F = { name: string; label: string; type: string };
type IntegrationKey = typeof INTEGRATIONS[number]["key"];

/* ── Helpers ────────────────────────────────────────────────────────────────── */

async function getRow(merchantId: number, key: string) {
  const [row] = await db.select().from(merchantIntegrationsTable).where(and(eq(merchantIntegrationsTable.merchantId, merchantId), eq(merchantIntegrationsTable.integrationKey, key))).limit(1);
  return row ?? null;
}

function isOAuthConfigured(provider: string): boolean {
  switch (provider) {
    case "google":     return !!process.env.GOOGLE_CLIENT_ID;
    case "microsoft":  return !!process.env.MICROSOFT_CLIENT_ID;
    case "dropbox":    return !!process.env.DROPBOX_APP_KEY;
    case "stripe":     return !!process.env.STRIPE_CONNECT_CLIENT_ID;
    case "xero":       return !!process.env.XERO_CLIENT_ID;
    case "quickbooks": return !!process.env.QUICKBOOKS_CLIENT_ID;
    case "meta":       return !!process.env.META_APP_ID;
    case "twitter":    return !!process.env.TWITTER_CLIENT_ID;
    case "linkedin":   return !!process.env.LINKEDIN_CLIENT_ID;
    case "tiktok":     return !!process.env.TIKTOK_CLIENT_KEY;
    default:           return false;
  }
}

/* ── OAuth URL builders ─────────────────────────────────────────────────────── */

const GOOGLE_SCOPES: Record<string, string> = {
  google_business:  "https://www.googleapis.com/auth/business.manage",
  google_drive:     "https://www.googleapis.com/auth/drive.file",
  google_contacts:  "https://www.googleapis.com/auth/contacts https://www.googleapis.com/auth/calendar",
};

const MICROSOFT_SCOPES: Record<string, string> = {
  onedrive:             "Files.ReadWrite.AppFolder offline_access",
  microsoft_contacts:   "Contacts.ReadWrite Calendars.ReadWrite offline_access",
};

function cbUrl(key: string, req: import("express").Request): string {
  const proto = req.headers["x-forwarded-proto"] ?? req.protocol ?? "https";
  const host  = req.headers["x-forwarded-host"] ?? req.headers.host ?? "";
  return `${proto}://${host}/api/integrations/oauth/${key}/callback`;
}

function buildOAuthStartUrl(key: string, req: import("express").Request): string | null {
  const cb = cbUrl(key, req);
  const state = String(req.session.merchantId);

  if (key in GOOGLE_SCOPES) {
    const cid = process.env.GOOGLE_CLIENT_ID; if (!cid) return null;
    return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: cid, redirect_uri: cb, response_type: "code", scope: GOOGLE_SCOPES[key]!, access_type: "offline", prompt: "consent", state })}`;
  }
  if (key in MICROSOFT_SCOPES) {
    const cid = process.env.MICROSOFT_CLIENT_ID; if (!cid) return null;
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${new URLSearchParams({ client_id: cid, redirect_uri: cb, response_type: "code", scope: MICROSOFT_SCOPES[key]!, state })}`;
  }
  if (key === "dropbox") {
    const k = process.env.DROPBOX_APP_KEY; if (!k) return null;
    return `https://www.dropbox.com/oauth2/authorize?${new URLSearchParams({ client_id: k, redirect_uri: cb, response_type: "code", token_access_type: "offline", state })}`;
  }
  if (key === "stripe_own") {
    const cid = process.env.STRIPE_CONNECT_CLIENT_ID; if (!cid) return null;
    return `https://connect.stripe.com/oauth/authorize?${new URLSearchParams({ response_type: "code", client_id: cid, scope: "read_write", redirect_uri: cb, state })}`;
  }
  if (key === "quickbooks") {
    const cid = process.env.QUICKBOOKS_CLIENT_ID; if (!cid) return null;
    return `https://appcenter.intuit.com/connect/oauth2?${new URLSearchParams({ client_id: cid, redirect_uri: cb, response_type: "code", scope: "com.intuit.quickbooks.accounting", state })}`;
  }
  if (key === "meta_business" || key === "instagram_business") {
    const appId = process.env.META_APP_ID; if (!appId) return null;
    const scope = key === "instagram_business" ? "instagram_basic,instagram_content_publish,instagram_manage_insights" : "pages_manage_ads,pages_read_engagement,business_management";
    return `https://www.facebook.com/v19.0/dialog/oauth?${new URLSearchParams({ client_id: appId, redirect_uri: cb, response_type: "code", scope, state })}`;
  }
  if (key === "twitter_x") {
    const cid = process.env.TWITTER_CLIENT_ID; if (!cid) return null;
    return `https://twitter.com/i/oauth2/authorize?${new URLSearchParams({ response_type: "code", client_id: cid, redirect_uri: cb, scope: "tweet.read tweet.write users.read offline.access", state, code_challenge: "challenge", code_challenge_method: "plain" })}`;
  }
  if (key === "linkedin_business") {
    const cid = process.env.LINKEDIN_CLIENT_ID; if (!cid) return null;
    return `https://www.linkedin.com/oauth/v2/authorization?${new URLSearchParams({ response_type: "code", client_id: cid, redirect_uri: cb, scope: "r_organization_social w_organization_social r_basicprofile", state })}`;
  }
  if (key === "tiktok_business") {
    const k = process.env.TIKTOK_CLIENT_KEY; if (!k) return null;
    return `https://business-api.tiktok.com/portal/auth?${new URLSearchParams({ app_id: k, redirect_uri: cb, state })}`;
  }
  return null;
}

/* ── Token exchange ──────────────────────────────────────────────────────────── */

async function exchangeToken(key: string, code: string, cb: string, extra?: Record<string, string>): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date | null; accountId?: string; accountHandle?: string }> {
  if (key === "google_drive" || key === "google_business" || key === "google_contacts") {
    const d = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", redirect_uri: cb, grant_type: "authorization_code" }) }).then((r) => r.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    const accessToken = d.access_token ?? "";
    let accountId: string | undefined, accountHandle: string | undefined;
    if (accessToken) {
      const profile = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } }).then((r) => r.json()).catch(() => ({})) as { sub?: string; email?: string };
      accountId = profile.sub; accountHandle = profile.email;
    }
    return { accessToken, refreshToken: d.refresh_token ?? "", expiresAt: d.expires_in ? new Date(Date.now() + d.expires_in * 1000) : null, accountId, accountHandle };
  }
  if (key === "onedrive" || key === "microsoft_contacts") {
    const d = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: process.env.MICROSOFT_CLIENT_ID ?? "", client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "", redirect_uri: cb, grant_type: "authorization_code" }) }).then((r) => r.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    const accessToken = d.access_token ?? "";
    let accountId: string | undefined, accountHandle: string | undefined;
    if (accessToken) {
      const profile = await fetch("https://graph.microsoft.com/v1.0/me", { headers: { Authorization: `Bearer ${accessToken}` } }).then((r) => r.json()).catch(() => ({})) as { id?: string; mail?: string; userPrincipalName?: string };
      accountId = profile.id; accountHandle = profile.mail ?? profile.userPrincipalName;
    }
    return { accessToken, refreshToken: d.refresh_token ?? "", expiresAt: d.expires_in ? new Date(Date.now() + d.expires_in * 1000) : null, accountId, accountHandle };
  }
  if (key === "dropbox") {
    const d = await fetch("https://api.dropboxapi.com/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: process.env.DROPBOX_APP_KEY ?? "", client_secret: process.env.DROPBOX_APP_SECRET ?? "", redirect_uri: cb, grant_type: "authorization_code" }) }).then((r) => r.json()) as { access_token?: string; refresh_token?: string; account_id?: string };
    const accessToken = d.access_token ?? "";
    let accountHandle: string | undefined;
    if (accessToken) {
      const profile = await fetch("https://api.dropboxapi.com/2/users/get_current_account", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: "null" }).then((r) => r.json()).catch(() => ({})) as { email?: string };
      accountHandle = profile.email;
    }
    return { accessToken, refreshToken: d.refresh_token ?? "", expiresAt: null, accountId: d.account_id, accountHandle };
  }
  if (key === "stripe_own") {
    const d = await fetch("https://connect.stripe.com/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, client_secret: process.env.STRIPE_SECRET_KEY ?? "" }) }).then((r) => r.json()) as { access_token?: string; refresh_token?: string; stripe_user_id?: string };
    const accessToken = d.access_token ?? "";
    let accountHandle: string | undefined;
    if (d.stripe_user_id) {
      const account = await fetch(`https://api.stripe.com/v1/accounts/${d.stripe_user_id}`, { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY ?? ""}` } }).then((r) => r.json()).catch(() => ({})) as { email?: string; business_profile?: { name?: string } };
      accountHandle = account.business_profile?.name ?? account.email;
    }
    return { accessToken, refreshToken: d.refresh_token ?? "", expiresAt: null, accountId: d.stripe_user_id, accountHandle };
  }
  if (key === "quickbooks") {
    const basicCreds = Buffer.from(`${process.env.QUICKBOOKS_CLIENT_ID}:${process.env.QUICKBOOKS_CLIENT_SECRET}`).toString("base64");
    const d = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basicCreds}` }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: cb }) }).then((r) => r.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    const accessToken = d.access_token ?? "";
    let accountHandle: string | undefined;
    if (accessToken) {
      const profile = await fetch("https://accounts.platform.intuit.com/v1/openid_connect/userinfo", { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }).then((r) => r.json()).catch(() => ({})) as { email?: string; givenName?: string; familyName?: string };
      accountHandle = profile.email ?? (profile.givenName ? `${profile.givenName} ${profile.familyName ?? ""}`.trim() : undefined);
    }
    return { accessToken, refreshToken: d.refresh_token ?? "", expiresAt: d.expires_in ? new Date(Date.now() + d.expires_in * 1000) : null, accountId: extra?.realmId, accountHandle };
  }
  if (key === "meta_business" || key === "instagram_business") {
    const d = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?${new URLSearchParams({ client_id: process.env.META_APP_ID ?? "", client_secret: process.env.META_APP_SECRET ?? "", redirect_uri: cb, code })}`).then((r) => r.json()) as { access_token?: string; expires_in?: number };
    return { accessToken: d.access_token ?? "", refreshToken: "", expiresAt: d.expires_in ? new Date(Date.now() + d.expires_in * 1000) : null };
  }
  if (key === "twitter_x") {
    const creds = Buffer.from(`${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`).toString("base64");
    const d = await fetch("https://api.twitter.com/2/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${creds}` }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: cb, code_verifier: "challenge" }) }).then((r) => r.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    return { accessToken: d.access_token ?? "", refreshToken: d.refresh_token ?? "", expiresAt: d.expires_in ? new Date(Date.now() + d.expires_in * 1000) : null };
  }
  if (key === "linkedin_business") {
    const d = await fetch("https://www.linkedin.com/oauth/v2/accessToken", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: process.env.LINKEDIN_CLIENT_ID ?? "", client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "", redirect_uri: cb }) }).then((r) => r.json()) as { access_token?: string; expires_in?: number };
    return { accessToken: d.access_token ?? "", refreshToken: "", expiresAt: d.expires_in ? new Date(Date.now() + d.expires_in * 1000) : null };
  }
  if (key === "tiktok_business") {
    const d = await fetch("https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app_id: process.env.TIKTOK_CLIENT_KEY, secret: process.env.TIKTOK_CLIENT_SECRET, auth_code: code }) }).then((r) => r.json()) as { data?: { access_token?: string; advertiser_id?: string } };
    return { accessToken: d.data?.access_token ?? "", refreshToken: "", expiresAt: null, accountId: d.data?.advertiser_id };
  }
  throw new Error(`No token exchange handler for: ${key}`);
}

/* ── GET /integrations ──────────────────────────────────────────────────────── */

router.get("/integrations", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const rows = await db.select().from(merchantIntegrationsTable).where(eq(merchantIntegrationsTable.merchantId, merchantId));
  const rowMap = new Map(rows.map((r) => [r.integrationKey, r]));
  const vaultRows = await db.select({ provider: oauthTokenVaultTable.provider, connectedAt: oauthTokenVaultTable.connectedAt, accountHandle: oauthTokenVaultTable.accountHandle, accountId: oauthTokenVaultTable.accountId }).from(oauthTokenVaultTable).where(eq(oauthTokenVaultTable.merchantId, merchantId));
  const vaultMap = new Map(vaultRows.map((r) => [r.provider, r]));

  const result = INTEGRATIONS.map((intg) => {
    const row        = rowMap.get(intg.key);
    const vaultRow   = vaultMap.get(intg.key);
    const comingSoon = "comingSoon" in intg ? (intg.comingSoon as boolean) : false;
    const oauthProv  = "oauthProvider" in intg ? intg.oauthProvider : null;

    let status = "disconnected", connectedAt: string | null = null, accountHandle: string | null = null, accountId: string | null = null;
    if (!comingSoon) {
      if (intg.useVault && vaultRow?.connectedAt) {
        status = "connected"; connectedAt = vaultRow.connectedAt.toISOString();
        accountHandle = vaultRow.accountHandle ?? null; accountId = vaultRow.accountId ?? null;
      } else if (row?.status === "connected") {
        status = "connected"; connectedAt = row.connectedAt?.toISOString() ?? null;
        // For Xero: surface the tenant name stored in credentials as accountHandle
        if (intg.key === "xero" && row.credentials) {
          try { const c = JSON.parse(row.credentials) as { tenantName?: string; tenantId?: string }; accountHandle = c.tenantName ?? null; accountId = c.tenantId ?? null; } catch { /* ignore */ }
        }
      }
    }

    return {
      key: intg.key, label: intg.label, section: intg.section, category: intg.category,
      description: intg.description, authType: intg.authType,
      fields: "fields" in intg ? intg.fields : [],
      comingSoon, useVault: intg.useVault, status, connectedAt, accountHandle, accountId,
      oauthConfigured: oauthProv ? isOAuthConfigured(oauthProv) : null,
    };
  });

  res.json(result);
});

/* ── POST /integrations/:key/connect ──────────────────────────────────────── */

router.post("/integrations/:key/connect", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const key = String(req.params.key) as IntegrationKey;
  const intg = INTEGRATIONS.find((i) => i.key === key);
  if (!intg) { res.status(404).json({ error: "Unknown integration" }); return; }
  if ("comingSoon" in intg && intg.comingSoon) { res.status(400).json({ error: "Coming soon" }); return; }
  if (intg.authType !== "credentials") { res.status(400).json({ error: "Use OAuth flow" }); return; }
  const credentials = JSON.stringify(req.body ?? {});
  const existing = await getRow(merchantId, key);
  if (existing) { await db.update(merchantIntegrationsTable).set({ status: "connected", credentials, connectedAt: new Date() }).where(eq(merchantIntegrationsTable.id, existing.id)); }
  else { await db.insert(merchantIntegrationsTable).values({ merchantId, integrationKey: key, status: "connected", credentials, connectedAt: new Date() }); }
  res.json({ status: "connected" });
});

/* ── DELETE /integrations/:key ─────────────────────────────────────────────── */

router.delete("/integrations/:key", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const key = String(req.params.key);
  const intg = INTEGRATIONS.find((i) => i.key === key);
  if (intg?.useVault) await deleteVault(merchantId, key);
  const existing = await getRow(merchantId, key);
  if (existing) { await db.update(merchantIntegrationsTable).set({ status: "disconnected", credentials: null, accessToken: null, refreshToken: null, connectedAt: null }).where(eq(merchantIntegrationsTable.id, existing.id)); }
  res.json({ status: "disconnected" });
});

/* ── GET /integrations/oauth/:key/start ────────────────────────────────────── */

router.get("/integrations/oauth/:key/start", requireAuth, (req, res): void => {
  const key = String(req.params.key);
  const url = buildOAuthStartUrl(key, req);
  if (!url) { res.redirect(`/management/integrations?error=${key}_oauth_not_configured`); return; }
  res.redirect(url);
});

/* ── GET /integrations/oauth/:key/callback ─────────────────────────────────── */

router.get("/integrations/oauth/:key/callback", async (req, res): Promise<void> => {
  const { key } = req.params;
  const { code, state, error, realmId } = req.query as Record<string, string>;
  if (error || !code || !state) { res.redirect(`/management/integrations?error=${key}_oauth_denied`); return; }
  const merchantId = parseInt(state, 10);
  if (isNaN(merchantId)) { res.redirect(`/management/integrations?error=${key}_invalid_state`); return; }
  // Xero has a dedicated route with full tenant-selection flow — hand off there
  if (key === "xero") { res.redirect(`/api/xero/auth/start`); return; }

  try {
    const cb = cbUrl(key, req);
    const extra = realmId ? { realmId } : undefined;
    const { accessToken, refreshToken, expiresAt, accountId, accountHandle } = await exchangeToken(key, code, cb, extra);
    const intg = INTEGRATIONS.find((i) => i.key === key);

    if (intg?.useVault) {
      await upsertVault(merchantId, { provider: key, accessToken, refreshToken: refreshToken || undefined, tokenExpiresAt: expiresAt ?? undefined, accountId, accountHandle });
    }

    const existing = await getRow(merchantId, key);
    if (existing) { await db.update(merchantIntegrationsTable).set({ status: "connected", ...(!intg?.useVault ? { accessToken, refreshToken, tokenExpiresAt: expiresAt } : {}), connectedAt: new Date() }).where(eq(merchantIntegrationsTable.id, existing.id)); }
    else { await db.insert(merchantIntegrationsTable).values({ merchantId, integrationKey: key, status: "connected", ...(!intg?.useVault ? { accessToken, refreshToken, tokenExpiresAt: expiresAt } : {}), connectedAt: new Date() }); }

    res.redirect(`/management/integrations?success=${key}`);
  } catch {
    res.redirect(`/management/integrations?error=${key}_token_exchange_failed`);
  }
});

export default router;
