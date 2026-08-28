/* ─── Bridge HTTP server ──────────────────────────────────────────────────────
 * Binds to loopback only and speaks a tiny JSON API to the KoaPOS tab running in
 * the same machine's browser. Browsers treat http://127.0.0.1 as a trustworthy
 * origin, so an HTTPS page can call it without a mixed-content block.
 *
 * Security model:
 *   • loopback bind — nothing on the LAN can reach it
 *   • Origin allow-list — only KoaPOS deployments may talk to it
 *   • bearer token — pairs the browser to this specific bridge
 *   • pairing window — the token is only handed out while a local operator has
 *     opened the window (automatically at startup, or by pressing "p")
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { BRIDGE_NAME, BRIDGE_VERSION, configPath, isOriginAllowed, type BridgeConfig } from "./config.js";
import { isRunningAsSystem, listPrinters, resolvePrinterName } from "./printers.js";
import { printRaw } from "./raw.js";
import { findChrome, findPdfPrinter, printHtml, type PaperSize } from "./render.js";

const MAX_BODY_BYTES = 12 * 1024 * 1024;
const PAPER_SIZES: PaperSize[] = ["A4", "A4-landscape", "A5", "Letter", "80mm", "58mm", "auto"];

export interface PairingWindow {
  openUntil: number;
  open(ms: number): void;
  isOpen(): boolean;
}

export function createPairingWindow(): PairingWindow {
  return {
    openUntil: 0,
    open(ms: number) { this.openUntil = Date.now() + ms; },
    isOpen() { return Date.now() < this.openUntil; },
  };
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function tokensMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, "Print job is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readBody(req);
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new HttpError(400, "Body must be a JSON object.");
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, "Body is not valid JSON.");
  }
}

function str(body: Record<string, unknown>, key: string): string | undefined {
  const v = body[key];
  return typeof v === "string" ? v : undefined;
}

function copiesOf(body: Record<string, unknown>): number {
  const n = Number(body.copies ?? 1);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(20, Math.floor(n)));
}

export function createBridgeServer(getConfig: () => BridgeConfig, pairing: PairingWindow) {
  const log = (...args: unknown[]) => {
    if (getConfig().debug) console.log("[bridge]", ...args);
  };

  const send = (res: ServerResponse, status: number, payload: unknown) => {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(body),
      "cache-control": "no-store",
    });
    res.end(body);
  };

  const applyCors = (req: IncomingMessage, res: ServerResponse, allowed: boolean): void => {
    const origin = req.headers.origin;
    if (!origin) return;
    // /v1/health echoes the origin even when it isn't allow-listed so the app can
    // tell "no bridge running" apart from "bridge running, origin not approved".
    if (!allowed) return;
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "origin");
    res.setHeader("access-control-allow-headers", "authorization, content-type");
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    res.setHeader("access-control-max-age", "600");
    // Chrome's Private Network Access preflight for public→loopback requests.
    res.setHeader("access-control-allow-private-network", "true");
    res.setHeader("access-control-allow-local-network", "true");
  };

  const requireAuth = (req: IncomingMessage, cfg: BridgeConfig): void => {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token || !tokensMatch(token, cfg.token)) {
      throw new HttpError(401, "This browser is not paired with the print bridge.");
    }
  };

  return createServer((req, res) => {
    void (async () => {
      const cfg = getConfig();
      const origin = req.headers.origin;
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const route = url.pathname.replace(/\/+$/, "") || "/";
      const originOk = !origin || isOriginAllowed(origin, cfg.allowedOrigins);

      // Health is reachable from any origin (it leaks nothing); everything else
      // requires the origin allow-list plus the bearer token.
      applyCors(req, res, originOk || route === "/v1/health");
      if (origin && route === "/v1/health" && !originOk) {
        res.setHeader("access-control-allow-origin", origin);
        res.setHeader("vary", "origin");
        res.setHeader("access-control-allow-headers", "authorization, content-type");
        res.setHeader("access-control-allow-private-network", "true");
      }

      if (req.method === "OPTIONS") {
        res.writeHead(204).end();
        return;
      }

      try {
        if (route !== "/v1/health" && !originOk) {
          throw new HttpError(
            403,
            `Origin ${origin} is not allowed. Add it to "allowedOrigins" in ${configPath()} and restart the bridge.`,
          );
        }

        log(req.method, route, origin ?? "-");

        if (route === "/v1/health" && req.method === "GET") {
          send(res, 200, {
            ok: true,
            name: BRIDGE_NAME,
            version: BRIDGE_VERSION,
            platform: process.platform,
            originAllowed: originOk,
            pairingOpen: pairing.isOpen(),
            // Lets the app warn that printers shared from another PC won't be
            // visible before someone spends an afternoon wondering why.
            runningAsService: await isRunningAsSystem(),
          });
          return;
        }

        if (route === "/v1/pair" && req.method === "POST") {
          if (!pairing.isOpen()) {
            throw new HttpError(
              403,
              "Pairing is closed. On the till, focus the Print Bridge window and press \"p\" (or restart the bridge), then try again.",
            );
          }
          send(res, 200, { token: cfg.token });
          return;
        }

        if (route === "/v1/printers" && req.method === "GET") {
          requireAuth(req, cfg);
          send(res, 200, { printers: await listPrinters() });
          return;
        }

        if (route === "/v1/diagnostics" && req.method === "GET") {
          requireAuth(req, cfg);
          send(res, 200, {
            configPath: configPath(),
            chromePath: findChrome(cfg) || null,
            pdfPrinterPath: findPdfPrinter(cfg) || null,
            allowedOrigins: cfg.allowedOrigins,
            runningAsService: await isRunningAsSystem(),
          });
          return;
        }

        if (route === "/v1/print/raw" && req.method === "POST") {
          requireAuth(req, cfg);
          const body = await readJson(req);
          const dataB64 = str(body, "data");
          if (!dataB64) throw new HttpError(400, "`data` (base64 ESC/POS bytes) is required.");
          const bytes = Buffer.from(dataB64, "base64");
          if (!bytes.length) throw new HttpError(400, "`data` decoded to zero bytes.");
          const printer = await resolvePrinterName(str(body, "printer"));
          const jobName = str(body, "jobName") || "KoaPOS";
          const copies = copiesOf(body);
          for (let i = 0; i < copies; i++) await printRaw(printer, bytes, jobName);
          send(res, 200, { ok: true, printer, copies, bytes: bytes.length });
          return;
        }

        if (route === "/v1/print/html" && req.method === "POST") {
          requireAuth(req, cfg);
          const body = await readJson(req);
          const html = str(body, "html");
          if (!html) throw new HttpError(400, "`html` is required.");
          const requestedPaper = (str(body, "paper") ?? "A4") as PaperSize;
          if (!PAPER_SIZES.includes(requestedPaper)) {
            throw new HttpError(400, `Unknown paper "${requestedPaper}". Expected one of ${PAPER_SIZES.join(", ")}.`);
          }
          const printer = await resolvePrinterName(str(body, "printer"));
          const copies = copiesOf(body);
          const heightMm = Number(body.heightMm);
          await printHtml(cfg, {
            html,
            printerName: printer,
            paper: requestedPaper,
            copies,
            jobName: str(body, "jobName") || "KoaPOS",
            heightMm: Number.isFinite(heightMm) ? heightMm : undefined,
          });
          send(res, 200, { ok: true, printer, copies, paper: requestedPaper });
          return;
        }

        if (route === "/v1/drawer" && req.method === "POST") {
          requireAuth(req, cfg);
          const body = await readJson(req);
          const pulseMs = Math.max(50, Math.min(500, Number(body.pulseMs ?? 200) || 200));
          const t = Math.max(1, Math.min(255, Math.round(pulseMs / 2)));
          const printer = await resolvePrinterName(str(body, "printer"));
          // ESC p 0 t t — the standard cash-drawer kick on pin 2.
          await printRaw(printer, Buffer.from([0x1b, 0x70, 0x00, t, t]), "KoaPOS drawer");
          send(res, 200, { ok: true, printer });
          return;
        }

        throw new HttpError(404, `No route for ${req.method} ${route}`);
      } catch (err) {
        const status = err instanceof HttpError ? err.status : 500;
        const message = err instanceof Error ? err.message : String(err);
        if (status >= 500) console.error("[bridge] error:", message);
        send(res, status, { ok: false, error: message });
      }
    })();
  });
}
