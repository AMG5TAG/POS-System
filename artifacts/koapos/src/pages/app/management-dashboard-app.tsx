import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListStaff } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LayoutDashboard, Copy, ExternalLink, Send, Mail, MessageSquare,
  Loader2, AlertTriangle, Globe,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Management > Staff & Operations > Apps > Dashboard
 *
 * Admin for the public, read-only Dashboard app (/b/:username/t/dashboard):
 * a shareable link (+ Send via email/SMS) and per-section visibility toggles.
 * The link requires no sign-in, so the toggles are the access control —
 * nothing is exposed unless it's switched on.
 */

type DashboardSettings = {
  enabled: boolean;
  showStatusTiles: boolean;
  showMetricTiles: boolean;
  showOverdueBanner: boolean;
  showNotifications: boolean;
  showServiceJobsPanel: boolean;
  showCalendar: boolean;
  showReferralRevenue: boolean;
};

const TOGGLES: { key: keyof DashboardSettings; title: string; desc: string }[] = [
  { key: "enabled",              title: "Share the Dashboard link",  desc: "Master switch — while off the link shows nothing. Anyone with the link can view the sections below; no sign-in is required." },
  { key: "showMetricTiles",      title: "Key metrics",               desc: "Today's sales, active jobs, pending invoices and upcoming appointments." },
  { key: "showStatusTiles",      title: "Service job status tiles",  desc: "Counts of in-progress, awaiting-customer, pending and critical jobs." },
  { key: "showOverdueBanner",    title: "Overdue jobs",              desc: "Jobs booked 7+ days ago that aren't completed or cancelled." },
  { key: "showServiceJobsPanel", title: "Active jobs list",          desc: "A live list of current service jobs." },
  { key: "showCalendar",         title: "Upcoming appointments",     desc: "Appointments scheduled over the next two weeks." },
  { key: "showNotifications",    title: "Notice board",              desc: "Sticky notes from the in-app dashboard. May contain internal notes — off by default." },
  { key: "showReferralRevenue",  title: "Top channels",              desc: "Where customers heard about you, by volume. Off by default." },
];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error((data as { error?: string } | null)?.error ?? `Request failed (${r.status})`);
  return data as T;
}

