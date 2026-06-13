import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/* ── Types ──────────────────────────────────────────────────────────────────
 * Mirrors the /social/* API. The server stores per-platform results and the
 * post lifecycle (draft → scheduled → publishing → published/partial/failed). */
export type SocialPlatform = "facebook" | "instagram" | "twitter" | "linkedin";
export type PostStatus = "draft" | "scheduled" | "publishing" | "published" | "partial" | "failed";

export interface SocialAccount {
  id: number;
  platform: SocialPlatform;
  externalId: string;
  name: string;
  avatarUrl: string | null;
  status: "active" | "revoked";
}

export interface PostMedia { url: string; type: "image" | "video" }
export interface PostTarget { platform: SocialPlatform; accountId: string }
export interface PostResult {
  platform: string; accountId: string;
  status: "published" | "failed" | "skipped";
  remoteId?: string; permalink?: string; error?: string;
}

export interface SocialPost {
  id: number;
  content: string;
  media: PostMedia[] | null;
  linkUrl: string | null;
  checkInName: string | null;
  targets: PostTarget[] | null;
  results: PostResult[] | null;
  status: PostStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  isGiveaway: string;
  giveawayPrize: string | null;
  winnerEntryId: number | null;
  createdAt: string;
}

export interface GiveawayEntry {
  id: number;
  postId: number;
  platform: string;
  externalUserId: string | null;
  name: string;
  commentId: string | null;
  commentText: string | null;
  isWinner: string;
  enteredAt: string;
}

export interface CreatePostBody {
  content: string;
  media?: PostMedia[];
  linkUrl?: string | null;
  checkInName?: string | null;
  targets: PostTarget[];
  scheduledAt?: string | null;
  isGiveaway?: boolean;
  giveawayPrize?: string | null;
  publishNow?: boolean;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

/* ── Queries ────────────────────────────────────────────────────────────────── */

export function useSocialAccounts() {
  return useQuery({
    queryKey: ["social-accounts"],
    queryFn: () => api<{ accounts: SocialAccount[] }>("/social/accounts"),
  });
}

export function useSocialPosts(status?: string) {
  return useQuery({
    queryKey: ["social-posts", status ?? "all"],
    queryFn: () => api<{ posts: SocialPost[] }>(`/social/posts${status && status !== "all" ? `?status=${status}` : ""}`),
  });
}

export function useGiveaway(postId: number | null) {
  return useQuery({
    queryKey: ["social-giveaway", postId],
    queryFn: () => api<{ post: SocialPost; entries: GiveawayEntry[] }>(`/social/posts/${postId}/giveaway`),
    enabled: !!postId,
  });
}

/* ── Mutations ──────────────────────────────────────────────────────────────── */

export function useSyncAccounts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ synced: number }>("/social/accounts/sync", { method: "POST" }),
    onSuccess: (d) => { toast.success(`Synced ${d.synced} account${d.synced === 1 ? "" : "s"}`); qc.invalidateQueries({ queryKey: ["social-accounts"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sync failed"),
  });
}

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePostBody) => api<{ post: SocialPost }>("/social/posts", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-posts"] }),
  });
}

export function useUpdatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<CreatePostBody> }) => api<{ post: SocialPost }>(`/social/posts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-posts"] }),
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<{ ok: boolean }>(`/social/posts/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-posts"] }),
  });
}

export function usePublishPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<{ post: SocialPost }>(`/social/posts/${id}/publish`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["social-posts"] }),
  });
}

export function useSyncGiveaway() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (postId: number) => api<{ added: number; total: number }>(`/social/posts/${postId}/giveaway/sync`, { method: "POST" }),
    onSuccess: (d, postId) => { toast.success(`${d.added} new entrant${d.added === 1 ? "" : "s"} (${d.total} total)`); qc.invalidateQueries({ queryKey: ["social-giveaway", postId] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sync failed"),
  });
}

export function useDrawWinner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (postId: number) => api<{ winner: GiveawayEntry }>(`/social/posts/${postId}/giveaway/draw`, { method: "POST" }),
    onSuccess: (d, postId) => { toast.success(`Winner: ${d.winner.name} 🎉`); qc.invalidateQueries({ queryKey: ["social-giveaway", postId] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Draw failed"),
  });
}

/** Upload a media file via the storage pipeline; returns the servable URL. */
export async function uploadMedia(file: File): Promise<PostMedia> {
  const urlRes = await fetch("/api/storage/uploads/request-url", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
    credentials: "include",
  });
  if (!urlRes.ok) throw new Error("Could not get upload URL");
  const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
  const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  if (!putRes.ok) throw new Error("Upload to storage failed");
  await fetch("/api/storage/uploads/confirm", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objectPath }), credentials: "include",
  });
  return { url: `/api/storage${objectPath}`, type: file.type.startsWith("video/") ? "video" : "image" };
}
