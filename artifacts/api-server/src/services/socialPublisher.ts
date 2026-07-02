/* ── Social publishing service ──────────────────────────────────────────────
 * Provider-abstracted publishing for the Social Media composer. Each platform
 * exposes the same `publish(account, post)` shape and returns a structured
 * PublishResult. Meta (Facebook Pages + Instagram Business) posts via the Graph
 * API; X/Twitter posts text via the v2 /tweets API (with automatic token
 * refresh); LinkedIn posts as the connected organization page via /v2/ugcPosts.
 * Image/video upload is currently supported only for Meta — X and LinkedIn post
 * text/link shares (media upload for those is a documented follow-up).
 *
 * Every provider degrades gracefully: a missing token or a connection without
 * publish rights yields a `failed`/`skipped` result with a human-readable
 * error rather than throwing, so a multi-platform post records per-target
 * outcomes independently. */
import type { SocialAccount, SocialPost } from "@workspace/db";
import { readVault, upsertVault } from "./tokenVault";

const GRAPH = "https://graph.facebook.com/v19.0";

export interface PublishMedia { url: string; type: "image" | "video" }

export interface PublishResult {
  platform: string;
  accountId: string;
  status: "published" | "failed" | "skipped";
  remoteId?: string;
  permalink?: string;
  error?: string;
}

/** Compose the message body, appending the link and check-in line when set. */
function buildMessage(post: SocialPost): string {
  const parts = [post.content?.trim() || ""];
  if (post.checkInName) parts.push(`📍 ${post.checkInName}`);
  if (post.linkUrl) parts.push(post.linkUrl);
  return parts.filter(Boolean).join("\n\n");
}

function mediaOf(post: SocialPost): PublishMedia[] {
  return Array.isArray(post.media) ? (post.media as PublishMedia[]) : [];
}

async function graphPost(path: string, params: Record<string, string>): Promise<{ id?: string; error?: string }> {
  try {
    const res = await fetch(`${GRAPH}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!res.ok || data.error) return { error: data.error?.message ?? `Graph API error (${res.status})` };
    return { id: data.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Network error" };
  }
}

/* ── Facebook Page ─────────────────────────────────────────────────────────── */
async function publishFacebook(account: SocialAccount, post: SocialPost): Promise<PublishResult> {
  const base: PublishResult = { platform: "facebook", accountId: account.externalId, status: "failed" };
  if (!account.accessToken) return { ...base, error: "Facebook Page not connected — reconnect Meta in Integrations." };

  const message = buildMessage(post);
  const media = mediaOf(post);
  const token = account.accessToken;

  let result: { id?: string; error?: string };
  if (media.length === 1 && media[0]!.type === "image") {
    result = await graphPost(`${account.externalId}/photos`, { url: media[0]!.url, caption: message, access_token: token });
  } else if (media.length === 1 && media[0]!.type === "video") {
    result = await graphPost(`${account.externalId}/videos`, { file_url: media[0]!.url, description: message, access_token: token });
  } else {
    // Text/link post (multi-image posts require an unpublished-photo flow we
    // collapse to a feed post with the first image as the link preview).
    const params: Record<string, string> = { message, access_token: token };
    if (post.linkUrl) params.link = post.linkUrl;
    result = await graphPost(`${account.externalId}/feed`, params);
  }

  if (result.error) return { ...base, error: result.error };
  const remoteId = result.id;
  return {
    ...base,
    status: "published",
    remoteId,
    permalink: remoteId ? `https://www.facebook.com/${remoteId}` : undefined,
  };
}

/* ── Instagram Business ────────────────────────────────────────────────────── */
async function publishInstagram(account: SocialAccount, post: SocialPost): Promise<PublishResult> {
  const base: PublishResult = { platform: "instagram", accountId: account.externalId, status: "failed" };
  if (!account.accessToken) return { ...base, error: "Instagram account not connected — reconnect Meta in Integrations." };

  const media = mediaOf(post);
  if (media.length === 0) return { ...base, status: "skipped", error: "Instagram posts require an image or video." };

  const token = account.accessToken;
  const caption = buildMessage(post);
  const first = media[0]!;
  // 1) Create a media container.
  const container = await graphPost(`${account.externalId}/media`, {
    ...(first.type === "video" ? { media_type: "REELS", video_url: first.url } : { image_url: first.url }),
    caption,
    access_token: token,
  });
  if (container.error || !container.id) return { ...base, error: container.error ?? "Failed to create media container" };
  // 2) Publish the container.
  const publish = await graphPost(`${account.externalId}/media_publish`, { creation_id: container.id, access_token: token });
  if (publish.error) return { ...base, error: publish.error };
  return { ...base, status: "published", remoteId: publish.id };
}

/* ── X / Twitter ───────────────────────────────────────────────────────────── */

/** Refresh an expired X OAuth2 access token using the stored refresh token
 *  (granted via the `offline.access` scope) and persist the new pair to the
 *  vault. Returns the fresh access token, or null if refresh isn't possible. */
async function refreshTwitterToken(
  merchantId: number,
  refreshToken: string,
  prev: { accountId: string | null; accountHandle: string | null },
): Promise<string | null> {
  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;
  if (!clientId || !clientSecret || !refreshToken) return null;
  try {
    const res = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId }).toString(),
    });
    const data = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string };
    if (!res.ok || !data.access_token) return null;
    await upsertVault(merchantId, {
      provider: "twitter_x",
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      accountId: prev.accountId ?? undefined,
      accountHandle: prev.accountHandle ?? undefined,
    });
    return data.access_token;
  } catch {
    return null;
  }
}

