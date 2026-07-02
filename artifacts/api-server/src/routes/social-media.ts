import { Router } from "express";
import {
  db, socialPostsTable, socialAccountsTable, socialGiveawayEntriesTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { readVault } from "../services/tokenVault";
import { publishToAccount, fetchComments, type PublishResult } from "../services/socialPublisher";

const router = Router();
router.use(requireAuth);

const GRAPH = "https://graph.facebook.com/v19.0";

interface Target { platform: string; accountId: string }
interface Media { url: string; type: "image" | "video" }

/* ── Connected accounts ─────────────────────────────────────────────────────── */

router.get("/social/accounts", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const rows = await db.select({
    id: socialAccountsTable.id, platform: socialAccountsTable.platform,
    externalId: socialAccountsTable.externalId, name: socialAccountsTable.name,
    avatarUrl: socialAccountsTable.avatarUrl, status: socialAccountsTable.status,
  }).from(socialAccountsTable)
    .where(eq(socialAccountsTable.merchantId, merchantId))
    .orderBy(socialAccountsTable.platform, socialAccountsTable.name);
  res.json({ accounts: rows });
});

/* Refresh the publishable destinations from the connected integrations. Pulls
 * Facebook Pages (and their linked Instagram Business accounts) via the Graph
 * API, and adds the connected X and LinkedIn destinations straight from the
 * vault (the OAuth connect flow already stored their account id + token). */
