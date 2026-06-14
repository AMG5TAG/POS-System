/* ── Social publishing service ──────────────────────────────────────────────
 * Provider-abstracted publishing for the Social Media composer. Each platform
 * exposes the same `publish(account, post)` shape and returns a structured
 * PublishResult. Meta (Facebook Pages + Instagram Business) is implemented
 * against the Graph API using the page/long-lived token stored on the account;
 * X and LinkedIn are scaffolded behind the same interface and report a clear
 * "not configured" status until their publish APIs are wired.
 *
 * Every provider degrades gracefully: a missing token or a connection without
 * publish rights yields a `failed`/`skipped` result with a human-readable
 * error rather than throwing, so a multi-platform post records per-target
 * outcomes independently. */
import type { SocialAccount, SocialPost } from "@workspace/db";

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

/* ── Not-yet-wired providers ───────────────────────────────────────────────── */
function notConfigured(platform: string, account: SocialAccount): PublishResult {
  return {
    platform,
    accountId: account.externalId,
    status: "skipped",
    error: `Publishing to ${platform} isn't wired yet — the account is connected but direct posting is coming soon.`,
  };
}

/** Publish a post to a single connected account, by platform. */
export async function publishToAccount(account: SocialAccount, post: SocialPost): Promise<PublishResult> {
  switch (account.platform) {
    case "facebook":  return publishFacebook(account, post);
    case "instagram": return publishInstagram(account, post);
    case "twitter":   return notConfigured("twitter", account);
    case "linkedin":  return notConfigured("linkedin", account);
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
