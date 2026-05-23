import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Facebook, Instagram, Twitter, Linkedin, Youtube,
  CheckCircle2, Unlink, ShieldCheck, ChevronRight,
  Loader2, RefreshCw, Users, FileText, Bell,
} from "lucide-react";

const STORAGE_KEY = "koapos_social_connections";

interface SocialConnection {
  connected: boolean;
  accountName: string;
  accountHandle: string;
  avatarInitials: string;
  connectedAt: string;
  scopes: string[];
}

interface SocialConnections {
  [platform: string]: SocialConnection;
}

interface Platform {
  id: string;
  name: string;
  tagline: string;
  icon: React.ComponentType<{ className?: string }>;
  brandColor: string;
  brandBg: string;
  brandBorder: string;
  brandButton: string;
  brandButtonHover: string;
  brandText: string;
  features: string[];
  scopes: { icon: React.ComponentType<{ className?: string }>; label: string; detail: string }[];
  mockAccount: { name: string; handle: string; initials: string };
  oauthUrl: string;
}

const PLATFORMS: Platform[] = [
  {
    id: "facebook",
    name: "Facebook",
    tagline: "Post to Pages, Groups & Timeline",
    icon: Facebook,
    brandColor: "#1877F2",
    brandBg: "bg-[#1877F2]",
    brandBorder: "border-[#1877F2]/20",
    brandButton: "bg-[#1877F2] hover:bg-[#0d65d9] text-white",
    brandButtonHover: "",
    brandText: "text-[#1877F2]",
    features: ["Pages", "Groups", "Timeline"],
    scopes: [
      { icon: FileText, label: "Manage your Pages",        detail: "Create, edit and publish posts on your Pages" },
      { icon: Users,    label: "Access your Groups",       detail: "Post to Groups you admin" },
      { icon: Bell,     label: "Publish to your Timeline", detail: "Share posts on your personal profile" },
    ],
    mockAccount: { name: "Demo Business", handle: "fb.com/demobusiness", initials: "DB" },
    oauthUrl: "https://www.facebook.com/v19.0/dialog/oauth",
  },
  {
    id: "instagram",
    name: "Instagram",
    tagline: "Post photos, Stories & Reels",
    icon: Instagram,
    brandColor: "#E1306C",
    brandBg: "bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045]",
    brandBorder: "border-pink-200",
    brandButton: "bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045] text-white hover:opacity-90",
    brandButtonHover: "",
    brandText: "text-pink-600",
    features: ["Feed Posts", "Stories", "Reels"],
    scopes: [
      { icon: FileText, label: "Create media",          detail: "Publish photos and videos to your feed" },
      { icon: Bell,     label: "Manage Stories",        detail: "Create and publish Stories and Reels" },
      { icon: Users,    label: "Access Business data",  detail: "Read follower insights and engagement metrics" },
    ],
    mockAccount: { name: "Demo Shop", handle: "@demo_shop", initials: "DS" },
    oauthUrl: "https://api.instagram.com/oauth/authorize",
  },
  {
    id: "twitter",
    name: "X / Twitter",
    tagline: "Post tweets, threads & replies",
    icon: Twitter,
    brandColor: "#000000",
    brandBg: "bg-black",
    brandBorder: "border-neutral-300",
    brandButton: "bg-black hover:bg-neutral-800 text-white dark:bg-white dark:text-black dark:hover:bg-neutral-200",
    brandButtonHover: "",
    brandText: "text-black dark:text-white",
    features: ["Tweets", "Threads", "Replies"],
    scopes: [
      { icon: FileText, label: "Post and delete Tweets",   detail: "Create, schedule and delete posts" },
      { icon: Users,    label: "Follow and unfollow",      detail: "Manage follows on your behalf" },
      { icon: Bell,     label: "Read your timeline",       detail: "Access your home timeline and mentions" },
    ],
    mockAccount: { name: "DemoStore", handle: "@demostore_au", initials: "D" },
    oauthUrl: "https://twitter.com/i/oauth2/authorize",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    tagline: "Share to Company Pages & profile",
    icon: Linkedin,
    brandColor: "#0A66C2",
    brandBg: "bg-[#0A66C2]",
    brandBorder: "border-[#0A66C2]/20",
    brandButton: "bg-[#0A66C2] hover:bg-[#084f96] text-white",
    brandButtonHover: "",
    brandText: "text-[#0A66C2]",
    features: ["Company Pages", "Profile Updates"],
    scopes: [
      { icon: FileText, label: "Share on your behalf",    detail: "Create and manage posts on your profile" },
      { icon: Users,    label: "Manage Company Pages",    detail: "Post to Pages where you are an admin" },
      { icon: Bell,     label: "Access analytics",        detail: "Read engagement and follower data" },
    ],
    mockAccount: { name: "Demo Pty Ltd", handle: "linkedin.com/company/demo", initials: "DL" },
    oauthUrl: "https://www.linkedin.com/oauth/v2/authorization",
  },
  {
    id: "youtube",
    name: "YouTube",
    tagline: "Post Community updates & Shorts",
    icon: Youtube,
    brandColor: "#FF0000",
    brandBg: "bg-[#FF0000]",
    brandBorder: "border-red-200",
    brandButton: "bg-[#FF0000] hover:bg-[#cc0000] text-white",
    brandButtonHover: "",
    brandText: "text-red-600",
    features: ["Community Posts", "Shorts"],
    scopes: [
      { icon: FileText, label: "Manage your channel",    detail: "Upload videos and create community posts" },
      { icon: Users,    label: "Access subscribers",     detail: "View your subscriber list and engagement" },
      { icon: Bell,     label: "Read analytics",         detail: "Access channel performance and metrics" },
    ],
    mockAccount: { name: "Demo Channel", handle: "youtube.com/@demochannel", initials: "YT" },
    oauthUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  },
];

