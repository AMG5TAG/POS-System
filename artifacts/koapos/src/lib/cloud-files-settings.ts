/**
 * Cloud Files & Folders — platform-user settings.
 *
 * Controls whether every file uploaded to a customer is also pushed to a folder
 * on a connected cloud storage provider (OneDrive, Google Drive, Dropbox, …).
 * Configured once by the platform user on Management → Sync; read by the
 * customer file-upload flow so each upload is routed to the chosen destination.
 *
 * Persisted in localStorage (keyed per signed-in user) following the same
 * pattern as the other settings in pos-local-settings.ts.
 */

const CUSTOMER_FILES_CLOUD_KEY = "koapos_customer_files_cloud";
const LAST_CUSTOMER_SYNC_KEY = "koapos_last_customer_sync";

/** Platform-user choice for mirroring customer files to cloud storage. */
export interface CustomerFilesCloudSettings {
  /** When true, every file uploaded to a customer is also sent to the cloud. */
  enabled: boolean;
  /** Integration key of the chosen storage, e.g. "onedrive" | "google_drive" | "dropbox" | "proton_drive". */
  storageKey: string;
  /** Destination folder path inside that storage, set by the platform user. */
  folder: string;
}

export const CUSTOMER_FILES_CLOUD_DEFAULTS: CustomerFilesCloudSettings = {
  enabled: false,
  storageKey: "",
  folder: "",
};

/** Scope the key to the signed-in user so two accounts on one browser don't clash. */
function scopedKey(base: string): string {
  try {
    const raw = localStorage.getItem("koapos_auth_user");
    const user = raw ? JSON.parse(raw) : null;
    if (user?.id) return `${base}_${user.id}`;
  } catch { /* ignore */ }
  return base;
}

export function loadCustomerFilesCloudSettings(): CustomerFilesCloudSettings {
  try {
    const raw = localStorage.getItem(scopedKey(CUSTOMER_FILES_CLOUD_KEY));
    if (raw) return { ...CUSTOMER_FILES_CLOUD_DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return CUSTOMER_FILES_CLOUD_DEFAULTS;
}

export function saveCustomerFilesCloudSettings(settings: CustomerFilesCloudSettings): void {
  try {
    localStorage.setItem(scopedKey(CUSTOMER_FILES_CLOUD_KEY), JSON.stringify(settings));
  } catch { /* ignore */ }
}

/* ── Server persistence (source of truth) ────────────────────────────────────
   The settings live on the merchant account via
   GET/PUT /api/integrations/customer-files-cloud. localStorage is kept in sync
   as a cache so the upload flow and UI can read it synchronously. */

const ENDPOINT = "/api/integrations/customer-files-cloud";

/** Fetch the merchant's settings from the server and refresh the local cache. */
export async function fetchCustomerFilesCloudSettings(): Promise<CustomerFilesCloudSettings> {
  const r = await fetch(ENDPOINT, { credentials: "include" });
  if (!r.ok) throw new Error("Failed to load cloud file settings");
  const data = await r.json() as Partial<CustomerFilesCloudSettings>;
  const settings: CustomerFilesCloudSettings = {
    enabled: Boolean(data.enabled),
    storageKey: data.storageKey ?? "",
    folder: data.folder ?? "",
  };
  saveCustomerFilesCloudSettings(settings);
  return settings;
}

/** Persist the merchant's settings to the server and refresh the local cache. */
export async function putCustomerFilesCloudSettings(settings: CustomerFilesCloudSettings): Promise<void> {
  const r = await fetch(ENDPOINT, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error ?? "Failed to save cloud file settings");
  }
  saveCustomerFilesCloudSettings(settings);
}

/* ── Last customer sync indicator ────────────────────────────────────────── */

/** Record that customers were just synced to a contacts provider. */
export function recordCustomerSync(provider?: string): void {
  try {
    localStorage.setItem(
      scopedKey(LAST_CUSTOMER_SYNC_KEY),
      JSON.stringify({ at: new Date().toISOString(), provider: provider ?? null }),
    );
  } catch { /* ignore */ }
}

/** Read back when customers were last synced, or null if never. */
export function getLastCustomerSync(): { at: string; provider: string | null } | null {
  try {
    const raw = localStorage.getItem(scopedKey(LAST_CUSTOMER_SYNC_KEY));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** Human-friendly "x minutes ago" style label for a sync timestamp. */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Never";
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}
