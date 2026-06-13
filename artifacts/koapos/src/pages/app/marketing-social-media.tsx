import { useState, useRef, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Share2, Megaphone, Image as ImageIcon, Video, Link2, MapPin, Calendar, Send, Loader2,
  Trash2, Pencil, X, Facebook, Instagram, Linkedin, Twitter, Gift, RefreshCw, Trophy,
  CheckCircle2, AlertCircle, Clock, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import {
  useSocialAccounts, useSocialPosts, useSyncAccounts, useCreatePost, useUpdatePost,
  useDeletePost, usePublishPost, useGiveaway, useSyncGiveaway, useDrawWinner, uploadMedia,
  type SocialPlatform, type SocialPost, type PostMedia, type SocialAccount,
} from "@/lib/social-media-api";

const PLATFORMS: Record<SocialPlatform, { label: string; icon: typeof Facebook; color: string }> = {
  facebook:  { label: "Facebook",  icon: Facebook,  color: "text-[#1877F2]" },
  instagram: { label: "Instagram", icon: Instagram, color: "text-[#E4405F]" },
  twitter:   { label: "X",         icon: Twitter,   color: "text-foreground" },
  linkedin:  { label: "LinkedIn",  icon: Linkedin,  color: "text-[#0A66C2]" },
};

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Clock }> = {
  draft:      { label: "Draft",      variant: "outline",     icon: Pencil },
  scheduled:  { label: "Scheduled",  variant: "secondary",   icon: Clock },
  publishing: { label: "Publishing", variant: "secondary",   icon: Loader2 },
  published:  { label: "Published",  variant: "default",     icon: CheckCircle2 },
  partial:    { label: "Partial",    variant: "secondary",   icon: AlertCircle },
  failed:     { label: "Failed",     variant: "destructive", icon: AlertCircle },
};

function platformKey(a: SocialAccount) { return `${a.platform}:${a.externalId}`; }

