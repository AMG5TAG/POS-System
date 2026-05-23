import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Facebook, Instagram, Twitter, Linkedin, Youtube,
  Send, Clock, CheckCircle2, AlertCircle, ImagePlus,
  Trash2, Calendar, X, ChevronDown, ChevronUp,
  Globe, Users, User,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const CONNECTIONS_KEY = "koapos_social_connections";
const POSTS_KEY       = "koapos_social_posts";

interface SocialPost {
  id: string;
  text: string;
  platforms: string[];
  fbAudience: string;
  scheduledAt: string | null;
  createdAt: string;
  status: "draft" | "scheduled" | "posted" | "failed";
  imageUrl?: string;
}

interface PlatformMeta {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  border: string;
  charLimit: number;
}

const PLATFORMS: PlatformMeta[] = [
  { id: "facebook",  name: "Facebook",   icon: Facebook,  color: "text-blue-600",  bg: "bg-blue-50 dark:bg-blue-950/30",  border: "border-blue-200 dark:border-blue-800", charLimit: 63206 },
  { id: "instagram", name: "Instagram",  icon: Instagram, color: "text-pink-600",  bg: "bg-pink-50 dark:bg-pink-950/30",  border: "border-pink-200 dark:border-pink-800", charLimit: 2200  },
  { id: "twitter",   name: "X / Twitter",icon: Twitter,   color: "text-sky-500",   bg: "bg-sky-50 dark:bg-sky-950/30",    border: "border-sky-200 dark:border-sky-800",   charLimit: 280   },
  { id: "linkedin",  name: "LinkedIn",   icon: Linkedin,  color: "text-blue-700",  bg: "bg-blue-50 dark:bg-blue-950/30",  border: "border-blue-200 dark:border-blue-800", charLimit: 3000  },
  { id: "youtube",   name: "YouTube",    icon: Youtube,   color: "text-red-600",   bg: "bg-red-50 dark:bg-red-950/30",    border: "border-red-200 dark:border-red-800",   charLimit: 5000  },
];

const FB_AUDIENCE_OPTIONS = [
  { value: "page",      label: "Page",     icon: Globe },
  { value: "group",     label: "Group",    icon: Users },
  { value: "timeline",  label: "Timeline", icon: User  },
];

