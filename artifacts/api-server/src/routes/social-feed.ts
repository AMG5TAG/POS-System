import { Router } from "express";
import { db, oauthTokenVaultTable, socialFeedSettingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { decryptToken } from "../services/tokenVault";

const router = Router();
router.use(requireAuth);

/* ── Defaults ───────────────────────────────────────────────────────────── */
const DEFAULT_SETTINGS = {
  showFacebook: true,
  showInstagram: true,
  showTwitter: true,
  showLinkedin: true,
  facebookEnabled: false,
  instagramEnabled: false,
  twitterEnabled: false,
  tiktokEnabled: false,
  linkedinEnabled: false,
  refreshIntervalMinutes: 60,
};

/* ── Get settings ───────────────────────────────────────────────────────── */
router.get("/social-feed/settings", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const [row] = await db.select().from(socialFeedSettingsTable)
    .where(eq(socialFeedSettingsTable.merchantId, merchantId));
  return res.json(row ?? { ...DEFAULT_SETTINGS, id: null, merchantId });
});

/* ── Update settings ────────────────────────────────────────────────────── */
router.put("/social-feed/settings", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const { showFacebook, showInstagram, showTwitter, showLinkedin, refreshIntervalMinutes, facebookEnabled, instagramEnabled, twitterEnabled, tiktokEnabled, linkedinEnabled } = req.body as {
    showFacebook?: boolean; showInstagram?: boolean; showTwitter?: boolean;
    showLinkedin?: boolean; refreshIntervalMinutes?: number;
    facebookEnabled?: boolean; instagramEnabled?: boolean; twitterEnabled?: boolean;
    tiktokEnabled?: boolean; linkedinEnabled?: boolean;
  };

  const existing = await db.select().from(socialFeedSettingsTable)
    .where(eq(socialFeedSettingsTable.merchantId, merchantId));

  if (existing.length === 0) {
    const [row] = await db.insert(socialFeedSettingsTable).values({
      merchantId,
      showFacebook: showFacebook ?? true,
      showInstagram: showInstagram ?? true,
      showTwitter: showTwitter ?? true,
      showLinkedin: showLinkedin ?? true,
      facebookEnabled: facebookEnabled ?? false,
      instagramEnabled: instagramEnabled ?? false,
      twitterEnabled: twitterEnabled ?? false,
      tiktokEnabled: tiktokEnabled ?? false,
      linkedinEnabled: linkedinEnabled ?? false,
      refreshIntervalMinutes: refreshIntervalMinutes ?? 60,
    }).returning();
    return res.json(row);
  }

  const patch: Record<string, unknown> = {};
  if (showFacebook !== undefined) patch.showFacebook = showFacebook;
  if (showInstagram !== undefined) patch.showInstagram = showInstagram;
  if (showTwitter !== undefined) patch.showTwitter = showTwitter;
  if (showLinkedin !== undefined) patch.showLinkedin = showLinkedin;
  if (facebookEnabled !== undefined) patch.facebookEnabled = facebookEnabled;
  if (instagramEnabled !== undefined) patch.instagramEnabled = instagramEnabled;
  if (twitterEnabled !== undefined) patch.twitterEnabled = twitterEnabled;
  if (tiktokEnabled !== undefined) patch.tiktokEnabled = tiktokEnabled;
  if (linkedinEnabled !== undefined) patch.linkedinEnabled = linkedinEnabled;
  if (refreshIntervalMinutes !== undefined) patch.refreshIntervalMinutes = refreshIntervalMinutes;

  const [row] = await db.update(socialFeedSettingsTable).set(patch)
    .where(eq(socialFeedSettingsTable.merchantId, merchantId))
    .returning();
  return res.json(row);
});

/* ── Helpers: fetch posts per platform ──────────────────────────────────── */

async function getVaultToken(merchantId: number, provider: string): Promise<string | null> {
  const [row] = await db.select({
    encryptedAccessToken: oauthTokenVaultTable.encryptedAccessToken,
    accountHandle: oauthTokenVaultTable.accountHandle,
  }).from(oauthTokenVaultTable)
    .where(and(
      eq(oauthTokenVaultTable.merchantId, merchantId),
      eq(oauthTokenVaultTable.provider, provider),
    ));
  if (!row?.encryptedAccessToken) return null;
  try { return decryptToken(row.encryptedAccessToken); } catch { return null; }
}