export default function MarketingSocialMediaPage() {
  const { data: accountsData } = useSocialAccounts();
  const accounts = (accountsData?.accounts ?? []).filter((a) => a.status === "active");
  const syncAccounts = useSyncAccounts();

  const [statusTab, setStatusTab] = useState("all");
  const { data: postsData, isLoading } = useSocialPosts(statusTab);
  const posts = postsData?.posts ?? [];

  const createPost = useCreatePost();
  const updatePost = useUpdatePost();
  const deletePost = useDeletePost();
  const publishPost = usePublishPost();

  /* ── Composer state ── */
  const [editingId, setEditingId] = useState<number | null>(null);
  const [content, setContent] = useState("");
  const [media, setMedia] = useState<PostMedia[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [checkInName, setCheckInName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isGiveaway, setIsGiveaway] = useState(false);
  const [giveawayPrize, setGiveawayPrize] = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [giveawayPostId, setGiveawayPostId] = useState<number | null>(null);

  const busy = createPost.isPending || updatePost.isPending;

  function resetComposer() {
    setEditingId(null); setContent(""); setMedia([]); setLinkUrl(""); setCheckInName("");
    setSelected(new Set()); setIsGiveaway(false); setGiveawayPrize("");
    setScheduleEnabled(false); setScheduledAt("");
  }

  function loadDraft(p: SocialPost) {
    setEditingId(p.id);
    setContent(p.content ?? "");
    setMedia(Array.isArray(p.media) ? p.media : []);
    setLinkUrl(p.linkUrl ?? "");
    setCheckInName(p.checkInName ?? "");
    setSelected(new Set((p.targets ?? []).map((t) => `${t.platform}:${t.accountId}`)));
    setIsGiveaway(p.isGiveaway === "true");
    setGiveawayPrize(p.giveawayPrize ?? "");
    setScheduleEnabled(!!p.scheduledAt);
    setScheduledAt(p.scheduledAt ? toLocalInput(p.scheduledAt) : "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded: PostMedia[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
          toast.error(`${file.name}: only images and videos are supported`); continue;
        }
        uploaded.push(await uploadMedia(file));
      }
      setMedia((m) => [...m, ...uploaded]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function targets() {
    return accounts.filter((a) => selected.has(platformKey(a))).map((a) => ({ platform: a.platform, accountId: a.externalId }));
  }

  function validate(): boolean {
    if (!content.trim() && media.length === 0) { toast.error("Add some text or media first."); return false; }
    if (targets().length === 0) { toast.error("Select at least one account to post to."); return false; }
    return true;
  }

  function body(extra: { publishNow?: boolean; scheduledAt?: string | null }) {
    return {
      content, media, linkUrl: linkUrl.trim() || null, checkInName: checkInName.trim() || null,
      targets: targets(), isGiveaway, giveawayPrize: giveawayPrize.trim() || null, ...extra,
    };
  }

  async function save(mode: "draft" | "schedule" | "now") {
    if (mode !== "draft" && !validate()) return;
    if (mode === "draft" && !content.trim() && media.length === 0) { toast.error("Nothing to save yet."); return; }
    const scheduled = mode === "schedule" ? (scheduledAt ? new Date(scheduledAt).toISOString() : null) : null;
    if (mode === "schedule" && !scheduled) { toast.error("Pick a date and time to schedule."); return; }
    try {
      if (editingId) {
        await updatePost.mutateAsync({ id: editingId, body: body({ scheduledAt: scheduled }) });
        if (mode === "now") await publishPost.mutateAsync(editingId);
      } else {
        await createPost.mutateAsync(body({ publishNow: mode === "now", scheduledAt: scheduled }));
      }
      toast.success(mode === "now" ? "Post sent" : mode === "schedule" ? "Post scheduled" : "Draft saved");
      resetComposer();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save post");
    }
  }

  const noAccounts = accounts.length === 0;

  return (
    <AppLayout>
      <div className="w-full px-4 lg:px-6 py-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Share2 className="w-6 h-6 text-primary" /> Social Media</h1>
            <p className="text-muted-foreground text-sm mt-1">Compose, schedule, and publish posts to your connected social accounts.</p>
          </div>
          <Link href="/marketing">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs"><Megaphone className="w-3.5 h-3.5" /> Overview</Button>
          </Link>
        </div>

        {/* Connected accounts */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2 pt-4 px-4 flex-row items-center justify-between">
            <CardTitle className="text-sm">Connected accounts</CardTitle>
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" disabled={syncAccounts.isPending} onClick={() => syncAccounts.mutate()}>
              {syncAccounts.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Sync from Integrations
            </Button>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {noAccounts ? (
              <p className="text-sm text-muted-foreground">
                No accounts connected yet. Connect <strong>Meta Business</strong> (and others) in{" "}
                <Link href="/management/integrations" className="text-primary hover:underline">Integrations</Link>, then click “Sync from Integrations”.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {accounts.map((a) => {
                  const P = PLATFORMS[a.platform];
                  return (
                    <div key={a.id} className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs">
                      {P && <P.icon className={cn("w-3.5 h-3.5", P.color)} />}
                      <span className="font-medium">{a.name}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6 items-start">
          {/* ── Composer ── */}
          <Card className="rounded-2xl">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                {editingId ? <Pencil className="w-4 h-4 text-primary" /> : <Plus className="w-4 h-4 text-primary" />}
                {editingId ? "Edit post" : "Create post"}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-4">
              <Textarea rows={5} placeholder="What would you like to share?" value={content} onChange={(e) => setContent(e.target.value)} className="resize-none" />

              {/* Media */}
              <div className="space-y-2">
                {media.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {media.map((m, i) => (
                      <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border bg-muted">
                        {m.type === "video"
                          ? <div className="w-full h-full flex items-center justify-center"><Video className="w-6 h-6 text-muted-foreground" /></div>
                          : <img src={m.url} alt="" className="w-full h-full object-cover" />}
                        <button type="button" onClick={() => setMedia((arr) => arr.filter((_, j) => j !== i))}
                          className="absolute top-0.5 right-0.5 bg-background/80 rounded-full p-0.5 hover:bg-destructive hover:text-white transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />} Add image / video
                </Button>
                <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
              </div>

              {/* Link + check-in */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1"><Link2 className="w-3 h-3" /> Link</Label>
                  <Input placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1"><MapPin className="w-3 h-3" /> Check-in / location</Label>
                  <Input placeholder="e.g. Koastal HQ, Burleigh" value={checkInName} onChange={(e) => setCheckInName(e.target.value)} className="h-8 text-sm" />
                </div>
              </div>

              {/* Account targets */}
              <div className="space-y-1.5">
                <Label className="text-xs">Post to</Label>
                {noAccounts ? (
                  <p className="text-xs text-muted-foreground">Connect an account above to choose where to post.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {accounts.map((a) => {
                      const P = PLATFORMS[a.platform];
                      const key = platformKey(a);
                      const on = selected.has(key);
                      return (
                        <button key={a.id} type="button"
                          onClick={() => setSelected((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; })}
                          className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                            on ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}>
                          {P && <P.icon className={cn("w-3.5 h-3.5", on ? "text-primary" : P.color)} />}
                          {a.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Giveaway */}
              <div className="rounded-xl border p-3 space-y-2.5">
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-sm font-medium flex items-center gap-1.5"><Gift className="w-4 h-4 text-primary" /> Run as giveaway</span>
                  <Switch checked={isGiveaway} onCheckedChange={setIsGiveaway} />
                </label>
                {isGiveaway && (
                  <>
                    <Input placeholder="Prize description (e.g. $100 gift card)" value={giveawayPrize} onChange={(e) => setGiveawayPrize(e.target.value)} className="h-8 text-sm" />
                    <p className="text-[11px] text-muted-foreground">Entrants are collected from post comments. Once published, open the post to sync comments and draw a winner.</p>
                  </>
                )}
              </div>

              {/* Schedule */}
              <div className="rounded-xl border p-3 space-y-2.5">
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-sm font-medium flex items-center gap-1.5"><Calendar className="w-4 h-4 text-primary" /> Schedule for later</span>
                  <Switch checked={scheduleEnabled} onCheckedChange={setScheduleEnabled} />
                </label>
                {scheduleEnabled && (
                  <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="h-8 text-sm" />
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button className="gap-1.5" disabled={busy} onClick={() => save(scheduleEnabled ? "schedule" : "now")}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : scheduleEnabled ? <Calendar className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                  {scheduleEnabled ? "Schedule" : "Post now"}
                </Button>
                <Button variant="outline" className="gap-1.5" disabled={busy} onClick={() => save("draft")}>Save draft</Button>
                {editingId && <Button variant="ghost" disabled={busy} onClick={resetComposer}>Cancel edit</Button>}
              </div>
            </CardContent>
          </Card>

          {/* ── Posts list ── */}
          <Card className="rounded-2xl">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm">Posts</CardTitle>
              <Tabs value={statusTab} onValueChange={setStatusTab} className="mt-2">
                <TabsList className="h-8">
                  {["all", "draft", "scheduled", "published"].map((s) => (
                    <TabsTrigger key={s} value={s} className="text-xs capitalize px-2.5">{s}</TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {isLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
              ) : posts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No posts here yet.</p>
              ) : posts.map((p) => (
                <PostRow key={p.id} post={p}
                  onEdit={() => loadDraft(p)}
                  onDelete={() => { if (confirm("Delete this post?")) deletePost.mutate(p.id); }}
                  onPublish={() => publishPost.mutate(p.id)}
                  onGiveaway={() => setGiveawayPostId(p.id)}
                  publishing={publishPost.isPending} />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <GiveawayDialog postId={giveawayPostId} onClose={() => setGiveawayPostId(null)} />
    </AppLayout>
  );
}

/* ── Post row ───────────────────────────────────────────────────────────────── */
function PostRow({ post, onEdit, onDelete, onPublish, onGiveaway, publishing }: {
  post: SocialPost; onEdit: () => void; onDelete: () => void; onPublish: () => void; onGiveaway: () => void; publishing: boolean;
}) {
  const sb = STATUS_BADGE[post.status] ?? STATUS_BADGE.draft!;
  const targets = post.targets ?? [];
  const results = post.results ?? [];
  const canEdit = post.status === "draft" || post.status === "scheduled";
  const canPublish = post.status === "draft" || post.status === "scheduled" || post.status === "failed" || post.status === "partial";
  return (
    <div className="rounded-xl border p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm whitespace-pre-wrap line-clamp-3 flex-1">{post.content || <span className="text-muted-foreground italic">No caption</span>}</p>
        <Badge variant={sb.variant} className="gap-1 shrink-0 text-[11px]"><sb.icon className={cn("w-3 h-3", post.status === "publishing" && "animate-spin")} />{sb.label}</Badge>
      </div>

      <div className="flex items-center flex-wrap gap-2 text-muted-foreground">
        {post.isGiveaway === "true" && <Badge variant="outline" className="gap-1 text-[10px]"><Gift className="w-3 h-3" /> Giveaway</Badge>}
        {(post.media?.length ?? 0) > 0 && <span className="text-[11px] flex items-center gap-1"><ImageIcon className="w-3 h-3" /> {post.media!.length}</span>}
        {targets.map((t, i) => {
          const P = PLATFORMS[t.platform]; return P ? <P.icon key={i} className={cn("w-3.5 h-3.5", P.color)} /> : null;
        })}
        {post.scheduledAt && post.status === "scheduled" && <span className="text-[11px] flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(post.scheduledAt).toLocaleString("en-AU")}</span>}
        {post.publishedAt && <span className="text-[11px]">{new Date(post.publishedAt).toLocaleString("en-AU")}</span>}
      </div>

      {results.some((r) => r.error) && (
        <div className="text-[11px] text-amber-600 space-y-0.5">
          {results.filter((r) => r.error).map((r, i) => <p key={i}>• {r.platform}: {r.error}</p>)}
        </div>
      )}

      <div className="flex items-center gap-1 pt-0.5">
        {canPublish && <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" disabled={publishing} onClick={onPublish}><Send className="w-3 h-3" /> {post.status === "draft" || post.status === "scheduled" ? "Post now" : "Retry"}</Button>}
        {canEdit && <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onEdit}><Pencil className="w-3 h-3" /> Edit</Button>}
        {post.isGiveaway === "true" && (post.status === "published" || post.status === "partial") && (
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-primary" onClick={onGiveaway}><Trophy className="w-3 h-3" /> Giveaway</Button>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto text-muted-foreground hover:text-destructive" onClick={onDelete}><Trash2 className="w-3.5 h-3.5" /></Button>
      </div>
    </div>
  );
}

/* ── Giveaway dialog ────────────────────────────────────────────────────────── */
function GiveawayDialog({ postId, onClose }: { postId: number | null; onClose: () => void }) {
  const { data, isLoading } = useGiveaway(postId);
  const syncGiveaway = useSyncGiveaway();
  const drawWinner = useDrawWinner();
  const entries = data?.entries ?? [];
  const winner = useMemo(() => entries.find((e) => e.isWinner === "true"), [entries]);

  return (
    <Dialog open={!!postId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base"><Gift className="w-4 h-4 text-primary" /> Giveaway</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : (
          <div className="space-y-4">
            {data?.post.giveawayPrize && <p className="text-sm"><span className="text-muted-foreground">Prize:</span> <strong>{data.post.giveawayPrize}</strong></p>}

            {winner && (
              <div className="rounded-xl border border-primary bg-primary/5 p-3 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-primary shrink-0" />
                <div><p className="text-xs text-muted-foreground">Winner</p><p className="font-semibold">{winner.name}</p></div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Entrants ({entries.length})</p>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" disabled={syncGiveaway.isPending} onClick={() => postId && syncGiveaway.mutate(postId)}>
                {syncGiveaway.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Sync comments
              </Button>
            </div>

            <div className="rounded-xl border divide-y max-h-60 overflow-y-auto">
              {entries.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No entrants yet — sync comments to collect them.</p>
              ) : entries.map((e) => (
                <div key={e.id} className={cn("px-3 py-2 text-sm flex items-center justify-between gap-2", e.isWinner === "true" && "bg-primary/5")}>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{e.name}{e.isWinner === "true" && <Trophy className="w-3 h-3 text-primary inline ml-1" />}</p>
                    {e.commentText && <p className="text-xs text-muted-foreground truncate">{e.commentText}</p>}
                  </div>
                  <span className="text-[10px] text-muted-foreground capitalize shrink-0">{e.platform}</span>
                </div>
              ))}
            </div>

            <Button className="w-full gap-1.5" disabled={drawWinner.isPending || entries.length === 0} onClick={() => postId && drawWinner.mutate(postId)}>
              {drawWinner.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />} {winner ? "Draw again" : "Draw winner"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* Convert an ISO timestamp to a value usable by <input type="datetime-local">. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}