async function publishTwitter(account: SocialAccount, post: SocialPost): Promise<PublishResult> {
  const base: PublishResult = { platform: "twitter", accountId: account.externalId, status: "failed" };
  // Prefer the live vault token (X access tokens expire ~2h; the vault also holds
  // the refresh token). Fall back to the snapshot stored on the account row.
  const vault = await readVault(account.merchantId, "twitter_x").catch(() => null);
  let token = vault?.accessToken || account.accessToken;
  if (!token) return { ...base, error: "X account not connected — reconnect X in Integrations." };

  const text = buildMessage(post);
  // Media upload to X isn't wired yet; a text/link tweet is. An image-only post
  // (no text) can't become a valid tweet, so surface that rather than fail cryptically.
  if (!text.trim()) return { ...base, status: "skipped", error: "X posting requires text — image-only posts to X aren't supported yet." };

  const doPost = (t: string) => fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
    body: JSON.stringify({ text }),
  });

  try {
    let res = await doPost(token);
    // Token expired → refresh once and retry.
    if (res.status === 401 && vault?.refreshToken) {
      const refreshed = await refreshTwitterToken(account.merchantId, vault.refreshToken, vault);
      if (refreshed) { token = refreshed; res = await doPost(token); }
    }
    const data = (await res.json().catch(() => ({}))) as { data?: { id?: string }; detail?: string; title?: string; errors?: { message?: string }[] };
    if (!res.ok || !data.data?.id) {
      if (res.status === 401) return { ...base, error: "X authorisation expired — reconnect X in Integrations." };
      return { ...base, error: data.detail || data.errors?.[0]?.message || data.title || `X API error (${res.status})` };
    }
    const id = data.data.id;
    return { ...base, status: "published", remoteId: id, permalink: `https://twitter.com/i/web/status/${id}` };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "Network error" };
  }
}

/* ── LinkedIn (organization page) ──────────────────────────────────────────── */

async function publishLinkedin(account: SocialAccount, post: SocialPost): Promise<PublishResult> {
  const base: PublishResult = { platform: "linkedin", accountId: account.externalId, status: "failed" };
  const vault = await readVault(account.merchantId, "linkedin_business").catch(() => null);
  const token = vault?.accessToken || account.accessToken;
  if (!token) return { ...base, error: "LinkedIn not connected — reconnect LinkedIn in Integrations." };

  const text = buildMessage(post);
  if (!text.trim()) return { ...base, status: "skipped", error: "LinkedIn posts require text." };

  // Authored as the organization page (the connect flow grants w_organization_social
  // and stores the org id as the account's externalId). Any link in the text is
  // rendered as a preview by LinkedIn, so we post as a text share (media upload,
  // which needs the register-upload asset flow, isn't wired yet).
  const body = {
    author: `urn:li:organization:${account.externalId}`,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: "NONE",
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };

  try {
    const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // LinkedIn tokens have no refresh grant — an expired one means reconnect.
      if (res.status === 401) return { ...base, error: "LinkedIn authorisation expired — reconnect LinkedIn in Integrations." };
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      return { ...base, error: data.message || `LinkedIn API error (${res.status})` };
    }
    // The created post URN is returned in the x-restli-id header (and the body id).
    const headerId = res.headers.get("x-restli-id");
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    const id = headerId || data.id;
    return { ...base, status: "published", remoteId: id ?? undefined, permalink: id ? `https://www.linkedin.com/feed/update/${id}` : undefined };
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : "Network error" };
  }
}

/** Publish a post to a single connected account, by platform. */
export async function publishToAccount(account: SocialAccount, post: SocialPost): Promise<PublishResult> {
  switch (account.platform) {
    case "facebook":  return publishFacebook(account, post);
    case "instagram": return publishInstagram(account, post);
    case "twitter":   return publishTwitter(account, post);
    case "linkedin":  return publishLinkedin(account, post);
    default:
      return { platform: account.platform, accountId: account.externalId, status: "failed", error: `Unknown platform "${account.platform}".` };
  }
}

/** Fetch comments on a published post for giveaway entrant collection. Only
 *  Meta (Facebook/Instagram) is supported; others return an empty list. */
export interface RemoteComment { commentId: string; externalUserId?: string; name: string; text: string }

export async function fetchComments(account: SocialAccount, remoteId: string): Promise<RemoteComment[]> {
  if (account.platform !== "facebook" && account.platform !== "instagram") return [];
  if (!account.accessToken) return [];
  try {
    const url = `${GRAPH}/${remoteId}/comments?fields=id,message,text,from&limit=200&access_token=${encodeURIComponent(account.accessToken)}`;
    const res = await fetch(url);
    const data = (await res.json().catch(() => ({}))) as { data?: Array<{ id: string; message?: string; text?: string; from?: { id?: string; name?: string; username?: string } }> };
    if (!Array.isArray(data.data)) return [];
    return data.data.map((c) => ({
      commentId: c.id,
      externalUserId: c.from?.id,
      name: c.from?.name ?? c.from?.username ?? "Anonymous",
      text: c.message ?? c.text ?? "",
    }));
  } catch {
    return [];
  }
}