async function getVaultEntry(merchantId: number, provider: string) {
  const [row] = await db.select().from(oauthTokenVaultTable)
    .where(and(
      eq(oauthTokenVaultTable.merchantId, merchantId),
      eq(oauthTokenVaultTable.provider, provider),
    ));
  if (!row?.encryptedAccessToken) return null;
  try {
    return { ...row, accessToken: decryptToken(row.encryptedAccessToken) };
  } catch { return null; }
}

interface SocialPost {
  id: string;
  platform: string;
  accountName: string;
  accountHandle: string;
  text: string;
  imageUrl: string | null;
  videoUrl: string | null;
  permalink: string | null;
  likes: number;
  comments: number;
  shares: number;
  postedAt: string;
}

async function fetchFacebookPosts(token: string, handle: string): Promise<SocialPost[]> {
  const fields = "id,message,created_time,full_picture,permalink_url,likes.summary(true),comments.summary(true)";
  const url = `https://graph.facebook.com/v19.0/me/feed?fields=${encodeURIComponent(fields)}&limit=12&access_token=${encodeURIComponent(token)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Facebook API error: ${r.status}`);
  const data = await r.json() as { data?: Array<{ id: string; message?: string; created_time: string; full_picture?: string; permalink_url?: string; likes?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } } }> };
  return (data.data ?? []).map((p) => ({
    id: p.id,
    platform: "facebook",
    accountName: handle || "Facebook Page",
    accountHandle: handle,
    text: p.message ?? "",
    imageUrl: p.full_picture ?? null,
    videoUrl: null,
    permalink: p.permalink_url ?? null,
    likes: p.likes?.summary?.total_count ?? 0,
    comments: p.comments?.summary?.total_count ?? 0,
    shares: 0,
    postedAt: p.created_time,
  }));
}

async function fetchInstagramPosts(token: string, handle: string): Promise<SocialPost[]> {
  const fields = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count";
  const url = `https://graph.instagram.com/me/media?fields=${encodeURIComponent(fields)}&limit=12&access_token=${encodeURIComponent(token)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Instagram API error: ${r.status}`);
  const data = await r.json() as { data?: Array<{ id: string; caption?: string; media_type?: string; media_url?: string; thumbnail_url?: string; permalink?: string; timestamp: string; like_count?: number; comments_count?: number }> };
  return (data.data ?? []).map((p) => ({
    id: p.id,
    platform: "instagram",
    accountName: handle || "Instagram Account",
    accountHandle: handle,
    text: p.caption ?? "",
    imageUrl: p.media_type === "VIDEO" ? (p.thumbnail_url ?? null) : (p.media_url ?? null),
    videoUrl: p.media_type === "VIDEO" ? (p.media_url ?? null) : null,
    permalink: p.permalink ?? null,
    likes: p.like_count ?? 0,
    comments: p.comments_count ?? 0,
    shares: 0,
    postedAt: p.timestamp,
  }));
}

async function fetchTwitterPosts(token: string, handle: string): Promise<SocialPost[]> {
  // Get user ID first
  const userRes = await fetch("https://api.twitter.com/2/users/me?user.fields=name,username,profile_image_url", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) throw new Error(`Twitter user fetch error: ${userRes.status}`);
  const userData = await userRes.json() as { data?: { id: string; name?: string; username?: string } };
  const userId = userData.data?.id;
  if (!userId) throw new Error("Twitter user ID not found");

  const tweetFields = "created_at,text,public_metrics,attachments,entities";
  const mediaFields = "media_key,type,url,preview_image_url";
  const url = `https://api.twitter.com/2/users/${userId}/tweets?max_results=12&tweet.fields=${encodeURIComponent(tweetFields)}&expansions=attachments.media_keys&media.fields=${encodeURIComponent(mediaFields)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Twitter API error: ${r.status}`);
  const data = await r.json() as {
    data?: Array<{ id: string; text: string; created_at: string; public_metrics?: { like_count?: number; reply_count?: number; retweet_count?: number }; attachments?: { media_keys?: string[] } }>;
    includes?: { media?: Array<{ media_key: string; type: string; url?: string; preview_image_url?: string }> };
  };

  const mediaMap: Record<string, { url?: string; preview?: string }> = {};
  (data.includes?.media ?? []).forEach((m) => {
    mediaMap[m.media_key] = { url: m.url, preview: m.preview_image_url };
  });

  const displayHandle = userData.data?.username ?? handle;
  const displayName = userData.data?.name ?? handle;

  return (data.data ?? []).map((t) => {
    const mediaKey = t.attachments?.media_keys?.[0];
    const media = mediaKey ? mediaMap[mediaKey] : null;
    return {
      id: t.id,
      platform: "twitter",
      accountName: displayName,
      accountHandle: `@${displayHandle}`,
      text: t.text,
      imageUrl: media?.url ?? media?.preview ?? null,
      videoUrl: null,
      permalink: `https://twitter.com/${displayHandle}/status/${t.id}`,
      likes: t.public_metrics?.like_count ?? 0,
      comments: t.public_metrics?.reply_count ?? 0,
      shares: t.public_metrics?.retweet_count ?? 0,
      postedAt: t.created_at,
    };
  });
}

