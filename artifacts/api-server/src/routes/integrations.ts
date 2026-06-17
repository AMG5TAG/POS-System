import { Router, type IRouter } from "express";
import { db, merchantIntegrationsTable, oauthTokenVaultTable, customersTable, customerNotesTable, appointmentsTable } from "@workspace/db";
import { eq, and, desc, gte } from "drizzle-orm";
import crypto from "crypto";
import { requireAuth } from "../middlewares/requireAuth";
import { upsertVault, deleteVault, readVault, upsertCredentialVault, getOAuthAppCreds, saveOAuthAppCreds } from "../services/tokenVault";
import { getValidMicrosoftToken, MicrosoftNotConnectedError } from "../services/microsoftToken";

const router: IRouter = Router();

/* ── Integration catalogue ─────────────────────────────────────────────────
   section: top-level UI grouping (accounting | ecommerce | payments | marketing | cloud)
   useVault: true → encrypted token vault storage; false → legacy credentials column
*/
export const INTEGRATIONS = [
  /* ── ACCOUNTING & FINANCE ──────────────────────────────────────────────── */
  { key: "xero",            label: "Xero",                  section: "accounting", category: "Accounting & Finance", description: "Push sales, invoices, purchase orders, and contacts into Xero with GST mapped automatically. Connect with your own Xero app credentials.", authType: "credentials" as const, byoOAuth: true, fields: [{ name: "clientId", label: "Client ID", type: "text" }, { name: "clientSecret", label: "Client Secret", type: "password" }] as F[], useVault: false },
  { key: "quickbooks",      label: "QuickBooks Online",     section: "accounting", category: "Accounting & Finance", description: "Sync daily sales summaries, invoices, and customer records with QuickBooks Online. Connect with your own QuickBooks app credentials.", authType: "credentials" as const, byoOAuth: true, fields: [{ name: "clientId", label: "Client ID", type: "text" }, { name: "clientSecret", label: "Client Secret", type: "password" }] as F[], useVault: true  },
  { key: "myob",            label: "MYOB",                  section: "accounting", category: "Accounting & Finance", description: "Sync sales data and end-of-day takings to MYOB AccountRight or Essentials. Connect with your own MYOB app credentials.", authType: "credentials" as const, byoOAuth: true, fields: [{ name: "clientId", label: "Client ID", type: "text" }, { name: "clientSecret", label: "Client Secret", type: "password" }] as F[], useVault: true },

  /* ── E-COMMERCE & MARKETPLACES ─────────────────────────────────────────── */
  { key: "shopify",         label: "Shopify",               section: "ecommerce",  category: "E-Commerce & Marketplaces", description: "Sync your Shopify online store inventory, orders, and customer data with KoaPOS.",                    authType: "credentials" as const, fields: [] as F[], comingSoon: true, useVault: false },
  { key: "ebay",            label: "eBay",                  section: "ecommerce",  category: "E-Commerce & Marketplaces", description: "List products, sync stock, and manage eBay orders directly from KoaPOS.",                            authType: "credentials" as const, fields: [] as F[], comingSoon: true, useVault: false },
  { key: "amazon",          label: "Amazon",                section: "ecommerce",  category: "E-Commerce & Marketplaces", description: "Connect your Amazon Seller account to sync listings, inventory, and fulfilled orders.",               authType: "credentials" as const, fields: [] as F[], comingSoon: true, useVault: false },
  { key: "woocommerce",     label: "WooCommerce",           section: "ecommerce",  category: "E-Commerce & Marketplaces", description: "Sync products, stock, and orders between your WooCommerce store and KoaPOS.",                        authType: "credentials" as const, fields: [] as F[], comingSoon: true, useVault: false },
  { key: "australia_post",  label: "Australia Post",        section: "ecommerce",  category: "E-Commerce & Marketplaces", description: "Calculate real-time postage rates, print labels, and book pickups at online checkout.",              authType: "credentials" as const, fields: [{ name: "apiKey", label: "API Key", type: "password" }, { name: "accountNumber", label: "Account Number", type: "text" }] as F[], useVault: false },
  { key: "sendle",          label: "Sendle",                section: "ecommerce",  category: "E-Commerce & Marketplaces", description: "Carbon-neutral door-to-door parcel delivery across Australia — no fixed contracts.",                  authType: "credentials" as const, fields: [] as F[], comingSoon: true, useVault: false },

  /* ── PAYMENTS & TERMINALS ──────────────────────────────────────────────── */
  { key: "stripe_own",      label: "Stripe",                section: "payments",   category: "Payments & Terminals", description: "Connect your own Stripe account with your API keys to accept card payments and manage payouts.",            authType: "credentials" as const, fields: [{ name: "secretKey", label: "Secret Key", type: "password" }, { name: "publishableKey", label: "Publishable Key", type: "text" }, { name: "webhookSecret", label: "Webhook Signing Secret", type: "password" }] as F[], useVault: true  },
  { key: "commbank_eftpos", label: "CommBank EFTPOS",       section: "payments",   category: "Payments & Terminals", description: "Integrate with CommBank Smart terminal for card-present payments.",                                       authType: "credentials" as const, fields: [{ name: "merchantId", label: "Merchant ID", type: "text" }, { name: "terminalId", label: "Terminal ID", type: "text" }, { name: "apiKey", label: "API Key", type: "password" }] as F[], useVault: false },
  { key: "square_terminal", label: "Square",                section: "payments",   category: "Payments & Terminals", description: "Accept in-store card payments via Square Terminal or Square Reader.",                                     authType: "credentials" as const, fields: [{ name: "accessToken", label: "Access Token", type: "password" }, { name: "locationId", label: "Location ID", type: "text" }] as F[], useVault: false },
  { key: "tyro_eftpos",     label: "Tyro EFTPOS",           section: "payments",   category: "Payments & Terminals", description: "Australia's most popular independent EFTPOS provider — contactless, Apple Pay & Google Pay.",             authType: "credentials" as const, fields: [{ name: "merchantId", label: "Merchant ID", type: "text" }, { name: "terminalId", label: "Terminal ID", type: "text" }, { name: "apiKey", label: "API Key", type: "password" }] as F[], useVault: false },
  { key: "paypal",          label: "PayPal",                section: "payments",   category: "Payments & Terminals", description: "Accept PayPal in-store via QR code — customer scans with the PayPal app to pay.",                        authType: "credentials" as const, fields: [{ name: "clientId", label: "Client ID", type: "text" }, { name: "clientSecret", label: "Client Secret", type: "password" }, { name: "merchantId", label: "Merchant ID", type: "text" }] as F[], useVault: false },
  { key: "wechat_alipay",   label: "WeChat Pay & Alipay",   section: "payments",   category: "Payments & Terminals", description: "Display merchant QR codes for WeChat Pay and Alipay in-store.",                                          authType: "credentials" as const, fields: [{ name: "wechatMerchantId", label: "WeChat Merchant ID", type: "text" }, { name: "wechatApiKey", label: "WeChat API Key", type: "password" }, { name: "alipayMerchantId", label: "Alipay Merchant ID", type: "text" }, { name: "alipayApiKey", label: "Alipay API Key", type: "password" }] as F[], useVault: false },
  { key: "afterpay",        label: "Afterpay",              section: "payments",   category: "Payments & Terminals", description: "Let customers split purchases into 4 fortnightly payments.",                                              authType: "credentials" as const, fields: [{ name: "merchantId", label: "Merchant ID", type: "text" }, { name: "apiKey", label: "API Key", type: "password" }, { name: "webhookSecret", label: "Webhook Signing Secret", type: "password" }] as F[], useVault: true },
  { key: "zip",             label: "Zip Pay",               section: "payments",   category: "Payments & Terminals", description: "Offer interest-free pay-later and pay-over-time options at checkout.",                                   authType: "credentials" as const, fields: [{ name: "merchantId", label: "Merchant ID", type: "text" }, { name: "apiKey", label: "API Key", type: "password" }, { name: "webhookSecret", label: "Webhook Signing Secret", type: "password" }] as F[], useVault: true },
  { key: "klarna",          label: "Klarna",                section: "payments",   category: "Payments & Terminals", description: "Flexible payment options — pay in 4, pay later, or finance larger purchases.",                            authType: "credentials" as const, fields: [{ name: "merchantId", label: "Merchant ID", type: "text" }, { name: "apiKey", label: "API Key", type: "password" }, { name: "webhookSecret", label: "Webhook Signing Secret", type: "password" }] as F[], useVault: true },
  { key: "apple_wallet",    label: "Apple Wallet",          section: "payments",   category: "Payments & Terminals", description: "Issue digital loyalty cards, membership passes, and coupons directly to Apple Wallet.",                  authType: "credentials" as const, fields: [{ name: "passTypeId", label: "Pass Type ID", type: "text" }, { name: "teamId", label: "Apple Team ID", type: "text" }, { name: "certificateBase64", label: "Certificate (Base64)", type: "password" }] as F[], useVault: false },
  { key: "google_pay",      label: "Google Wallet",         section: "payments",   category: "Payments & Terminals", description: "Issue loyalty cards and offers to Google Wallet.",                                                        authType: "credentials" as const, fields: [] as F[], comingSoon: true, useVault: false },

  /* ── MARKETING & SOCIALS ───────────────────────────────────────────────── */
  { key: "google_ads",          label: "Google Ads",              section: "marketing", category: "Marketing & Socials", description: "Create, manage, and track ad campaigns tied to your KoaPOS product catalogue.",                    authType: "oauth" as const, oauthProvider: "google"    as const, useVault: true  },
  { key: "meta_business",       label: "Meta Business",           section: "marketing", category: "Marketing & Socials", description: "Sync your product catalogue and customer audiences to Facebook & Instagram for targeted ads.",    authType: "oauth" as const, oauthProvider: "meta"      as const, useVault: true  },
  { key: "twitter_x",           label: "Twitter / X",             section: "marketing", category: "Marketing & Socials", description: "Post promotions, reply to mentions, and track brand sentiment on Twitter / X.",                authType: "oauth" as const, oauthProvider: "twitter"   as const, useVault: true  },
  { key: "tiktok_business",     label: "TikTok for Business",     section: "marketing", category: "Marketing & Socials", description: "Run ads, track performance, and grow your audience on TikTok Business.",                       authType: "oauth" as const, oauthProvider: "tiktok"    as const, useVault: true  },
  { key: "linkedin_business",   label: "LinkedIn",                section: "marketing", category: "Marketing & Socials", description: "Share business updates and promotions to your LinkedIn company page.",                         authType: "oauth" as const, oauthProvider: "linkedin"  as const, useVault: true  },
  { key: "instagram_business",  label: "Instagram Business",      section: "marketing", category: "Marketing & Socials", description: "Schedule posts, manage DMs, and track insights on Instagram Business.",                       authType: "oauth" as const, oauthProvider: "meta"      as const, useVault: true  },
  { key: "google_business",     label: "Google Business Profile", section: "marketing", category: "Marketing & Socials", description: "Keep your Google Maps listing accurate with hours, offers, and posts.",                       authType: "oauth" as const, oauthProvider: "google"    as const, useVault: true  },
  { key: "youtube_channel",     label: "YouTube Channel",         section: "marketing", category: "Marketing & Socials", description: "Publish video content, manage community posts, and pull channel analytics.",                  authType: "oauth" as const, oauthProvider: "google"    as const, useVault: true  },
  { key: "mailchimp",           label: "Mailchimp",               section: "marketing", category: "Marketing & Socials", description: "Add customers to Mailchimp audiences and trigger post-purchase email flows.",                  authType: "credentials" as const, fields: [] as F[], comingSoon: true, useVault: false },

  /* ── CLOUD STORAGE & PRODUCTIVITY ─────────────────────────────────────── */
  { key: "google_drive",        label: "Google Workspace",    section: "cloud", category: "Cloud Storage & Productivity", description: "Back up reports to Google Drive and sync contacts and appointments with Google Workspace.",   authType: "oauth" as const, oauthProvider: "google"    as const, useVault: true  },
  { key: "onedrive",            label: "Microsoft OneDrive",  section: "cloud", category: "Cloud Storage & Productivity", description: "Back up your KoaPOS data to Microsoft OneDrive — ideal for Microsoft 365 businesses.",       authType: "oauth" as const, oauthProvider: "microsoft" as const, useVault: true  },
  { key: "dropbox",             label: "Dropbox",             section: "cloud", category: "Cloud Storage & Productivity", description: "Send automated backups of reports and exports directly to your Dropbox.",                    authType: "oauth" as const, oauthProvider: "dropbox"   as const, useVault: true  },
  { key: "proton_drive",        label: "Proton Drive",        section: "cloud", category: "Cloud Storage & Productivity", description: "Store encrypted backups in Proton Drive for maximum privacy and security.",                  authType: "credentials" as const, fields: [] as F[], comingSoon: true, useVault: false },
  { key: "google_contacts",     label: "Google Account",      section: "cloud", category: "Cloud Storage & Productivity", description: "Sync your customer list with Google Contacts and push appointments to Google Calendar.",    authType: "oauth" as const, oauthProvider: "google"    as const, useVault: true  },
  { key: "microsoft_contacts",  label: "Microsoft Account",   section: "cloud", category: "Cloud Storage & Productivity", description: "Sync customers to Outlook Contacts and push appointments to Microsoft Calendar.",          authType: "oauth" as const, oauthProvider: "microsoft" as const, useVault: true  },
  { key: "apple_account",       label: "Apple Account",       section: "cloud", category: "Cloud Storage & Productivity", description: "Sign in with Apple to sync customers to iCloud Contacts and push appointments to Apple Calendar.", authType: "oauth" as const, oauthProvider: "apple" as const, useVault: true  },
  { key: "openai",              label: "OpenAI (Your Key)",   section: "cloud", category: "Cloud Storage & Productivity", description: "Use your own OpenAI API key for AI Insights, demand forecasting, and product descriptions.", authType: "credentials" as const, fields: [{ name: "apiKey", label: "API Key", type: "password" }] as F[], useVault: false },
  { key: "zapier",              label: "Zapier",              section: "cloud", category: "Cloud Storage & Productivity", description: "Connect KoaPOS to 6,000+ apps — automate workflows triggered by sales and inventory.",      authType: "credentials" as const, fields: [] as F[], comingSoon: true, useVault: false },
  { key: "deputy",              label: "Deputy",              section: "cloud", category: "Cloud Storage & Productivity", description: "Sync staff rosters, clock-ins, and timesheets with Deputy for seamless Australian payroll.", authType: "credentials" as const, fields: [] as F[], comingSoon: true, useVault: false },
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
    case "xero":       return !!process.env.XERO_CLIENT_ID;
    case "quickbooks": return !!process.env.QUICKBOOKS_CLIENT_ID;
    case "meta":       return !!process.env.META_APP_ID;
    case "twitter":    return !!process.env.TWITTER_CLIENT_ID;
    case "linkedin":   return !!process.env.LINKEDIN_CLIENT_ID;
    case "tiktok":     return !!process.env.TIKTOK_CLIENT_KEY;
    case "apple":      return !!(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY);
    default:           return false;
  }
}