function loadConnected(): string[] {
  try {
    const raw = localStorage.getItem(CONNECTIONS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return Object.entries(obj).filter(([, v]: [string, unknown]) => (v as { connected?: boolean }).connected).map(([k]) => k);
  } catch { return []; }
}

function loadPosts(): SocialPost[] {
  try {
    const raw = localStorage.getItem(POSTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePosts(posts: SocialPost[]) {
  localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
}

const STATUS_STYLES: Record<string, string> = {
  draft:     "bg-muted text-muted-foreground",
  scheduled: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  posted:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  failed:    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export default function MarketingSocialsPostsPage() {
  const [connected] = useState<string[]>(() => loadConnected());
  const [posts, setPosts] = useState<SocialPost[]>(() => loadPosts());
  const [text, setText] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [fbAudience, setFbAudience] = useState("page");
  const [schedule, setSchedule] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [showHistory, setShowHistory] = useState(true);
  const [previewPost, setPreviewPost] = useState<SocialPost | null>(null);

  useEffect(() => { savePosts(posts); }, [posts]);

  const togglePlatform = (id: string) =>
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );

  const handlePost = () => {
    if (!text.trim()) { toast.error("Write something before posting"); return; }
    if (!selectedPlatforms.length) { toast.error("Select at least one platform"); return; }
    if (schedule && !scheduleAt) { toast.error("Choose a scheduled date & time"); return; }

    const newPost: SocialPost = {
      id:          Math.random().toString(36).slice(2, 10),
      text,
      platforms:   selectedPlatforms,
      fbAudience,
      scheduledAt: schedule ? scheduleAt : null,
      createdAt:   new Date().toISOString(),
      status:      connected.length === 0
                    ? "draft"
                    : schedule
                    ? "scheduled"
                    : "posted",
      imageUrl:    imageUrl || undefined,
    };

    setPosts((prev) => [newPost, ...prev]);
    setText("");
    setSelectedPlatforms([]);
    setImageUrl("");
    setSchedule(false);
    setScheduleAt("");

    if (connected.length === 0) {
      toast.warning("Saved as draft — connect social accounts in Management > Marketing to publish");
    } else if (schedule) {
      toast.success("Post scheduled");
    } else {
      toast.success(`Posted to ${selectedPlatforms.length} platform${selectedPlatforms.length !== 1 ? "s" : ""}`);
    }
  };

  const deletePost = (id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
    toast.success("Post removed");
  };

  const twitterSelected = selectedPlatforms.includes("twitter");
  const twitterLen = text.length;
  const twitterOver = twitterSelected && twitterLen > 280;

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Social Media Posts</h1>
            <p className="text-muted-foreground mt-1">Compose and publish posts across all your connected social platforms.</p>
          </div>
          {connected.length === 0 && (
            <Badge variant="secondary" className="gap-1.5 shrink-0">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              No accounts connected
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Composer */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Compose Post</CardTitle>
              <CardDescription>Select platforms, write your post, and publish or schedule.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Platform picker */}
              <div className="space-y-2">
                <Label>Platforms</Label>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map((p) => {
                    const isConnected = connected.includes(p.id);
                    const isSelected  = selectedPlatforms.includes(p.id);
                    const Icon = p.icon;
                    return (
                      <button
                        key={p.id}
                        onClick={() => togglePlatform(p.id)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all",
                          isSelected
                            ? cn("border-2", p.border, p.bg)
                            : "border-border bg-background hover:bg-muted",
                          !isConnected && "opacity-50"
                        )}
                        title={isConnected ? p.name : `${p.name} — not connected`}
                      >
                        <Icon className={cn("w-3.5 h-3.5", isSelected ? p.color : "text-muted-foreground")} />
                        {p.name}
                        {!isConnected && <span className="text-[10px] text-muted-foreground">(disconnected)</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Facebook audience */}
              {selectedPlatforms.includes("facebook") && (
                <div className="space-y-1.5">
                  <Label>Facebook Audience</Label>
                  <div className="flex gap-2">
                    {FB_AUDIENCE_OPTIONS.map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        onClick={() => setFbAudience(value)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all flex-1 justify-center",
                          fbAudience === value
                            ? "border-2 border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/30 dark:text-blue-400"
                            : "border-border bg-background hover:bg-muted"
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Text */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <Label>Message</Label>
                  {twitterSelected && (
                    <span className={cn("text-xs tabular-nums", twitterOver ? "text-destructive font-medium" : "text-muted-foreground")}>
                      {twitterLen}/280 (X)
                    </span>
                  )}
                </div>
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="What would you like to share?"
                  className="min-h-32 resize-y"
                />
                {twitterOver && (
                  <p className="text-xs text-destructive">Tweet exceeds 280 characters — it will be truncated or rejected by X/Twitter.</p>
                )}
              </div>

              {/* Image URL */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5"><ImagePlus className="w-3.5 h-3.5" /> Image URL (optional)</Label>
                <div className="flex gap-2">
                  <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" />
                  {imageUrl && <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setImageUrl("")}><X className="w-3.5 h-3.5" /></Button>}
                </div>
                {imageUrl && (
                  <img src={imageUrl} alt="Preview" className="rounded-lg border max-h-40 object-cover w-full" onError={() => setImageUrl("")} />
                )}
              </div>

              <Separator />

              {/* Schedule */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <Label className="text-sm cursor-pointer" htmlFor="schedule-toggle">Schedule for later</Label>
                </div>
                <Switch id="schedule-toggle" checked={schedule} onCheckedChange={setSchedule} />
              </div>
              {schedule && (
                <Input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                />
              )}

              <Button
                className="w-full gap-2"
                onClick={handlePost}
                disabled={!text.trim() || !selectedPlatforms.length}
              >
                {schedule ? <Calendar className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                {schedule ? "Schedule Post" : "Post Now"}
              </Button>
            </CardContent>
          </Card>

          {/* Per-platform character counts */}
          {selectedPlatforms.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Character Limits</CardTitle>
                <CardDescription>How your post fits on each selected platform.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedPlatforms.map((pid) => {
                  const p = PLATFORMS.find((pl) => pl.id === pid)!;
                  const Icon = p.icon;
                  const pct = Math.min(100, (text.length / p.charLimit) * 100);
                  const over = text.length > p.charLimit;
                  return (
                    <div key={pid} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-1.5">
                          <Icon className={cn("w-3.5 h-3.5", p.color)} />
                          <span>{p.name}</span>
                        </div>
                        <span className={cn("tabular-nums text-xs", over ? "text-destructive" : "text-muted-foreground")}>
                          {text.length} / {p.charLimit.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", over ? "bg-destructive" : "bg-primary")}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Post history */}
        <Card>
          <CardHeader>
            <button
              className="flex items-center justify-between w-full text-left"
              onClick={() => setShowHistory((p) => !p)}
            >
              <div>
                <CardTitle className="text-base">Post History</CardTitle>
                <CardDescription className="mt-0.5">{posts.length} post{posts.length !== 1 ? "s" : ""}</CardDescription>
              </div>
              {showHistory ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
          </CardHeader>
          {showHistory && (
            <CardContent>
              {posts.length === 0 ? (
                <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center space-y-2">
                  <Send className="w-8 h-8 text-muted-foreground/30 mx-auto" />
                  <p className="text-sm text-muted-foreground">No posts yet — compose your first post above.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {posts.map((post) => {
                    const date = new Date(post.scheduledAt ?? post.createdAt);
                    return (
                      <div key={post.id} className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3">
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={cn("text-[10px] border-0 capitalize", STATUS_STYLES[post.status])}>
                              {post.status === "scheduled" && <Clock className="w-2.5 h-2.5 mr-0.5" />}
                              {post.status === "posted" && <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />}
                              {post.status}
                            </Badge>
                            <div className="flex items-center gap-1">
                              {post.platforms.map((pid) => {
                                const pl = PLATFORMS.find((p) => p.id === pid);
                                if (!pl) return null;
                                const Icon = pl.icon;
                                return <Icon key={pid} className={cn("w-3.5 h-3.5", pl.color)} />;
                              })}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {post.status === "scheduled" ? "Scheduled for" : "Posted"}{" "}
                              {date.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} {date.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <p className="text-sm line-clamp-2">{post.text}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPreviewPost(post)}>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deletePost(post.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          )}
        </Card>
      </div>

      {/* Post preview dialog */}
      <Dialog open={!!previewPost} onOpenChange={(o) => { if (!o) setPreviewPost(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Post Preview</DialogTitle>
          </DialogHeader>
          {previewPost && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {previewPost.platforms.map((pid) => {
                  const pl = PLATFORMS.find((p) => p.id === pid);
                  if (!pl) return null;
                  const Icon = pl.icon;
                  return (
                    <Badge key={pid} variant="secondary" className={cn("gap-1", pl.color)}>
                      <Icon className="w-3 h-3" /> {pl.name}
                    </Badge>
                  );
                })}
                <Badge className={cn("border-0 capitalize", STATUS_STYLES[previewPost.status])}>{previewPost.status}</Badge>
              </div>
              {previewPost.imageUrl && (
                <img src={previewPost.imageUrl} alt="" className="rounded-lg border max-h-48 w-full object-cover" />
              )}
              <p className="text-sm whitespace-pre-wrap">{previewPost.text}</p>
              <p className="text-xs text-muted-foreground">
                Created {new Date(previewPost.createdAt).toLocaleString("en-AU")}
                {previewPost.scheduledAt && ` · Scheduled ${new Date(previewPost.scheduledAt).toLocaleString("en-AU")}`}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
