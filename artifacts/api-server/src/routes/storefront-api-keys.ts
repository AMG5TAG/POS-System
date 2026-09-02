import { Router, type IRouter } from "express";
import { randomBytes } from "crypto";
import { db, storefrontApiKeysTable, merchantsTable } from "@workspace/db";
import { and, eq, desc, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { hashApiKey } from "../middlewares/requireStorefrontKey";
import {
  API_SCOPES, DEFAULT_SCOPES, isValidScope, parseScopes,
  buildConnectionManifest, manifestFilename,
} from "../lib/storefront-api";
import { publicOrigin } from "../lib/publicUrl";

/**
 * Management side of the Storefront Data API: the merchant issues, inspects and
 * revokes the keys that let their website read their data, and downloads the
 * connection brief to hand to whoever (or whatever) is building it.
 *
 * The plaintext key exists for exactly one response. It is generated here,
 * returned once with the brief that embeds it, and stored only as a SHA-256
 * hash — so "show me that key again" is a question this API cannot answer, by
 * design. Every later brief download carries a placeholder instead.
 */

const router: IRouter = Router();

/** `koa_live_` + 32 random bytes, base64url. Prefixed so a leaked string is
 *  recognisable in a log or a repo scan as a KoaPOS credential. */
function generateKey(): { key: string; prefix: string } {
  const secret = randomBytes(32).toString("base64url");
  const key = `koa_live_${secret}`;
  return { key, prefix: key.slice(0, 17) };
}

async function merchantFor(merchantId: number) {
  const [m] = await db
    .select({ businessName: merchantsTable.businessName })
    .from(merchantsTable).where(eq(merchantsTable.id, merchantId)).limit(1);
  return m ?? { businessName: "Your business" };
}

/** The shape the app shows: everything except anything resembling the secret. */
function publicKey(row: typeof storefrontApiKeysTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    scopes: parseScopes(row.scopes),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    requestCount: row.requestCount,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** GET /storefront-api-keys — the merchant's keys, and the scope catalogue. */
router.get("/storefront-api-keys", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const rows = await db.select().from(storefrontApiKeysTable)
    .where(eq(storefrontApiKeysTable.merchantId, merchantId))
    .orderBy(desc(storefrontApiKeysTable.id));
  res.json({
    items: rows.map(publicKey),
    scopes: API_SCOPES,
    baseUrl: `${publicOrigin(req)}/api/storefront/v1`,
  });
});

/** POST /storefront-api-keys — issue a key. The only time the secret exists. */
router.post("/storefront-api-keys", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const body = (req.body ?? {}) as { name?: string; scopes?: string[]; expiresInDays?: number };

  const name = String(body.name ?? "").trim().slice(0, 80);
  const scopes = Array.isArray(body.scopes) ? body.scopes.filter(isValidScope) : [];
  const granted = scopes.length ? Array.from(new Set(scopes)) : DEFAULT_SCOPES;

  const days = Number(body.expiresInDays);
  const expiresAt = Number.isFinite(days) && days > 0
    ? new Date(Date.now() + Math.min(days, 3650) * 86_400_000)
    : null;

  // A merchant with an unbounded key list is a merchant who has lost track of
  // who can read their data; cap it at a number no honest setup exceeds.
  const live = await db.select({ id: storefrontApiKeysTable.id }).from(storefrontApiKeysTable)
    .where(and(eq(storefrontApiKeysTable.merchantId, merchantId), isNull(storefrontApiKeysTable.revokedAt)));
  if (live.length >= 20) {
    res.status(400).json({ error: "Too many active keys — revoke one before creating another." });
    return;
  }

  const { key, prefix } = generateKey();
  const [row] = await db.insert(storefrontApiKeysTable).values({
    merchantId, name, keyPrefix: prefix, keyHash: hashApiKey(key),
    scopes: granted.join(","), expiresAt,
  }).returning();

  const merchant = await merchantFor(merchantId);
  res.status(201).json({
    ...publicKey(row),
    // Shown once. There is no endpoint that can return this again.
    key,
    manifest: {
      filename: manifestFilename(merchant.businessName),
      content: buildConnectionManifest({
        origin: publicOrigin(req),
        businessName: merchant.businessName,
        keyName: name, keyPrefix: prefix, scopes: granted, expiresAt, secret: key,
      }),
    },
  });
});

/** GET /storefront-api-keys/:id/manifest — the brief, with a key placeholder. */
router.get("/storefront-api-keys/:id/manifest", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(404).json({ error: "Key not found" }); return; }

  const [row] = await db.select().from(storefrontApiKeysTable)
    .where(and(eq(storefrontApiKeysTable.id, id), eq(storefrontApiKeysTable.merchantId, merchantId))).limit(1);
  if (!row) { res.status(404).json({ error: "Key not found" }); return; }

  const merchant = await merchantFor(merchantId);
  res.json({
    filename: manifestFilename(merchant.businessName),
    content: buildConnectionManifest({
      origin: publicOrigin(req),
      businessName: merchant.businessName,
      keyName: row.name, keyPrefix: row.keyPrefix,
      scopes: parseScopes(row.scopes), expiresAt: row.expiresAt, secret: null,
    }),
  });
});

/** DELETE /storefront-api-keys/:id — revoke. Immediate and irreversible. */
router.delete("/storefront-api-keys/:id", requireAuth, async (req, res): Promise<void> => {
  const merchantId = req.session.merchantId!;
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.sendStatus(204); return; }

  await db.update(storefrontApiKeysTable)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(storefrontApiKeysTable.id, id),
      eq(storefrontApiKeysTable.merchantId, merchantId),
      isNull(storefrontApiKeysTable.revokedAt),
    ));
  res.sendStatus(204);
});

export default router;