/* ── Apple Sign In helpers ───────────────────────────────────────────────────── */

function buildAppleClientSecret(): string {
  const teamId     = process.env.APPLE_TEAM_ID ?? "";
  const clientId   = process.env.APPLE_CLIENT_ID ?? "";
  const keyId      = process.env.APPLE_KEY_ID ?? "";
  const privateKey = process.env.APPLE_PRIVATE_KEY ?? "";

  const now = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: teamId, iat: now, exp: now + 15_777_000, aud: "https://appleid.apple.com", sub: clientId })).toString("base64url");
  const signingInput = `${header}.${payload}`;

  const sign = crypto.createSign("SHA256");
  sign.update(signingInput);
  const derSig = sign.sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${signingInput}.${derSig.toString("base64url")}`;
}

function decodeAppleIdToken(idToken: string): { sub?: string; email?: string } {
  try {
    const parts = idToken.split(".");
    if (parts.length < 2) return {};
    return JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as { sub?: string; email?: string };
  } catch {
    return {};
  }
}

/* ── OAuth URL builders ─────────────────────────────────────────────────────── */

const GOOGLE_SCOPES: Record<string, string> = {
  google_business:  "https://www.googleapis.com/auth/business.manage",
  google_drive:     "https://www.googleapis.com/auth/drive.file",
  google_contacts:  "https://www.googleapis.com/auth/contacts https://www.googleapis.com/auth/calendar",
  youtube_channel:  "https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/yt-analytics.readonly",
  google_ads:       "https://www.googleapis.com/auth/adwords",
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

// Cloud-storage and account/contacts integrations are managed on the Sync page;
// everything else on the Integrations page. OAuth redirects land the user back
// on whichever page the integration lives.
const SYNC_INTEGRATION_KEYS = new Set([
  "google_drive", "onedrive", "dropbox", "proton_drive",
  "google_contacts", "microsoft_contacts", "apple_account",
]);
function manageUrl(key: string): string {
  return SYNC_INTEGRATION_KEYS.has(key) ? "/management/sync" : "/management/integrations";
}

async function buildOAuthStartUrl(key: string, req: import("express").Request, merchantId: number): Promise<string | null> {
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
  if (key === "quickbooks") {
    // Bring-your-own OAuth app: merchant's own client id (env fallback).
    const cc = await getOAuthAppCreds(merchantId, "quickbooks")
      ?? (process.env.QUICKBOOKS_CLIENT_ID ? { clientId: process.env.QUICKBOOKS_CLIENT_ID, clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET ?? "" } : null);
    if (!cc) return null;
    return `https://appcenter.intuit.com/connect/oauth2?${new URLSearchParams({ client_id: cc.clientId, redirect_uri: cb, response_type: "code", scope: "com.intuit.quickbooks.accounting", state })}`;
  }
  if (key === "myob") {
    // Bring-your-own OAuth app: merchant supplies their own MYOB app credentials.
    const cc = await getOAuthAppCreds(merchantId, "myob");
    if (!cc) return null;
    return `https://secure.myob.com/oauth2/account/authorize?${new URLSearchParams({ client_id: cc.clientId, redirect_uri: cb, response_type: "code", scope: "CompanyFile", state })}`;
  }
  if (key === "meta_business" || key === "instagram_business") {
    const appId = process.env.META_APP_ID; if (!appId) return null;
    const scope = key === "instagram_business"
      ? "instagram_basic,instagram_content_publish,instagram_manage_insights,instagram_manage_comments,pages_show_list,pages_read_engagement"
      : "pages_manage_ads,pages_manage_posts,pages_read_engagement,pages_show_list,business_management,ads_management,ads_read,read_insights";
    return `https://www.facebook.com/v19.0/dialog/oauth?${new URLSearchParams({ client_id: appId, redirect_uri: cb, response_type: "code", scope, state })}`;
  }
  if (key === "twitter_x") {
    const cid = process.env.TWITTER_CLIENT_ID; if (!cid) return null;
    return `https://twitter.com/i/oauth2/authorize?${new URLSearchParams({ response_type: "code", client_id: cid, redirect_uri: cb, scope: "tweet.read tweet.write users.read offline.access media.write list.read", state, code_challenge: "challenge", code_challenge_method: "plain" })}`;
  }
  if (key === "linkedin_business") {
    const cid = process.env.LINKEDIN_CLIENT_ID; if (!cid) return null;
    return `https://www.linkedin.com/oauth/v2/authorization?${new URLSearchParams({ response_type: "code", client_id: cid, redirect_uri: cb, scope: "r_organization_social w_organization_social r_basicprofile r_ads rw_ads r_organization_admin", state })}`;
  }
  if (key === "tiktok_business") {
    const k = process.env.TIKTOK_CLIENT_KEY; if (!k) return null;
    return `https://business-api.tiktok.com/portal/auth?${new URLSearchParams({ app_id: k, redirect_uri: cb, state })}`;
  }
  if (key === "apple_account") {
    const cid = process.env.APPLE_CLIENT_ID;
    if (!cid || !process.env.APPLE_TEAM_ID || !process.env.APPLE_KEY_ID || !process.env.APPLE_PRIVATE_KEY) return null;
    return `https://appleid.apple.com/auth/authorize?${new URLSearchParams({ response_type: "code id_token", client_id: cid, redirect_uri: cbUrl("apple", req), scope: "name email", response_mode: "form_post", state })}`;
  }
  return null;
}

