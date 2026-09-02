/**
 * Resolve a valid Microsoft Graph access token for a merchant's connected
 * OneDrive integration, transparently refreshing via the stored refresh token
 * when the current access token has expired.
 *
 * OneDrive is connected on the Sync page; its tokens live in the OAuth token
 * vault under provider key "onedrive". This lets the backup uploader reuse that
 * connection instead of asking the user to paste a raw token.
 */
import { db, oauthTokenVaultTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { encryptToken, decryptToken } from "./tokenVault";

const MS_TOKEN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const ONEDRIVE_SCOPE = "Files.ReadWrite.AppFolder offline_access";
// Refresh slightly early so a long-running backup doesn't race the expiry.
const EXPIRY_SKEW_MS = 2 * 60 * 1000;

/** Raised when OneDrive isn't connected (or can no longer be refreshed). */
export class OneDriveNotConnectedError extends Error {
  constructor(
    message = "OneDrive is not connected. Connect it on the Sync page before backing up to OneDrive.",
  ) {
    super(message);
    this.name = "OneDriveNotConnectedError";
  }
}

/** Raised when a Microsoft Graph integration isn't connected or can't refresh. */
export class MicrosoftNotConnectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MicrosoftNotConnectedError";
  }
}

/**
 * Resolve a valid Microsoft Graph access token for any merchant integration
 * whose tokens live in the OAuth vault under `provider` (e.g. "microsoft_contacts"),
 * transparently refreshing via the stored refresh token when the current access
 * token has expired. The same flow OneDrive uses, generalised so contacts and
 * calendar sync stop failing once the short-lived access token lapses.
 *
 * @param scope The space-delimited scope to request on refresh — must match the
 *   scope the integration was originally granted (incl. `offline_access`).
 */
export async function getValidMicrosoftToken(
  merchantId: number,
  provider: string,
  scope: string,
): Promise<string> {
  const [row] = await db
    .select()
    .from(oauthTokenVaultTable)
    .where(
      and(
        eq(oauthTokenVaultTable.merchantId, merchantId),
        eq(oauthTokenVaultTable.provider, provider),
      ),
    )
    .limit(1);

  if (!row || !row.encryptedAccessToken || row.disconnectedReason) {
    throw new MicrosoftNotConnectedError(
      `${provider} is not connected — authorise it on the Sync page first.`,
    );
  }

  const stillValid =
    row.tokenExpiresAt != null &&
    row.tokenExpiresAt.getTime() - EXPIRY_SKEW_MS > Date.now();
  if (stillValid) {
    return decryptToken(row.encryptedAccessToken);
  }

  // Expired or unknown expiry — refresh with the stored refresh token.
  if (!row.encryptedRefreshToken) {
    // Unknown expiry and no refresh token: try the current token as-is.
    if (row.tokenExpiresAt == null) {
      return decryptToken(row.encryptedAccessToken);
    }
    throw new MicrosoftNotConnectedError(
      `${provider} access has expired and cannot be refreshed. Reconnect it on the Sync page.`,
    );
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Microsoft OAuth credentials are not configured on the server",
    );
  }

  const refreshToken = decryptToken(row.encryptedRefreshToken);
  const resp = await fetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope,
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(
      `${provider} token refresh failed (${resp.status} ${resp.statusText})${detail ? `: ${detail}` : ""}`,
    );
  }

  const d = (await resp.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!d.access_token) {
    throw new Error(`${provider} token refresh returned no access token`);
  }

  // Persist the rotated tokens. Update in place to preserve connectedAt and the
  // account display fields shown on the Sync page.
  await db
    .update(oauthTokenVaultTable)
    .set({
      encryptedAccessToken: encryptToken(d.access_token),
      // Microsoft rotates refresh tokens; keep the old one if none is returned.
      encryptedRefreshToken: encryptToken(d.refresh_token ?? refreshToken),
      tokenExpiresAt: d.expires_in
        ? new Date(Date.now() + d.expires_in * 1000)
        : null,
    })
    .where(
      and(
        eq(oauthTokenVaultTable.merchantId, merchantId),
        eq(oauthTokenVaultTable.provider, provider),
      ),
    );

  return d.access_token;
}

export async function getValidOneDriveToken(
  merchantId: number,
): Promise<string> {
  const [row] = await db
    .select()
    .from(oauthTokenVaultTable)
    .where(
      and(
        eq(oauthTokenVaultTable.merchantId, merchantId),
        eq(oauthTokenVaultTable.provider, "onedrive"),
      ),
    )
    .limit(1);

  if (!row || !row.encryptedAccessToken || row.disconnectedReason) {
    throw new OneDriveNotConnectedError();
  }

  const stillValid =
    row.tokenExpiresAt != null &&
    row.tokenExpiresAt.getTime() - EXPIRY_SKEW_MS > Date.now();
  if (stillValid) {
    return decryptToken(row.encryptedAccessToken);
  }

  // Expired or unknown expiry — refresh with the stored refresh token.
  if (!row.encryptedRefreshToken) {
    // Unknown expiry and no refresh token: try the current token as-is.
    if (row.tokenExpiresAt == null) {
      return decryptToken(row.encryptedAccessToken);
    }
    throw new OneDriveNotConnectedError(
      "OneDrive access has expired and cannot be refreshed. Reconnect it on the Sync page.",
    );
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Microsoft OAuth credentials are not configured on the server",
    );
  }

  const refreshToken = decryptToken(row.encryptedRefreshToken);
  const resp = await fetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: ONEDRIVE_SCOPE,
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(
      `OneDrive token refresh failed (${resp.status} ${resp.statusText})${detail ? `: ${detail}` : ""}`,
    );
  }

  const d = (await resp.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!d.access_token) {
    throw new Error("OneDrive token refresh returned no access token");
  }

  // Persist the rotated tokens. Update in place to preserve connectedAt and the
  // account display fields shown on the Sync page.
  await db
    .update(oauthTokenVaultTable)
    .set({
      encryptedAccessToken: encryptToken(d.access_token),
      // Microsoft rotates refresh tokens; keep the old one if none is returned.
      encryptedRefreshToken: encryptToken(d.refresh_token ?? refreshToken),
      tokenExpiresAt: d.expires_in
        ? new Date(Date.now() + d.expires_in * 1000)
        : null,
    })
    .where(
      and(
        eq(oauthTokenVaultTable.merchantId, merchantId),
        eq(oauthTokenVaultTable.provider, "onedrive"),
      ),
    );

  return d.access_token;
}
