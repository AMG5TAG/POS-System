import { Router, type IRouter } from "express";
import { db, merchantIntegrationsTable, oauthTokenVaultTable, merchantAutoSyncSettingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import { requireAuth } from "../middlewares/requireAuth";
import { upsertVault, deleteVault, upsertCredentialVault } from "../services/tokenVault";
import { syncContacts, syncCalendar, isSyncProvider, AccountNotConnectedError, syncProviderLabel } from "../services/accountSync";
import { verifyAppleCredentials } from "../services/appleDav";

const router: IRouter = Router();

/* ── Integration catalogue ─────────────────────────────────────────────────
   section: top-level UI grouping (accounting | ecommerce | payments | marketing | cloud)
   useVault: true → encrypted token vault storage; false → legacy credentials column
*/
export const INTEGRATIONS = [
  /* ── ACCOUNTING & FINANCE ──────────────────────────────────────────────── */
  { key: "xero",            label: "Xero",                  section: "accounting", category: "Accounting & Finance", description: "Connect in one click to push sales, invoices, purchase orders, and contacts into Xero with GST mapped automatically.", authType: "oauth" as const, fields: [] as F[], useVault: false },
  /* ── E-COMMERCE & MARKETPLACES ─────────────────────────────────────────── */
  { key: "australia_post",  label: "Australia Post",        section: "ecommerce",  category: "E-Commerce & Marketplaces", description: "Calculate real-time postage rates, print labels, and book pickups at online checkout.",              authType: "credentials" as const, fields: [{ name: "apiKey", label: "API Key", type: "password" }, { name: "accountNumber", label: "Account Number", type: "text" }] as F[], useVault: false },

  /* ── PAYMENTS & TERMINALS ──────────────────────────────────────────────── */
  { key: "stripe_own",      label: "Stripe",                section: "payments",   category: "Payments & Terminals", description: "Connect your own Stripe account with your API keys to accept card payments and manage payouts.",            authType: "credentials" as const, fields: [{ name: "secretKey", label: "Secret Key", type: "password" }, { name: "publishableKey", label: "Publishable Key", type: "text" }, { name: "webhookSecret", label: "Webhook Signing Secret", type: "password" }] as F[], useVault: true  },
  { key: "commbank_eftpos", label: "CommBank EFTPOS",       section: "payments",   category: "Payments & Terminals", description: "Integrate with CommBank Smart terminal for card-present payments.",                                       authType: "credentials" as const, fields: [{ name: "merchantId", label: "Merchant ID", type: "text" }, { name: "terminalId", label: "Terminal ID", type: "text" }, { name: "apiKey", label: "API Key", type: "password" }] as F[], useVault: false },
  { key: "square_terminal", label: "Square",                section: "payments",   category: "Payments & Terminals", description: "Accept in-store card payments via Square Terminal or Square Reader.",                                     authType: "credentials" as const, fields: [{ name: "accessToken", label: "Access Token", type: "password" }, { name: "locationId", label: "Location ID", type: "text" }] as F[], useVault: false },
  { key: "tyro_eftpos",     label: "Tyro EFTPOS",           section: "payments",   category: "Payments & Terminals", description: "Australia's most popular independent EFTPOS provider — contactless, Apple Pay & Google Pay.",             authType: "credentials" as const, fields: [{ name: "merchantId", label: "Merchant ID", type: "text" }, { name: "terminalId", label: "Terminal ID", type: "text" }, { name: "apiKey", label: "API Key", type: "password" }] as F[], useVault: false },
  { key: "paypal",          label: "PayPal",                section: "payments",   category: "Payments & Terminals", description: "Accept PayPal in-store via QR code — customer scans with the PayPal app to pay.",                        authType: "credentials" as const, fields: [{ name: "clientId", label: "Client ID", type: "text" }, { name: "clientSecret", label: "Client Secret", type: "password" }, { name: "merchantId", label: "Merchant ID", type: "text" }] as F[], useVault: false },
  { key: "wechat_alipay",   label: "WeChat Pay & Alipay",   section: "payments",   category: "Payments & Terminals", description: "Display merchant QR codes for WeChat Pay and Alipay in-store.",                                          authType: "credentials" as const, fields: [{ name: "wechatMerchantId", label: "WeChat Merchant ID", type: "text" }, { name: "wechatApiKey", label: "WeChat API Key", type: "password" }, { name: "alipayMerchantId", label: "Alipay Merchant ID", type: "text" }, { name: "alipayApiKey", label: "Alipay API Key", type: "password" }] as F[], useVault: false },
  { key: "afterpay",        label: "Afterpay",              section: "payments",   category: "Payments & Terminals", description: "Let customers split purchases into 4 fortnightly payments.",                                              authType: "credentials" as const, fields: [{ name: "merchantId", label: "Merchant ID", type: "text" }, { name: "apiKey", label: "API Key", type: "password" }, { name: "webhookSecret", label: "Webhook Signing Secret", type: "password" }] as F[], useVault: true },
  { key: "zip",             label: "Zip Pay",               section: "payments",   category: "Payments & Terminals", description: "Offer interest-free pay-later and pay-over-time options at checkout.",                                   authType: "credentials" as const, fields: [{ name: "apiKey", label: "API Key", type: "password" }, { name: "locationId", label: "Location ID", type: "text" }, { name: "deviceRefCode", label: "Device Reference", type: "text" }, { name: "webhookSecret", label: "Webhook Signing Secret", type: "password" }] as F[], useVault: true },
  { key: "klarna",          label: "Klarna",                section: "payments",   category: "Payments & Terminals", description: "Flexible payment options — pay in 4, pay later, or finance larger purchases.",                            authType: "credentials" as const, fields: [{ name: "merchantId", label: "Merchant ID", type: "text" }, { name: "apiKey", label: "API Key", type: "password" }, { name: "webhookSecret", label: "Webhook Signing Secret", type: "password" }] as F[], useVault: true },
  { key: "apple_wallet",    label: "Apple Wallet",          section: "payments",   category: "Payments & Terminals", description: "Issue digital loyalty cards, membership passes, and coupons directly to Apple Wallet.",                  authType: "credentials" as const, fields: [{ name: "passTypeId", label: "Pass Type ID", type: "text" }, { name: "teamId", label: "Apple Team ID", type: "text" }, { name: "certificateBase64", label: "Certificate (Base64)", type: "password" }] as F[], useVault: false },

  /* ── MARKETING ─────────────────────────────────────────────────────────── */
  { key: "google_ads",          label: "Google Ads",              section: "marketing", category: "Marketing", description: "Create, manage, and track ad campaigns tied to your KoaPOS product catalogue.",                    authType: "oauth" as const, oauthProvider: "google"    as const, useVault: true  },
  { key: "google_business",     label: "Google Business Profile", section: "marketing", category: "Marketing", description: "Keep your Google Maps listing accurate with hours, offers, and posts.",                       authType: "oauth" as const, oauthProvider: "google"    as const, useVault: true  },

  /* ── CLOUD STORAGE & PRODUCTIVITY ─────────────────────────────────────── */
  { key: "google_drive",        label: "Google Workspace",    section: "cloud", category: "Cloud Storage & Productivity", description: "Back up reports to Google Drive and sync contacts and appointments with Google Workspace.",   authType: "oauth" as const, oauthProvider: "google"    as const, useVault: true  },
  { key: "onedrive",            label: "Microsoft OneDrive",  section: "cloud", category: "Cloud Storage & Productivity", description: "Back up your KoaPOS data to Microsoft OneDrive — ideal for Microsoft 365 businesses.",       authType: "oauth" as const, oauthProvider: "microsoft" as const, useVault: true  },
  { key: "dropbox",             label: "Dropbox",             section: "cloud", category: "Cloud Storage & Productivity", description: "Send automated backups of reports and exports directly to your Dropbox.",                    authType: "oauth" as const, oauthProvider: "dropbox"   as const, useVault: true  },
  { key: "google_contacts",     label: "Google Account",      section: "cloud", category: "Cloud Storage & Productivity", description: "Sync your customer list with Google Contacts and push appointments to Google Calendar.",    authType: "oauth" as const, oauthProvider: "google"    as const, useVault: true  },
  { key: "microsoft_contacts",  label: "Microsoft Account",   section: "cloud", category: "Cloud Storage & Productivity", description: "Sync customers to Outlook Contacts and push appointments to Microsoft Calendar.",          authType: "oauth" as const, oauthProvider: "microsoft" as const, useVault: true  },
  { key: "apple_account",       label: "Apple Account",       section: "cloud", category: "Cloud Storage & Productivity", description: "Sign in with Apple — lets staff/customers authenticate with their Apple ID. (Contacts & Calendar sync is the separate Apple iCloud connection.)", authType: "oauth" as const, oauthProvider: "apple" as const, useVault: true  },
  { key: "apple_icloud",        label: "Apple iCloud",        section: "cloud", category: "Cloud Storage & Productivity", description: "Sync customers to iCloud Contacts and push appointments to Apple Calendar. Connect with your Apple ID and an app-specific password.", authType: "credentials" as const, fields: [{ name: "appleId", label: "Apple ID (email)", type: "text" }, { name: "appPassword", label: "App-specific password", type: "password" }] as F[], useVault: true  },
  { key: "openai",              label: "OpenAI (Your Key)",   section: "cloud", category: "Cloud Storage & Productivity", description: "Use your own OpenAI API key for AI Insights, demand forecasting, and product descriptions.", authType: "credentials" as const, fields: [{ name: "apiKey", label: "API Key", type: "password" }] as F[], useVault: false },
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
  "google_drive", "onedrive", "dropbox",
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
  if (key === "apple_account") {
    const cid = process.env.APPLE_CLIENT_ID;
    if (!cid || !process.env.APPLE_TEAM_ID || !process.env.APPLE_KEY_ID || !process.env.APPLE_PRIVATE_KEY) return null;
    return `https://appleid.apple.com/auth/authorize?${new URLSearchParams({ response_type: "code id_token", client_id: cid, redirect_uri: cbUrl("apple", req), scope: "name email", response_mode: "form_post", state })}`;
  }
  return null;
}

/* ── Token exchange ──────────────────────────────────────────────────────────── */

async function exchangeToken(key: string, code: string, cb: string, merchantId: number, extra?: Record<string, string>): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date | null; accountId?: string; accountHandle?: string }> {
  if (key === "google_drive" || key === "google_business" || key === "google_contacts" || key === "google_ads") {
    const d = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", redirect_uri: cb, grant_type: "authorization_code" }) }).then((r) => r.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    const accessToken = d.access_token ?? "";
    let accountId: string | undefined, accountHandle: string | undefined;
    if (accessToken) {
      if (key === "google_ads") {
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
    const oauthProv  = "oauthProvider" in intg ? intg.oauthProvider : null;

    let status = "disconnected", connectedAt: string | null = null, accountHandle: string | null = null, accountId: string | null = null;
    let disconnectedReason: string | null = null;
    let disconnectedAt: string | null = null;
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

    return {
      key: intg.key, label: intg.label, section: intg.section, category: intg.category,
      description: intg.description, authType: intg.authType,
      fields: "fields" in intg ? intg.fields : [],
      useVault: intg.useVault, status, connectedAt, accountHandle, accountId,
      disconnectedReason, disconnectedAt,
      // Xero connects via its dedicated /api/xero/* routes using the single
      // platform-registered app, so "configured" is the platform env-var check.
      // Other OAuth integrations use the platform env-var check too.
      oauthConfigured: intg.key === "xero"
        ? isOAuthConfigured("xero")
        : (oauthProv ? isOAuthConfigured(oauthProv) : null),
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
  if (intg.authType !== "credentials") { res.status(400).json({ error: "Use OAuth flow" }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;

  // iCloud: verify the Apple ID + app-specific password against CalDAV/CardDAV
  // before storing them, so a wrong or expired password fails loudly here.
  if (key === "apple_icloud") {
    const appleId = String(body.appleId ?? "").trim();
    const appPassword = String(body.appPassword ?? "").trim();
    if (!appleId || !appPassword) { res.status(400).json({ error: "Enter your Apple ID and an app-specific password." }); return; }
    const check = await verifyAppleCredentials(appleId, appPassword);
    if (!check.ok) { res.status(400).json({ error: check.error ?? "Apple credentials could not be verified." }); return; }
    body.appleId = appleId;
    body.appPassword = appPassword;
  }

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


/* ── DELETE /integrations/:key ─────────────────────────────────────────────── */

router.delete("/integrations/:key", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const key = String(req.params.key);
  const intg = INTEGRATIONS.find((i) => i.key === key);
  if (intg?.useVault) await deleteVault(merchantId, key);
  const existing = await getRow(merchantId, key);
  if (existing) { await db.update(merchantIntegrationsTable).set({ status: "disconnected", credentials: null, accessToken: null, refreshToken: null, connectedAt: null }).where(eq(merchantIntegrationsTable.id, existing.id)); }
  await standDownAutoSync(merchantId, key, req.log);
  res.json({ status: "disconnected" });
});

/* Disconnecting an account must also stand down any automatic sync aimed at it.
   Otherwise the schedule keeps pointing at the old provider and every run fails
   with "not connected" — which is what a merchant who switched providers sees.
   We turn the schedule off rather than silently repointing it: pushing the whole
   customer list into a different account is the merchant's call, not ours. */
async function standDownAutoSync(merchantId: number, key: string, log: { info: (o: object, m: string) => void }): Promise<void> {
  if (!isSyncProvider(key)) return;
  const [row] = await db.select().from(merchantAutoSyncSettingsTable).where(eq(merchantAutoSyncSettingsTable.merchantId, merchantId));
  if (!row) return;

  const notice = `Automatic sync was turned off because ${syncProviderLabel(key)} was disconnected. Choose a connected account to resume.`;
  const patch: Partial<typeof merchantAutoSyncSettingsTable.$inferInsert> = {};
  if (row.contactsProvider === key && row.contactsFrequency !== "disabled") {
    Object.assign(patch, { contactsProvider: "", contactsFrequency: "disabled", contactsLastError: notice, contactsLastErrorAt: new Date() });
  }
  if (row.calendarProvider === key && row.calendarFrequency !== "disabled") {
    Object.assign(patch, { calendarProvider: "", calendarFrequency: "disabled", calendarLastError: notice, calendarLastErrorAt: new Date() });
  }
  if (Object.keys(patch).length === 0) return;

  await db.update(merchantAutoSyncSettingsTable).set(patch).where(eq(merchantAutoSyncSettingsTable.merchantId, merchantId));
  log.info({ merchantId, provider: key }, "Automatic sync disabled — target account disconnected");
}

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
    duplicateStrategy,
  } = req.body as {
    provider?: string;
    includeNotes?: boolean;
    notesConflict?: "append" | "overwrite";
    // Absent on the first call → if duplicates exist we stop and warn rather
    // than silently overwriting. The client re-calls with an explicit choice.
    duplicateStrategy?: "overwrite" | "skip";
  };

  if (!isSyncProvider(provider)) {
    res.status(400).json({ error: "provider must be 'google_contacts', 'microsoft_contacts' or 'apple_icloud'" });
    return;
  }

  try {
    const result = await syncContacts(merchantId, provider, { includeNotes, notesConflict, duplicateStrategy }, req.log);
    if (result.needsConfirmation) {
      res.json({
        ok: true,
        provider,
        needsConfirmation: true,
        duplicates: result.duplicates,
        total: result.total,
        message: `${result.duplicates} of ${result.total} customer${result.total !== 1 ? "s" : ""} already exist as contacts. Overwriting replaces their existing details.`,
      });
      return;
    }
    const parts: string[] = [];
    if (result.created) parts.push(`${result.created} added`);
    if (result.updated) parts.push(`${result.updated} overwritten`);
    if (result.skipped) parts.push(`${result.skipped} skipped`);
    if (result.notesSynced) parts.push(`${result.notesSynced} with notes`);
    if (result.failed) parts.push(`${result.failed} failed`);
    res.json({
      ok: true,
      provider,
      synced: result.created + result.updated,
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
      failed: result.failed,
      notesSynced: result.notesSynced,
      message: parts.length ? `Contacts sync: ${parts.join(", ")}.` : "Nothing to sync.",
    });
  } catch (err) {
    if (err instanceof AccountNotConnectedError) { res.status(401).json({ error: err.message }); return; }
    req.log.error({ merchantId, provider, err }, "Contacts sync failed");
    res.status(502).json({ error: "Contact sync failed — please reconnect the account on the Sync page and try again." });
  }
});

/* ── POST /integrations/calendar/sync ─────────────────────────────────────────
   Pushes the merchant's upcoming KoaPOS appointments to the connected account's
   calendar — Microsoft (Graph /me/events) or Google (Calendar API). Idempotent
   via stable event ids (Microsoft transactionId, Google event id).
   Body: { provider: "microsoft_contacts" | "google_contacts" }
   ─────────────────────────────────────────────────────────────────────────── */
router.post("/integrations/calendar/sync", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const { provider } = req.body as { provider?: string };
  if (!isSyncProvider(provider)) {
    res.status(400).json({ error: "provider must be 'google_contacts', 'microsoft_contacts' or 'apple_icloud'" });
    return;
  }
  try {
    const result = await syncCalendar(merchantId, provider, req.log);
    res.json({
      ok: true,
      provider,
      synced: result.synced,
      failed: result.failed,
      message: result.total === 0
        ? "No upcoming appointments to sync"
        : `Synced ${result.synced} appointment${result.synced !== 1 ? "s" : ""}${result.failed > 0 ? ` (${result.failed} failed)` : ""}`,
    });
  } catch (err) {
    if (err instanceof AccountNotConnectedError) { res.status(401).json({ error: err.message }); return; }
    req.log.error({ merchantId, provider, err }, "Calendar sync failed");
    res.status(502).json({ error: "Calendar sync failed — please reconnect the account on the Sync page and try again." });
  }
});

export default router;