/* ── Token exchange ──────────────────────────────────────────────────────────── */

async function exchangeToken(key: string, code: string, cb: string, merchantId: number, extra?: Record<string, string>): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date | null; accountId?: string; accountHandle?: string }> {
  if (key === "google_drive" || key === "google_business" || key === "google_contacts" || key === "youtube_channel" || key === "google_ads") {
    const d = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", redirect_uri: cb, grant_type: "authorization_code" }) }).then((r) => r.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    const accessToken = d.access_token ?? "";
    let accountId: string | undefined, accountHandle: string | undefined;
    if (accessToken) {
      if (key === "youtube_channel") {
        const ch = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true", { headers: { Authorization: `Bearer ${accessToken}` } }).then((r) => r.json()).catch(() => ({})) as { items?: Array<{ id?: string; snippet?: { title?: string } }> };
        accountId = ch.items?.[0]?.id; accountHandle = ch.items?.[0]?.snippet?.title;
        if (!accountHandle) {
          const ui = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } }).then((r) => r.json()).catch(() => ({})) as { sub?: string; email?: string };
          accountId = accountId ?? ui.sub; accountHandle = ui.email;
        }
      } else if (key === "google_ads") {
        const customers = await fetch("https://googleads.googleapis.com/v16/customers:listAccessibleCustomers", { headers: { Authorization: `Bearer ${accessToken}`, "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "" } }).then((r) => r.json()).catch(() => ({})) as { resourceNames?: string[] };
        const firstId = customers.resourceNames?.[0]?.split("/")?.[1];
        if (firstId) { accountId = firstId; accountHandle = `Account #${firstId}`; }
        if (!accountHandle) {
          const ui = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } }).then((r) => r.json()).catch(() => ({})) as { sub?: string; email?: string };
          accountId = accountId ?? ui.sub; accountHandle = ui.email;
        }
      } else {
        const profile = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } }).then((r) => r.json()).catch(() => ({})) as { sub?: string; email?: string };
        accountId = profile.sub; accountHandle = profile.email;
      }
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
  if (key === "quickbooks") {
    // Bring-your-own OAuth app: merchant's own client id/secret (env fallback).
    const cc = await getOAuthAppCreds(merchantId, "quickbooks")
      ?? { clientId: process.env.QUICKBOOKS_CLIENT_ID ?? "", clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET ?? "" };
    const basicCreds = Buffer.from(`${cc.clientId}:${cc.clientSecret}`).toString("base64");
    const d = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basicCreds}` }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: cb }) }).then((r) => r.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    const accessToken = d.access_token ?? "";
    let accountHandle: string | undefined;
    if (accessToken) {
      const profile = await fetch("https://accounts.platform.intuit.com/v1/openid_connect/userinfo", { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }).then((r) => r.json()).catch(() => ({})) as { email?: string; givenName?: string; familyName?: string };
      accountHandle = profile.email ?? (profile.givenName ? `${profile.givenName} ${profile.familyName ?? ""}`.trim() : undefined);
    }
    return { accessToken, refreshToken: d.refresh_token ?? "", expiresAt: d.expires_in ? new Date(Date.now() + d.expires_in * 1000) : null, accountId: extra?.realmId, accountHandle };
  }
  if (key === "myob") {
    // Bring-your-own OAuth app: merchant supplies their own MYOB app credentials.
    const cc = await getOAuthAppCreds(merchantId, "myob");
    if (!cc) throw new Error("MYOB app credentials not configured for this merchant");
    const d = await fetch("https://secure.myob.com/oauth2/v1/authorize", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: cb, client_id: cc.clientId, client_secret: cc.clientSecret, scope: "CompanyFile" }) }).then((r) => r.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; user?: { uid?: string; username?: string } };
    return { accessToken: d.access_token ?? "", refreshToken: d.refresh_token ?? "", expiresAt: d.expires_in ? new Date(Date.now() + d.expires_in * 1000) : null, accountId: d.user?.uid, accountHandle: d.user?.username };
  }
  if (key === "meta_business" || key === "instagram_business") {
    const d = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?${new URLSearchParams({ client_id: process.env.META_APP_ID ?? "", client_secret: process.env.META_APP_SECRET ?? "", redirect_uri: cb, code })}`).then((r) => r.json()) as { access_token?: string; expires_in?: number };
    const accessToken = d.access_token ?? "";
    let accountId: string | undefined, accountHandle: string | undefined;
    if (accessToken) {
      const me = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name,email&access_token=${accessToken}`).then((r) => r.json()).catch(() => ({})) as { id?: string; name?: string; email?: string };
      if (key === "instagram_business") {
        // Resolve the connected IG Business account via linked pages
        const igAccounts = await fetch(`https://graph.facebook.com/v19.0/me/accounts?fields=name,id,instagram_business_account{id,username}&access_token=${accessToken}&limit=1`).then((r) => r.json()).catch(() => ({ data: [] })) as { data?: Array<{ name?: string; instagram_business_account?: { id?: string; username?: string } }> };
        const igBiz = igAccounts.data?.[0]?.instagram_business_account;
        accountId = igBiz?.id ?? me.id;
        accountHandle = igBiz?.username ? `@${igBiz.username}` : (igAccounts.data?.[0]?.name ?? me.name ?? me.email);
      } else {
        // Return the first managed Facebook Page as the primary account
        const pages = await fetch(`https://graph.facebook.com/v19.0/me/accounts?fields=name,id&limit=1&access_token=${accessToken}`).then((r) => r.json()).catch(() => ({ data: [] })) as { data?: Array<{ id?: string; name?: string }> };
        accountId = pages.data?.[0]?.id ?? me.id;
        accountHandle = pages.data?.[0]?.name ?? me.name ?? me.email;
      }
    }
    return { accessToken, refreshToken: "", expiresAt: d.expires_in ? new Date(Date.now() + d.expires_in * 1000) : null, accountId, accountHandle };
  }
  if (key === "twitter_x") {
    const creds = Buffer.from(`${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`).toString("base64");
    const d = await fetch("https://api.twitter.com/2/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${creds}` }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: cb, code_verifier: "challenge" }) }).then((r) => r.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    const accessToken = d.access_token ?? "";
    let accountId: string | undefined, accountHandle: string | undefined;
    if (accessToken) {
      const me = await fetch("https://api.twitter.com/2/users/me?user.fields=id,name,username,public_metrics", { headers: { Authorization: `Bearer ${accessToken}` } }).then((r) => r.json()).catch(() => ({})) as { data?: { id?: string; name?: string; username?: string } };
      accountId = me.data?.id; accountHandle = me.data?.username ? `@${me.data.username}` : me.data?.name;
    }
    return { accessToken, refreshToken: d.refresh_token ?? "", expiresAt: d.expires_in ? new Date(Date.now() + d.expires_in * 1000) : null, accountId, accountHandle };
  }
  if (key === "linkedin_business") {
    const d = await fetch("https://www.linkedin.com/oauth/v2/accessToken", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: process.env.LINKEDIN_CLIENT_ID ?? "", client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "", redirect_uri: cb }) }).then((r) => r.json()) as { access_token?: string; expires_in?: number };
    const accessToken = d.access_token ?? "";
    let accountId: string | undefined, accountHandle: string | undefined;
    if (accessToken) {
      const me = await fetch("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } }).then((r) => r.json()).catch(() => ({})) as { sub?: string; email?: string; name?: string };
      // Resolve the first administered LinkedIn Organization (Company Page)
      const orgs = await fetch("https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(id,localizedName)))", { headers: { Authorization: `Bearer ${accessToken}` } }).then((r) => r.json()).catch(() => ({ elements: [] })) as { elements?: Array<{ "organization~"?: { id?: number; localizedName?: string } }> };
      const org = orgs.elements?.[0]?.["organization~"];
      accountId = org?.id ? String(org.id) : me.sub;
      accountHandle = org?.localizedName ?? me.name ?? me.email;
    }
    return { accessToken, refreshToken: "", expiresAt: d.expires_in ? new Date(Date.now() + d.expires_in * 1000) : null, accountId, accountHandle };
  }
  if (key === "tiktok_business") {
    const d = await fetch("https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app_id: process.env.TIKTOK_CLIENT_KEY, secret: process.env.TIKTOK_CLIENT_SECRET, auth_code: code }) }).then((r) => r.json()) as { data?: { access_token?: string; advertiser_id?: string; advertiser_name?: string; display_name?: string } };
    const accessToken = d.data?.access_token ?? "";
    const accountId = d.data?.advertiser_id;
    const accountHandle = d.data?.advertiser_name ?? d.data?.display_name;
    return { accessToken, refreshToken: "", expiresAt: null, accountId, accountHandle };
  }
  throw new Error(`No token exchange handler for: ${key}`);
}

