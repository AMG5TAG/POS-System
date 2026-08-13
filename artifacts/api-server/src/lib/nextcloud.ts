/**
 * Nextcloud WebDAV client.
 *
 * Unlike the other cloud storage integrations, Nextcloud is self-hosted: every
 * merchant points at their own server, so there is no platform-registered OAuth
 * app and no bearer token. Authentication is HTTP Basic with an *app password*
 * obtained through Login Flow v2 (see services/nextcloudAuth.ts) — a per-app
 * credential the merchant can revoke from Nextcloud → Settings → Security
 * without touching their real account password.
 *
 * Because the server URL is merchant-supplied, every request target is checked
 * against `assertSafeNextcloudUrl` before we make it (see the SSRF notes there).
 *
 * This module is pure transport: no DB, no vault. Credential resolution lives in
 * services/nextcloudAuth.ts.
 */
import { lookup } from "dns/promises";
import { open, stat } from "fs/promises";
import net from "net";

/** Merchant-supplied server plus the app password issued by Login Flow v2. */
export interface NextcloudCredentials {
  /** Origin only, no trailing slash — e.g. "https://cloud.example.com". */
  serverUrl: string;
  /** The Nextcloud login name the app password belongs to. */
  loginName: string;
  appPassword: string;
}

/** Files larger than this are sent via chunked upload v2 rather than a single PUT. */
const CHUNKED_UPLOAD_THRESHOLD = 50 * 1024 * 1024;
const CHUNK_SIZE = 10 * 1024 * 1024;

/* ── URL handling & SSRF guard ──────────────────────────────────────────────── */

/**
 * Normalise a merchant-entered server URL into a bare origin.
 *
 * Accepts what merchants actually paste — "cloud.example.com",
 * "https://cloud.example.com/", "https://cloud.example.com/index.php/apps/files"
 * — and reduces it to the origin. A path prefix is preserved when the instance
 * is hosted under a sub-path (e.g. "https://example.com/nextcloud"), but the
 * well-known Nextcloud app paths are stripped so pasting a browser URL works.
 */
export function normaliseServerUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Enter your Nextcloud server address");

  // A bare host gets https:// prepended, but any *other* scheme must be
  // rejected outright: blindly prefixing "ftp://host" yields the parseable
  // nonsense "https://ftp://host" rather than an error.
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme && scheme !== "https" && scheme !== "http") {
    throw new Error("Server address must start with https://");
  }
  const withScheme = scheme ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error(`"${input}" is not a valid server address`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Server address must start with https://");
  }
  // Plain HTTP would send the app password in the clear. Only tolerated locally.
  if (url.protocol === "http:" && process.env.NODE_ENV === "production") {
    throw new Error("Nextcloud server must use https://");
  }

  // Drop anything from the first Nextcloud-owned path segment onward, so a URL
  // copied out of the browser's address bar still resolves to the instance root.
  let path = url.pathname.replace(/\/+$/, "");
  path = path.replace(/\/(index\.php|apps|remote\.php|settings|login).*$/i, "");

  return `${url.origin}${path}`;
}

/** IPv4/IPv6 ranges that must never be reachable from a merchant-supplied URL. */
function isBlockedAddress(ip: string): boolean {
  const family = net.isIP(ip);

  if (family === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number, number, number];
    if (a === 0) return true;                        // "this network"
    if (a === 10) return true;                       // RFC1918
    if (a === 127) return true;                      // loopback
    if (a === 169 && b === 254) return true;         // link-local (cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 192 && b === 168) return true;         // RFC1918
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 192 && b === 0) return true;           // IETF protocol assignments
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a >= 224) return true;                       // multicast + reserved
    return false;
  }

  if (family === 6) {
    const v6 = ip.toLowerCase();
    // IPv4-mapped addresses (::ffff:169.254.169.254) must be judged as IPv4.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
    if (mapped) return isBlockedAddress(mapped[1]!);
    if (v6 === "::" || v6 === "::1") return true;    // unspecified / loopback
    if (/^f[cd]/.test(v6)) return true;              // unique local fc00::/7
    if (/^fe[89ab]/.test(v6)) return true;           // link-local fe80::/10
    if (/^ff/.test(v6)) return true;                 // multicast
    return false;
  }

  return true;
}

/**
 * Reject server URLs that resolve into our own infrastructure.
 *
 * The merchant controls this hostname, so without a check it becomes an SSRF
 * primitive pointed at the deployment's private network or the cloud metadata
 * endpoint. A merchant's genuinely private Nextcloud is unreachable from this
 * server anyway, so blocking these ranges costs nothing real.
 *
 * Note this validates the address at resolve time; a hostname whose DNS record
 * flips to a private address between this check and the request (DNS rebinding)
 * would slip through. Closing that fully needs connection-level pinning, which
 * fetch() does not expose — accepted here because the caller is an authenticated
 * merchant rather than an anonymous visitor.
 */
