import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useGetSocialFeedSettings, useUpdateSocialFeedSettings,
} from "@workspace/api-client-react";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  Share2, RefreshCw, ExternalLink, CheckCircle2,
  Plug, Unplug, Loader2, AlertCircle, KeyRound, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Integration shape (subset of what /api/integrations returns) ─────── */
interface IntegrationStatus {
  key: string;
  status: "connected" | "disconnected";
  accountHandle: string | null;
  disconnectedReason: string | null;
  oauthConfigured: boolean | null;
}

/* ── Platform definitions ────────────────────────────────────────────────── */
interface PlatformDef {
  toggleKey: "showFacebook" | "showInstagram" | "showTwitter" | "showLinkedin";
  integrationKey: string;
  label: string;
  feedDescription: string;
  connectDescription: string;
  color: string;
  monogram: string;
}

const PLATFORMS: PlatformDef[] = [
  {
    toggleKey: "showFacebook",
    integrationKey: "meta_business",
    label: "Facebook",
    feedDescription: "Display posts from your Facebook Page feed.",
    connectDescription: "Connect your Meta Business account to pull Facebook Page posts into the staff social feed.",
    color: "bg-[#1877F2]",
    monogram: "f",
  },
  {
    toggleKey: "showInstagram",
    integrationKey: "instagram_business",
    label: "Instagram",
    feedDescription: "Display images and reels from your Instagram Business account.",
    connectDescription: "Connect your Instagram Business account to display images and reels in the staff social feed.",
    color: "bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#FCAF45]",
    monogram: "IG",
  },
  {
    toggleKey: "showTwitter",
    integrationKey: "twitter_x",
    label: "Twitter / X",
    feedDescription: "Display tweets and updates from your Twitter / X account.",
    connectDescription: "Connect your Twitter / X account to show tweets and brand mentions in the staff social feed.",
    color: "bg-black",
    monogram: "𝕏",
  },
  {
    toggleKey: "showLinkedin",
    integrationKey: "linkedin_business",
    label: "LinkedIn",
    feedDescription: "Display posts from your LinkedIn company page.",
    connectDescription: "Connect your LinkedIn company page to surface professional updates in the staff social feed.",
    color: "bg-[#0A66C2]",
    monogram: "in",
  },
];