/* ── GET /integrations ──────────────────────────────────────────────────────── */

router.get("/integrations", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const rows = await db.select().from(merchantIntegrationsTable).where(eq(merchantIntegrationsTable.merchantId, merchantId));
  const rowMap = new Map(rows.map((r) => [r.integrationKey, r]));
  const vaultRows = await db.select({ provider: oauthTokenVaultTable.provider, connectedAt: oauthTokenVaultTable.connectedAt, accountHandle: oauthTokenVaultTable.accountHandle, accountId: oauthTokenVaultTable.accountId, disconnectedReason: oauthTokenVaultTable.disconnectedReason, disconnectedAt: oauthTokenVaultTable.disconnectedAt }).from(oauthTokenVaultTable).where(eq(oauthTokenVaultTable.merchantId, merchantId));
  const vaultMap = new Map(vaultRows.map((r) => [r.provider, r]));

  const result = INTEGRATIONS.map((intg) => {
    const row        = rowMap.get(intg.key);
    const vaultRow   = vaultMap.get(intg.key);
    const comingSoon = "comingSoon" in intg ? (intg.comingSoon as boolean) : false;
    const oauthProv  = "oauthProvider" in intg ? intg.oauthProvider : null;
    const byoOAuth   = "byoOAuth" in intg ? !!intg.byoOAuth : false;

    let status = "disconnected", connectedAt: string | null = null, accountHandle: string | null = null, accountId: string | null = null;
    let disconnectedReason: string | null = null;
    let disconnectedAt: string | null = null;
    if (!comingSoon) {
      if (intg.useVault && vaultRow?.connectedAt && !vaultRow.disconnectedReason) {
        status = "connected"; connectedAt = vaultRow.connectedAt.toISOString();
        accountHandle = vaultRow.accountHandle ?? null; accountId = vaultRow.accountId ?? null;
      } else if (intg.useVault && vaultRow?.disconnectedReason) {
        // Vault row was invalidated (e.g. encryption key rotation) — surface a
        // notice so the merchant knows their previous connection needs re-auth.
        disconnectedReason = vaultRow.disconnectedReason;
        disconnectedAt = vaultRow.disconnectedAt?.toISOString() ?? null;
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
      disconnectedReason, disconnectedAt, byoOAuth,
      // For BYO-OAuth, "configured" means the merchant has saved their own app
      // credentials (a "<key>__app" vault row exists); otherwise it's the
      // platform env-var check for classic OAuth integrations.
      oauthConfigured: byoOAuth ? vaultMap.has(`${intg.key}__app`) : (oauthProv ? isOAuthConfigured(oauthProv) : null),
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
  if ("byoOAuth" in intg && intg.byoOAuth) { res.status(400).json({ error: "Use the OAuth app connect flow" }); return; }
  if (intg.authType !== "credentials") { res.status(400).json({ error: "Use OAuth flow" }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;

  if (intg.useVault) {
    // Credential secrets (e.g. Zip's apiKey) are encrypted at rest in the vault.
    // Surface the first non-secret (text) field as the display handle.
    const fields = "fields" in intg ? intg.fields : [];
    const displayField = fields.find((f) => f.type === "text")?.name;
    await upsertCredentialVault(merchantId, key, body, { accountHandleField: displayField });
    // Keep a marker row so the rest of the app can detect the connection.
    const existing = await getRow(merchantId, key);
    if (existing) { await db.update(merchantIntegrationsTable).set({ status: "connected", credentials: null, connectedAt: new Date() }).where(eq(merchantIntegrationsTable.id, existing.id)); }
    else { await db.insert(merchantIntegrationsTable).values({ merchantId, integrationKey: key, status: "connected", connectedAt: new Date() }); }
    res.json({ status: "connected" });
    return;
  }

  const credentials = JSON.stringify(body);
  const existing = await getRow(merchantId, key);
  if (existing) { await db.update(merchantIntegrationsTable).set({ status: "connected", credentials, connectedAt: new Date() }).where(eq(merchantIntegrationsTable.id, existing.id)); }
  else { await db.insert(merchantIntegrationsTable).values({ merchantId, integrationKey: key, status: "connected", credentials, connectedAt: new Date() }); }
  res.json({ status: "connected" });
});

/* ── POST /integrations/:key/oauth-app ──────────────────────────────────────────
   Store a merchant's OWN OAuth app credentials (client id + secret) for a
   bring-your-own-OAuth integration (Xero / QuickBooks / MYOB). The OAuth start
   flow then uses these instead of any platform-level env vars. After saving, the
   client redirects the browser to the provider's OAuth start endpoint. */
router.post("/integrations/:key/oauth-app", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const key = String(req.params.key);
  const intg = INTEGRATIONS.find((i) => i.key === key);
  if (!intg) { res.status(404).json({ error: "Unknown integration" }); return; }
  if (!("byoOAuth" in intg && intg.byoOAuth)) { res.status(400).json({ error: "Not a bring-your-own-OAuth integration" }); return; }
  const { clientId, clientSecret } = (req.body ?? {}) as { clientId?: string; clientSecret?: string };
  if (!clientId || !clientSecret) { res.status(400).json({ error: "clientId and clientSecret are required" }); return; }
  await saveOAuthAppCreds(merchantId, key, String(clientId).trim(), String(clientSecret).trim());
  res.json({ ok: true });
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

/* ── GET /integrations/oauth/apple/start ───────────────────────────────────── */

router.get("/integrations/oauth/apple/start", requireAuth, async (req, res): Promise<void> => {
  const url = await buildOAuthStartUrl("apple_account", req, req.session.merchantId!);
  if (!url) { res.redirect("/management/sync?error=apple_oauth_not_configured"); return; }
  res.redirect(url);
});

/* ── POST /integrations/oauth/apple/callback ────────────────────────────────── */
/*
 * Apple uses response_mode=form_post — the authorization server POSTs back here
 * rather than redirecting with query params. Express must parse the urlencoded body.
 *
 * Body fields sent by Apple:
 *   code        — authorization code for token exchange
 *   id_token    — signed JWT; payload contains sub (user ID) and email
 *   state       — merchantId passed in the start URL
 *   user        — JSON string with name info (first-time auth only)
 *   error       — set when the user cancels or an error occurs
 */
router.post("/integrations/oauth/apple/callback", async (req, res): Promise<void> => {
  const body = req.body as Record<string, string | undefined>;
  const { code, id_token, state, error } = body;

  if (error || !code || !state) {
    res.redirect(`/management/sync?error=apple_oauth_denied`);
    return;
  }

  const merchantId = parseInt(state, 10);
  if (isNaN(merchantId)) {
    res.redirect("/management/sync?error=apple_invalid_state");
    return;
  }

  try {
    const redirectUri = cbUrl("apple", req);
    const clientSecret = buildAppleClientSecret();

    // Exchange the authorization code for Apple tokens
    const tokenRes = await fetch("https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     process.env.APPLE_CLIENT_ID ?? "",
        client_secret: clientSecret,
        code,
        grant_type:    "authorization_code",
        redirect_uri:  redirectUri,
      }),
    }).then((r) => r.json()) as { access_token?: string; refresh_token?: string; id_token?: string; expires_in?: number; error?: string };

    if (tokenRes.error) {
      res.redirect(`/management/sync?error=apple_token_exchange_failed`);
      return;
    }

    // Prefer the id_token from the token response; fall back to the one from the POST body
    const resolvedIdToken = tokenRes.id_token ?? id_token ?? "";
    const idPayload = decodeAppleIdToken(resolvedIdToken);

    // Apple sends user profile (name) in the POST body only on the first authorization
    let accountHandle: string | undefined = idPayload.email;
    try {
      if (body.user) {
        const userInfo = JSON.parse(body.user) as { name?: { firstName?: string; lastName?: string } };
        const fullName = `${userInfo.name?.firstName ?? ""} ${userInfo.name?.lastName ?? ""}`.trim();
        if (fullName) accountHandle = fullName;
      }
    } catch { /* ignore malformed user JSON */ }

    const accessToken  = tokenRes.access_token ?? "";
    const refreshToken = tokenRes.refresh_token ?? "";
    const expiresAt    = tokenRes.expires_in ? new Date(Date.now() + tokenRes.expires_in * 1000) : null;
    const accountId    = idPayload.sub;

    await upsertVault(merchantId, {
      provider:       "apple_account",
      accessToken,
      refreshToken:   refreshToken || undefined,
      tokenExpiresAt: expiresAt ?? undefined,
      accountId,
      accountHandle,
    });

    // Upsert the merchant integration row
    const [existing] = await db
      .select({ id: merchantIntegrationsTable.id })
      .from(merchantIntegrationsTable)
      .where(and(
        eq(merchantIntegrationsTable.merchantId, merchantId),
        eq(merchantIntegrationsTable.integrationKey, "apple_account"),
      ))
      .limit(1);

    if (existing) {
      await db.update(merchantIntegrationsTable)
        .set({ status: "connected", connectedAt: new Date() })
        .where(eq(merchantIntegrationsTable.id, existing.id));
    } else {
      await db.insert(merchantIntegrationsTable)
        .values({ merchantId, integrationKey: "apple_account", status: "connected", connectedAt: new Date() });
    }

    res.redirect("/management/sync?success=apple_account");
  } catch {
    res.redirect("/management/sync?error=apple_token_exchange_failed");
  }
});

/* ── GET /integrations/oauth/:key/start ────────────────────────────────────── */

router.get("/integrations/oauth/:key/start", requireAuth, async (req, res): Promise<void> => {
  const key = String(req.params.key);
  const url = await buildOAuthStartUrl(key, req, req.session.merchantId!);
  if (!url) { res.redirect(`${manageUrl(key)}?error=${key}_oauth_not_configured`); return; }
  res.redirect(url);
});

/* ── GET /integrations/oauth/:key/callback ─────────────────────────────────── */

router.get("/integrations/oauth/:key/callback", async (req, res): Promise<void> => {
  const { key } = req.params;
  const { code, state, error, realmId } = req.query as Record<string, string>;
  if (error || !code || !state) { res.redirect(`${manageUrl(key)}?error=${key}_oauth_denied`); return; }
  const merchantId = parseInt(state, 10);
  if (isNaN(merchantId)) { res.redirect(`${manageUrl(key)}?error=${key}_invalid_state`); return; }
  // Xero has a dedicated route with full tenant-selection flow — hand off there
  if (key === "xero") { res.redirect(`/api/xero/auth/start`); return; }

  try {
    const cb = cbUrl(key, req);
    const extra = realmId ? { realmId } : undefined;
    const { accessToken, refreshToken, expiresAt, accountId, accountHandle } = await exchangeToken(key, code, cb, merchantId, extra);
    const intg = INTEGRATIONS.find((i) => i.key === key);

    if (intg?.useVault) {
      await upsertVault(merchantId, { provider: key, accessToken, refreshToken: refreshToken || undefined, tokenExpiresAt: expiresAt ?? undefined, accountId, accountHandle });
    }

    const existing = await getRow(merchantId, key);
    if (existing) { await db.update(merchantIntegrationsTable).set({ status: "connected", ...(!intg?.useVault ? { accessToken, refreshToken, tokenExpiresAt: expiresAt } : {}), connectedAt: new Date() }).where(eq(merchantIntegrationsTable.id, existing.id)); }
    else { await db.insert(merchantIntegrationsTable).values({ merchantId, integrationKey: key, status: "connected", ...(!intg?.useVault ? { accessToken, refreshToken, tokenExpiresAt: expiresAt } : {}), connectedAt: new Date() }); }

    res.redirect(`${manageUrl(key)}?success=${key}`);
  } catch {
    res.redirect(`${manageUrl(key)}?error=${key}_token_exchange_failed`);
  }
});

/* ── POST /integrations/contacts/sync ────────────────────────────────────────
   Syncs KoaPOS customers to Google Contacts (People API) or Microsoft Contacts
   (Graph API). Optionally includes CRM notes in each platform's native notes
   field: Google → biographies[0].value, Microsoft → personalNotes.

   Body: {
     provider:      "google_contacts" | "microsoft_contacts",
     includeNotes?: boolean,           (default: false)
     notesConflict?: "append" | "overwrite"  (default: "append")
   }

   Error handling: per-contact failures are counted and logged, but do not abort
   the batch. Large note payloads are silently truncated to 2 000 characters.
   ─────────────────────────────────────────────────────────────────────────── */

router.post("/integrations/contacts/sync", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const {
    provider,
    includeNotes  = false,
    notesConflict = "append",
  } = req.body as {
    provider?: string;
    includeNotes?: boolean;
    notesConflict?: "append" | "overwrite";
  };

  if (provider !== "google_contacts" && provider !== "microsoft_contacts") {
    res.status(400).json({ error: "provider must be 'google_contacts' or 'microsoft_contacts'" });
    return;
  }

  // Resolve a valid access token. Microsoft access tokens are short-lived
  // (~1 hour), so refresh via the stored refresh token instead of using the
  // raw cached token — otherwise every Graph request 401s once it lapses.
  let accessToken: string;
  if (provider === "microsoft_contacts") {
    try {
      accessToken = await getValidMicrosoftToken(merchantId, provider, MICROSOFT_SCOPES.microsoft_contacts!);
    } catch (err) {
      if (err instanceof MicrosoftNotConnectedError) {
        res.status(401).json({ error: err.message });
        return;
      }
      req.log.error({ merchantId, err }, "Microsoft token refresh failed");
      res.status(502).json({ error: "Could not refresh Microsoft access — please reconnect the account on the Sync page." });
      return;
    }
  } else {
    const vault = await readVault(merchantId, provider);
    if (!vault?.accessToken) {
      res.status(401).json({ error: `${provider} is not connected — please authorise via OAuth first` });
      return;
    }
    accessToken = vault.accessToken;
  }

  const customers = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.merchantId, merchantId));

  if (customers.length === 0) {
    res.json({ ok: true, provider, synced: 0, failed: 0, notesSynced: 0, message: "No customers to sync" });
    return;
  }

  // ── Build per-customer notes text when requested ─────────────────────────
  const notesByCustomer = new Map<number, string>();
  if (includeNotes) {
    const MAX_NOTE_CHARS = 2000;
    const allNotes = await db
      .select()
      .from(customerNotesTable)
      .where(eq(customerNotesTable.merchantId, merchantId))
      .orderBy(desc(customerNotesTable.createdAt)); // newest first

    for (const note of allNotes) {
      const existing = notesByCustomer.get(note.customerId) ?? "";

      if (notesConflict === "overwrite") {
        // Keep only the most-recent note (first seen in desc order)
        if (existing === "") {
          const date = new Date(note.createdAt).toLocaleDateString("en-AU", {
            day: "numeric", month: "short", year: "numeric",
          });
          notesByCustomer.set(
            note.customerId,
            `[KoaPOS Notes]\n• ${date}: ${note.note}`.slice(0, MAX_NOTE_CHARS),
          );
        }
      } else {
        // Append: collect all notes newest-first
        const date = new Date(note.createdAt).toLocaleDateString("en-AU", {
          day: "numeric", month: "short", year: "numeric",
        });
        const line = `• ${date}: ${note.note}`;
        const next = existing === "" ? `[KoaPOS Notes]\n${line}` : `${existing}\n${line}`;
        notesByCustomer.set(note.customerId, next.slice(0, MAX_NOTE_CHARS));
      }
    }
  }

  // ── Sync contacts one by one ─────────────────────────────────────────────
  let synced     = 0;
  let failed     = 0;
  let notesSynced = 0;

  if (provider === "google_contacts") {
    // Google People API — POST /v1/people:createContact
    for (const c of customers) {
      const notesText = includeNotes ? (notesByCustomer.get(c.id) ?? "") : "";
      const body: Record<string, unknown> = {
        names:          [{ givenName: c.firstName ?? "", familyName: c.lastName ?? "" }],
        emailAddresses: c.email ? [{ value: c.email }] : [],
        phoneNumbers:   c.phone ? [{ value: c.phone }] : [],
      };
      if (includeNotes && notesText) {
        (body as Record<string, unknown>).biographies = [{ value: notesText, contentType: "TEXT_PLAIN" }];
      }
      try {
        const r = await fetch("https://people.googleapis.com/v1/people:createContact", {
          method:  "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body:    JSON.stringify(body),
        });
        if (r.ok) {
          synced++;
          if (includeNotes && notesText) notesSynced++;
        } else {
          req.log.warn({ merchantId, status: r.status, email: c.email }, "Google Contacts create failed");
          failed++;
        }
      } catch (err) {
        req.log.warn({ merchantId, err, email: c.email }, "Google Contacts create threw");
        failed++;
      }
    }
  } else {
    // Microsoft Graph Contacts API — POST /v1.0/me/contacts
    for (const c of customers) {
      const notesText = includeNotes ? (notesByCustomer.get(c.id) ?? "") : "";
      const fullName  = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
      const body: Record<string, unknown> = {
        givenName:      c.firstName ?? "",
        surname:        c.lastName  ?? "",
        emailAddresses: c.email ? [{ address: c.email, name: fullName || c.email }] : [],
        businessPhones: c.phone ? [c.phone] : [],
      };
      if (includeNotes && notesText) {
        body.personalNotes = notesText;
      }
      try {
        const r = await fetch("https://graph.microsoft.com/v1.0/me/contacts", {
          method:  "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body:    JSON.stringify(body),
        });
        if (r.ok) {
          synced++;
          if (includeNotes && notesText) notesSynced++;
        } else {
          req.log.warn({ merchantId, status: r.status, email: c.email }, "Microsoft Contacts create failed");
          failed++;
        }
      } catch (err) {
        req.log.warn({ merchantId, err, email: c.email }, "Microsoft Contacts create threw");
        failed++;
      }
    }
  }

  const notesMsg = includeNotes && notesSynced > 0
    ? `, ${notesSynced} with notes`
    : "";
  res.json({
    ok:         true,
    provider,
    synced,
    failed,
    notesSynced,
    message:    `Synced ${synced} contact${synced !== 1 ? "s" : ""}${notesMsg}${failed > 0 ? ` (${failed} failed)` : ""}`,
  });
});

