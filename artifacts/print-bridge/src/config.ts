/* ─── Bridge configuration ────────────────────────────────────────────────────
 * Persisted next to the OS user profile so the token and printer defaults
 * survive restarts:
 *   Windows  %APPDATA%\KKPOS\print-bridge.json
 *   macOS    ~/Library/Application Support/KKPOS/print-bridge.json
 *   Linux    ${XDG_CONFIG_HOME:-~/.config}/kkpos/print-bridge.json
 * A till set up before the rename keeps its config under "KoaPOS"/"koapos";
 * that folder is still read (and the file carried across) so the pairing token
 * survives the upgrade. Everything here is device-local — the merchant-level
 * routing policy lives in KoaPOS (`pos_settings.hardwareConfig`), not here.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const BRIDGE_NAME = "kkpos-print-bridge";
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
    "https://pos.koastal.com.au",
    "https://koapos.com.au",
  ],
  chromePath: "",
  pdfPrinterPath: "",
  debug: false,
};

function configDirNamed(winMac: string, linux: string): string {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), winMac);
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", winMac);
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), linux);
}

export function configDir(): string {
  return configDirNamed("KKPOS", "kkpos");
}

/** Where a bridge installed before the KoaPOS → KK POS rename kept its config. */
function legacyConfigPath(): string {
  return path.join(configDirNamed("KoaPOS", "koapos"), "print-bridge.json");
}

/** Env override, under its current name or the pre-rename KOAPOS_ one. */
function env(name: string): string | undefined {
  return process.env[`KKPOS_BRIDGE_${name}`] || process.env[`KOAPOS_BRIDGE_${name}`];
}

/** Origins the bridge always trusts, whatever a stored config lists: the app's
 *  own domains, so an upgraded bridge keeps working after a domain move. */
const REQUIRED_ORIGINS = ["https://pos.koastal.com.au", "https://koapos.com.au"];

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
    // First run under the new name: carry an existing pre-rename config (and
    // with it the pairing token) across rather than unpairing every browser.
    try {
      stored = JSON.parse(readFileSync(legacyConfigPath(), "utf8")) as Partial<BridgeConfig>;
    } catch {
      /* first run, or a corrupt file we deliberately overwrite below */
    }
  }
  const cfg: BridgeConfig = {
    ...DEFAULTS,
    ...stored,
    // Never inherit a blank/short token from a hand-edited file.
    token: typeof stored.token === "string" && stored.token.length >= 16 ? stored.token : newToken(),
    allowedOrigins: [...new Set([
      ...(Array.isArray(stored.allowedOrigins) && stored.allowedOrigins.length
        ? stored.allowedOrigins
        : DEFAULTS.allowedOrigins),
      ...REQUIRED_ORIGINS,
    ])],
  };
  const envPort = Number(env("PORT"));
  if (Number.isFinite(envPort) && envPort > 0) cfg.port = envPort;
  const chrome = env("CHROME");
  if (chrome) cfg.chromePath = chrome;
  const pdfPrinter = env("PDF_PRINTER");
  if (pdfPrinter) cfg.pdfPrinterPath = pdfPrinter;
  if (env("DEBUG") === "1") cfg.debug = true;

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