const REFRESH_OPTIONS = [
  { value: "15",  label: "Every 15 minutes" },
  { value: "30",  label: "Every 30 minutes" },
  { value: "60",  label: "Every hour" },
  { value: "120", label: "Every 2 hours" },
  { value: "360", label: "Every 6 hours" },
  { value: "720", label: "Every 12 hours" },
];

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function ManagementMarketingSocialFeedPage() {
  const { data: settings, isLoading: settingsLoading, refetch } = useGetSocialFeedSettings();
  const updateSettings = useUpdateSocialFeedSettings();

  const [form, setForm] = useState({
    showFacebook:           true,
    showInstagram:          true,
    showTwitter:            true,
    showLinkedin:           true,
    refreshIntervalMinutes: 60,
  });
  const [dirty, setDirty] = useState(false);

  /* integration connection state */
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [intgLoading, setIntgLoading]   = useState(true);
  const [disconnecting, setDisconnecting] = useState<Record<string, boolean>>({});

  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations", { credentials: "include" });
      if (res.ok) {
        const all: IntegrationStatus[] = await res.json();
        setIntegrations(all.filter(i =>
          PLATFORMS.some(p => p.integrationKey === i.key)
        ));
      }
    } finally {
      setIntgLoading(false);
    }
  }, []);

  useEffect(() => { fetchIntegrations(); }, [fetchIntegrations]);

  useEffect(() => {
    if (settings) {
      setForm({
        showFacebook:           settings.showFacebook,
        showInstagram:          settings.showInstagram,
        showTwitter:            settings.showTwitter,
        showLinkedin:           settings.showLinkedin,
        refreshIntervalMinutes: settings.refreshIntervalMinutes,
      });
    }
  }, [settings]);

  /* handle OAuth callback query params on return */
  useEffect(() => {
    const params  = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const error   = params.get("error");
    if (success) {
      const p = PLATFORMS.find(pl => pl.integrationKey === success);
      toast.success(`${p?.label ?? success} connected`);
      fetchIntegrations();
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (error) {
      if (error.endsWith("_oauth_not_configured")) toast.error("OAuth credentials not configured — contact your administrator.");
      else if (error.endsWith("_oauth_denied"))    toast.error("OAuth authorisation was cancelled.");
      else                                          toast.error("Failed to connect — please try again.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function togglePlatform(key: keyof typeof form) {
    setForm(f => ({ ...f, [key]: !f[key] }));
    setDirty(true);
  }

  function setRefresh(val: string) {
    setForm(f => ({ ...f, refreshIntervalMinutes: parseInt(val, 10) }));
    setDirty(true);
  }

  async function save() {
    try {
      await updateSettings.mutateAsync({ data: form });
      toast.success("Social Feed settings saved");
      setDirty(false);
      refetch();
    } catch {
      toast.error("Failed to save settings");
    }
  }

  function handleConnect(integrationKey: string) {
    window.location.href = `/api/integrations/oauth/${integrationKey}/start`;
  }

  async function handleDisconnect(p: PlatformDef) {
    if (!confirm(`Disconnect ${p.label}? Posts from this platform will no longer appear in the Social Feed.`)) return;
    setDisconnecting(d => ({ ...d, [p.integrationKey]: true }));
    try {
      await fetch(`/api/integrations/${p.integrationKey}`, { method: "DELETE", credentials: "include" });
      toast.success(`${p.label} disconnected`);
      fetchIntegrations();
    } catch {
      toast.error("Failed to disconnect");
    } finally {
      setDisconnecting(d => ({ ...d, [p.integrationKey]: false }));
    }
  }

  function getStatus(integrationKey: string): IntegrationStatus | undefined {
    return integrations.find(i => i.key === integrationKey);
  }

  if (settingsLoading) {
    return (
      <AppLayout>
        <div className="w-full px-4 py-6 flex items-center justify-center min-h-64">
          <RefreshCw size={20} className="animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="w-full px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Social Feed Settings</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Connect your social platforms and configure which channels appear on the Staff Social Feed.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/staff/social-feed">
                <ExternalLink size={14} />
                View Feed
              </Link>
            </Button>
            <Button onClick={save} disabled={!dirty || updateSettings.isPending} size="sm">
              {updateSettings.isPending && <RefreshCw size={14} className="animate-spin" />}
              Save Changes
            </Button>
          </div>
        </div>

        {/* ── Connected Accounts ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Plug size={16} />
              Connected Accounts
            </CardTitle>
            <CardDescription>
              Connect each social platform via OAuth. Posts are fetched read-only — nothing is published from KoaPOS.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-0 p-0">
            {PLATFORMS.map((p, idx) => {
              const status   = getStatus(p.integrationKey);
              const connected    = status?.status === "connected";
              const needsReauth  = !connected && !!status?.disconnectedReason;
              const notConfigured = status?.oauthConfigured === false && !connected;
              const busy = !!disconnecting[p.integrationKey];

              return (
                <div key={p.integrationKey}>
                  {idx > 0 && <Separator />}
                  <div className={cn(
                    "flex items-center gap-4 px-6 py-4 transition-colors",
                    connected && "bg-emerald-50/40 dark:bg-emerald-950/10",
                    needsReauth && "bg-amber-50/40 dark:bg-amber-950/10",
                  )}>
                    {/* Platform icon */}
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0",
                      p.color,
                    )}>
                      {p.monogram}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{p.label}</span>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900">
                          <ShieldCheck className="w-3 h-3" /> OAuth
                        </span>
                        {connected && (
                          <Badge className="gap-1 bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700 text-[11px] py-0">
                            <CheckCircle2 className="w-3 h-3" /> Connected
                          </Badge>
                        )}
                        {needsReauth && (
                          <Badge className="gap-1 bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700 text-[11px] py-0">
                            <KeyRound className="w-3 h-3" /> Needs reconnect
                          </Badge>
                        )}
                      </div>
                      {connected && status?.accountHandle ? (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5 font-medium truncate">
                          {status.accountHandle}
                        </p>
                      ) : needsReauth ? (
                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                          Token expired or revoked — reconnect to restore feed posts.
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {p.connectDescription}
                        </p>
                      )}
                      {notConfigured && (
                        <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          OAuth credentials not configured — contact your administrator.
                        </div>
                      )}
                    </div>

                    {/* Action */}
                    {intgLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
                    ) : connected ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/8 text-xs shrink-0"
                        onClick={() => handleDisconnect(p)}
                        disabled={busy}
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unplug className="w-3.5 h-3.5" />}
                        Disconnect
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className={cn("gap-1.5 shrink-0", needsReauth && "bg-amber-600 hover:bg-amber-700 text-white")}
                        onClick={() => handleConnect(p.integrationKey)}
                        disabled={notConfigured}
                      >
                        {needsReauth
                          ? <><RefreshCw className="w-3.5 h-3.5" /> Reconnect</>
                          : <><Plug className="w-3.5 h-3.5" /> Connect</>
                        }
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* ── Platform Visibility ── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Share2 size={16} />
                Platform Visibility
              </CardTitle>
              <CardDescription>
                Toggle which connected platforms are visible to staff on the Social Feed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {PLATFORMS.map((p, idx) => {
                const status    = getStatus(p.integrationKey);
                const connected = status?.status === "connected";
                const isEnabled = form[p.toggleKey] as boolean;
                return (
                  <div key={p.toggleKey}>
                    {idx > 0 && <Separator className="my-2" />}
                    <div className="flex items-center gap-3 py-1">
                      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0", p.color)}>
                        {p.monogram}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Label className="font-medium cursor-pointer" htmlFor={`toggle-${p.toggleKey}`}>
                            {p.label}
                          </Label>
                          {!connected && (
                            <span className="text-[10px] text-muted-foreground border rounded px-1.5 py-0.5">
                              Not connected
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{p.feedDescription}</p>
                      </div>
                      <Switch
                        id={`toggle-${p.toggleKey}`}
                        checked={isEnabled && connected}
                        onCheckedChange={() => togglePlatform(p.toggleKey)}
                        disabled={!connected}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* ── Right column ── */}
          <div className="space-y-6">

            {/* Refresh interval */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <RefreshCw size={16} />
                  Sync Interval
                </CardTitle>
                <CardDescription>
                  How often the Social Feed automatically refreshes posts from each platform.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Refresh every</Label>
                  <Select
                    value={String(form.refreshIntervalMinutes)}
                    onValueChange={setRefresh}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REFRESH_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Staff can also tap the Refresh button on the Social Feed at any time to fetch the latest posts immediately.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* How it works */}
            <Card className="bg-muted/30 border-dashed">
              <CardContent className="pt-5 pb-4 space-y-2">
                <p className="text-sm font-medium">How it works</p>
                <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
                  <li>Posts are fetched read-only via your connected OAuth tokens.</li>
                  <li>No posts are published or modified from KoaPOS.</li>
                  <li>Token permissions are scoped to public feed reading only.</li>
                  <li>If a token expires, tap Reconnect above to restore the feed.</li>
                </ul>
              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </AppLayout>
  );
}
