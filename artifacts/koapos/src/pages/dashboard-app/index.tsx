import { useState, useEffect, useCallback } from "react";
import { useRoute } from "wouter";
import {
  LayoutDashboard, Loader2, RefreshCw, AlertTriangle, Clock, AlertCircle,
  Wrench, CalendarClock, FileText, StickyNote, TrendingUp,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { setHomeScreenApp } from "@/lib/home-screen";

/**
 * Public, read-only Dashboard app — served at /b/:businessUsername/t/dashboard.
 *
 * Bare layout (no app nav / search), no sign-in. It renders only the sections
 * the merchant has enabled, from the public snapshot endpoint, and refreshes
 * itself periodically so it works as a wall display.
 */

interface Snapshot {
  businessName: string;
  logoUrl: string | null;
  generatedAt: string;
  widgets: Record<string, boolean>;
  data: {
    statusTiles?: { inProgress: number; awaitingCustomer: number; pending: number; critical: number; totalActive: number };
    metricTiles?: { todaySales: number; pendingInvoices: number; activeJobs: number; upcomingAppointments: number };
    overdueJobs?: { jobNumber: string; title: string; customerName: string | null; since: string }[];
    serviceJobs?: { jobNumber: string; title: string; status: string; customerName: string | null }[];
    notifications?: { text: string; isCritical: boolean }[];
    calendar?: { title: string; scheduledAt: string; customerName: string | null }[];
    referralChannels?: { channel: string; count: number }[];
  };
}

const STATUS_LABEL: Record<string, string> = {
  "pending": "Pending",
  "in-progress": "In Progress",
  "awaiting-customer": "Awaiting Customer",
  "ready": "Ready",
  "completed": "Completed",
};

function Card({ title, icon: Icon, children, className }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border bg-card p-5 ${className ?? ""}`}>
      <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-primary" /> {title}
      </h2>
      {children}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-xl border bg-background px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${accent ?? ""}`}>{value}</p>
    </div>
  );
}

