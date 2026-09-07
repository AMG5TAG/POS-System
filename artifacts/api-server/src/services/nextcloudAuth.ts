/**
 * Nextcloud connection lifecycle — Login Flow v2 plus credential storage.
 *
 * Nextcloud is self-hosted, so there is no platform-registered OAuth client to
 * exchange a code against: each merchant's server issues its own credential.
 * Login Flow v2 is Nextcloud's answer to that — we ask the merchant's server to
 * open a login session, send the merchant there to approve it in their browser,
 * and poll until the server hands back an app password scoped to KoaPOS. The
 * merchant never types a password into KoaPOS, and can revoke the app password
 * from Nextcloud → Settings → Security without changing their account password.
 *
 * The resulting credentials are stored in the encrypted OAuth token vault under
 * the provider key "nextcloud", the same as every other vault-backed
 * integration.
 */
import {
  assertSafeNextcloudUrl,
  normaliseServerUrl,
  verifyCredentials,
  type NextcloudCredentials,
} from "../lib/nextcloud";
import { readCredentialVault, upsertCredentialVault } from "./tokenVault";

/** The integration/vault key for Nextcloud. */
export const NEXTCLOUD_PROVIDER = "nextcloud";

/** Nextcloud expires an unapproved login flow after 20 minutes. */
export const LOGIN_FLOW_TTL_MS = 20 * 60 * 1000;

/** Server-held state for a login flow awaiting the merchant's approval. */
export interface PendingLoginFlow {
  /** Normalised origin the flow was started against. */
  serverUrl: string;
  /** Secret poll token — never sent to the browser. */
  pollToken: string;
  pollEndpoint: string;
  startedAt: number;
}

export class NextcloudNotConnectedError extends Error {
  constructor(message = "Nextcloud is not connected for this merchant") {
    super(message);
    this.name = "NextcloudNotConnectedError";
  }
}

/** Credential blob as persisted in the vault. */
interface StoredNextcloudCredentials extends NextcloudCredentials {
  /** Precomputed "user @ host" label; the vault surfaces it as the handle. */
  displayName: string;
}

function displayNameFor(serverUrl: string, loginName: string): string {
  let host = serverUrl;
  try {
    host = new URL(serverUrl).host;
  } catch {
    /* keep the raw value — it is only a label */
  }
  return `${loginName} @ ${host}`;
}

/* ── Login Flow v2 ──────────────────────────────────────────────────────────── */

/**
 * Open a login flow on the merchant's server.
 *
 * Returns the browser URL to send the merchant to, plus the poll state the
 * caller must hold onto (in the session) until the flow completes.
 */
export async function startLoginFlow(
  rawServerUrl: string,
): Promise<{ loginUrl: string; pending: PendingLoginFlow }> {
  const serverUrl = normaliseServerUrl(rawServerUrl);
  await assertSafeNextcloudUrl(serverUrl);

  let res: Response;
  try {
    res = await fetch(`${serverUrl}/index.php/login/v2`, {
      method: "POST",
      // Nextcloud shows this name on the generated app password, so the
      // merchant can see what the credential belongs to when revoking it.
      headers: { "User-Agent": "KoaPOS", Accept: "application/json" },
    });
  } catch {
    throw new Error(
      `Could not reach ${serverUrl}. Check the address and that the server is publicly accessible.`,
    );
  }

  if (!res.ok) {
    throw new Error(
      `${serverUrl} did not accept the login request (${res.status}). Check that it is a Nextcloud server.`,
    );
  }

  const data = (await res.json().catch(() => null)) as {
    poll?: { token?: string; endpoint?: string };
    login?: string;
  } | null;

  const pollToken = data?.poll?.token;
  const pollEndpoint = data?.poll?.endpoint;
  const loginUrl = data?.login;
  if (!pollToken || !pollEndpoint || !loginUrl) {
    throw new Error(`${serverUrl} returned an unexpected login response.`);
  }

  // The endpoint is echoed back by the merchant's server; make sure it still
  // points at the host we vetted rather than anywhere it likes.
  await assertSafeNextcloudUrl(pollEndpoint);
  if (new URL(pollEndpoint).origin !== new URL(serverUrl).origin) {
    throw new Error(`${serverUrl} returned a login endpoint on a different host.`);
  }

  return {
    loginUrl,
    pending: { serverUrl, pollToken, pollEndpoint, startedAt: Date.now() },
  };
}

