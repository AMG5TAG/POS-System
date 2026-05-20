import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetDashboardSummary, GetDashboardSummaryPeriod } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, cn } from "@/lib/utils";
import {
  DollarSign, ShoppingCart, TrendingUp, Users, Gift, TrendingDown,
  Mail, Activity, Trophy, MapPin, Monitor, AlertCircle,
  RotateCcw, Receipt, Package, Percent, Package2,
} from "lucide-react";
import { useLocation } from "wouter";

/* ─── Period tabs ─────────────────────────────────────────────────────────── */

type Period = "today" | "month" | "year";

const PERIOD_TABS: { id: Period; label: string; api: GetDashboardSummaryPeriod }[] = [
  { id: "today", label: "Today", api: "today" },
  { id: "month", label: "Month", api: "month" },
  { id: "year",  label: "Year",  api: "year"  },
];

/* ─── KPI card ────────────────────────────────────────────────────────────── */

function KpiCard({
  title, icon: Icon, iconBg, value, sub, valueClass = "", href,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  value: string;
  sub?: string;
  valueClass?: string;
  href?: string;
}) {
  const [, navigate] = useLocation();
  return (
    <button
      onClick={() => href && navigate(href)}
      className="rounded-2xl border bg-card text-left p-5 hover:shadow-md transition-shadow flex flex-col gap-3 w-full"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", iconBg)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div>
        <p className={cn("text-3xl font-bold", valueClass)}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </button>
  );
}

/* ─── Activity period tabs ────────────────────────────────────────────────── */

type ActivityPeriod = "day" | "week" | "month" | "year";

const ACTIVITY_TABS: { id: ActivityPeriod; label: string }[] = [
  { id: "day",   label: "Day"   },
  { id: "week",  label: "Week"  },
  { id: "month", label: "Month" },
  { id: "year",  label: "Year"  },
];

/* ─── Page ────────────────────────────────────────────────────────────────── */

