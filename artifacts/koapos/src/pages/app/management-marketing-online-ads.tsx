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
  CheckCircle2, Unlink, ShieldCheck, ChevronRight,
  Loader2, RefreshCw, Users, FileText, Bell,
} from "lucide-react";

const STORAGE_KEY = "koapos_social_connections";

function GoogleAdsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

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

const ADS_PLATFORM: Platform = {
  id: "google_ads",
  name: "Google Ads",
  tagline: "Campaigns, spend & conversions",
  icon: GoogleAdsIcon,
  brandColor: "#4285F4",
  brandBg: "bg-white border",
  brandBorder: "border-[#4285F4]/20",
  brandButton: "bg-white border border-border hover:bg-muted text-foreground",
  brandText: "text-[#4285F4]",
  scopes: [
    { icon: FileText, label: "View campaigns",        detail: "Read campaign performance and spend data" },
    { icon: Users,    label: "Manage budgets",        detail: "Pause, resume and adjust campaign budgets" },
    { icon: Bell,     label: "Access conversions",    detail: "Track conversion events and ROAS reporting" },
  ],
  mockAccount: { name: "Demo Ads Account", handle: "Customer ID: 123-456-7890", initials: "GA" },
};

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

export default function ManagementMarketingOnlineAdsPage() {
  const [connections, setConnections] = useState<SocialConnections>(() => loadConnections());
  const [oauthPlatform, setOauthPlatform] = useState<Platform | null>(null);
  const [authorizing, setAuthorizing] = useState(false);

  useEffect(() => { saveConnections(connections); }, [connections]);

  const isConnected = !!connections[ADS_PLATFORM.id]?.connected;

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
    toast.success(`${ADS_PLATFORM.name} disconnected`);
  };

  const isLightHeader = oauthPlatform?.brandBg.includes("bg-white");

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Google Ads Connection</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Connect your Google Ads account to enable campaign dashboards in Marketing &gt; Online Ads.
            </p>
          </div>
          {isConnected && (
            <Badge variant="secondary" className="gap-1.5 text-sm px-3 py-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Connected
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <PlatformCard
            platform={ADS_PLATFORM}
            conn={connections[ADS_PLATFORM.id]}
            onConnect={() => startOAuth(ADS_PLATFORM)}
            onReconnect={() => startOAuth(ADS_PLATFORM)}
            onDisconnect={() => handleDisconnect(ADS_PLATFORM.id)}
          />
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
