import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  useGetSocialFeedSettings, useUpdateSocialFeedSettings,
} from "@workspace/api-client-react";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  Share2, CheckCircle2, XCircle, ExternalLink, RefreshCw, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Platform definition ─────────────────────────────────────────────────── */
interface PlatformDef {
  key: "showFacebook" | "showInstagram" | "showTwitter" | "showLinkedin";
  integrationKey: string;
  label: string;
  description: string;
  color: string;
  monogram: string;
}

const PLATFORMS: PlatformDef[] = [
  {
    key: "showFacebook",
    integrationKey: "meta_business",
    label: "Facebook",
    description: "Display posts from your Facebook Page feed.",
    color: "bg-[#1877F2]",
    monogram: "f",
  },
  {
    key: "showInstagram",
    integrationKey: "instagram_business",
    label: "Instagram",
    description: "Display images and reels from your Instagram Business account.",
    color: "bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#FCAF45]",
    monogram: "IG",
  },
  {
    key: "showTwitter",
    integrationKey: "twitter_x",
    label: "Twitter / X",
    description: "Display tweets and updates from your Twitter / X account.",
    color: "bg-black",
    monogram: "𝕏",
  },
  {
    key: "showLinkedin",
    integrationKey: "linkedin_business",
    label: "LinkedIn",
    description: "Display posts from your LinkedIn company page.",
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

  function togglePlatform(key: keyof typeof form) {
    setForm(f => ({ ...f, [key]: !f[key] }));
    setDirty(true);
  }

  function setInterval(val: string) {
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
              Configure which social channels appear on the Staff Social Feed dashboard.
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
              {updateSettings.isPending ? <RefreshCw size={14} className="animate-spin" /> : null}
              Save Changes
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Platform toggles */}
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
                const isEnabled = form[p.key] as boolean;
                return (
                  <div key={p.key}>
                    {idx > 0 && <Separator className="my-2" />}
                    <div className="flex items-center gap-3 py-1">
                      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0", p.color)}>
                        {p.monogram}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Label className="font-medium cursor-pointer" htmlFor={`toggle-${p.key}`}>
                          {p.label}
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                      </div>
                      <Switch
                        id={`toggle-${p.key}`}
                        checked={isEnabled}
                        onCheckedChange={() => togglePlatform(p.key)}
                      />
                    </div>
                  </div>
                );
              })}

              {/* link to integrations */}
              <div className="flex items-start gap-2 mt-4 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                <Info size={14} className="shrink-0 mt-0.5" />
                <span>
                  To connect a platform, go to{" "}
                  <Link href="/management/integrations" className="underline hover:text-foreground font-medium">
                    Integrations → Social Media & Marketing
                  </Link>
                  . Once connected, that platform's toggle will become active.
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Refresh interval */}
          <div className="space-y-6">
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
                    onValueChange={setInterval}
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

            {/* Info card */}
            <Card className="bg-muted/30 border-dashed">
              <CardContent className="pt-5 pb-4 space-y-2">
                <p className="text-sm font-medium">How it works</p>
                <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
                  <li>Posts are fetched read-only via your connected OAuth tokens.</li>
                  <li>No posts are published or modified from KoaPOS.</li>
                  <li>Token permissions are scoped to public feed reading only.</li>
                  <li>If a token expires, reconnect the integration to restore the feed.</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