function loadConnections(): SocialConnections {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveConnections(c: SocialConnections) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
}

export default function ManagementMarketingSocialPage() {
  const [connections, setConnections] = useState<SocialConnections>(() => loadConnections());
  const [oauthPlatform, setOauthPlatform] = useState<string | null>(null);
  const [authorizing, setAuthorizing] = useState(false);

  useEffect(() => { saveConnections(connections); }, [connections]);

  const activePlatform = PLATFORMS.find((p) => p.id === oauthPlatform);
  const connectedCount = Object.values(connections).filter((c) => c.connected).length;

  const startOAuth = (platformId: string) => {
    setOauthPlatform(platformId);
  };

  const authorizeOAuth = () => {
    if (!activePlatform) return;
    setAuthorizing(true);
    setTimeout(() => {
      const conn: SocialConnection = {
        connected:     true,
        accountName:   activePlatform.mockAccount.name,
        accountHandle: activePlatform.mockAccount.handle,
        avatarInitials:activePlatform.mockAccount.initials,
        connectedAt:   new Date().toISOString(),
        scopes:        activePlatform.scopes.map((s) => s.label),
      };
      setConnections((prev) => ({ ...prev, [activePlatform.id]: conn }));
      setAuthorizing(false);
      setOauthPlatform(null);
      toast.success(`${activePlatform.name} connected successfully`);
    }, 1800);
  };

  const handleDisconnect = (platformId: string) => {
    setConnections((prev) => {
      const next = { ...prev };
      delete next[platformId];
      return next;
    });
    const platform = PLATFORMS.find((p) => p.id === platformId);
    toast.success(`${platform?.name} disconnected`);
  };

  const handleReconnect = (platformId: string) => {
    startOAuth(platformId);
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Social Media Connections</h1>
            <p className="text-muted-foreground mt-1">
              Connect your social accounts to enable posting and giveaway tracking from KoaPOS.
            </p>
          </div>
          {connectedCount > 0 && (
            <Badge variant="secondary" className="gap-1.5 text-sm px-3 py-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              {connectedCount} platform{connectedCount !== 1 ? "s" : ""} connected
            </Badge>
          )}
        </div>

        {/* Platform grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {PLATFORMS.map((platform) => {
            const conn        = connections[platform.id];
            const isConnected = !!conn?.connected;
            const Icon        = platform.icon;

            return (
              <Card
                key={platform.id}
                className={cn(
                  "border-2 transition-all",
                  isConnected ? `border-emerald-200 dark:border-emerald-800` : "border-border"
                )}
              >
                <CardContent className="pt-5 pb-5 space-y-4">
                  {/* Platform identity */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={cn("rounded-xl p-2.5 shrink-0", platform.brandBg)}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{platform.name}</p>
                        <p className="text-xs text-muted-foreground">{platform.tagline}</p>
                      </div>
                    </div>
                    {isConnected ? (
                      <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 gap-1 shrink-0">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Connected
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] shrink-0">Not connected</Badge>
                    )}
                  </div>

                  {/* Connected state */}
                  {isConnected && conn ? (
                    <div className="rounded-xl bg-muted/40 border px-4 py-3 flex items-center gap-3">
                      <Avatar className="w-9 h-9 shrink-0">
                        <AvatarFallback className="text-xs font-semibold">{conn.avatarInitials}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{conn.accountName}</p>
                        <p className="text-xs text-muted-foreground truncate">{conn.accountHandle}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Connected {new Date(conn.connectedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Button
                          size="sm" variant="ghost"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                          title="Reconnect"
                          onClick={() => handleReconnect(platform.id)}
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          title="Disconnect"
                          onClick={() => handleDisconnect(platform.id)}
                        >
                          <Unlink className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* OAuth connect button */
                    <button
                      onClick={() => startOAuth(platform.id)}
                      className={cn(
                        "w-full flex items-center justify-center gap-2.5 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all",
                        platform.brandButton
                      )}
                    >
                      <Icon className="w-4 h-4" />
                      Continue with {platform.name}
                      <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-70" />
                    </button>
                  )}

                  {/* Feature badges */}
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {platform.features.map((f) => (
                      <Badge key={f} variant="secondary" className="text-xs">{f}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* OAuth consent dialog */}
      <Dialog open={!!oauthPlatform} onOpenChange={(o) => { if (!o && !authorizing) setOauthPlatform(null); }}>
        <DialogContent className="max-w-sm p-0 overflow-hidden gap-0">
          {activePlatform && (
            <>
              {/* Platform header */}
              <div className={cn("flex flex-col items-center gap-3 pt-8 pb-6 px-6", activePlatform.brandBg)}>
                <activePlatform.icon className="w-10 h-10 text-white" />
                <div className="text-center">
                  <p className="text-white font-bold text-lg">{activePlatform.name}</p>
                  <p className="text-white/80 text-xs mt-0.5">wants to connect to KoaPOS</p>
                </div>
              </div>

              {/* Permission list */}
              <div className="px-6 pt-5 pb-2 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  KoaPOS will be able to:
                </p>
                {activePlatform.scopes.map(({ icon: ScopeIcon, label, detail }) => (
                  <div key={label} className="flex gap-3 py-2">
                    <div className="rounded-lg bg-muted p-1.5 shrink-0 h-fit">
                      <ScopeIcon className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{detail}</p>
                    </div>
                  </div>
                ))}
              </div>

              <Separator className="mt-3" />

              {/* Security note */}
              <div className="flex gap-2 px-6 py-3 bg-muted/30">
                <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  You can revoke access at any time from your {activePlatform.name} account settings.
                </p>
              </div>

              <Separator />

              {/* CTA */}
              <div className="px-6 py-4 flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={authorizing}
                  onClick={() => setOauthPlatform(null)}
                >
                  Cancel
                </Button>
                <button
                  disabled={authorizing}
                  onClick={authorizeOAuth}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-all",
                    activePlatform.brandButton,
                    authorizing && "opacity-80 cursor-not-allowed"
                  )}
                >
                  {authorizing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Connecting…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Authorise
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
