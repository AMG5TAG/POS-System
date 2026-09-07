/* ─── Print Bridge client ─────────────────────────────────────────────────────
 * Talks to the KoaPOS Print Bridge (artifacts/print-bridge) running on this
 * till's loopback interface. The bridge is what lets the app print to a *named*
 * printer with no Windows print dialog — raw ESC/POS for thermal, HTML→PDF for
 * A4 — and is the only transport that can route different documents to
 * different printers.
 *
 * Everything here is device-local: the bridge URL, the pairing token and the
 * per-device printer overrides live in localStorage, because OS printer names
 * differ from till to till. The merchant-level routing *policy* (which purpose
 * uses which profile) lives in `pos_settings.hardwareConfig` — see
 * `lib/hardware-config.ts`.
 *
 * Browsers treat http://127.0.0.1 as a trustworthy origin, so an HTTPS KoaPOS
 * page can reach the bridge without a mixed-content block. Chrome/Edge only —
 * the same requirement as WebUSB.
 */

const LS_URL = "koapos.printBridge.url";
const LS_TOKEN = "koapos.printBridge.token";
const LS_PRINTER_OVERRIDES = "koapos.printBridge.printerOverrides";

export const DEFAULT_BRIDGE_URL = "http://127.0.0.1:17777";

export interface BridgeHealth {
  ok: true;
  name: string;
  version: string;
  platform: string;
  originAllowed: boolean;
  pairingOpen: boolean;
  runningAsService: boolean;
}

export interface BridgePrinter {
  name: string;
  isDefault: boolean;
  /** Reached over the network — shared from another PC, or on a TCP/IP port. */
  isNetwork: boolean;
  status?: string;
}

export interface BridgeDiagnostics {
  configPath: string;
  chromePath: string | null;
  pdfPrinterPath: string | null;
  allowedOrigins: string[];
  runningAsService: boolean;
}

/** Snapshot of the bridge as this device currently sees it. */
export interface BridgeStatus {
  /** A bridge answered /v1/health. */
  reachable: boolean;
  /** The bridge accepted this KoaPOS origin. */
  originAllowed: boolean;
  /** A token is stored *and* the bridge accepted it. */
  paired: boolean;
  /** The bridge is currently handing out pairing tokens. */
  pairingOpen: boolean;
  /**
   * The bridge is running as a Windows service (SYSTEM). Printers *shared from
   * another PC* are per-user connections and are invisible to it — the usual
   * cause of "my LAN label printer isn't in the list".
   */
  runningAsService: boolean;
  version?: string;
  platform?: string;
  printers: BridgePrinter[];
  /** Human-readable reason when the bridge can't be used. */
  error?: string;
}

/* ── Device-local settings ──────────────────────────────────────────────────── */

function readLs(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return ""; // private mode / storage blocked
  }
}

function writeLs(key: string, value: string): void {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    /* nothing we can do — the bridge just stays unpaired on this device */
  }
}

export function getBridgeUrl(): string {
  return readLs(LS_URL) || DEFAULT_BRIDGE_URL;
}

export function setBridgeUrl(url: string): void {
  writeLs(LS_URL, url.trim().replace(/\/+$/, ""));
}

export function getBridgeToken(): string {
  return readLs(LS_TOKEN);
}

export function setBridgeToken(token: string): void {
  writeLs(LS_TOKEN, token.trim());
}

export function isBridgePaired(): boolean {
  return getBridgeToken().length > 0;
}

/**
 * Per-device overrides of a printer profile's OS queue name, keyed by profile
 * id. A merchant-level profile can name the queue ("Partner RP-700") for the
 * common case where every till installs the driver identically; a till that
 * names it differently overrides it here.
 */
export function getPrinterOverrides(): Record<string, string> {
  try {
    const parsed = JSON.parse(readLs(LS_PRINTER_OVERRIDES) || "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

export function setPrinterOverride(profileId: string, printerName: string): void {
  const next = { ...getPrinterOverrides() };
  if (printerName) next[profileId] = printerName;
  else delete next[profileId];
  writeLs(LS_PRINTER_OVERRIDES, JSON.stringify(next));
}

/* ── Transport ──────────────────────────────────────────────────────────────── */

class BridgeError extends Error {}

async function call<T>(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown; auth?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), init.timeoutMs ?? 20_000);
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.auth !== false) {
    const token = getBridgeToken();
    if (!token) throw new BridgeError("This device isn't paired with the print bridge yet.");
    headers.authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${getBridgeUrl()}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
      // The bridge authenticates with a bearer token, never a cookie.
      credentials: "omit",
      mode: "cors",
    });
  } catch {
    throw new BridgeError(
      "Can't reach the print bridge. Make sure it's running on this computer (KoaPOS Print Bridge).",
    );
  } finally {
    window.clearTimeout(timer);
  }

  const text = await res.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    const message = (payload as { error?: string } | null)?.error ?? `Print bridge returned ${res.status}`;
    throw new BridgeError(message);
  }
  return payload as T;
}

