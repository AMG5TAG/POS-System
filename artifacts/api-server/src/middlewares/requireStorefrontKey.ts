import { createHash } from "crypto";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { db, storefrontApiKeysTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { parseScopes } from "../lib/storefront-api";

/**
 * Bearer-key authentication for the Storefront Data API.
 *
 * Unlike `requireAuth`, which reads the merchant from a session cookie, this
 * identifies the merchant from a key issued in Management › Online Store › Data
 * API. The caller is somebody else's server — a website the merchant built, or
 * an AI agent that built it — so there is no session, no cookie, and nothing
 * about the request to trust beyond the key itself.
 *
 * Only the SHA-256 hash is compared; the plaintext exists in the merchant's
 * hands and nowhere in KoaPOS.
 */

export interface StorefrontAuth {
  merchantId: number;
  keyId: number;
  scopes: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      storefront?: StorefrontAuth;
    }
  }
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Pull the key out of `Authorization: Bearer …`, or `X-API-Key` for clients
 * that find the header easier. A key in the query string is deliberately NOT
 * accepted: URLs end up in access logs, browser history and referrer headers.
 */
function readKey(req: Request): string | null {
  const auth = req.get("authorization");
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m) return m[1].trim();
  }
  const header = req.get("x-api-key");
  return header ? header.trim() : null;
}

function deny(res: Response, status: number, error: string, message: string): void {
  res.status(status).json({ error, message });
}

/**
 * `lastUsedAt` is useful to a merchant deciding whether a key is still in use,
 * but writing it on every request would double the cost of a cheap read. One
 * write per key per minute is enough to answer the question.
 */
const lastTouch = new Map<number, number>();
const TOUCH_INTERVAL_MS = 60_000;

async function touchKey(keyId: number): Promise<void> {
  const now = Date.now();
  const previous = lastTouch.get(keyId) ?? 0;
  if (now - previous < TOUCH_INTERVAL_MS) return;
  lastTouch.set(keyId, now);
  await db
    .update(storefrontApiKeysTable)
    .set({ lastUsedAt: new Date(), requestCount: sql`${storefrontApiKeysTable.requestCount} + 1` })
    .where(eq(storefrontApiKeysTable.id, keyId))
    .catch(() => { /* usage tracking must never fail a read */ });
}

export const requireStorefrontKey: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const key = readKey(req);
  if (!key) {
    res.setHeader("WWW-Authenticate", 'Bearer realm="KoaPOS Storefront API"');
    deny(res, 401, "missing_key", "Send your API key as: Authorization: Bearer <key>");
    return;
  }

  const [row] = await db
    .select()
    .from(storefrontApiKeysTable)
    .where(eq(storefrontApiKeysTable.keyHash, hashApiKey(key)))
    .limit(1);

  // One message for every failure: a caller must not be able to tell a revoked
  // key from a key that never existed.
  if (!row || row.revokedAt || (row.expiresAt && row.expiresAt.getTime() <= Date.now())) {
    deny(res, 401, "invalid_key", "This API key is not valid, has been revoked, or has expired.");
    return;
  }

  req.storefront = { merchantId: row.merchantId, keyId: row.id, scopes: parseScopes(row.scopes) };
  void touchKey(row.id);
  next();
};

/** Guards one endpoint behind a scope the key must carry. */
export function requireScope(scope: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.storefront?.scopes.includes(scope)) {
      deny(res, 403, "insufficient_scope", `This key does not have the "${scope}" scope.`);
      return;
    }
    next();
  };
}