/* ── POST /integrations/calendar/sync ─────────────────────────────────────────
   Pushes the merchant's upcoming KoaPOS appointments to the connected account's
   calendar — Microsoft (Graph /me/events) or Google (Calendar API). Each push is
   idempotent: re-syncing updates/skips an existing event rather than duplicating
   it (Microsoft via transactionId, Google via a stable event id).

   Body: { provider: "microsoft_contacts" | "google_contacts" }
   ─────────────────────────────────────────────────────────────────────────── */

router.post("/integrations/calendar/sync", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { provider } = req.body as { provider?: string };

  if (provider !== "google_contacts" && provider !== "microsoft_contacts") {
    res.status(400).json({ error: "provider must be 'google_contacts' or 'microsoft_contacts'" });
    return;
  }

  // Resolve a valid access token (refresh Microsoft's short-lived token).
  let accessToken: string;
  if (provider === "microsoft_contacts") {
    try {
      accessToken = await getValidMicrosoftToken(merchantId, provider, MICROSOFT_SCOPES.microsoft_contacts!);
    } catch (err) {
      if (err instanceof MicrosoftNotConnectedError) {
        res.status(401).json({ error: err.message });
        return;
      }
      req.log.error({ merchantId, err }, "Microsoft token refresh failed");
      res.status(502).json({ error: "Could not refresh Microsoft access — please reconnect the account on the Sync page." });
      return;
    }
  } else {
    const vault = await readVault(merchantId, provider);
    if (!vault?.accessToken) {
      res.status(401).json({ error: `${provider} is not connected — please authorise via OAuth first` });
      return;
    }
    accessToken = vault.accessToken;
  }

  // Only push upcoming, non-cancelled appointments.
  const now = new Date();
  const appointments = (await db
    .select()
    .from(appointmentsTable)
    .where(and(eq(appointmentsTable.merchantId, merchantId), gte(appointmentsTable.scheduledAt, now)))
    .orderBy(appointmentsTable.scheduledAt))
    .filter((a) => a.status !== "cancelled");

  if (appointments.length === 0) {
    res.json({ ok: true, provider, synced: 0, failed: 0, message: "No upcoming appointments to sync" });
    return;
  }

  // Microsoft Graph wants a naive ISO timestamp paired with a separate timeZone.
  const toGraphTime = (d: Date) => new Date(d).toISOString().replace(/\.\d{3}Z$/, "");

  let synced = 0;
  let failed = 0;

  for (const a of appointments) {
    const start = new Date(a.scheduledAt);
    const end   = new Date(start.getTime() + (a.durationMinutes ?? 30) * 60_000);

    try {
      if (provider === "microsoft_contacts") {
        // POST /me/events with a stable transactionId so re-syncing is idempotent.
        const r = await fetch("https://graph.microsoft.com/v1.0/me/events", {
          method:  "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            subject:       a.title,
            body:          { contentType: "text", content: a.description ?? a.notes ?? "" },
            start:         { dateTime: toGraphTime(start), timeZone: "UTC" },
            end:           { dateTime: toGraphTime(end),   timeZone: "UTC" },
            transactionId: `koapos-appt-${a.id}`,
          }),
        });
        if (r.ok) {
          synced++;
        } else {
          req.log.warn({ merchantId, status: r.status, appointmentId: a.id }, "Microsoft Calendar create failed");
          failed++;
        }
      } else {
        // Google Calendar — a stable event id makes re-syncing idempotent
        // (a repeat insert returns 409, which we treat as already-synced).
        const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
          method:  "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            id:          `koapos${a.id}`,
            summary:     a.title,
            description: a.description ?? a.notes ?? "",
            start:       { dateTime: start.toISOString() },
            end:         { dateTime: end.toISOString() },
          }),
        });
        if (r.ok || r.status === 409) {
          synced++;
        } else {
          req.log.warn({ merchantId, status: r.status, appointmentId: a.id }, "Google Calendar create failed");
          failed++;
        }
      }
    } catch (err) {
      req.log.warn({ merchantId, err, appointmentId: a.id }, "Calendar event create threw");
      failed++;
    }
  }

  res.json({
    ok:      true,
    provider,
    synced,
    failed,
    message: `Synced ${synced} appointment${synced !== 1 ? "s" : ""}${failed > 0 ? ` (${failed} failed)` : ""}`,
  });
});

export default router;