export async function assertSafeNextcloudUrl(serverUrl: string): Promise<void> {
  const { hostname } = new URL(serverUrl);

  // A literal IP needs no resolution — check it directly.
  if (net.isIP(hostname)) {
    if (isBlockedAddress(hostname)) {
      throw new Error("That server address is not reachable");
    }
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new Error(`Could not resolve "${hostname}"`);
  }

  if (addresses.length === 0) throw new Error(`Could not resolve "${hostname}"`);
  // Every resolved address must be public — a hostname with even one private
  // answer is treated as hostile rather than partially usable.
  if (addresses.some((a) => isBlockedAddress(a.address))) {
    throw new Error("That server address is not reachable");
  }
}

/* ── Request helpers ────────────────────────────────────────────────────────── */

function authHeader(creds: NextcloudCredentials): string {
  const raw = `${creds.loginName}:${creds.appPassword}`;
  return `Basic ${Buffer.from(raw, "utf8").toString("base64")}`;
}

/** Root of the merchant's own WebDAV files space. */
function filesRoot(creds: NextcloudCredentials): string {
  return `${creds.serverUrl}/remote.php/dav/files/${encodeURIComponent(creds.loginName)}`;
}

/** Root of the chunked-upload space used for large archives. */
function uploadsRoot(creds: NextcloudCredentials): string {
  return `${creds.serverUrl}/remote.php/dav/uploads/${encodeURIComponent(creds.loginName)}`;
}

/** Encode a "a/b/c" remote path for use in a URL, preserving the separators. */
function encodePath(remotePath: string): string {
  return remotePath.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

/** Normalise a user-entered folder into clean, slash-separated segments. */
export function folderSegments(folder: string | undefined): string[] {
  return (folder ?? "")
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function davFetch(
  creds: NextcloudCredentials,
  url: string,
  init: RequestInit & { method: string },
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: authHeader(creds),
      // Nextcloud keys some rate-limit and app-password behaviour off the agent.
      "User-Agent": "KoaPOS",
      ...(init.headers ?? {}),
    },
  });
}

/** Turn a failed WebDAV response into an error the merchant can act on. */
async function davError(res: Response, action: string): Promise<Error> {
  if (res.status === 401) {
    return new Error(
      "Nextcloud rejected the saved credentials — reconnect the integration",
    );
  }
  if (res.status === 507) {
    return new Error("The Nextcloud account is out of storage space");
  }
  if (res.status === 413) {
    return new Error(
      "The Nextcloud server refused the file as too large — raise its upload limit",
    );
  }
  const detail = await res.text().catch(() => "");
  // WebDAV errors are XML; surface just the human message when there is one.
  const message = /<s:message>([\s\S]*?)<\/s:message>/.exec(detail)?.[1]?.trim();
  return new Error(
    `Nextcloud ${action} failed (${res.status} ${res.statusText})${message ? `: ${message}` : ""}`,
  );
}

/* ── Operations ─────────────────────────────────────────────────────────────── */

/**
 * Check that the credentials work and the account is usable, returning the
 * quota-bearing PROPFIND on the files root. Used to fail loudly at connect time
 * rather than at the first backup.
 */
export async function verifyCredentials(
  creds: NextcloudCredentials,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await assertSafeNextcloudUrl(creds.serverUrl);
    const res = await davFetch(creds, filesRoot(creds), {
      method: "PROPFIND",
      headers: { Depth: "0", "Content-Type": "application/xml" },
    });
    if (res.ok || res.status === 207) return { ok: true };
    return { ok: false, error: (await davError(res, "connection check")).message };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Create the folder chain if it does not already exist, one MKCOL per level.
 * WebDAV has no recursive create, and 405 Method Not Allowed is how Nextcloud
 * reports "this collection already exists" — which is a success for us.
 */
export async function ensureFolder(
  creds: NextcloudCredentials,
  segments: string[],
): Promise<void> {
  let soFar = "";
  for (const segment of segments) {
    soFar = soFar ? `${soFar}/${segment}` : segment;
    const res = await davFetch(creds, `${filesRoot(creds)}/${encodePath(soFar)}`, {
      method: "MKCOL",
    });
    if (res.ok || res.status === 405) continue;
    throw await davError(res, `folder creation ("${soFar}")`);
  }
}

/**
 * Upload a buffer to `<folder>/<filename>`, creating the folder chain first.
 * Returns the remote path relative to the account's files root.
 */
export async function uploadBuffer(
  creds: NextcloudCredentials,
  segments: string[],
  filename: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  await assertSafeNextcloudUrl(creds.serverUrl);
  if (segments.length > 0) await ensureFolder(creds, segments);

  const remotePath = [...segments, filename].join("/");
  const res = await davFetch(creds, `${filesRoot(creds)}/${encodePath(remotePath)}`, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: new Uint8Array(body),
  });
  if (!res.ok) throw await davError(res, "upload");
  return remotePath;
}