/** Probe the bridge without throwing — safe to call on every settings render. */
export async function probeBridge(): Promise<BridgeStatus> {
  const idle: BridgeStatus = {
    reachable: false, originAllowed: false, paired: false, pairingOpen: false,
    runningAsService: false, printers: [],
  };
  let health: BridgeHealth;
  try {
    health = await call<BridgeHealth>("/v1/health", { auth: false, timeoutMs: 4000 });
  } catch (err) {
    return { ...idle, error: err instanceof Error ? err.message : "Print bridge unavailable" };
  }

  const base: BridgeStatus = {
    reachable: true,
    originAllowed: health.originAllowed,
    paired: false,
    pairingOpen: health.pairingOpen,
    runningAsService: health.runningAsService === true,
    version: health.version,
    platform: health.platform,
    printers: [],
  };

  if (!health.originAllowed) {
    return {
      ...base,
      error: `The bridge is running but hasn't been told to trust ${window.location.origin}. Add it to "allowedOrigins" in the bridge config and restart it.`,
    };
  }
  if (!isBridgePaired()) return { ...base, error: "This device isn't paired with the print bridge yet." };

  try {
    const { printers } = await call<{ printers: BridgePrinter[] }>("/v1/printers", { timeoutMs: 15_000 });
    return { ...base, paired: true, printers };
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : "Print bridge rejected this device" };
  }
}

/** Claim the pairing token. The bridge only grants it while pairing is open. */
export async function pairBridge(): Promise<void> {
  const { token } = await call<{ token: string }>("/v1/pair", { method: "POST", auth: false, timeoutMs: 8000 });
  if (!token) throw new BridgeError("The print bridge did not return a pairing token.");
  setBridgeToken(token);
}

export function unpairBridge(): void {
  setBridgeToken("");
}

export async function listBridgePrinters(): Promise<BridgePrinter[]> {
  const { printers } = await call<{ printers: BridgePrinter[] }>("/v1/printers");
  return printers;
}

export function bridgeDiagnostics(): Promise<BridgeDiagnostics> {
  return call<BridgeDiagnostics>("/v1/diagnostics");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  // Chunked so a long docket can't blow the argument limit of String.fromCharCode.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return window.btoa(binary);
}

/** Push raw ESC/POS bytes to a named queue — no dialog, no driver rendering. */
export function bridgePrintRaw(opts: {
  printer?: string;
  data: Uint8Array;
  jobName?: string;
  copies?: number;
}): Promise<void> {
  return call<{ ok: true }>("/v1/print/raw", {
    method: "POST",
    timeoutMs: 60_000,
    body: {
      printer: opts.printer ?? "",
      data: toBase64(opts.data),
      jobName: opts.jobName ?? "KoaPOS",
      copies: opts.copies ?? 1,
    },
  }).then(() => undefined);
}

export type BridgePaper = "A4" | "A4-landscape" | "A5" | "Letter" | "80mm" | "58mm" | "auto";

/** Render an HTML document on the till and print it silently to a named queue. */
export function bridgePrintHtml(opts: {
  printer?: string;
  html: string;
  paper?: BridgePaper;
  jobName?: string;
  copies?: number;
  /**
   * Page length in mm for a thermal roll. Chrome can't render a page of `auto`
   * height, so the bridge falls back to a fixed 200mm when this is omitted.
   * Ignored for sheet paper.
   */
  heightMm?: number;
}): Promise<void> {
  return call<{ ok: true }>("/v1/print/html", {
    method: "POST",
    timeoutMs: 120_000,
    body: {
      printer: opts.printer ?? "",
      html: opts.html,
      paper: opts.paper ?? "A4",
      jobName: opts.jobName ?? "KoaPOS",
      copies: opts.copies ?? 1,
      heightMm: opts.heightMm,
    },
  }).then(() => undefined);
}

/** Fire the cash-drawer kick through a bridge-attached printer. */
export function bridgeOpenDrawer(printer: string | undefined, pulseMs: number): Promise<void> {
  return call<{ ok: true }>("/v1/drawer", {
    method: "POST",
    timeoutMs: 30_000,
    body: { printer: printer ?? "", pulseMs },
  }).then(() => undefined);
}
