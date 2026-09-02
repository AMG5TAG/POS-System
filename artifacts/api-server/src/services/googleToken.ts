/**
 * Resolve a valid Google API access token for any merchant integration whose
 * tokens live in the OAuth vault under `provider` (e.g. "google_contacts"),
 * transparently refreshing via the stored refresh token when the current access
 * token has expired. Mirrors the Microsoft refresher so Google contacts and
 * calendar sync stop failing once the short-lived (~1 hour) access token lapses.
 *
 * Google only issues a refresh token on the first consent (the OAuth start URL
 * requests access_type=offline & prompt=consent for this), and does NOT rotate
 * it on refresh — so we keep the stored refresh token across refreshes.
 */
import { db, oauthTokenVaultTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { encryptToken, decryptToken } from "./tokenVault";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
// Refresh slightly early so a long-running sync doesn't race the expiry.
const EXPIRY_SKEW_MS = 2 * 60 * 1000;

/** Raised when a Google integration isn't connected or can't refresh. */
export class GoogleNotConnectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleNotConnectedError";
  }
}

export async function getValidGoogleToken(
  merchantId: number,
  provider: string,
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
    throw new GoogleNotConnectedError(
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
    throw new GoogleNotConnectedError(
      `${provider} access has expired and cannot be refreshed. Reconnect it on the Sync page.`,
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials are not configured on the server");
  }

  const refreshToken = decryptToken(row.encryptedRefreshToken);
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
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

  // Persist the new access token. Google does not return a new refresh token on
  // refresh, so keep the existing one. Update in place to preserve connectedAt
  // and the account display fields shown on the Sync page.
  await db
    .update(oauthTokenVaultTable)
    .set({
      encryptedAccessToken: encryptToken(d.access_token),
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
