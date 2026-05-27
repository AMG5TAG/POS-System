import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetSocialFeedSettings, useListSocialFeedPosts } from "@workspace/api-client-react";
import { Link } from "wouter";
import {
  RefreshCw, ExternalLink, Heart, MessageCircle, Repeat2,
  ThumbsUp, Share2, Settings, WifiOff, AlertCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

/* ── Platform config ─────────────────────────────────────────────────────── */
const PLATFORMS = [
  { key: "facebook",  label: "Facebook",    color: "bg-[#1877F2]", textColor: "text-[#1877F2]", borderColor: "border-[#1877F2]" },
  { key: "instagram", label: "Instagram",   color: "bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#FCAF45]", textColor: "text-[#E1306C]", borderColor: "border-[#E1306C]" },
  { key: "twitter",   label: "Twitter / X", color: "bg-black",     textColor: "text-black",       borderColor: "border-black" },
  { key: "linkedin",  label: "LinkedIn",    color: "bg-[#0A66C2]", textColor: "text-[#0A66C2]",   borderColor: "border-[#0A66C2]" },
] as const;

type Platform = typeof PLATFORMS[number]["key"] | "all";

function PlatformIcon({ platform, size = 20 }: { platform: string; size?: number }) {
  const icons: Record<string, string> = {
    facebook:  "M",
    instagram: "IG",
    twitter:   "𝕏",
    linkedin:  "in",
  };
  const colors: Record<string, string> = {
    facebook:  "bg-[#1877F2] text-white",
    instagram: "bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#FCAF45] text-white",
    twitter:   "bg-black text-white",
    linkedin:  "bg-[#0A66C2] text-white",
  };
  return (
    <div
      className={cn("flex items-center justify-center rounded-full font-bold text-[10px]", colors[platform] ?? "bg-muted")}
      style={{ width: size, height: size }}
    >
      {icons[platform] ?? "?"}
    </div>
  );
}

/* ── Post card ───────────────────────────────────────────────────────────── */
interface Post {
  id: string;
  platform: string;
  accountName: string;
  accountHandle: string;
  text: string;
  imageUrl?: string | null;
  permalink?: string | null;
  likes: number;
  comments: number;
  shares: number;
  postedAt: string;
}

function PostCard({ post }: { post: Post }) {
  const [expanded, setExpanded] = useState(false);
  const TEXT_LIMIT = 220;
  const isLong = post.text.length > TEXT_LIMIT;
  const displayText = isLong && !expanded ? post.text.slice(0, TEXT_LIMIT) + "…" : post.text;
  const ago = (() => {
    try { return formatDistanceToNow(new Date(post.postedAt), { addSuffix: true }); }
    catch { return ""; }
  })();

  return (
    <Card className="flex flex-col gap-0 overflow-hidden group hover:shadow-md transition-shadow">
      {/* platform header strip */}
      <div className="h-1 w-full" style={{ background: platformGradient(post.platform) }} />
      <CardHeader className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2.5">
          <PlatformIcon platform={post.platform} size={28} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight truncate">{post.accountName}</p>
            <p className="text-xs text-muted-foreground truncate">{post.accountHandle} · {ago}</p>
          </div>
          {post.permalink && (
            <a href={post.permalink} target="_blank" rel="noopener noreferrer"
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground">
              <ExternalLink size={14} />
            </a>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 flex flex-col gap-3">
        {post.text && (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {displayText}
            {isLong && (
              <button onClick={() => setExpanded(v => !v)}
                className="ml-1 text-xs text-primary hover:underline font-medium">
                {expanded ? "Less" : "More"}
              </button>
            )}
          </p>
        )}
        {post.imageUrl && (
          <div className="rounded-lg overflow-hidden bg-muted aspect-video">
            <img src={post.imageUrl} alt="Post media"
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
          </div>
        )}
        {/* engagement stats */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-0.5">
          {post.platform === "twitter" ? (
            <>
              <span className="flex items-center gap-1"><Heart size={12} />{post.likes.toLocaleString()}</span>
              <span className="flex items-center gap-1"><MessageCircle size={12} />{post.comments.toLocaleString()}</span>
              <span className="flex items-center gap-1"><Repeat2 size={12} />{post.shares.toLocaleString()}</span>
            </>
          ) : post.platform === "linkedin" ? (
            <>
              <span className="flex items-center gap-1"><ThumbsUp size={12} />{post.likes.toLocaleString()}</span>
              <span className="flex items-center gap-1"><MessageCircle size={12} />{post.comments.toLocaleString()}</span>
              <span className="flex items-center gap-1"><Share2 size={12} />{post.shares.toLocaleString()}</span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1"><Heart size={12} />{post.likes.toLocaleString()}</span>
              <span className="flex items-center gap-1"><MessageCircle size={12} />{post.comments.toLocaleString()}</span>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function platformGradient(p: string) {
  const map: Record<string, string> = {
    facebook:  "#1877F2",
    instagram: "linear-gradient(135deg, #833AB4, #FD1D1D, #FCAF45)",
    twitter:   "#000000",
    linkedin:  "#0A66C2",
  };
  return map[p] ?? "#6b7280";
}

/* ── Not-connected card ─────────────────────────────────────────────────── */
function NotConnectedCard({ platform }: { platform: typeof PLATFORMS[number] }) {
  return (
    <Card className="flex flex-col overflow-hidden opacity-70">
      <div className="h-1 w-full" style={{ background: platformGradient(platform.key) }} />
      <CardContent className="flex flex-col items-center justify-center gap-3 py-8 text-center">
        <PlatformIcon platform={platform.key} size={40} />
        <div>
          <p className="font-semibold text-sm">{platform.label} not connected</p>
          <p className="text-xs text-muted-foreground mt-1">Connect your account in Integrations to see posts here.</p>
        </div>
        <Button asChild size="sm" variant="outline" className="mt-1">
          <Link href="/management/integrations">Go to Integrations</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/* ── Error card ─────────────────────────────────────────────────────────── */
function ErrorCard({ platform, error }: { platform: typeof PLATFORMS[number]; error?: string }) {
  return (
    <Card className="flex flex-col overflow-hidden opacity-70">
      <div className="h-1 w-full" style={{ background: platformGradient(platform.key) }} />
      <CardContent className="flex flex-col items-center justify-center gap-3 py-8 text-center">
        <PlatformIcon platform={platform.key} size={40} />
        <div>
          <p className="font-semibold text-sm">{platform.label} — fetch error</p>
          <p className="text-xs text-muted-foreground mt-1">{error ?? "Could not load posts. Your token may have expired."}</p>
        </div>
        <Button asChild size="sm" variant="outline" className="mt-1">
          <Link href="/management/integrations">Re-connect</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/* ── Skeleton cards ─────────────────────────────────────────────────────── */
function SkeletonCard() {
  return (
    <Card className="overflow-hidden">
      <div className="h-1 w-full bg-muted" />
      <CardHeader className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2.5">
          <Skeleton className="w-7 h-7 rounded-full" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </CardContent>
    </Card>
  );
}

/* ── Main page ──────────────────────────────────────────────────────────── */
export default function StaffSocialFeedPage() {
  const [activePlatform, setActivePlatform] = useState<Platform>("all");
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: settings } = useGetSocialFeedSettings();

  const { data, isLoading, isError, refetch } = useListSocialFeedPosts(
    activePlatform !== "all" ? { platform: activePlatform } : {},
    { query: { queryKey: ["social-feed-posts", activePlatform, refreshKey] } }
  );

  const results = data?.results ?? [];

  /* which platforms are enabled in settings */
  const enabledPlatforms = PLATFORMS.filter((p) => {
    if (!settings) return true;
    const map: Record<string, boolean> = {
      facebook:  settings.showFacebook,
      instagram: settings.showInstagram,
      twitter:   settings.showTwitter,
      linkedin:  settings.showLinkedin,
    };
    return map[p.key] !== false;
  });

  /* filter by active tab */
  const displayPlatforms = activePlatform === "all"
    ? enabledPlatforms
    : enabledPlatforms.filter(p => p.key === activePlatform);

  const allPosts = results.flatMap(r => r.posts ?? []);
  const totalConnected = results.filter(r => r.status === "ok").length;

  return (
    <AppLayout>
      <div className="w-full px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Social Feed</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Live posts from your connected social channels
              {totalConnected > 0 && (
                <span className="ml-2">
                  <Badge variant="secondary" className="text-xs">{totalConnected} connected</Badge>
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { setRefreshKey(k => k + 1); refetch(); }}>
              <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
              Refresh
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/management/marketing/social-feed">
                <Settings size={14} />
                Settings
              </Link>
            </Button>
          </div>
        </div>

        {/* Platform filter tabs */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActivePlatform("all")}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium border transition-colors",
              activePlatform === "all"
                ? "bg-foreground text-background border-foreground"
                : "bg-background text-foreground border-border hover:bg-muted"
            )}
          >
            All Feeds
          </button>
          {enabledPlatforms.map((p) => {
            const result = results.find(r => r.platform === p.key);
            const connected = result?.status === "ok";
            return (
              <button
                key={p.key}
                onClick={() => setActivePlatform(p.key)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium border transition-colors",
                  activePlatform === p.key
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background text-foreground border-border hover:bg-muted"
                )}
              >
                <PlatformIcon platform={p.key} size={16} />
                {p.label}
                {!isLoading && result?.status === "not_connected" && (
                  <WifiOff size={12} className="text-muted-foreground" />
                )}
                {!isLoading && connected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                )}
              </button>
            );
          })}
        </div>

        {/* Feed grid */}
        {isError ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <AlertCircle size={36} className="text-destructive" />
            <p className="font-semibold">Failed to load feed</p>
            <p className="text-sm text-muted-foreground">Check your connection and try refreshing.</p>
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 xl:columns-3 gap-4 space-y-4">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="break-inside-avoid mb-4">
                  <SkeletonCard />
                </div>
              ))
            ) : (
              <>
                {/* Connected platform posts */}
                {displayPlatforms.map((platform) => {
                  const result = results.find(r => r.platform === platform.key);
                  if (!result || result.status === "not_connected") {
                    return (
                      <div key={platform.key} className="break-inside-avoid mb-4">
                        <NotConnectedCard platform={platform} />
                      </div>
                    );
                  }
                  if (result.status === "error") {
                    return (
                      <div key={platform.key} className="break-inside-avoid mb-4">
                        <ErrorCard platform={platform} error={result.error ?? undefined} />
                      </div>
                    );
                  }
                  if (activePlatform === "all") {
                    /* in All mode, show a sample of posts from each platform */
                    return (result.posts ?? []).slice(0, 3).map((post) => (
                      <div key={post.id} className="break-inside-avoid mb-4">
                        <PostCard post={post} />
                      </div>
                    ));
                  }
                  return null;
                })}

                {/* Single platform filtered view */}
                {activePlatform !== "all" && allPosts.map((post) => (
                  <div key={post.id} className="break-inside-avoid mb-4">
                    <PostCard post={post} />
                  </div>
                ))}

                {/* Empty state */}
                {!isLoading && allPosts.length === 0 && results.every(r => r.status !== "not_connected") && results.length === 0 && (
                  <div className="col-span-3 flex flex-col items-center justify-center py-16 text-center gap-3">
                    <Share2 size={36} className="text-muted-foreground" />
                    <p className="font-semibold">No platforms enabled</p>
                    <p className="text-sm text-muted-foreground">Enable platforms in Social Feed settings.</p>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/management/marketing/social-feed">Open Settings</Link>
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Sync info footer */}
        {settings && (
          <p className="text-xs text-muted-foreground text-center pt-2">
            Feed syncs every {settings.refreshIntervalMinutes} minute{settings.refreshIntervalMinutes !== 1 ? "s" : ""}.
            Manage settings in <Link href="/management/marketing/social-feed" className="underline hover:text-foreground">Marketing &gt; Social Feed</Link>.
          </p>
        )}
      </div>
    </AppLayout>
  );
}
