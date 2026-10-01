import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatPhoneForDisplay } from "@/lib/phone-format";
import { CARRIERS, carrierName, trackingUrl } from "@/lib/order-tracking";
import { useAuth } from "@/lib/use-auth";
import { Mail, PackageCheck, Truck, ExternalLink, Loader2, Search, Wrench, Settings2 } from "lucide-react";

/**
 * Online › Mail-In: repairs customers have posted (or are about to post) for
 * free diagnostics, from the shop's Mail-In page. A request is only a promise
 * of a parcel; "Received" is what books it in as a service job
 * (POST /mail-in/:id/receive), so parcels that never arrive never reach
 * Services. Rules are in the API's lib/mail-in.ts.
 */

type MailIn = {
  id: number; reference: string; status: "awaiting_postage" | "in_transit" | "received" | "cancelled";
  customerId: number | null; firstName: string; lastName: string | null; email: string; phone: string;
  street: string; suburb: string; state: string; postcode: string;
  deviceType: string; brandModel: string; serialNumber: string | null; fault: string; accessories: string | null;
  trackingCarrier: string | null; trackingNumber: string | null; trackingAddedAt: string | null;
  receivedAt: string | null; serviceJobId: number | null; serviceJobNumber: string | null;
  staffNotes: string | null; agreedAt: string; createdAt: string;
};
type Settings = { enabled: boolean; returnText: string; extraNotes: string };

const STATUS: Record<MailIn["status"], { label: string; tone: string }> = {
  awaiting_postage: { label: "Awaiting postage", tone: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  in_transit:       { label: "In transit",       tone: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300" },
  received:         { label: "Received",         tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  cancelled:        { label: "Cancelled",        tone: "bg-muted text-muted-foreground" },
};
const TABS = [
  { key: "open", label: "Open", match: (s: string) => s === "awaiting_postage" || s === "in_transit" },
  { key: "received", label: "Received", match: (s: string) => s === "received" },
  { key: "cancelled", label: "Cancelled", match: (s: string) => s === "cancelled" },
  { key: "all", label: "All", match: () => true },
] as const;

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

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }) : "—");
const fullName = (r: MailIn) => `${r.firstName} ${r.lastName ?? ""}`.trim();
const KEY = ["mail-in"];

