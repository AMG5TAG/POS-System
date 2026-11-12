import { Router, type IRouter } from "express";
import { randomBytes } from "node:crypto";
import { db, apiTokensTable } from "@workspace/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { requireManagerOrOwner } from "../middlewares/requireManagerOrOwner";
import { API_TOKEN_PREFIX, hashApiToken } from "../middlewares/apiTokenAuth";

/** Manage API tokens for connected apps (Settings > Account > API tokens). Session-only: tokens can't manage tokens. */
const router: IRouter = Router();
const MAX_ACTIVE_TOKENS = 20;

function format(t: typeof apiTokensTable.$inferSelect) {
  return {
    id: t.id, name: t.name, tokenPrefix: t.tokenPrefix,
    createdAt: t.createdAt.toISOString(),
    lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
  };
}

router.get("/api-tokens", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const rows = await db.select().from(apiTokensTable)
    .where(and(eq(apiTokensTable.merchantId, merchantId), isNull(apiTokensTable.revokedAt)))
    .orderBy(desc(apiTokensTable.createdAt));
  res.json(rows.map(format));
});

router.post("/api-tokens", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 80) : "";
  if (!name) { res.status(400).json({ error: "Give the token a name (e.g. the technician or the app)" }); return; }
  const active = await db.select({ id: apiTokensTable.id }).from(apiTokensTable)
    .where(and(eq(apiTokensTable.merchantId, merchantId), isNull(apiTokensTable.revokedAt)));
  if (active.length >= MAX_ACTIVE_TOKENS) { res.status(400).json({ error: `You can have up to ${MAX_ACTIVE_TOKENS} API tokens - revoke an old one first` }); return; }

  const token = API_TOKEN_PREFIX + randomBytes(30).toString("base64url");
  const [row] = await db.insert(apiTokensTable).values({
    merchantId, name, tokenHash: hashApiToken(token), tokenPrefix: token.slice(0, 12),
  }).returning();
  // The full token is returned only this once.
  res.status(201).json({ ...format(row!), token });
});

router.delete("/api-tokens/:id", requireAuth, requireManagerOrOwner, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.update(apiTokensTable).set({ revokedAt: new Date() })
    .where(and(eq(apiTokensTable.id, id), eq(apiTokensTable.merchantId, merchantId), isNull(apiTokensTable.revokedAt)))
    .returning();
  if (!row) { res.status(404).json({ error: "Token not found" }); return; }
  res.status(204).end();
});

export default router;
