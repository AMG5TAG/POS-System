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
  brandText: string;
  scopes: { icon: React.ComponentType<{ className?: string }>; label: string; detail: string }[];
  mockAccount: { name: string; handle: string; initials: string };
}

const SOCIAL_PLATFORMS: Platform[] = [
  {
    id: "facebook",
    name: "Facebook",
    tagline: "Pages, Groups & Timeline",
    icon: Facebook,
    brandColor: "#1877F2",
    brandBg: "bg-[#1877F2]",
    brandBorder: "border-[#1877F2]/20",
    brandButton: "bg-[#1877F2] hover:bg-[#0d65d9] text-white",
    brandText: "text-[#1877F2]",
    scopes: [
      { icon: FileText, label: "Manage your Pages",        detail: "Create, edit and publish posts on your Pages" },
      { icon: Users,    label: "Access your Groups",       detail: "Post to Groups you admin" },
      { icon: Bell,     label: "Publish to your Timeline", detail: "Share posts on your personal profile" },
    ],
    mockAccount: { name: "Demo Business", handle: "fb.com/demobusiness", initials: "DB" },
  },
  {
    id: "instagram",
    name: "Instagram",
    tagline: "Feed, Stories & Reels",
    icon: Instagram,
    brandColor: "#E1306C",
    brandBg: "bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045]",
    brandBorder: "border-pink-200",
    brandButton: "bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045] text-white hover:opacity-90",
    brandText: "text-pink-600",
    scopes: [
      { icon: FileText, label: "Create media",          detail: "Publish photos and videos to your feed" },
      { icon: Bell,     label: "Manage Stories",        detail: "Create and publish Stories and Reels" },
      { icon: Users,    label: "Access Business data",  detail: "Read follower insights and engagement metrics" },
    ],
    mockAccount: { name: "Demo Shop", handle: "@demo_shop", initials: "DS" },
  },
  {
    id: "twitter",
    name: "X / Twitter",
    tagline: "Tweets, threads & replies",
    icon: Twitter,
    brandColor: "#000000",
    brandBg: "bg-black",
    brandBorder: "border-neutral-300",
    brandButton: "bg-black hover:bg-neutral-800 text-white dark:bg-white dark:text-black dark:hover:bg-neutral-200",
    brandText: "text-black dark:text-white",
    scopes: [
      { icon: FileText, label: "Post and delete Tweets",   detail: "Create, schedule and delete posts" },
      { icon: Users,    label: "Follow and unfollow",      detail: "Manage follows on your behalf" },
      { icon: Bell,     label: "Read your timeline",       detail: "Access your home timeline and mentions" },
    ],
    mockAccount: { name: "DemoStore", handle: "@demostore_au", initials: "D" },
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    tagline: "Company Pages & profile",
    icon: Linkedin,
    brandColor: "#0A66C2",
    brandBg: "bg-[#0A66C2]",
    brandBorder: "border-[#0A66C2]/20",
    brandButton: "bg-[#0A66C2] hover:bg-[#084f96] text-white",
    brandText: "text-[#0A66C2]",
    scopes: [
      { icon: FileText, label: "Share on your behalf",    detail: "Create and manage posts on your profile" },
      { icon: Users,    label: "Manage Company Pages",    detail: "Post to Pages where you are an admin" },
      { icon: Bell,     label: "Access analytics",        detail: "Read engagement and follower data" },
    ],
    mockAccount: { name: "Demo Pty Ltd", handle: "linkedin.com/company/demo", initials: "DL" },
  },
  {
    id: "youtube",
    name: "YouTube",
    tagline: "Community Posts & Shorts",
    icon: Youtube,
    brandColor: "#FF0000",
    brandBg: "bg-[#FF0000]",
    brandBorder: "border-red-200",
    brandButton: "bg-[#FF0000] hover:bg-[#cc0000] text-white",
    brandText: "text-red-600",
    scopes: [
      { icon: FileText, label: "Manage your channel",    detail: "Upload videos and create community posts" },
      { icon: Users,    label: "Access subscribers",     detail: "View your subscriber list and engagement" },
      { icon: Bell,     label: "Read analytics",         detail: "Access channel performance and metrics" },
    ],
    mockAccount: { name: "Demo Channel", handle: "youtube.com/@demochannel", initials: "YT" },
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

function PlatformCard({
  platform, conn, onConnect, onReconnect, onDisconnect,
}: {
  platform: Platform;
  conn?: SocialConnection;
  onConnect: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
}) {
  const isConnected = !!conn?.connected;
  const Icon = platform.icon;

  return (
    <Card
      className={cn(
        "border transition-all",
        isConnected ? "border-emerald-200 dark:border-emerald-800" : "border-border"
      )}
    >
      <CardContent className="p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={cn("rounded-lg p-1.5 shrink-0", platform.brandBg)}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{platform.name}</p>
              <p className="text-[11px] text-muted-foreground truncate">{platform.tagline}</p>
            </div>
          </div>
          {isConnected ? (
            <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 gap-1 shrink-0 h-5 px-1.5">
              <CheckCircle2 className="w-2.5 h-2.5" /> Connected
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px] shrink-0 h-5 px-1.5">Not connected</Badge>
          )}
        </div>

        {isConnected && conn ? (
          <div className="flex items-center gap-2 rounded-lg bg-muted/40 border px-3 py-2">
            <Avatar className="w-7 h-7 shrink-0">
              <AvatarFallback className="text-[10px] font-semibold">{conn.avatarInitials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium truncate">{conn.accountName}</p>
                <p className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {new Date(conn.connectedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">{conn.accountHandle}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button
                size="icon" variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                title="Reconnect"
                onClick={onReconnect}
              >
                <RefreshCw className="w-3 h-3" />
              </Button>
              <Button
                size="icon" variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                title="Disconnect"
                onClick={onDisconnect}
              >
                <Unlink className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={onConnect}
            className={cn(
              "w-full flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-all",
              platform.brandButton
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            Continue with {platform.name}
            <ChevronRight className="w-3 h-3 ml-auto opacity-60" />
          </button>
        )}
      </CardContent>
    </Card>
  );
}

export default function ManagementMarketingSocialsPage() {
  const [connections, setConnections] = useState<SocialConnections>(() => loadConnections());
  const [oauthPlatform, setOauthPlatform] = useState<Platform | null>(null);
  const [authorizing, setAuthorizing] = useState(false);

  useEffect(() => { saveConnections(connections); }, [connections]);

  const connectedCount = SOCIAL_PLATFORMS.filter((p) => connections[p.id]?.connected).length;

  const startOAuth = (platform: Platform) => setOauthPlatform(platform);

  const authorizeOAuth = () => {
    if (!oauthPlatform) return;
    setAuthorizing(true);
    setTimeout(() => {
      const conn: SocialConnection = {
        connected:      true,
        accountName:    oauthPlatform.mockAccount.name,
        accountHandle:  oauthPlatform.mockAccount.handle,
        avatarInitials: oauthPlatform.mockAccount.initials,
        connectedAt:    new Date().toISOString(),
        scopes:         oauthPlatform.scopes.map((s) => s.label),
      };
      setConnections((prev) => ({ ...prev, [oauthPlatform.id]: conn }));
      setAuthorizing(false);
      setOauthPlatform(null);
      toast.success(`${oauthPlatform.name} connected successfully`);
    }, 1800);
  };

  const handleDisconnect = (platformId: string) => {
    setConnections((prev) => {
      const next = { ...prev };
      delete next[platformId];
      return next;
    });
    const platform = SOCIAL_PLATFORMS.find((p) => p.id === platformId);
    toast.success(`${platform?.name} disconnected`);
  };

  const isLightHeader = oauthPlatform?.brandBg.includes("bg-white");

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Social Media Connections</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Connect social accounts to enable posting and giveaway tracking from KoaPOS.
            </p>
          </div>
          {connectedCount > 0 && (
            <Badge variant="secondary" className="gap-1.5 text-sm px-3 py-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              {connectedCount} connected
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SOCIAL_PLATFORMS.map((p) => (
            <PlatformCard
              key={p.id}
              platform={p}
              conn={connections[p.id]}
              onConnect={() => startOAuth(p)}
              onReconnect={() => startOAuth(p)}
              onDisconnect={() => handleDisconnect(p.id)}
            />
          ))}
        </div>
      </div>

      <Dialog open={!!oauthPlatform} onOpenChange={(o) => { if (!o && !authorizing) setOauthPlatform(null); }}>
        <DialogContent className="max-w-sm p-0 overflow-hidden gap-0">
          {oauthPlatform && (
            <>
              <div className={cn("flex flex-col items-center gap-3 pt-8 pb-6 px-6", oauthPlatform.brandBg)}>
                <oauthPlatform.icon className="w-10 h-10" />
                <div className="text-center">
                  <p className={cn("font-bold text-lg", isLightHeader ? "text-foreground" : "text-white")}>
                    {oauthPlatform.name}
                  </p>
                  <p className={cn("text-xs mt-0.5", isLightHeader ? "text-muted-foreground" : "text-white/80")}>
                    wants to connect to KoaPOS
                  </p>
                </div>
              </div>

              <div className="px-6 pt-5 pb-2 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  KoaPOS will be able to:
                </p>
                {oauthPlatform.scopes.map(({ icon: ScopeIcon, label, detail }) => (
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

              <div className="flex gap-2 px-6 py-3 bg-muted/30">
                <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  You can revoke access at any time from your {oauthPlatform.name} account settings.
                </p>
              </div>

              <Separator />

              <div className="px-6 py-4 flex gap-3">
                <Button variant="outline" className="flex-1" disabled={authorizing} onClick={() => setOauthPlatform(null)}>
                  Cancel
                </Button>
                <button
                  disabled={authorizing}
                  onClick={authorizeOAuth}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-all",
                    oauthPlatform.brandButton,
                    authorizing && "opacity-80 cursor-not-allowed"
                  )}
                >
                  {authorizing ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting…</>
                  ) : (
                    <><CheckCircle2 className="w-3.5 h-3.5" /> Authorise</>
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
