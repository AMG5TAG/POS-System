import type { PayrollAuth, PayrollRegion } from "./types";
import { XERO_OAUTH_SCOPES } from "./xeroPayrollAdapter";

/**
 * Provider-agnostic OAuth layer for payroll connections.
 *
 * Each payroll provider differs in authorize/token URLs, scopes, how the token
 * request is authenticated (HTTP Basic vs. client creds in the body), and how
 * the "connection" (Xero tenant / MYOB company file) is resolved after sign-in.
 * The route layer drives all of this through `OAuthProviderConfig` so adding a
 * provider is a single registry entry, not a route rewrite.
 */

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export interface OAuthProviderConfig {
  /** Also used as the merchant_integrations.integration_key for token storage. */
  key: string;
  label: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  /** How the token endpoint authenticates the client. */
  tokenAuth: "basic" | "body";
  /** Resolve the connection identifier + display name after sign-in. */
  resolveTenant(accessToken: string, clientId: string): Promise<{ tenantId: string; tenantName: string }>;
  /** Build the adapter auth context for API calls. */
  buildAuth(opts: { accessToken: string; tenantId: string; region: PayrollRegion; clientId: string }): PayrollAuth;
}

const MYOB_API_ROOT = "https://api.myob.com/accountright";

export const PAYROLL_PROVIDERS: Record<string, OAuthProviderConfig> = {
  xero_payroll: {
    key: "xero_payroll",
    label: "Xero Payroll",
    authUrl: "https://login.xero.com/identity/connect/authorize",
    tokenUrl: "https://identity.xero.com/connect/token",
    scopes: XERO_OAUTH_SCOPES,
    clientIdEnv: "XERO_CLIENT_ID",
    clientSecretEnv: "XERO_CLIENT_SECRET",
    tokenAuth: "basic",
    async resolveTenant(accessToken) {
      const r = await fetch("https://api.xero.com/connections", {
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      });
      if (!r.ok) return { tenantId: "", tenantName: "" };
      const tenants = (await r.json()) as Array<{ tenantId: string; tenantName: string }>;
      return { tenantId: tenants[0]?.tenantId ?? "", tenantName: tenants[0]?.tenantName ?? "" };
    },
    buildAuth({ accessToken, tenantId, region }) {
      return { accessToken, tenantId, region };
    },
  },

  myob_payroll: {
    key: "myob_payroll",
    label: "MYOB",
    authUrl: "https://secure.myob.com/oauth2/account/authorize",
    tokenUrl: "https://secure.myob.com/oauth2/v1/authorize",
    // MYOB issues a refresh token for the CompanyFile scope by default.
    scopes: "CompanyFile",
    clientIdEnv: "MYOB_CLIENT_ID",
    clientSecretEnv: "MYOB_CLIENT_SECRET",
    tokenAuth: "body",
    async resolveTenant(accessToken, clientId) {
      // Lists the cloud company files visible to the signed-in MYOB account.
      const r = await fetch(`${MYOB_API_ROOT}/`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "x-myobapi-key": clientId,
          "x-myobapi-version": "v2",
          Accept: "application/json",
        },
      });
      if (!r.ok) return { tenantId: "", tenantName: "" };
      const files = (await r.json()) as Array<{ Id: string; Name: string; Uri: string }>;
      const f = files[0];
      // Store the company-file URI as the connection id; the adapter calls it directly.
      return { tenantId: f?.Uri ?? "", tenantName: f?.Name ?? "" };
    },
    buildAuth({ accessToken, tenantId, region, clientId }) {
      return { accessToken, tenantId, region, apiKey: clientId };
    },
  },
};

export function getOAuthConfig(key: string): OAuthProviderConfig | null {
  return PAYROLL_PROVIDERS[key] ?? null;
}

export function isProviderConfigured(cfg: OAuthProviderConfig): boolean {
  return !!(process.env[cfg.clientIdEnv] && process.env[cfg.clientSecretEnv]);
}

function clientCreds(cfg: OAuthProviderConfig): { id: string; secret: string } | null {
  const id = process.env[cfg.clientIdEnv];
  const secret = process.env[cfg.clientSecretEnv];
  return id && secret ? { id, secret } : null;
}

/** Build the provider authorize-redirect URL. */
export function buildAuthorizeUrl(cfg: OAuthProviderConfig, redirectUri: string, state: string): string | null {
  const creds = clientCreds(cfg);
  if (!creds) return null;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: creds.id,
    redirect_uri: redirectUri,
    scope: cfg.scopes,
    state,
  });
  return `${cfg.authUrl}?${params.toString()}`;
}

function tokenRequestInit(cfg: OAuthProviderConfig, body: Record<string, string>): RequestInit {
  const creds = clientCreds(cfg)!;
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  const form = { ...body };
  if (cfg.tokenAuth === "basic") {
    headers.Authorization = `Basic ${Buffer.from(`${creds.id}:${creds.secret}`).toString("base64")}`;
  } else {
    form.client_id = creds.id;
    form.client_secret = creds.secret;
  }
  return { method: "POST", headers, body: new URLSearchParams(form) };
}

/** Exchange an authorization code for tokens. Returns null on failure. */
export async function exchangeCode(
  cfg: OAuthProviderConfig,
  code: string,
  redirectUri: string,
): Promise<OAuthTokens | null> {
  if (!clientCreds(cfg)) return null;
  try {
    const r = await fetch(
      cfg.tokenUrl,
      tokenRequestInit(cfg, { grant_type: "authorization_code", code, redirect_uri: redirectUri, scope: cfg.scopes }),
    );
    if (!r.ok) return null;
    return (await r.json()) as OAuthTokens;
  } catch {
    return null;
  }
}

/** Refresh an access token. Returns null on failure. */
export async function refreshTokens(cfg: OAuthProviderConfig, refreshToken: string): Promise<OAuthTokens | null> {
  if (!clientCreds(cfg)) return null;
  try {
    const r = await fetch(cfg.tokenUrl, tokenRequestInit(cfg, { grant_type: "refresh_token", refresh_token: refreshToken }));
    if (!r.ok) return null;
    return (await r.json()) as OAuthTokens;
  } catch {
    return null;
  }
}

export function clientId(cfg: OAuthProviderConfig): string {
  return process.env[cfg.clientIdEnv] ?? "";
}