export default function DashboardAppPage() {
  const [, params] = useRoute("/b/:businessUsername/t/dashboard");
  const username = params?.businessUsername ?? "";

  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "disabled" | "notfound" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (initial = false) => {
    if (!username) return;
    if (!initial) setRefreshing(true);
    try {
      const r = await fetch(`/api/public/b/${encodeURIComponent(username)}/dashboard`);
      if (r.status === 403) { setStatus("disabled"); return; }
      if (r.status === 404) { setStatus("notfound"); return; }
      if (!r.ok) { setStatus("error"); return; }
      setSnap(await r.json());
      setStatus("ok");
    } catch {
      setStatus("error");
    } finally {
      setRefreshing(false);
    }
  }, [username]);

  useEffect(() => { void load(true); }, [load]);

  /* Brand the home-screen icon for this business's Dashboard. */
  useEffect(() => {
    if (snap) setHomeScreenApp({ name: `${snap.businessName} Dashboard`, iconUrl: snap.logoUrl });
  }, [snap]);

  // Auto-refresh every 60s so a pinned display stays current.
  useEffect(() => {
    if (status !== "ok") return;
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [status, load]);

  if (status === "loading") {
    return <div className="min-h-screen grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (status !== "ok" || !snap) {
    const msg = status === "disabled"
      ? "This dashboard isn't being shared right now."
      : status === "notfound"
        ? "Dashboard not found."
        : "Couldn't load the dashboard. Please try again.";
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="text-center max-w-sm">
          <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">{msg}</p>
        </div>
      </div>
    );
  }

  const w = snap.widgets;
  const d = snap.data;

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background/95 backdrop-blur px-5 py-3">
        {snap.logoUrl
          ? <img src={snap.logoUrl} alt="" className="w-8 h-8 rounded-md object-cover" />
          : <LayoutDashboard className="w-7 h-7 text-primary" />}
        <div className="min-w-0">
          <h1 className="text-base font-bold truncate">{snap.businessName}</h1>
          <p className="text-[11px] text-muted-foreground">Live dashboard</p>
        </div>
        <button
          onClick={() => void load()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Updated {new Date(snap.generatedAt).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}
        </button>
      </header>

      <main className="max-w-6xl mx-auto p-4 md:p-6 space-y-5">
        {/* Metric tiles */}
        {w.metricTiles && d.metricTiles && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat label="Today's Sales" value={formatCurrency(d.metricTiles.todaySales)} accent="text-emerald-600" />
            <Stat label="Active Jobs" value={d.metricTiles.activeJobs} />
            <Stat label="Pending Invoices" value={d.metricTiles.pendingInvoices} />
            <Stat label="Upcoming Appts (14d)" value={d.metricTiles.upcomingAppointments} />
          </div>
        )}

        {/* Status tiles */}
        {w.statusTiles && d.statusTiles && (
          <Card title="Service Jobs" icon={Wrench}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="In Progress" value={d.statusTiles.inProgress} />
              <Stat label="Awaiting Customer" value={d.statusTiles.awaitingCustomer} />
              <Stat label="Pending" value={d.statusTiles.pending} />
              <Stat label="Critical" value={d.statusTiles.critical} accent={d.statusTiles.critical > 0 ? "text-red-600" : undefined} />
            </div>
          </Card>
        )}

        {/* Overdue jobs */}
        {w.overdueBanner && d.overdueJobs && d.overdueJobs.length > 0 && (
          <Card title="Overdue Jobs" icon={AlertCircle} className="border-amber-300 bg-amber-50/50 dark:bg-amber-900/10">
            <ul className="divide-y">
              {d.overdueJobs.map((j) => (
                <li key={j.jobNumber} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="truncate"><span className="font-medium">#{j.jobNumber}</span> {j.title}{j.customerName ? ` — ${j.customerName}` : ""}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">since {new Date(j.since).toLocaleDateString("en-AU", { day: "2-digit", month: "short" })}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="grid lg:grid-cols-2 gap-5">
          {/* Active jobs list */}
          {w.serviceJobs && d.serviceJobs && (
            <Card title="Active Jobs" icon={Wrench}>
              {d.serviceJobs.length === 0
                ? <p className="text-sm text-muted-foreground py-4 text-center">No active jobs.</p>
                : (
                  <ul className="divide-y max-h-[420px] overflow-auto">
                    {d.serviceJobs.map((j) => (
                      <li key={j.jobNumber} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <span className="truncate"><span className="font-medium">#{j.jobNumber}</span> {j.title}{j.customerName ? ` — ${j.customerName}` : ""}</span>
                        <span className="text-[11px] rounded-full border px-2 py-0.5 text-muted-foreground whitespace-nowrap">{STATUS_LABEL[j.status] ?? j.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
            </Card>
          )}

          {/* Upcoming appointments */}
          {w.calendar && d.calendar && (
            <Card title="Upcoming Appointments" icon={CalendarClock}>
              {d.calendar.length === 0
                ? <p className="text-sm text-muted-foreground py-4 text-center">Nothing scheduled in the next two weeks.</p>
                : (
                  <ul className="divide-y max-h-[420px] overflow-auto">
                    {d.calendar.map((a, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <span className="truncate">{a.title}{a.customerName ? ` — ${a.customerName}` : ""}</span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(a.scheduledAt).toLocaleString("en-AU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
            </Card>
          )}

          {/* Notice board */}
          {w.notifications && d.notifications && d.notifications.length > 0 && (
            <Card title="Notice Board" icon={StickyNote}>
              <ul className="space-y-2">
                {d.notifications.map((n, i) => (
                  <li key={i} className={`rounded-lg border px-3 py-2 text-sm ${n.isCritical ? "border-red-300 bg-red-50 dark:bg-red-900/10 text-red-800 dark:text-red-300" : "bg-background"}`}>
                    {n.text}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Top channels */}
          {w.referralRevenue && d.referralChannels && d.referralChannels.length > 0 && (
            <Card title="Top Channels" icon={TrendingUp}>
              <ul className="space-y-1.5">
                {d.referralChannels.map((c) => (
                  <li key={c.channel} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{c.channel}</span>
                    <span className="text-xs font-medium text-muted-foreground">{c.count}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <p className="text-center text-[11px] text-muted-foreground pt-2 flex items-center justify-center gap-1.5">
          <FileText className="w-3 h-3" /> Read-only view · refreshes automatically
        </p>
      </main>
    </div>
  );
}
