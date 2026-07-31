import { useListServiceJobs, useListAppointments, useGetDashboardSummary, useGetDashboardKpi, type ServiceJob } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { AlertTriangle, Timer, Hourglass, CircleDot, CalendarDays, FileText, Truck, Receipt, Clock, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

// ─── helpers ──────────────────────────────────────────────────────────────────

function daysAgo(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function statusLabel(status: string): string {
  switch (status) {
    case "pending": return "Pending";
    case "in-progress": return "In Progress";
    case "awaiting-parts": return "Awaiting Parts";
    case "awaiting-stock": return "Awaiting Stock";
    case "at-repairer": return "At Repairer";
    case "awaiting-partner-approval": return "Awaiting Partner Approval";
    case "partner-replacement": return "Partner Replacement";
    case "awaiting-customer": return "Awaiting Customer";
    case "awaiting-pickup": return "Completed - Awaiting Pickup";
    case "completed": return "Completed";
    case "cancelled": return "Cancelled";
    default: return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

function statusColor(status: string) {
  switch (status) {
    case "pending": return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "in-progress": return "bg-blue-100 text-blue-700 border-blue-200";
    case "awaiting-parts": return "bg-rose-100 text-rose-700 border-rose-200";
    case "awaiting-stock": return "bg-purple-100 text-purple-700 border-purple-200";
    case "at-repairer": return "bg-yellow-50 text-yellow-700 border-yellow-300";
    case "awaiting-partner-approval": return "bg-indigo-100 text-indigo-700 border-indigo-200";
    case "partner-replacement": return "bg-teal-100 text-teal-700 border-teal-200";
    case "awaiting-customer": return "bg-orange-100 text-orange-700 border-orange-200";
    case "awaiting-pickup": return "bg-lime-100 text-lime-700 border-lime-200";
    case "completed": return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "cancelled": return "bg-gray-100 text-gray-500 border-gray-200";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

// ─── Colored status tiles (row 1) ─────────────────────────────────────────────

interface StatusTileProps {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  bg: string;
  iconColor: string;
  valueColor: string;
  dot?: boolean;
}

function StatusTile({ icon, value, label, bg, iconColor, valueColor, dot }: StatusTileProps) {
  return (
    <div className={cn("rounded-2xl p-5 flex flex-col items-center justify-center gap-1 min-h-[110px]", bg)}>
      <span className={cn("text-2xl mb-1", iconColor)}>{icon}</span>
      <div className="flex items-center gap-1.5">
        <span className={cn("text-3xl font-bold tabular-nums", valueColor)}>{value}</span>
        {dot && <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />}
      </div>
      {/* Tiles use light pastel backgrounds with no dark variant, so pin the label
          to a dark colour — otherwise it inherits white in dark mode and vanishes. */}
      <span className="text-[11px] font-semibold tracking-wider text-center uppercase text-gray-700">{label}</span>
    </div>
  );
}

// ─── Metric tiles (row 2) ────────────────────────────────────────────────────

interface MetricTileProps {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  iconColor: string;
  valueColor: string;
  sub?: React.ReactNode;
}

function MetricTile({ icon, value, label, iconColor, valueColor, sub, href }: MetricTileProps & { href?: string }) {
  const [, navigate] = useLocation();
  const clickable = !!href;
  const Wrapper = clickable ? "button" : "div";
  return (
    <Wrapper
      onClick={clickable ? () => {
        if (href === "/online/deliveries") {
          sessionStorage.setItem("koapos_deliveries_preselect", "new");
        }
        navigate(href);
      } : undefined}
      className={cn(
        "rounded-2xl border bg-card p-5 flex flex-col items-center justify-center gap-1 min-h-[100px] w-full",
        clickable && "cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all"
      )}
    >
      <span className={cn("text-xl mb-0.5", iconColor)}>{icon}</span>
      <span className={cn("text-3xl font-bold tabular-nums", valueColor)}>{value}</span>
      <span className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">{label}</span>
      {sub && <div className="mt-0.5">{sub}</div>}
    </Wrapper>
  );
}

// ─── Overdue banner ──────────────────────────────────────────────────────────

function OverdueBanner({ jobs }: { jobs: ServiceJob[] }) {
  const overdue = jobs.filter(
    (j) => !["completed", "cancelled"].includes(j.status as string) && daysAgo(j.bookInDate) >= 7
  );
  if (overdue.length === 0) return null;

  return (
    <div className="rounded-2xl bg-orange-50 border border-orange-200 px-5 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0" />
        <span className="text-sm font-semibold text-orange-800">
          {overdue.length} Repair{overdue.length !== 1 ? "s" : ""} Overdue (7+ Days Since Book-In)
        </span>
      </div>
      <div className="space-y-2">
        {overdue.map((job) => (
          <div key={job.id} className="flex items-center gap-3 text-sm">
            <span className="font-mono text-orange-700 font-medium min-w-[90px]">{job.jobNumber}</span>
            <Badge variant="outline" className={cn("text-xs", statusColor(job.status as string))}>
              {statusLabel(job.status as string)}
            </Badge>
            <span className="flex-1" />
            <span className="text-orange-600 text-xs">{daysAgo(job.bookInDate)} days ago</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── KPI Dashboard Tile ──────────────────────────────────────────────────── */

type KpiMeta = { label: string; isCurrency: boolean; isInverse?: boolean };
const KPI_META: Record<string, KpiMeta> = {
  revenue:               { label: "Revenue",          isCurrency: true  },
  transactions:          { label: "Transactions",     isCurrency: false },
  avg_transaction:       { label: "Avg Transaction",  isCurrency: true  },
  items_per_transaction: { label: "Items / Txn",      isCurrency: false },
  new_customers:         { label: "New Customers",    isCurrency: false },
  loyalty_signups:       { label: "Loyalty Signups",  isCurrency: false },
  category_revenue:      { label: "Category Revenue", isCurrency: true  },
  appointments:          { label: "Appointments",     isCurrency: false },
  services:              { label: "Services",         isCurrency: false },
  refund_rate:           { label: "Refund Rate",      isCurrency: false, isInverse: true },
  gross_margin:          { label: "Gross Margin",     isCurrency: false },
  upsell_rate:           { label: "Upsell Rate",      isCurrency: false },
  net_profit:            { label: "Net Profit",       isCurrency: true  },
};

function formatKpiValue(metric: string, value: number): string {
  const m = KPI_META[metric];
  if (!m) return String(value);
  if (m.isCurrency) return formatCurrency(value);
  if (metric === "refund_rate" || metric === "gross_margin" || metric === "upsell_rate") return `${value}%`;
  return value.toLocaleString("en-AU");
}

function KpiDashboardTile({ href }: { href?: string }) {
  const { data: result } = useGetDashboardKpi({ query: { queryKey: ["dashboard-kpi"], staleTime: 60_000, refetchInterval: 120_000 } });
  const [, navigate] = useLocation();

  if (!result?.kpi) {
    return (
      <div
        onClick={() => navigate("/management/staff-operations/kpis-targets")}
        className="rounded-2xl border border-dashed bg-card p-5 flex flex-col items-center justify-center gap-1 min-h-[100px] w-full cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all"
      >
        <Target className="w-5 h-5 text-muted-foreground/50" />
        <span className="text-xs text-muted-foreground text-center leading-snug">No KPI set<br /><span className="text-primary">Set up</span></span>
      </div>
    );
  }

  const { kpi, actual } = result;
  const meta = KPI_META[kpi.metric] ?? { label: kpi.name, isCurrency: false };
  const target = kpi.target;
  const pctRaw = actual !== null && target > 0 ? (actual / target) * 100 : null;
  const pct = pctRaw !== null ? Math.min(pctRaw, 100) : null;

  // For inverse metrics (refund_rate), lower actual = better
  const isInverse = meta.isInverse ?? false;
  const effectivePct = pct !== null ? (isInverse ? 100 - pct : pct) : null;

  const statusColor = effectivePct === null
    ? { bg: "bg-card", border: "border", value: "text-foreground", badge: "", bar: "bg-muted-foreground/40" }
    : effectivePct >= 100
    ? { bg: "bg-green-50 dark:bg-green-950/30", border: "border-green-200 dark:border-green-800", value: "text-green-700 dark:text-green-400", badge: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300", bar: "bg-green-500" }
    : effectivePct >= 70
    ? { bg: "bg-yellow-50 dark:bg-yellow-950/30", border: "border-yellow-200 dark:border-yellow-800", value: "text-yellow-700 dark:text-yellow-400", badge: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300", bar: "bg-yellow-500" }
    : { bg: "bg-red-50 dark:bg-red-950/30", border: "border-red-200 dark:border-red-800", value: "text-red-700 dark:text-red-400", badge: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300", bar: "bg-red-500" };

  return (
    <div
      onClick={() => navigate(href ?? "/management/staff-operations/kpis-targets")}
      className={cn("rounded-2xl border p-4 flex flex-col gap-1.5 min-h-[100px] w-full cursor-pointer hover:shadow-sm transition-all", statusColor.bg, statusColor.border)}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">{kpi.name}</span>
        <Target className={cn("w-3.5 h-3.5 shrink-0", statusColor.value)} />
      </div>
      <span className={cn("text-2xl font-bold tabular-nums leading-none", statusColor.value)}>
        {actual !== null ? formatKpiValue(kpi.metric, actual) : "—"}
      </span>
      <span className="text-[10px] text-muted-foreground">
        Target: {formatKpiValue(kpi.metric, target)}
      </span>
      {/* Progress bar */}
      {pct !== null && (
        <div className="mt-auto pt-1">
          <div className="h-1 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
            <div className={cn("h-full rounded-full transition-all", statusColor.bar)} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          <span className={cn("text-[10px] font-medium mt-0.5 block", statusColor.value)}>
            {Math.round(isInverse ? 100 - pct : pct)}% of target
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Main export ────────────────────────────────────────────────────────────── */

export function ServiceJobsTiles({
  showStatusTiles = true,
  showMetricTiles = true,
  showOverdueBanner = true,
}: {
  showStatusTiles?: boolean;
  showMetricTiles?: boolean;
  showOverdueBanner?: boolean;
}) {
  const { data: jobsData } = useListServiceJobs({ query: { queryKey: ["service-jobs-dash"] } });
  const { data: appointmentsData } = useListAppointments(undefined, { query: { queryKey: ["appts-dash"] } });
  const { data: todaySummary } = useGetDashboardSummary({ period: "today" }, { query: { queryKey: ["dashboard-summary-today"] } });

  const jobs = jobsData ?? [];

  const inProgress = jobs.filter((j) => !["completed", "partner-replacement", "cancelled"].includes(j.status as string)).length;
  const awaitingCustomer = jobs.filter((j) => (j.status as string) === "awaiting-customer").length;
  const pending = jobs.filter((j) => (j.status as string) === "pending").length;
  const critical = jobs.filter((j) => j.isCritical).length;

  const now = new Date();
  const upcomingAppts = (appointmentsData ?? []).filter(
    (a) => new Date(a.scheduledAt) > now && a.status !== "cancelled" && a.status !== "completed"
  ).length;

  const todaySales = todaySummary?.totalSales ?? 0;

  return (
    <div className="space-y-4">
      {/* Row 1: Service job status tiles */}
      {showStatusTiles && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatusTile
            icon={<Timer className="w-6 h-6" />}
            value={inProgress}
            label="In Progress"
            bg="bg-blue-50 border border-blue-100"
            iconColor="text-blue-500"
            valueColor="text-blue-700"
          />
          <StatusTile
            icon={<Hourglass className="w-6 h-6" />}
            value={awaitingCustomer}
            label="Awaiting Customer"
            bg="bg-orange-50 border border-orange-100"
            iconColor="text-orange-500"
            valueColor="text-orange-700"
          />
          <StatusTile
            icon={<CircleDot className="w-6 h-6" />}
            value={pending}
            label="Pending"
            bg="bg-yellow-50 border border-yellow-100"
            iconColor="text-yellow-500"
            valueColor="text-yellow-700"
          />
          <StatusTile
            icon={<AlertTriangle className="w-6 h-6" />}
            value={critical}
            label="Critical"
            bg="bg-red-50 border border-red-100"
            iconColor="text-red-500"
            valueColor="text-red-700"
            dot={critical > 0}
          />
          <StatusTile
            icon={<CalendarDays className="w-6 h-6" />}
            value={upcomingAppts}
            label="Upcoming Appts"
            bg="bg-violet-50 border border-violet-100"
            iconColor="text-violet-500"
            valueColor="text-violet-700"
          />
        </div>
      )}

      {/* Row 2: Business metric tiles */}
      {showMetricTiles && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <MetricTile
            icon={<FileText className="w-5 h-5" />}
            value={jobs.filter((j) => !["completed", "cancelled"].includes(j.status as string)).length}
            label="Total Jobs"
            iconColor="text-blue-500"
            valueColor="text-foreground"
          />
          <MetricTile
            icon={<Receipt className="w-5 h-5" />}
            value={todaySummary?.pendingInvoiceCount ?? 0}
            label="Invoices"
            iconColor="text-amber-500"
            valueColor="text-amber-700"
            href="/pos/invoices"
          />
          <MetricTile
            icon={<Truck className="w-5 h-5" />}
            value={0}
            label="Pending Deliveries"
            iconColor="text-teal-500"
            valueColor="text-foreground"
            href="/online/deliveries"
          />
          <KpiDashboardTile />
          <MetricTile
            icon={<Clock className="w-5 h-5" />}
            value={formatCurrency(todaySales)}
            label="Today Sales"
            iconColor="text-emerald-500"
            valueColor="text-emerald-700"
          />
        </div>
      )}

      {/* Overdue banner */}
      {showOverdueBanner && <OverdueBanner jobs={jobs} />}
    </div>
  );
}
