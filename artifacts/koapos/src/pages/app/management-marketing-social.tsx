import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Facebook, Instagram, Twitter, Linkedin, Youtube,
  CheckCircle2, AlertCircle, Link2, Unlink, ExternalLink,
  Eye, EyeOff, Info,
} from "lucide-react";

const STORAGE_KEY = "koapos_social_connections";

interface PlatformConnection {
  connected: boolean;
  accountName?: string;
  connectedAt?: string;
  credentials: Record<string, string>;
}

interface SocialConnections {
  [platform: string]: PlatformConnection;
}

const PLATFORMS = [
  {
    id: "facebook",
    name: "Facebook",
    icon: Facebook,
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    border: "border-blue-200 dark:border-blue-800",
    description: "Post to Pages, Groups, and your personal Timeline.",
    docsUrl: "https://developers.facebook.com/docs/pages/publishing/",
    features: ["Pages", "Groups", "Timeline"],
    fields: [
      { key: "appId",       label: "App ID",          placeholder: "123456789012345",   type: "text" },
      { key: "appSecret",   label: "App Secret",      placeholder: "abc123…",           type: "password" },
      { key: "accessToken", label: "Page Access Token",placeholder: "EAABs…",           type: "password" },
      { key: "pageId",      label: "Page ID (optional)",placeholder: "e.g. 987654321",  type: "text" },
    ],
  },
  {
    id: "instagram",
    name: "Instagram",
    icon: Instagram,
    color: "text-pink-600",
    bg: "bg-pink-50 dark:bg-pink-950/30",
    border: "border-pink-200 dark:border-pink-800",
    description: "Post photos and videos to your Instagram Business account.",
    docsUrl: "https://developers.facebook.com/docs/instagram-api/",
    features: ["Feed Posts", "Stories", "Reels"],
    fields: [
      { key: "accessToken",  label: "Access Token",  placeholder: "IGQVJXb…",          type: "password" },
      { key: "igUserId",     label: "Instagram User ID", placeholder: "17841400…",     type: "text" },
    ],
  },
  {
    id: "twitter",
    name: "X / Twitter",
    icon: Twitter,
    color: "text-sky-500",
    bg: "bg-sky-50 dark:bg-sky-950/30",
    border: "border-sky-200 dark:border-sky-800",
    description: "Post tweets to your X (Twitter) account and business profile.",
    docsUrl: "https://developer.twitter.com/en/docs/twitter-api",
    features: ["Tweets", "Replies", "Threads"],
    fields: [
      { key: "apiKey",       label: "API Key",        placeholder: "abc123…",          type: "password" },
      { key: "apiSecret",    label: "API Key Secret", placeholder: "xyz789…",          type: "password" },
      { key: "accessToken",  label: "Access Token",   placeholder: "999999-abc…",      type: "password" },
      { key: "accessSecret", label: "Access Token Secret", placeholder: "xyz…",        type: "password" },
    ],
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    icon: Linkedin,
    color: "text-blue-700",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    border: "border-blue-200 dark:border-blue-800",
    description: "Share updates to your LinkedIn Company Page or personal profile.",
    docsUrl: "https://learn.microsoft.com/en-us/linkedin/marketing/",
    features: ["Company Pages", "Profile Updates"],
    fields: [
      { key: "accessToken", label: "Access Token",  placeholder: "AQX…",              type: "password" },
      { key: "orgId",       label: "Organization ID (optional)", placeholder: "123456", type: "text" },
    ],
  },
  {
    id: "youtube",
    name: "YouTube",
    icon: Youtube,
    color: "text-red-600",
    bg: "bg-red-50 dark:bg-red-950/30",
    border: "border-red-200 dark:border-red-800",
    description: "Post community updates and shorts to your YouTube channel.",
    docsUrl: "https://developers.google.com/youtube/v3/",
    features: ["Community Posts", "Shorts"],
    fields: [
      { key: "apiKey",        label: "API Key",       placeholder: "AIzaSy…",         type: "password" },
      { key: "channelId",     label: "Channel ID",    placeholder: "UCxxxxx…",         type: "text" },
      { key: "refreshToken",  label: "Refresh Token", placeholder: "1//0eE…",          type: "password" },
    ],
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
  const [dialogPlatform, setDialogPlatform] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  useEffect(() => { saveConnections(connections); }, [connections]);

  const activePlatform = PLATFORMS.find((p) => p.id === dialogPlatform);

  const openConnect = (platformId: string) => {
    const existing = connections[platformId]?.credentials ?? {};
    setFormValues(existing);
    setShowSecrets({});
    setDialogPlatform(platformId);
  };

  const handleSave = () => {
    if (!activePlatform) return;
    const required = activePlatform.fields.filter((f) => !f.key.includes("optional") && !f.label.includes("optional"));
    const missing = required.filter((f) => !formValues[f.key]?.trim());
    if (missing.length) { toast.error(`Please fill in: ${missing.map((f) => f.label).join(", ")}`); return; }

    const updated: SocialConnections = {
      ...connections,
      [activePlatform.id]: {
        connected:   true,
        accountName: formValues.pageId || formValues.igUserId || formValues.channelId || formValues.orgId || activePlatform.name,
        connectedAt: new Date().toISOString(),
        credentials: { ...formValues },
      },
    };
    setConnections(updated);
    setDialogPlatform(null);
    toast.success(`${activePlatform.name} connected`);
  };

  const handleDisconnect = (platformId: string) => {
    const { [platformId]: _, ...rest } = connections;
    setConnections(rest);
    const platform = PLATFORMS.find((p) => p.id === platformId);
    toast.success(`${platform?.name} disconnected`);
  };

  const connectedCount = Object.values(connections).filter((c) => c.connected).length;

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
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

        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 p-4 flex gap-3">
          <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 dark:text-amber-300 space-y-1">
            <p className="font-medium">API credentials required</p>
            <p>Each platform requires API credentials from their developer portals. Credentials are stored locally on this device. Click the docs link on each platform for setup instructions.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {PLATFORMS.map((platform) => {
            const conn = connections[platform.id];
            const isConnected = conn?.connected;
            const Icon = platform.icon;
            return (
              <Card key={platform.id} className={cn("border-2", isConnected ? platform.border : "border-border")}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={cn("rounded-xl p-2.5", platform.bg)}>
                        <Icon className={cn("w-5 h-5", platform.color)} />
                      </div>
                      <div>
                        <CardTitle className="text-base">{platform.name}</CardTitle>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {isConnected ? (
                            <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 gap-1">
                              <CheckCircle2 className="w-2.5 h-2.5" /> Connected
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] gap-1">
                              <AlertCircle className="w-2.5 h-2.5" /> Not connected
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <a href={platform.docsUrl} target="_blank" rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground transition-colors">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{platform.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {platform.features.map((f) => (
                      <Badge key={f} variant="secondary" className="text-xs">{f}</Badge>
                    ))}
                  </div>
                  {isConnected && conn.connectedAt && (
                    <p className="text-xs text-muted-foreground">
                      Connected {new Date(conn.connectedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                      {conn.accountName && conn.accountName !== platform.name ? ` · ID: ${conn.accountName}` : ""}
                    </p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant={isConnected ? "outline" : "default"}
                      className="gap-1.5"
                      onClick={() => openConnect(platform.id)}
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      {isConnected ? "Update Credentials" : "Connect"}
                    </Button>
                    {isConnected && (
                      <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => handleDisconnect(platform.id)}>
                        <Unlink className="w-3.5 h-3.5" /> Disconnect
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Dialog open={!!dialogPlatform} onOpenChange={(o) => { if (!o) setDialogPlatform(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {activePlatform && (
                  <>
                    <activePlatform.icon className={cn("w-4 h-4", activePlatform.color)} />
                    Connect {activePlatform.name}
                  </>
                )}
              </DialogTitle>
            </DialogHeader>
            {activePlatform && (
              <div className="space-y-4 py-1">
                <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                  Get your credentials from the{" "}
                  <a href={activePlatform.docsUrl} target="_blank" rel="noopener noreferrer"
                    className="text-primary underline underline-offset-2">
                    {activePlatform.name} developer portal
                  </a>
                  . Credentials are stored locally on this device only.
                </div>
                <Separator />
                {activePlatform.fields.map((field) => (
                  <div key={field.key} className="space-y-1.5">
                    <Label>{field.label}</Label>
                    <div className="relative">
                      <Input
                        type={field.type === "password" && !showSecrets[field.key] ? "password" : "text"}
                        value={formValues[field.key] ?? ""}
                        onChange={(e) => setFormValues((p) => ({ ...p, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                        className={field.type === "password" ? "pr-9" : ""}
                      />
                      {field.type === "password" && (
                        <button
                          type="button"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => setShowSecrets((p) => ({ ...p, [field.key]: !p[field.key] }))}
                        >
                          {showSecrets[field.key] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex gap-2 justify-end pt-2">
                  <Button variant="outline" onClick={() => setDialogPlatform(null)}>Cancel</Button>
                  <Button onClick={handleSave}>Save & Connect</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
