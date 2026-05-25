import { useListServiceJobs, useListCustomers, useListAppointments, ServiceJob } from "@workspace/api-client-react";
import { useGetDashboardSummary } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { AlertTriangle, Timer, Hourglass, CircleDot, CalendarDays, TrendingUp, FileText, Truck, Users2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

// ─── helpers ──────────────────────────────────────────────────────────────────

function daysAgo(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function getCurrentFYLabel(): string {
  const now = new Date();
  const yr = now.getFullYear();
  const fyStart = now.getMonth() >= 6 ? yr : yr - 1; // July = month 6
  return `FY ${fyStart}/${String(fyStart + 1).slice(-2)}`;
}

function statusLabel(status: string): string {
  switch (status) {
    case "in-progress": return "In Progress";
    case "awaiting-customer": return "Awaiting Customer";
    case "pending": return "Pending";
    case "completed": return "Completed";
    case "cancelled": return "Cancelled";
    default: return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

function statusColor(status: string) {
  switch (status) {
    case "in-progress": return "bg-blue-100 text-blue-700 border-blue-200";
    case "awaiting-customer": return "bg-orange-100 text-orange-700 border-orange-200";
    case "pending": return "bg-yellow-100 text-yellow-700 border-yellow-200";
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
      <span className="text-[11px] font-semibold tracking-wider text-center opacity-70 uppercase">{label}</span>
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
        if (href === "/online/delivery-orders") {
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

// ─── Main export ─────────────────────────────────────────────────────────────

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
  const { data: customersData } = useListCustomers({ limit: 1 }, { query: { queryKey: ["customers-dash"] } });
  const { data: appointmentsData } = useListAppointments(undefined, { query: { queryKey: ["appts-dash"] } });
  const { data: summary } = useGetDashboardSummary({ period: "year" }, { query: { queryKey: ["dashboard-summary-year"] } });

  const jobs = jobsData ?? [];

  const inProgress = jobs.filter((j) => (j.status as string) === "in-progress").length;
  const awaitingCustomer = jobs.filter((j) => (j.status as string) === "awaiting-customer").length;
  const pending = jobs.filter((j) => (j.status as string) === "pending").length;
  const critical = jobs.filter((j) => j.isCritical).length;
  const totalCustomers = customersData?.total ?? 0;

  const now = new Date();
  const upcomingAppts = (appointmentsData ?? []).filter(
    (a) => new Date(a.scheduledAt) > now && a.status !== "cancelled" && a.status !== "completed"
  ).length;

  const fyLabel = getCurrentFYLabel();
  const fySales = summary?.totalSales ?? 0;

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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricTile
            icon={<TrendingUp className="w-5 h-5" />}
            value={formatCurrency(fySales)}
            label={`${fyLabel} Sales`}
            iconColor="text-emerald-500"
            valueColor="text-emerald-700"
          />
          <MetricTile
            icon={<FileText className="w-5 h-5" />}
            value={jobs.length}
            label="Total Jobs"
            iconColor="text-blue-500"
            valueColor="text-foreground"
          />
          <MetricTile
            icon={<Truck className="w-5 h-5" />}
            value={0}
            label="Pending Deliveries"
            iconColor="text-teal-500"
            valueColor="text-foreground"
            href="/online/delivery-orders"
          />
          <MetricTile
            icon={<Users2 className="w-5 h-5" />}
            value={totalCustomers}
            label="Total Customers"
            iconColor="text-emerald-500"
            valueColor="text-foreground"
          />
        </div>
      )}

      {/* Overdue banner */}
      {showOverdueBanner && <OverdueBanner jobs={jobs} />}
    </div>
  );
}