export default function OnlineMailInPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const canManage = ["owner", "manager"].includes(user?.staffRole ?? "");
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("open");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const { data: rows, isLoading } = useQuery({ queryKey: KEY, queryFn: () => api<MailIn[]>("/mail-in"), refetchInterval: 60_000 });

  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.key, (rows ?? []).filter((r) => t.match(r.status)).length])), [rows]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const t = TABS.find((x) => x.key === tab)!;
    return (rows ?? []).filter((r) => t.match(r.status)).filter((r) => !needle || [
      r.reference, fullName(r), r.email, r.phone, r.brandModel, r.trackingNumber ?? "", r.serviceJobNumber ?? "",
    ].some((v) => v.toLowerCase().includes(needle)));
  }, [rows, tab, q]);
  const selected = rows?.find((r) => r.id === openId) ?? null;

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Mail className="w-6 h-6 text-primary" /> Mail-In Repairs</h1>
            <p className="text-sm text-muted-foreground mt-1">Devices customers are posting in for free diagnostics. Mark one Received when the parcel arrives to book it in as a service job.</p>
          </div>
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <a href="https://koastal.com.au/shop/mail-in" target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3.5 h-3.5" /> View shop page</a>
          </Button>
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-lg border overflow-hidden">
                {TABS.map((t) => (
                  <button key={t.key} onClick={() => setTab(t.key)}
                    className={cn("px-3 py-1.5 text-sm font-medium transition-colors", tab === t.key ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground")}>
                    {t.label} <span className="opacity-70 tabular-nums">({counts[t.key] ?? 0})</span>
                  </button>
                ))}
              </div>
              <div className="relative flex-1 min-w-[14rem]">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reference, name, device, tracking…" className="pl-8 h-9" noPhoneFormat />
              </div>
            </div>

            {isLoading ? (
              <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : shown.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">{(rows?.length ?? 0) === 0 ? "No mail-in requests yet. They appear here when a customer submits the form on the shop." : "Nothing matches."}</p>
            ) : (
              <div className="overflow-x-auto -mx-4">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="px-4 py-2 font-medium">Reference</th>
                      <th className="px-4 py-2 font-medium">Customer</th>
                      <th className="px-4 py-2 font-medium">Device</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Tracking</th>
                      <th className="px-4 py-2 font-medium">Submitted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {shown.map((r) => (
                      <tr key={r.id} onClick={() => setOpenId(r.id)} className="cursor-pointer hover:bg-muted/40">
                        <td className="px-4 py-2.5 font-medium tabular-nums">{r.reference}</td>
                        <td className="px-4 py-2.5">{fullName(r)}<span className="block text-xs text-muted-foreground">{formatPhoneForDisplay(r.phone)}</span></td>
                        <td className="px-4 py-2.5">{r.brandModel}<span className="block text-xs text-muted-foreground">{r.deviceType}</span></td>
                        <td className="px-4 py-2.5">
                          <span className={cn("text-xs rounded-full px-2 py-0.5 font-medium", STATUS[r.status]?.tone)}>{STATUS[r.status]?.label ?? r.status}</span>
                          {r.serviceJobNumber && <span className="block text-xs text-muted-foreground mt-0.5">Job {r.serviceJobNumber}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs">{r.trackingNumber ? <>{carrierName(r.trackingCarrier ?? "")}<span className="block font-mono">{r.trackingNumber}</span></> : <span className="text-muted-foreground">Not added</span>}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{when(r.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {canManage && <SettingsCard />}
      </div>

      {selected && <DetailDialog r={selected} onClose={() => setOpenId(null)} onChanged={() => void qc.invalidateQueries({ queryKey: KEY })} />}
    </AppLayout>
  );
}

function DetailDialog({ r, onClose, onChanged }: { r: MailIn; onClose: () => void; onChanged: () => void }) {
  const [notes, setNotes] = useState(r.staffNotes ?? "");
  const [carrier, setCarrier] = useState(r.trackingCarrier ?? "auspost");
  const [tracking, setTracking] = useState(r.trackingNumber ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmReceive, setConfirmReceive] = useState(false);
  const open = r.status === "awaiting_postage" || r.status === "in_transit";
  const link = r.trackingNumber && r.trackingCarrier ? trackingUrl(r.trackingCarrier, r.trackingNumber) : null;

  const run = async (label: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(label);
    try { await fn(); toast.success(ok); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };
  const patch = (body: object) => api(`/mail-in/${r.id}`, { method: "PATCH", body: JSON.stringify(body) });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {r.reference} · {r.brandModel}
            <span className={cn("text-xs rounded-full px-2 py-0.5 font-medium", STATUS[r.status]?.tone)}>{STATUS[r.status]?.label}</span>
          </DialogTitle>
          <DialogDescription>Submitted {when(r.createdAt)} · terms agreed {when(r.agreedAt)}</DialogDescription>
        </DialogHeader>

        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Customer</p>
            <p className="font-medium">{fullName(r)}</p>
            <p><a href={`mailto:${r.email}`} className="text-primary hover:underline">{r.email}</a></p>
            <p><a href={`tel:${r.phone}`} className="text-primary hover:underline">{formatPhoneForDisplay(r.phone)}</a></p>
            <p className="text-muted-foreground">{r.street}, {r.suburb} {r.state} {r.postcode}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Device</p>
            <p className="font-medium">{r.deviceType} — {r.brandModel}</p>
            {r.serialNumber && <p>Serial/IMEI: <span className="font-mono">{r.serialNumber}</span></p>}
            <p className="text-muted-foreground">In the parcel: {r.accessories || "device only"}</p>
          </div>
          <div className="sm:col-span-2 space-y-1">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Fault</p>
            <p className="whitespace-pre-line">{r.fault}</p>
          </div>
        </div>

        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-sm font-medium flex items-center gap-1.5"><Truck className="w-4 h-4" /> Inbound tracking</p>
          {r.trackingNumber && (
            <p className="text-sm">{carrierName(r.trackingCarrier ?? "")}: <span className="font-mono">{r.trackingNumber}</span>
              {link && <a href={link} target="_blank" rel="noopener noreferrer" className="ml-2 text-primary hover:underline inline-flex items-center gap-1">Track <ExternalLink className="w-3 h-3" /></a>}
              {r.trackingAddedAt && <span className="block text-xs text-muted-foreground">Added {when(r.trackingAddedAt)}</span>}
            </p>
          )}
          {open && (
            <div className="flex flex-wrap gap-2 items-end">
              <Select value={carrier} onValueChange={setCarrier}>
                <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{CARRIERS.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Tracking number" className="h-8 text-xs flex-1 min-w-[10rem]" noPhoneFormat />
              <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy !== null || tracking.trim() === (r.trackingNumber ?? "") && carrier === (r.trackingCarrier ?? "auspost")}
                onClick={() => void run("track", () => patch({ trackingCarrier: carrier, trackingNumber: tracking.trim() || null }), "Tracking saved")}>
                Save
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Staff notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Internal — copied onto the service job when it's received" />
          {notes !== (r.staffNotes ?? "") && (
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy !== null} onClick={() => void run("notes", () => patch({ staffNotes: notes }), "Notes saved")}>Save notes</Button>
          )}
        </div>

        {r.serviceJobId && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 p-3 text-sm flex items-center justify-between gap-2 flex-wrap">
            <span>Received {when(r.receivedAt)} — booked in as job <strong>{r.serviceJobNumber}</strong>.</span>
            <Button size="sm" asChild className="h-7 text-xs gap-1"><Link href={`/services/${r.serviceJobId}`}><Wrench className="w-3.5 h-3.5" /> Open job</Link></Button>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between flex-wrap">
          <div className="flex gap-2">
            {open && (
              <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void run("cancel", () => patch({ status: "cancelled" }), "Request cancelled")}>Cancel request</Button>
            )}
            {r.status === "cancelled" && (
              <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void run("reopen", () => patch({ status: r.trackingNumber ? "in_transit" : "awaiting_postage" }), "Request reopened")}>Reopen</Button>
            )}
          </div>
          {open && (confirmReceive ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Creates a service job for {fullName(r)}.</span>
              <Button size="sm" variant="ghost" onClick={() => setConfirmReceive(false)}>Back</Button>
              <Button size="sm" className="gap-1.5" disabled={busy !== null}
                onClick={() => void run("receive", () => api(`/mail-in/${r.id}/receive`, { method: "POST" }), "Received — service job created")}>
                {busy === "receive" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PackageCheck className="w-3.5 h-3.5" />} Confirm received
              </Button>
            </div>
          ) : (
            <Button size="sm" className="gap-1.5" onClick={() => setConfirmReceive(true)}><PackageCheck className="w-3.5 h-3.5" /> Parcel received</Button>
          ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingsCard() {
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { void api<Settings>("/mail-in/settings").then(setS).catch(() => {}); }, []);
  const save = async (patch: Partial<Settings>) => {
    setSaving(true);
    try { setS(await api<Settings>("/mail-in/settings", { method: "PUT", body: JSON.stringify(patch) })); toast.success("Mail-in settings saved"); }
    catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };
  if (!s) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Settings2 className="w-4 h-4" /> Mail-in page settings</CardTitle>
        <CardDescription>The address and operating hours come from Settings › Business Details. The packing guide and terms are fixed.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="flex items-center justify-between gap-4 lg:col-span-2">
          <div>
            <p className="text-sm font-medium">Accept mail-in requests</p>
            <p className="text-xs text-muted-foreground">When off, the shop page still shows the packing guide but not the form.</p>
          </div>
          <Switch checked={s.enabled} disabled={saving} onCheckedChange={(v) => void save({ enabled: v })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Returning your device</Label>
          <Textarea value={s.returnText} onChange={(e) => setS({ ...s, returnText: e.target.value })} rows={3} />
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={saving || !s.returnText.trim()} onClick={() => void save({ returnText: s.returnText })}>Save</Button>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Extra notes (optional)</Label>
          <Textarea value={s.extraNotes} onChange={(e) => setS({ ...s, extraNotes: e.target.value })} rows={3} placeholder="e.g. We're closed for holidays 24 Dec – 5 Jan" />
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={saving} onClick={() => void save({ extraNotes: s.extraNotes })}>Save</Button>
        </div>
      </CardContent>
    </Card>
  );
}
