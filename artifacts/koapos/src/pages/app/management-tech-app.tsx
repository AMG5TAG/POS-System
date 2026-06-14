import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListStaff } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  TabletSmartphone, Copy, ExternalLink, Send, Mail, MessageSquare,
  Loader2, History, ShieldAlert, Eye, LogIn, LogOut, RefreshCw, AlertTriangle,
  StickyNote, Camera,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Management > Staff & Operations > Tech App
 *
 * Home for everything Tech App: the shareable link (+ Send Link via email or
 * SMS), behaviour settings enforced by the /api/tech endpoints, and the
 * per-user moderation trail of what technicians do in the app.
 */

type TechSettings = {
  enabled: boolean;
  showCustomerContact: boolean;
  showCredentials: boolean;
  allowStatusChange: boolean;
};

type TechEvent = {
  id: number;
  staffId: number | null;
  staffName: string;
  action: string;
  detail: string;
  createdAt: string;
};

const ACTION_META: Record<string, { label: string; icon: typeof Eye; className: string }> = {
  login:          { label: "Signed In",       icon: LogIn,       className: "bg-emerald-50 text-emerald-700 border-emerald-300" },
  logout:         { label: "Signed Out",      icon: LogOut,      className: "bg-slate-50 text-slate-600 border-slate-300" },
  job_view:       { label: "Viewed Job",      icon: Eye,         className: "bg-blue-50 text-blue-700 border-blue-300" },
  denied_foreign: { label: "Blocked Scan",    icon: ShieldAlert, className: "bg-red-50 text-red-700 border-red-300" },
  note_added:     { label: "Added Note",      icon: StickyNote,  className: "bg-amber-50 text-amber-700 border-amber-300" },
  photos_added:   { label: "Added Files",     icon: Camera,      className: "bg-violet-50 text-violet-700 border-violet-300" },
  status_changed: { label: "Changed Status",  icon: RefreshCw,   className: "bg-cyan-50 text-cyan-700 border-cyan-300" },
};

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