/**
 * Upload a file from disk to `<folder>/<filename>`, creating the folder chain
 * first. Large files go through chunked upload v2, because a single PUT of a
 * multi-GB archive runs into whatever body limit sits in front of the merchant's
 * Nextcloud (nginx's `client_max_body_size` defaults to 1 MB).
 *
 * Returns the remote path relative to the account's files root.
 */
export async function uploadFile(
  creds: NextcloudCredentials,
  segments: string[],
  filename: string,
  sourcePath: string,
): Promise<string> {
  await assertSafeNextcloudUrl(creds.serverUrl);
  if (segments.length > 0) await ensureFolder(creds, segments);

  const remotePath = [...segments, filename].join("/");
  const { size } = await stat(sourcePath);

  if (size > CHUNKED_UPLOAD_THRESHOLD) {
    await uploadChunked(creds, remotePath, sourcePath, size);
    return remotePath;
  }

  const handle = await open(sourcePath, "r");
  try {
    const body = await handle.readFile();
    const res = await davFetch(creds, `${filesRoot(creds)}/${encodePath(remotePath)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: new Uint8Array(body),
    });
    if (!res.ok) throw await davError(res, "upload");
  } finally {
    await handle.close();
  }
  return remotePath;
}

/**
 * Chunked upload v2: MKCOL a transfer directory, PUT each chunk into it, then
 * MOVE the virtual `.file` onto the real destination — Nextcloud assembles the
 * chunks server-side at that point, so the destination never exists partially.
 */
async function uploadChunked(
  creds: NextcloudCredentials,
  remotePath: string,
  sourcePath: string,
  size: number,
): Promise<void> {
  // Nextcloud only requires the transfer id to be unique per user; the target
  // path makes collisions between concurrent backups impossible in practice.
  const transferId = `koapos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const transferDir = `${uploadsRoot(creds)}/${encodeURIComponent(transferId)}`;
  const destination = `${filesRoot(creds)}/${encodePath(remotePath)}`;

  const mk = await davFetch(creds, transferDir, {
    method: "MKCOL",
    headers: { Destination: destination },
  });
  if (!mk.ok && mk.status !== 405) throw await davError(mk, "chunked upload start");

  const handle = await open(sourcePath, "r");
  try {
    const total = Math.ceil(size / CHUNK_SIZE);
    for (let index = 0; index < total; index++) {
      const offset = index * CHUNK_SIZE;
      const length = Math.min(CHUNK_SIZE, size - offset);
      const buffer = Buffer.allocUnsafe(length);
      await handle.read(buffer, 0, length, offset);

      // Chunk names sort lexicographically in assembly order.
      const name = String(index + 1).padStart(5, "0");
      const res = await davFetch(creds, `${transferDir}/${name}`, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream", Destination: destination },
        body: new Uint8Array(buffer),
      });
      if (!res.ok) throw await davError(res, `chunk ${index + 1}/${total} upload`);
    }
  } catch (err) {
    // Leaving a half-finished transfer directory behind would consume the
    // merchant's quota until Nextcloud's own cleanup job runs.
    await davFetch(creds, transferDir, { method: "DELETE" }).catch(() => undefined);
    throw err;
  } finally {
    await handle.close();
  }

  const move = await davFetch(creds, `${transferDir}/.file`, {
    method: "MOVE",
    headers: { Destination: destination, Overwrite: "T" },
  });
  if (!move.ok) throw await davError(move, "chunked upload assembly");
}

/** Download a file by its remote path (relative to the account's files root). */
export async function downloadToBuffer(
  creds: NextcloudCredentials,
  remotePath: string,
): Promise<Buffer> {
  await assertSafeNextcloudUrl(creds.serverUrl);
  const res = await davFetch(creds, `${filesRoot(creds)}/${encodePath(remotePath)}`, {
    method: "GET",
  });
  if (!res.ok) throw await davError(res, "download");
  return Buffer.from(await res.arrayBuffer());
}

/* ── Location refs ──────────────────────────────────────────────────────────── */

/**
 * Build the `locations[]` ref recorded against a backup. Mirrors the readable
 * form the other adapters use ("s3://bucket/key", "sftp://host/path") while
 * staying parseable by `parseNextcloudRef`.
 */
export function nextcloudRef(serverUrl: string, remotePath: string): string {
  const { host } = new URL(serverUrl);
  return `nextcloud://${host}/${remotePath}`;
}

/** Recover the remote path from a ref, or null if it is not a Nextcloud ref. */
export function parseNextcloudRef(ref: string): string | null {
  const prefix = "nextcloud://";
  if (!ref.startsWith(prefix)) return null;
  const rest = ref.slice(prefix.length);
  const slash = rest.indexOf("/");
  return slash === -1 ? null : rest.slice(slash + 1);
}