router.post("/social/accounts/sync", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const [meta, tw, li] = await Promise.all([
    readVault(merchantId, "meta_business").catch(() => null),
    readVault(merchantId, "twitter_x").catch(() => null),
    readVault(merchantId, "linkedin_business").catch(() => null),
  ]);
  if (!meta?.accessToken && !tw?.accessToken && !li?.accessToken) {
    res.status(400).json({ error: "Connect Meta, X, or LinkedIn in Integrations first.", synced: 0 });
    return;
  }

  const discovered: Array<{ platform: string; externalId: string; name: string; accessToken: string | null; avatarUrl: string | null }> = [];

  // Meta: discover Pages + linked Instagram Business accounts via Graph. A Meta
  // API hiccup is non-fatal — X/LinkedIn below can still sync.
  if (meta?.accessToken) {
    try {
      const r = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token,picture,instagram_business_account{id,username,profile_picture_url}&access_token=${encodeURIComponent(meta.accessToken)}`);
      const data = (await r.json().catch(() => ({}))) as {
        data?: Array<{ id: string; name: string; access_token?: string; picture?: { data?: { url?: string } };
          instagram_business_account?: { id: string; username?: string; profile_picture_url?: string } }>;
        error?: { message?: string };
      };
      for (const page of data.data ?? []) {
        discovered.push({ platform: "facebook", externalId: page.id, name: page.name, accessToken: page.access_token ?? null, avatarUrl: page.picture?.data?.url ?? null });
        if (page.instagram_business_account) {
          const ig = page.instagram_business_account;
          discovered.push({ platform: "instagram", externalId: ig.id, name: ig.username ? `@${ig.username}` : page.name, accessToken: page.access_token ?? null, avatarUrl: ig.profile_picture_url ?? null });
        }
      }
    } catch {
      req.log?.warn("social sync: could not reach the Meta Graph API");
    }
  }

  // X + LinkedIn: single destination each, taken directly from the vault (the
  // connect flow stored accountId = X user id / LinkedIn organization id).
  if (tw?.accessToken && tw.accountId) {
    discovered.push({ platform: "twitter", externalId: tw.accountId, name: tw.accountHandle || "X account", accessToken: tw.accessToken, avatarUrl: null });
  }
  if (li?.accessToken && li.accountId) {
    discovered.push({ platform: "linkedin", externalId: li.accountId, name: li.accountHandle || "LinkedIn Page", accessToken: li.accessToken, avatarUrl: null });
  }

  // Upsert discovered accounts; mark missing ones revoked.
  const existing = await db.select().from(socialAccountsTable).where(eq(socialAccountsTable.merchantId, merchantId));
  const seen = new Set<string>();
  for (const d of discovered) {
    seen.add(`${d.platform}:${d.externalId}`);
    const match = existing.find((e) => e.platform === d.platform && e.externalId === d.externalId);
    if (match) {
      await db.update(socialAccountsTable).set({ name: d.name, accessToken: d.accessToken, avatarUrl: d.avatarUrl, status: "active" }).where(eq(socialAccountsTable.id, match.id));
    } else {
      await db.insert(socialAccountsTable).values({ merchantId, ...d, status: "active" });
    }
  }
  for (const e of existing) {
    if (!seen.has(`${e.platform}:${e.externalId}`)) {
      await db.update(socialAccountsTable).set({ status: "revoked" }).where(eq(socialAccountsTable.id, e.id));
    }
  }

  res.json({ synced: discovered.length });
});

/* ── Posts CRUD ─────────────────────────────────────────────────────────────── */

router.get("/social/posts", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const status = req.query.status ? String(req.query.status) : undefined;
  const conditions = [eq(socialPostsTable.merchantId, merchantId)];
  if (status && status !== "all") conditions.push(eq(socialPostsTable.status, status));
  const rows = await db.select().from(socialPostsTable)
    .where(and(...conditions))
    .orderBy(desc(socialPostsTable.createdAt))
    .limit(200);
  res.json({ posts: rows });
});

router.post("/social/posts", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const b = req.body as {
    content?: string; media?: Media[]; linkUrl?: string | null; checkInName?: string | null;
    targets?: Target[]; scheduledAt?: string | null; isGiveaway?: boolean; giveawayPrize?: string | null;
    publishNow?: boolean;
  };
  const targets = Array.isArray(b.targets) ? b.targets : [];
  if (!b.content?.trim() && !(b.media?.length)) { res.status(400).json({ error: "Add some text or media before posting." }); return; }

  const status = b.publishNow ? "publishing" : b.scheduledAt ? "scheduled" : "draft";
  const [post] = await db.insert(socialPostsTable).values({
    merchantId,
    content: b.content ?? "",
    media: b.media ?? [],
    linkUrl: b.linkUrl ?? null,
    checkInName: b.checkInName ?? null,
    targets,
    status,
    scheduledAt: b.scheduledAt ? new Date(b.scheduledAt) : null,
    isGiveaway: b.isGiveaway ? "true" : "false",
    giveawayPrize: b.giveawayPrize ?? null,
  }).returning();

  if (b.publishNow) {
    const published = await runPublish(merchantId, post!.id);
    res.json({ post: published });
    return;
  }
  res.json({ post });
});

router.patch("/social/posts/:id", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id, 10);
  const [existing] = await db.select().from(socialPostsTable).where(and(eq(socialPostsTable.id, id), eq(socialPostsTable.merchantId, merchantId)));
  if (!existing) { res.status(404).json({ error: "Post not found" }); return; }
  if (existing.status === "published" || existing.status === "partial") { res.status(400).json({ error: "Published posts can't be edited." }); return; }

  const b = req.body as Partial<{ content: string; media: Media[]; linkUrl: string | null; checkInName: string | null; targets: Target[]; scheduledAt: string | null; isGiveaway: boolean; giveawayPrize: string | null }>;
  const patch: Record<string, unknown> = {};
  if (b.content !== undefined) patch.content = b.content;
  if (b.media !== undefined) patch.media = b.media;
  if (b.linkUrl !== undefined) patch.linkUrl = b.linkUrl;
  if (b.checkInName !== undefined) patch.checkInName = b.checkInName;
  if (b.targets !== undefined) patch.targets = b.targets;
  if (b.isGiveaway !== undefined) patch.isGiveaway = b.isGiveaway ? "true" : "false";
  if (b.giveawayPrize !== undefined) patch.giveawayPrize = b.giveawayPrize;
  if (b.scheduledAt !== undefined) {
    patch.scheduledAt = b.scheduledAt ? new Date(b.scheduledAt) : null;
    patch.status = b.scheduledAt ? "scheduled" : "draft";
  }
  const [post] = await db.update(socialPostsTable).set(patch).where(eq(socialPostsTable.id, id)).returning();
  res.json({ post });
});

router.delete("/social/posts/:id", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id, 10);
  await db.delete(socialGiveawayEntriesTable).where(eq(socialGiveawayEntriesTable.postId, id));
  await db.delete(socialPostsTable).where(and(eq(socialPostsTable.id, id), eq(socialPostsTable.merchantId, merchantId)));
  res.json({ ok: true });
});

router.post("/social/posts/:id/publish", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id, 10);
  const post = await runPublish(merchantId, id);
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  res.json({ post });
});

/* ── Giveaways ──────────────────────────────────────────────────────────────── */

router.get("/social/posts/:id/giveaway", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id, 10);
  const [post] = await db.select().from(socialPostsTable).where(and(eq(socialPostsTable.id, id), eq(socialPostsTable.merchantId, merchantId)));
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  const entries = await db.select().from(socialGiveawayEntriesTable).where(eq(socialGiveawayEntriesTable.postId, id)).orderBy(socialGiveawayEntriesTable.enteredAt);
  res.json({ post, entries });
});

/* Pull commenters from the published post(s) and store unique entrants. */
router.post("/social/posts/:id/giveaway/sync", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id, 10);
  const [post] = await db.select().from(socialPostsTable).where(and(eq(socialPostsTable.id, id), eq(socialPostsTable.merchantId, merchantId)));
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }

  const results = (Array.isArray(post.results) ? post.results : []) as PublishResult[];
  const accounts = await db.select().from(socialAccountsTable).where(eq(socialAccountsTable.merchantId, merchantId));
  const existing = await db.select().from(socialGiveawayEntriesTable).where(eq(socialGiveawayEntriesTable.postId, id));
  const known = new Set(existing.map((e) => `${e.platform}:${e.commentId}`));

  let added = 0;
  for (const r of results) {
    if (r.status !== "published" || !r.remoteId) continue;
    const account = accounts.find((a) => a.platform === r.platform && a.externalId === r.accountId);
    if (!account) continue;
    const comments = await fetchComments(account, r.remoteId);
    for (const c of comments) {
      if (known.has(`${r.platform}:${c.commentId}`)) continue;
      known.add(`${r.platform}:${c.commentId}`);
      await db.insert(socialGiveawayEntriesTable).values({
        merchantId, postId: id, platform: r.platform,
        externalUserId: c.externalUserId ?? null, name: c.name, commentId: c.commentId, commentText: c.text,
      });
      added++;
    }
  }
  const entries = await db.select().from(socialGiveawayEntriesTable).where(eq(socialGiveawayEntriesTable.postId, id));
  res.json({ added, total: entries.length, entries });
});

/* Draw a random winner from the collected entrants. */
router.post("/social/posts/:id/giveaway/draw", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const id = parseInt(req.params.id, 10);
  const [post] = await db.select().from(socialPostsTable).where(and(eq(socialPostsTable.id, id), eq(socialPostsTable.merchantId, merchantId)));
  if (!post) { res.status(404).json({ error: "Post not found" }); return; }
  const entries = await db.select().from(socialGiveawayEntriesTable).where(eq(socialGiveawayEntriesTable.postId, id));
  if (entries.length === 0) { res.status(400).json({ error: "No entrants yet — sync comments first." }); return; }

  const winner = entries[Math.floor(Math.random() * entries.length)]!;
  await db.update(socialGiveawayEntriesTable).set({ isWinner: "false" }).where(eq(socialGiveawayEntriesTable.postId, id));
  await db.update(socialGiveawayEntriesTable).set({ isWinner: "true" }).where(eq(socialGiveawayEntriesTable.id, winner.id));
  await db.update(socialPostsTable).set({ winnerEntryId: winner.id }).where(eq(socialPostsTable.id, id));
  res.json({ winner });
});

/* ── Publish helper (shared with the scheduler) ───────────────────────────────
 * Fans the post out to each target's connected account, records per-target
 * results, and rolls up an overall status. Exported for the scheduler. */
export async function runPublish(merchantId: number, postId: number) {
  const [post] = await db.select().from(socialPostsTable).where(and(eq(socialPostsTable.id, postId), eq(socialPostsTable.merchantId, merchantId)));
  if (!post) return null;

  const targets = (Array.isArray(post.targets) ? post.targets : []) as Target[];
  // Resolve target accounts by platform + externalId.
  const allAccounts = await db.select().from(socialAccountsTable).where(eq(socialAccountsTable.merchantId, merchantId));

  await db.update(socialPostsTable).set({ status: "publishing" }).where(eq(socialPostsTable.id, postId));

  const results: PublishResult[] = [];
  for (const t of targets) {
    const account = allAccounts.find((a) => a.platform === t.platform && a.externalId === t.accountId);
    if (!account) {
      results.push({ platform: t.platform, accountId: t.accountId, status: "failed", error: "Account not connected." });
      continue;
    }
    results.push(await publishToAccount(account, post));
  }

  const anyOk = results.some((r) => r.status === "published");
  const allOk = results.length > 0 && results.every((r) => r.status === "published");
  const status = results.length === 0 ? "failed" : allOk ? "published" : anyOk ? "partial" : "failed";

  const [updated] = await db.update(socialPostsTable).set({
    results, status, publishedAt: anyOk ? new Date() : null,
  }).where(eq(socialPostsTable.id, postId)).returning();
  return updated;
}

export default router;