export default function ManagementTechAppPage() {
  /* ── Link ── */
  const [link, setLink] = useState<{ username: string | null; url: string | null } | null>(null);

  /* ── Settings ── */
  const [settings, setSettings] = useState<TechSettings | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  /* ── Send Link ── */
  const [sendMethod, setSendMethod] = useState<"email" | "sms">("email");
  const [sendTo, setSendTo] = useState("");
  const [sending, setSending] = useState(false);

  /* ── Activity ── */
  const [events, setEvents] = useState<TechEvent[] | null>(null);
  const [staffFilter, setStaffFilter] = useState("all");
  const [loadingEvents, setLoadingEvents] = useState(false);

  const { data: staffData } = useListStaff();
  const staff = Array.isArray(staffData) ? staffData : [];

  useEffect(() => {
    void api<{ username: string | null; url: string | null }>("/tech-app/link").then(setLink).catch(() => setLink({ username: null, url: null }));
    void api<TechSettings>("/tech-app/settings").then(setSettings).catch(() => toast.error("Failed to load Tech App settings"));
  }, []);

  const loadActivity = useCallback(async (filter: string) => {
    setLoadingEvents(true);
    try {
      const q = filter !== "all" ? `?staffId=${filter}` : "";
      const r = await api<{ items: TechEvent[] }>(`/tech-app/activity${q}`);
      setEvents(r.items);
    } catch {
      toast.error("Failed to load Tech App activity");
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  useEffect(() => { void loadActivity(staffFilter); }, [staffFilter, loadActivity]);

  const updateSetting = async (key: keyof TechSettings, value: boolean) => {
    if (!settings) return;
    const prev = settings;
    setSettings({ ...settings, [key]: value });
    setSavingKey(key);
    try {
      const updated = await api<TechSettings>("/tech-app/settings", {
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
    toast.success("Tech App link copied");
  };

  const sendLink = async () => {
    if (!sendTo.trim() || sending) return;
    setSending(true);
    try {
      await api("/tech-app/send-link", {
        method: "POST",
        body: JSON.stringify({ method: sendMethod, to: sendTo.trim() }),
      });
      toast.success(`Tech App link sent to ${sendTo.trim()}`);
      setSendTo("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send link");
    } finally {
      setSending(false);
    }
  };

  /* Quick-pick: choosing a staff member prefills their email/phone */
  const pickStaff = (id: string) => {
    const member = staff.find((s) => String(s.id) === id);
    if (!member) return;
    const value = sendMethod === "email" ? member.email : member.phone;
    if (value) setSendTo(value);
    else toast.error(`${member.name} has no ${sendMethod === "email" ? "email address" : "phone number"} on file`);
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TabletSmartphone className="w-6 h-6 text-primary" />
            Tech App
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            The mobile companion for technicians — share access, control what it shows, and review per-user activity.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          {/* ── Left column: Link + Settings ───────────────────────────── */}
          <div className="space-y-6">
        {/* ── Link + Send Link ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tech App Link</CardTitle>
            <CardDescription>Technicians open this address on their phone and sign in with their staff PIN.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {link && !link.url ? (
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Set a <strong>business username</strong> in Settings &gt; Account first — it forms the Tech App address.</span>
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
                    placeholder={sendMethod === "email" ? "tech@example.com" : "04xx xxx xxx"}
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

        {/* ── Settings ─────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Settings</CardTitle>
            <CardDescription>Control what technicians can access in the Tech App. Changes apply immediately.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {([
              ["enabled", "Enable Tech App", "Master switch — turning this off signs out all technicians and blocks new sign-ins."],
              ["showCustomerContact", "Show customer contact details", "Display the customer's phone number and email on job details."],
              ["showCredentials", "Show device logins & accounts", "Display device PINs/passwords and account details on job details."],
              ["allowStatusChange", "Allow changing job status", "Let technicians update a job's status from the Tech App. Status changes are logged and send the same customer SMS notifications as the main app."],
            ] as const).map(([key, title, desc]) => (
              <div key={key} className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {savingKey === key && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                  <Switch
                    checked={settings?.[key] ?? true}
                    onCheckedChange={(v) => void updateSetting(key, v)}
                    disabled={!settings || savingKey !== null}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
          </div>

        {/* ── Right column: Activity / moderation ──────────────────────── */}
        <Card className="h-full flex flex-col">
          <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-1.5"><History className="w-4 h-4" /> User Activity</CardTitle>
              <CardDescription>Everything each technician has done in the Tech App — most recent first.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={staffFilter} onValueChange={setStaffFilter}>
                <SelectTrigger className="h-8 text-xs w-44 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => void loadActivity(staffFilter)} aria-label="Refresh activity">
                <RefreshCw className={cn("w-3.5 h-3.5", loadingEvents && "animate-spin")} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            {events == null ? (
              <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto" /></div>
            ) : events.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {staffFilter === "all"
                  ? "No Tech App activity yet — events appear here as technicians sign in and view jobs."
                  : "No Tech App activity for this user yet."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground uppercase tracking-wide">
                      <th className="text-left py-2 pr-3 font-medium">When</th>
                      <th className="text-left py-2 pr-3 font-medium">User</th>
                      <th className="text-left py-2 pr-3 font-medium">Action</th>
                      <th className="text-left py-2 font-medium">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => {
                      const meta = ACTION_META[e.action] ?? { label: e.action, icon: Eye, className: "bg-slate-50 text-slate-600 border-slate-300" };
                      const Icon = meta.icon;
                      return (
                        <tr key={e.id} className="border-b last:border-0">
                          <td className="py-2.5 pr-3 whitespace-nowrap text-muted-foreground text-xs">
                            {new Date(e.createdAt).toLocaleString("en-AU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className="py-2.5 pr-3 font-medium whitespace-nowrap">{e.staffName || "—"}</td>
                          <td className="py-2.5 pr-3">
                            <Badge variant="outline" className={cn("gap-1 text-[11px] font-medium", meta.className)}>
                              <Icon className="w-3 h-3" /> {meta.label}
                            </Badge>
                          </td>
                          <td className="py-2.5 text-muted-foreground">{e.detail}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      </div>
    </AppLayout>
  );
}
