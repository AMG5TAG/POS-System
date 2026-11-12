import type { Request, Response, NextFunction, RequestHandler } from "express";
import { createHash } from "node:crypto";
import { db, apiTokensTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";

export const API_TOKEN_PREFIX = "kpos_";

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * What an API token may call. Tokens are for connected apps (Koastal Tech Support) that sync customers and
 * service jobs - they can't reach account, staff, billing, payments or token management.
 */
const ALLOWED: Array<{ prefix: string; methods: string[] }> = [
  { prefix: "/api/auth/me",           methods: ["GET"] },
  { prefix: "/api/service-jobs",      methods: ["GET", "POST", "PATCH"] },
  { prefix: "/api/customers",         methods: ["GET", "POST", "PATCH"] },
  { prefix: "/api/storage/uploads/",  methods: ["POST"] },
];

function allowed(req: Request): boolean {
  const path = req.path;
  return ALLOWED.some((a) =>
    (a.prefix.endsWith("/") ? path.startsWith(a.prefix) : path === a.prefix || path.startsWith(a.prefix + "/"))
    && a.methods.includes(req.method));
}

const LAST_USED_THROTTLE_MS = 5 * 60_000;
const lastUsedWritten = new Map<number, number>();

/**
 * Wraps the session middleware: requests carrying `Authorization: Bearer kpos_...` are authenticated by API token
 * and get a request-scoped session object (never stored, no cookie) with the token's merchant, so the existing
 * routes (which read req.session.merchantId) work unchanged. All other requests use the normal cookie session.
 */
export function sessionOrApiToken(sessionMiddleware: RequestHandler): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer " + API_TOKEN_PREFIX)) {
      sessionMiddleware(req, res, next);
      return;
    }
    try {
      const token = auth.slice("Bearer ".length).trim();
      const [row] = await db
        .select({ id: apiTokensTable.id, merchantId: apiTokensTable.merchantId })
        .from(apiTokensTable)
        .where(and(eq(apiTokensTable.tokenHash, hashApiToken(token)), isNull(apiTokensTable.revokedAt)))
        .limit(1);
      if (!row) {
        res.status(401).json({ error: "Invalid or revoked API token" });
        return;
      }
      if (!allowed(req)) {
        res.status(403).json({ error: "API tokens can't use this endpoint" });
        return;
      }
      const noop = (cb?: (err?: unknown) => void) => { cb?.(); };
      (req as unknown as { session: unknown }).session = {
        id: `api-token-${row.id}`,
        merchantId: row.merchantId,
        staffRole: "manager",
        apiTokenId: row.id,
        cookie: {},
        save: noop, destroy: noop, regenerate: noop, reload: noop,
        touch: () => {}, resetMaxAge: () => {},
      };
      const now = Date.now();
      if ((lastUsedWritten.get(row.id) ?? 0) < now - LAST_USED_THROTTLE_MS) {
        lastUsedWritten.set(row.id, now);
        void db.update(apiTokensTable).set({ lastUsedAt: new Date() }).where(eq(apiTokensTable.id, row.id)).catch(() => {});
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
