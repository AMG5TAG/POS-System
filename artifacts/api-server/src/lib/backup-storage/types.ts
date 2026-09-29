/**
 * Backup storage destination types.
 *
 * Two shapes exist for each destination:
 *  - StoredDestination: what we persist in `merchant_backup_configs.destinations`
 *    (JSONB). Secrets are vault-encrypted with a `*Enc` suffix and never leave
 *    the server in plaintext.
 *  - ResolvedDestination: a StoredDestination with its secrets decrypted, used
 *    only in-memory at upload time.
 */
import { encryptToken, decryptToken } from "../../services/tokenVault";

export type StorageType = "local" | "sftp" | "nextcloud";

/** Sanitised destination returned to the client (no secrets, only `*Set` flags). */
export interface PublicDestination {
  id: string;
  type: StorageType;
  directory: string | null;
  host: string | null;
  port: number | null;
  username: string | null;
  remotePath: string | null;
  passwordSet: boolean;
  folder: string | null;
}

export interface StoredDestination {
  id: string;
  type: StorageType;
  // local
  directory?: string;
  // sftp
  host?: string;
  port?: number;
  username?: string;
  remotePath?: string;
  passwordEnc?: string;
  // nextcloud (credentials come from the connected integration, not stored
  // here — only the target folder is per-destination)
  folder?: string;
}

export interface ResolvedDestination {
  id: string;
  type: StorageType;
  directory?: string;
  host?: string;
  port?: number;
  username?: string;
  remotePath?: string;
  password?: string;
  folder?: string;
}

// `@workspace/db` re-exports nothing about these API types; the generated client
// owns them. We accept loose input here and narrow.
type DestInput = Record<string, unknown>;

function randomId(): string {
  return `dst_${Math.random().toString(36).slice(2, 10)}`;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/**
 * Merge a destination input from the client into the stored form, preserving
 * existing encrypted secrets when the client did not supply a new value.
 */
export function mergeDestination(
  input: DestInput,
  existing?: StoredDestination,
): StoredDestination {
  const type = str(input.type) as StorageType;
  const id = str(input.id) ?? existing?.id ?? randomId();
  const base: StoredDestination = { id, type };

  if (type === "local") {
    base.directory = str(input.directory) ?? existing?.directory;
  } else if (type === "sftp") {
    base.host = str(input.host) ?? existing?.host;
    base.port =
      typeof input.port === "number" ? input.port : existing?.port;
    base.username = str(input.username) ?? existing?.username;
    base.remotePath = str(input.remotePath) ?? existing?.remotePath;
    const pw = str(input.password);
    base.passwordEnc = pw ? encryptToken(pw) : existing?.passwordEnc;
  } else if (type === "nextcloud") {
    base.folder = str(input.folder) ?? existing?.folder;
  }
  return base;
}

/** Decrypt a stored destination's secrets for use at upload time. */
export function resolveDestination(d: StoredDestination): ResolvedDestination {
  return {
    id: d.id,
    type: d.type,
    directory: d.directory,
    host: d.host,
    port: d.port,
    username: d.username,
    remotePath: d.remotePath,
    password: d.passwordEnc ? decryptToken(d.passwordEnc) : undefined,
    folder: d.folder,
  };
}

/** Strip secrets and expose only `*Set` booleans for the API response. */
export function publicDestination(d: StoredDestination): PublicDestination {
  return {
    id: d.id,
    type: d.type,
    directory: d.directory ?? null,
    host: d.host ?? null,
    port: d.port ?? null,
    username: d.username ?? null,
    remotePath: d.remotePath ?? null,
    passwordSet: Boolean(d.passwordEnc),
    folder: d.folder ?? null,
  };
}