export default function ManagementOverviewPage() {
  const [period, setPeriod]         = useState<Period>("today");
  const [actPeriod, setActPeriod]   = useState<ActivityPeriod>("week");

  const api = PERIOD_TABS.find((t) => t.id === period)!.api;

  const { data: summary, isLoading } = useGetDashboardSummary(
    { period: api },
    { query: { queryKey: ["mgmt-overview", api] } },
  );

  const totalSales    = summary?.totalSales       ?? 0;
  const txCount       = summary?.transactionCount ?? 0;
  const avgSale       = txCount > 0 ? totalSales / txCount : 0;
  const totalCustomers= summary?.newCustomers     ?? 0;
  const gstCollected  = totalSales / 11;
  const grossProfit   = totalSales * 0.91;
  const grossMarginPct= totalSales > 0 ? ((grossProfit / totalSales) * 100).toFixed(1) : "0.0";

  const today     = new Date();
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay() + 1);
  const weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-8">

        {/* ── Sales Overview ─────────────────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Sales Overview
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">Click any card for full breakdown</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" className="gap-1.5 text-sm">
                <Mail className="w-3.5 h-3.5" />
                Email Summary
              </Button>
              <div className="flex rounded-lg border overflow-hidden">
                {PERIOD_TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setPeriod(t.id)}
                    className={cn(
                      "px-3 py-1.5 text-sm font-medium transition-colors",
                      period === t.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard
              title="Revenue"
              icon={DollarSign}
              iconBg="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600"
              value={isLoading ? "—" : formatCurrency(totalSales)}
              sub={`${txCount} sale${txCount !== 1 ? "s" : ""} —`}
              valueClass="text-emerald-600"
              href="/management/sales-overview"
            />
            <KpiCard
              title="Gross Profit (excl.)"
              icon={TrendingUp}
              iconBg="bg-teal-100 dark:bg-teal-900/30 text-teal-600"
              value={isLoading ? "—" : formatCurrency(totalSales * 0.91)}
              sub="admin only —"
              valueClass="text-teal-600"
              href="/management/sales-overview#profit-loss"
            />
            <KpiCard
              title="Sales"
              icon={ShoppingCart}
              iconBg="bg-blue-100 dark:bg-blue-900/30 text-blue-600"
              value={isLoading ? "—" : txCount.toString()}
              sub={`${period === "today" ? "Today" : period === "month" ? "This month" : "This year"} —`}
              href="/management/sales-overview"
            />
            <KpiCard
              title="Avg Sale"
              icon={Activity}
              iconBg="bg-violet-100 dark:bg-violet-900/30 text-violet-600"
              value={isLoading ? "—" : formatCurrency(avgSale)}
              sub="—"
              href="/management/sales-overview"
            />
            <KpiCard
              title="Customers"
              icon={Users}
              iconBg="bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600"
              value={isLoading ? "—" : totalCustomers.toString()}
              sub="unique —"
              href="/management/sales-overview#customer-insights"
            />
            <KpiCard
              title="Kredits Issued"
              icon={Gift}
              iconBg="bg-pink-100 dark:bg-pink-900/30 text-pink-600"
              value={formatCurrency(0)}
              sub="—"
              href="/management/sales-overview#store-credit"
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard
              title="Discounts"
              icon={TrendingDown}
              iconBg="bg-orange-100 dark:bg-orange-900/30 text-orange-600"
              value={formatCurrency(0)}
              sub="—"
              valueClass="text-orange-500"
              href="/management/discounts"
            />
            <KpiCard
              title="Refunds"
              icon={RotateCcw}
              iconBg="bg-red-100 dark:bg-red-900/30 text-red-600"
              value={isLoading ? "—" : formatCurrency(0)}
              sub="—"
              valueClass="text-red-500"
              href="/management/sales-overview#refunds"
            />
            <KpiCard
              title="GST Collected"
              icon={Receipt}
              iconBg="bg-amber-100 dark:bg-amber-900/30 text-amber-600"
              value={isLoading ? "—" : formatCurrency(gstCollected)}
              sub="inc. in revenue —"
              valueClass="text-amber-600"
              href="/management/tax"
            />
            <KpiCard
              title="Items Sold"
              icon={Package}
              iconBg="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600"
              value={isLoading ? "—" : "0"}
              sub="units —"
              href="/management/sales-overview"
            />
            <KpiCard
              title="Gross Margin"
              icon={Percent}
              iconBg="bg-lime-100 dark:bg-lime-900/30 text-lime-600"
              value={isLoading ? "—" : `${grossMarginPct}%`}
              sub="ex-GST —"
              valueClass="text-lime-600"
              href="/management/sales-overview#profit-loss"
            />
            <KpiCard
              title="Laybys"
              icon={Package2}
              iconBg="bg-sky-100 dark:bg-sky-900/30 text-sky-600"
              value={isLoading ? "—" : formatCurrency(0)}
              sub="outstanding —"
              valueClass="text-sky-600"
              href="/management/layby"
            />
          </div>

          {/* VS Yesterday bar */}
          <div className="rounded-xl border bg-muted/30 px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-semibold text-muted-foreground uppercase text-[11px] tracking-wider">vs yesterday:</span>
            <span>Revenue: <span className="font-medium">{formatCurrency(0)}</span> —</span>
            <span>Sales: <span className="font-medium">0</span> —</span>
            <span>Customers: <span className="font-medium">0</span> —</span>
          </div>
        </section>

        {/* ── Activity Overview ──────────────────────────────────────────── */}
        <section className="space-y-4">

          {/* Best Week Ever banner */}
          <div className="rounded-2xl border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/10 dark:border-yellow-800 px-5 py-4 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Trophy className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-yellow-800 dark:text-yellow-300">Best Week Ever</p>
                <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-0.5">{fmt(weekStart)} – {fmt(weekEnd)}</p>
                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-yellow-700 dark:text-yellow-400">
                  <span>1 service (×3)</span>
                  <span>·</span>
                  <span>0 appts (×2)</span>
                  <span>·</span>
                  <span>0 new customers (×1)</span>
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">3</p>
              <p className="text-[10px] text-yellow-600/70 dark:text-yellow-500 font-medium uppercase tracking-wider">score</p>
            </div>
          </div>

          {/* Section header + period tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Activity Overview
            </h2>
            <div className="flex rounded-lg border overflow-hidden">
              {ACTIVITY_TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActPeriod(t.id)}
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium transition-colors",
                    actPeriod === t.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* No Bookings state */}
          <div className="rounded-2xl border bg-card px-5 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="font-semibold">No Bookings</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {actPeriod === "day" ? "Today" : actPeriod === "week" ? "This week" : actPeriod === "month" ? "This month" : "This year"}
                  {" "}— 0 services · 0 appts · 0 new customers
                </p>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5 text-muted-foreground/50" />
            </div>
          </div>

          {/* This week / VS last week */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border bg-card p-5 space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">This Week</p>
              <div className="grid grid-cols-3 gap-4">
                {["Services", "Appointments", "New Customers"].map((label) => (
                  <div key={label}>
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-2">
                      <span className="text-lg font-bold text-muted-foreground/50">0</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground border-t pt-3">0 total entries</p>
            </div>
            <div className="rounded-2xl border bg-card p-5 space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">VS Last Week</p>
              <div className="grid grid-cols-3 gap-4">
                {["Services", "Appointments", "New Customers"].map((label) => (
                  <div key={label}>
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-2">
                      <span className="text-sm text-muted-foreground/50">—</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground border-t pt-3">0 total entries</p>
            </div>
          </div>

          {/* Device Types + Customers by Suburb */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border bg-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-primary flex items-center gap-2">
                  <Monitor className="w-4 h-4" />
                  Device Types
                </p>
                <p className="text-xs text-muted-foreground">1 total jobs</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-primary">Printer</span>
                  <span>1</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: "100%" }} />
                </div>
              </div>
            </div>
            <div className="rounded-2xl border bg-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-primary flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Customers by Suburb
                </p>
                <p className="text-xs text-muted-foreground">0 contacts</p>
              </div>
              <p className="text-sm text-muted-foreground py-4 text-center">No suburb data yet.</p>
            </div>
          </div>

        </section>
      </div>
    </AppLayout>
  );
}