export type PollResult =
  | { status: "pending" }
  | { status: "expired" }
  | { status: "connected"; credentials: NextcloudCredentials; displayName: string };

/**
 * Poll a pending flow once.
 *
 * Nextcloud answers 404 until the merchant approves, then 200 with the app
 * password — and consumes the poll token at that point, so a successful result
 * must be persisted by the caller.
 */
export async function pollLoginFlow(pending: PendingLoginFlow): Promise<PollResult> {
  if (Date.now() - pending.startedAt > LOGIN_FLOW_TTL_MS) return { status: "expired" };

  await assertSafeNextcloudUrl(pending.pollEndpoint);

  let res: Response;
  try {
    res = await fetch(pending.pollEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "KoaPOS",
        Accept: "application/json",
      },
      body: new URLSearchParams({ token: pending.pollToken }),
    });
  } catch {
    // A transient network blip should not kill a flow the merchant may still be
    // partway through approving; let the client poll again.
    return { status: "pending" };
  }

  // 404 is the documented "not approved yet" answer.
  if (res.status === 404) return { status: "pending" };
  if (!res.ok) return { status: "expired" };

  const data = (await res.json().catch(() => null)) as {
    server?: string;
    loginName?: string;
    appPassword?: string;
  } | null;

  if (!data?.loginName || !data?.appPassword) return { status: "expired" };

  // Trust the server value the instance reports over the one the merchant typed
  // (it accounts for overwrite.cli.url and sub-path installs), but re-vet it.
  const serverUrl = data.server
    ? normaliseServerUrl(data.server)
    : pending.serverUrl;
  await assertSafeNextcloudUrl(serverUrl);

  const credentials: NextcloudCredentials = {
    serverUrl,
    loginName: data.loginName,
    appPassword: data.appPassword,
  };

  return {
    status: "connected",
    credentials,
    displayName: displayNameFor(serverUrl, credentials.loginName),
  };
}

/* ── Credential storage ─────────────────────────────────────────────────────── */

/**
 * Verify the freshly issued credentials actually work, then store them
 * encrypted. Verifying here means a misconfigured instance surfaces during the
 * connect flow rather than silently at the first scheduled backup.
 */
export async function saveNextcloudCredentials(
  merchantId: number,
  credentials: NextcloudCredentials,
  displayName: string,
): Promise<void> {
  const check = await verifyCredentials(credentials);
  if (!check.ok) throw new Error(check.error);

  const stored: StoredNextcloudCredentials = { ...credentials, displayName };
  await upsertCredentialVault(merchantId, NEXTCLOUD_PROVIDER, { ...stored }, {
    accountIdField: "loginName",
    accountHandleField: "displayName",
  });
}

/**
 * Read the merchant's stored Nextcloud credentials.
 *
 * Throws NextcloudNotConnectedError when the integration is absent or the vault
 * row could not be decrypted (e.g. after a key rotation), so callers report
 * "reconnect Nextcloud" rather than a generic failure.
 */
export async function getNextcloudCredentials(
  merchantId: number,
): Promise<NextcloudCredentials> {
  const stored = await readCredentialVault<StoredNextcloudCredentials>(
    merchantId,
    NEXTCLOUD_PROVIDER,
  );
  if (!stored?.serverUrl || !stored.loginName || !stored.appPassword) {
    throw new NextcloudNotConnectedError();
  }
  return {
    serverUrl: stored.serverUrl,
    loginName: stored.loginName,
    appPassword: stored.appPassword,
  };
}
