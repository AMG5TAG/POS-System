/* ─── Bridge configuration ────────────────────────────────────────────────────
 * Persisted next to the OS user profile so the token and printer defaults
 * survive restarts:
 *   Windows  %APPDATA%\KoaPOS\print-bridge.json
 *   macOS    ~/Library/Application Support/KoaPOS/print-bridge.json
 *   Linux    ${XDG_CONFIG_HOME:-~/.config}/koapos/print-bridge.json
 * Everything here is device-local — the merchant-level routing policy lives in
 * KoaPOS (`pos_settings.hardwareConfig`), not in this file.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const BRIDGE_NAME = "koapos-print-bridge";
export const BRIDGE_VERSION = "1.0.0";
export const DEFAULT_PORT = 17777;

export interface BridgeConfig {
  /** Loopback port the bridge listens on. */
  port: number;
  /** Shared secret the browser sends as `Authorization: Bearer <token>`. */
  token: string;
  /**
   * Web origins allowed to talk to this bridge. Entries may be exact
   * (`https://pos.example.com`) or a leading-wildcard host
   * (`https://*.replit.app`). `http://localhost:*` is always allowed so the
   * dev frontend works without configuration.
   */
  allowedOrigins: string[];
  /** Explicit Chromium/Edge binary for HTML→PDF. Empty = auto-detect. */
  chromePath: string;
  /** Explicit SumatraPDF / PDFtoPrinter binary for PDF→printer on Windows. */
  pdfPrinterPath: string;
  /** Verbose request logging. */
  debug: boolean;
}

const DEFAULTS: Omit<BridgeConfig, "token"> = {
  port: DEFAULT_PORT,
  allowedOrigins: [
    "https://*.replit.app",
    "https://*.replit.dev",
    "https://*.koapos.com",
    "https://koapos.com",
  ],
  chromePath: "",
  pdfPrinterPath: "",
  debug: false,
};

export function configDir(): string {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "KoaPOS");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "KoaPOS");
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "koapos");
}

export function configPath(): string {
  return path.join(configDir(), "print-bridge.json");
}

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Read the config, creating it (with a fresh token) on first run. */
export function loadConfig(): BridgeConfig {
  const file = configPath();
  let stored: Partial<BridgeConfig> = {};
  try {
    stored = JSON.parse(readFileSync(file, "utf8")) as Partial<BridgeConfig>;
  } catch {
    /* first run, or a corrupt file we deliberately overwrite below */
  }
  const cfg: BridgeConfig = {
    ...DEFAULTS,
    ...stored,
    // Never inherit a blank/short token from a hand-edited file.
    token: typeof stored.token === "string" && stored.token.length >= 16 ? stored.token : newToken(),
    allowedOrigins: Array.isArray(stored.allowedOrigins) && stored.allowedOrigins.length
      ? stored.allowedOrigins
      : DEFAULTS.allowedOrigins,
  };
  const envPort = Number(process.env.KOAPOS_BRIDGE_PORT);
  if (Number.isFinite(envPort) && envPort > 0) cfg.port = envPort;
  if (process.env.KOAPOS_BRIDGE_CHROME) cfg.chromePath = process.env.KOAPOS_BRIDGE_CHROME;
  if (process.env.KOAPOS_BRIDGE_PDF_PRINTER) cfg.pdfPrinterPath = process.env.KOAPOS_BRIDGE_PDF_PRINTER;
  if (process.env.KOAPOS_BRIDGE_DEBUG === "1") cfg.debug = true;

  if (JSON.stringify(stored) !== JSON.stringify(cfg)) saveConfig(cfg);
  return cfg;
}

export function saveConfig(cfg: BridgeConfig): void {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(configPath(), `${JSON.stringify(cfg, null, 2)}\n`, { mode: 0o600 });
}

/** Issue a brand-new token, invalidating every previously paired browser. */
export function rotateToken(cfg: BridgeConfig): BridgeConfig {
  const next = { ...cfg, token: newToken() };
  saveConfig(next);
  return next;
}

/**
 * Origin allow-list check. Supports one leading `*.` wildcard in the host so a
 * merchant can allow every deployment subdomain without listing each one.
 */
export function isOriginAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  // The local dev frontend, on any port.
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]") return true;

  return allowed.some((entry) => {
    const pattern = entry.trim();
    if (!pattern) return false;
    let p: URL;
    try {
      p = new URL(pattern.replace("*.", "wildcard-placeholder."));
    } catch {
      return false;
    }
    if (p.protocol !== url.protocol) return false;
    if (pattern.includes("*.")) {
      const suffix = p.hostname.replace("wildcard-placeholder.", "");
      return url.hostname === suffix || url.hostname.endsWith(`.${suffix}`);
    }
    return p.hostname === url.hostname && (p.port || "") === (url.port || "");
  });
}