async function fetchLinkedInPosts(token: string, handle: string): Promise<SocialPost[]> {
  // Get organization URN first via /userinfo
  const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${token}`, "LinkedIn-Version": "202312" },
  });
  if (!profileRes.ok) throw new Error(`LinkedIn profile error: ${profileRes.status}`);
  const profile = await profileRes.json() as { sub?: string; name?: string };

  const author = `urn:li:person:${profile.sub ?? ""}`;
  const url = `https://api.linkedin.com/rest/posts?author=${encodeURIComponent(author)}&count=12&q=author`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "LinkedIn-Version": "202312" },
  });
  if (!r.ok) throw new Error(`LinkedIn API error: ${r.status}`);
  const data = await r.json() as { elements?: Array<{ id: string; commentary?: string; publishedAt?: number; content?: { media?: { thumbnail?: { resolvedUrl?: string } } } }> };

  const displayName = profile.name ?? handle;

  return (data.elements ?? []).map((p) => ({
    id: p.id,
    platform: "linkedin",
    accountName: displayName,
    accountHandle: handle,
    text: p.commentary ?? "",
    imageUrl: p.content?.media?.thumbnail?.resolvedUrl ?? null,
    videoUrl: null,
    permalink: null,
    likes: 0,
    comments: 0,
    shares: 0,
    postedAt: p.publishedAt ? new Date(p.publishedAt).toISOString() : new Date().toISOString(),
  }));
}

/* ── GET /social-feed/posts ─────────────────────────────────────────────── */
router.get("/social-feed/posts", async (req, res) => {
  const merchantId = req.session.merchantId!;
  const platformFilter = req.query.platform as string | undefined;

  const [settings] = await db.select().from(socialFeedSettingsTable)
    .where(eq(socialFeedSettingsTable.merchantId, merchantId));

  const show = {
    facebook:  settings?.showFacebook  ?? true,
    instagram: settings?.showInstagram ?? true,
    twitter:   settings?.showTwitter   ?? true,
    linkedin:  settings?.showLinkedin  ?? true,
  };

  type PlatformResult = { platform: string; status: "ok" | "not_connected" | "error"; posts: SocialPost[]; error?: string };
  const results: PlatformResult[] = [];

  const platforms: Array<{ key: keyof typeof show; provider: string; label: string; fetchFn: (token: string, handle: string) => Promise<SocialPost[]> }> = [
    { key: "facebook",  provider: "meta",     label: "Facebook",  fetchFn: fetchFacebookPosts },
    { key: "instagram", provider: "meta",     label: "Instagram", fetchFn: fetchInstagramPosts },
    { key: "twitter",   provider: "twitter",  label: "Twitter/X", fetchFn: fetchTwitterPosts },
    { key: "linkedin",  provider: "linkedin", label: "LinkedIn",  fetchFn: fetchLinkedInPosts },
  ];

  await Promise.all(platforms.map(async ({ key, provider, fetchFn }) => {
    if (!show[key]) return;
    if (platformFilter && platformFilter !== key) return;

    const entry = await getVaultEntry(merchantId, provider);
    if (!entry || !entry.accessToken) {
      results.push({ platform: key, status: "not_connected", posts: [] });
      return;
    }

    try {
      const posts = await fetchFn(entry.accessToken, entry.accountHandle ?? "");
      results.push({ platform: key, status: "ok", posts });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      results.push({ platform: key, status: "error", posts: [], error: msg });
    }
  }));

  return res.json({ results });
});

export default router;