export default function ManagementDashboardAppPage() {
  const [link, setLink] = useState<{ username: string | null; url: string | null } | null>(null);
  const [settings, setSettings] = useState<DashboardSettings | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [sendMethod, setSendMethod] = useState<"email" | "sms">("email");
  const [sendTo, setSendTo] = useState("");
  const [sending, setSending] = useState(false);

  const { data: staffData } = useListStaff();
  const staff = Array.isArray(staffData) ? staffData : [];

  useEffect(() => {
    void api<{ username: string | null; url: string | null }>("/dashboard-app/link").then(setLink).catch(() => setLink({ username: null, url: null }));
    void api<DashboardSettings>("/dashboard-app/settings").then(setSettings).catch(() => toast.error("Failed to load Dashboard settings"));
  }, []);

  const updateSetting = async (key: keyof DashboardSettings, value: boolean) => {
    if (!settings) return;
    const prev = settings;
    setSettings({ ...settings, [key]: value });
    setSavingKey(key);
    try {
      const updated = await api<DashboardSettings>("/dashboard-app/settings", {
        method: "PUT",
        body: JSON.stringify({ [key]: value }),
      });
      setSettings(updated);
    } catch (e) {
      setSettings(prev);
      toast.error(e instanceof Error ? e.message : "Failed to save setting");
    } finally {
      setSavingKey(null);
    }
  };

  const copyLink = async () => {
    if (!link?.url) return;
    await navigator.clipboard.writeText(link.url);
    toast.success("Dashboard link copied");
  };

  const sendLink = async () => {
    if (!sendTo.trim() || sending) return;
    setSending(true);
    try {
      await api("/dashboard-app/send-link", {
        method: "POST",
        body: JSON.stringify({ method: sendMethod, to: sendTo.trim() }),
      });
      toast.success(`Dashboard link sent to ${sendTo.trim()}`);
      setSendTo("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send link");
    } finally {
      setSending(false);
    }
  };

  const pickStaff = (id: string) => {
    const member = staff.find((s) => String(s.id) === id);
    if (!member) return;
    const value = sendMethod === "email" ? member.email : member.phone;
    if (value) setSendTo(value);
    else toast.error(`${member.name} has no ${sendMethod === "email" ? "email address" : "phone number"} on file`);
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LayoutDashboard className="w-6 h-6 text-primary" />
            Dashboard App
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            A live, read-only view of your dashboard for a wall display or quick share — pick exactly what it shows.
          </p>
        </div>

        {/* ── Link + Send Link ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dashboard Link</CardTitle>
            <CardDescription>Open this address on any screen — no sign-in required. It only shows the sections enabled below.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {link && !link.url ? (
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Set a <strong>business username</strong> in Settings &gt; Account first — it forms the Dashboard address.</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-xs bg-muted rounded-lg px-3 py-2 break-all flex-1 min-w-[240px]">
                  {link?.url ?? "Loading…"}
                </code>
                <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => void copyLink()} disabled={!link?.url}>
                  <Copy className="w-3.5 h-3.5" /> Copy
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" asChild disabled={!link?.url}>
                  <a href={link?.url ?? "#"} target="_blank" rel="noreferrer">
                    <ExternalLink className="w-3.5 h-3.5" /> Open
                  </a>
                </Button>
              </div>
            )}

            {!settings?.enabled && (
              <div className="flex items-start gap-2.5 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                <Globe className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Sharing is currently <strong>off</strong>. Turn on “Share the Dashboard link” below to make the link live.</span>
              </div>
            )}

            {/* Send Link */}
            <div className="rounded-xl border p-4 space-y-3">
              <p className="text-sm font-semibold flex items-center gap-1.5"><Send className="w-4 h-4 text-primary" /> Send Link</p>
              <div className="flex gap-2 flex-wrap items-end">
                <div className="space-y-1.5">
                  <Label className="text-xs">Send via</Label>
                  <div className="flex rounded-lg border overflow-hidden">
                    {([["email", Mail, "Email"], ["sms", MessageSquare, "SMS"]] as const).map(([m, Icon, label]) => (
                      <button
                        key={m}
                        onClick={() => { setSendMethod(m); setSendTo(""); }}
                        className={cn(
                          "px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors",
                          sendMethod === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" /> {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5 flex-1 min-w-[180px]">
                  <Label className="text-xs">{sendMethod === "email" ? "Email address" : "Phone number"}</Label>
                  <Input
                    value={sendTo}
                    onChange={(e) => setSendTo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void sendLink(); }}
                    placeholder={sendMethod === "email" ? "name@example.com" : "04xx xxx xxx"}
                    type={sendMethod === "email" ? "email" : "tel"}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Quick-pick staff</Label>
                  <Select value="" onValueChange={pickStaff}>
                    <SelectTrigger className="h-8 text-xs w-44 bg-background">
                      <SelectValue placeholder="Choose staff…" />
                    </SelectTrigger>
                    <SelectContent>
                      {staff.filter((s) => s.isActive).map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => void sendLink()} disabled={!sendTo.trim() || sending || !link?.url}>
                  {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Send Link
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Visibility settings ──────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What's visible</CardTitle>
            <CardDescription>Choose exactly which sections appear on the shared link. Changes apply immediately.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {TOGGLES.map(({ key, title, desc }) => (
              <div key={key} className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {savingKey === key && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                  <Switch
                    checked={settings?.[key] ?? false}
                    onCheckedChange={(v) => void updateSetting(key, v)}
                    disabled={!settings || savingKey !== null}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
