import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useGetDashboardSummary,
  useGetDashboardActivity,
  useGetTaxSettings,
  useGetLoyaltySettings,
  useListCustomers,
  useListLaybys,
  GetDashboardSummaryPeriod,
  GetDashboardActivityPeriod,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, cn } from "@/lib/utils";
import {
  DollarSign, ShoppingCart, TrendingUp, Users, Gift, TrendingDown,
  Mail, Activity, MapPin, Monitor, AlertCircle,
  RotateCcw, Receipt, Package, Percent, Package2, Calendar,
  ArrowUp, ArrowDown, Minus,
} from "lucide-react";
import { useLocation } from "wouter";
import { CustomerLocationMap } from "@/components/maps/CustomerLocationMap";

/* ─── Period tabs ─────────────────────────────────────────────────────────── */

type Period = "today" | "month" | "year";

const PERIOD_TABS: { id: Period; label: string; api: GetDashboardSummaryPeriod }[] = [
  { id: "today", label: "Today", api: "today" },
  { id: "month", label: "Month", api: "month" },
  { id: "year",  label: "Year",  api: "year"  },
];

/* ─── Activity period tabs ────────────────────────────────────────────────── */

type ActivityPeriod = "day" | "week" | "month" | "year";

const ACTIVITY_TABS: { id: ActivityPeriod; label: string; api: GetDashboardActivityPeriod }[] = [
  { id: "day",   label: "Day",   api: "day"   },
  { id: "week",  label: "Week",  api: "week"  },
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

/* ─── Delta chip ──────────────────────────────────────────────────────────── */

function Delta({ current, previous, prefix = "" }: { current: number; previous: number; prefix?: string }) {
  if (previous === 0 && current === 0) return <span className="text-muted-foreground font-medium">—</span>;
  const diff = current - previous;
  const pct = previous > 0 ? Math.abs((diff / previous) * 100).toFixed(0) : null;
  if (diff === 0) return (
    <span className="inline-flex items-center gap-0.5 text-muted-foreground font-medium">
      <Minus className="w-3 h-3" /> no change
    </span>
  );
  const positive = diff > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium", positive ? "text-emerald-600" : "text-red-500")}>
      {positive ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      {prefix}{Math.abs(diff).toLocaleString()}
      {pct && <span className="text-[10px] opacity-70 ml-0.5">({pct}%)</span>}
    </span>
  );
}

/* ─── Activity stat tile ──────────────────────────────────────────────────── */

function ActivityTile({
  label, current, previous,
}: { label: string; current: number; previous: number }) {
  return (
    <div>
      <p className="text-3xl font-bold">{current}</p>
      <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
      <div className="text-xs mt-1">
        <Delta current={current} previous={previous} />
        <span className="text-muted-foreground ml-1">vs prev</span>
      </div>
    </div>
  );
}

/* ─── Page ────────────────────────────────────────────────────────────────── */

export default function ManagementOverviewPage() {
  const [period, setPeriod]       = useState<Period>("today");
  const [actPeriod, setActPeriod] = useState<ActivityPeriod>("week");

  const api = PERIOD_TABS.find((t) => t.id === period)!.api;

  const { data: summary, isLoading } = useGetDashboardSummary(
    { period: api },
    { query: { queryKey: ["mgmt-overview", api] } },
  );

  /* Always fetch "yesterday" for the VS Yesterday comparison bar */
  const { data: yesterday } = useGetDashboardSummary(
    { period: "yesterday" },
    { query: { queryKey: ["mgmt-overview", "yesterday"] } },
  );

  /* Activity section */
  const { data: activity, isLoading: actLoading } = useGetDashboardActivity(
    { period: actPeriod as GetDashboardActivityPeriod },
    { query: { queryKey: ["mgmt-activity", actPeriod] } },
  );

  /* Tax & loyalty settings */
  const { data: taxData }     = useGetTaxSettings();
  const { data: loyaltyData } = useGetLoyaltySettings();
  const { data: customerData } = useListCustomers({ limit: 500 });
  const { data: laybyData }   = useListLaybys({ status: "active" });

  /* Derived sales values */
  const totalSales    = summary?.totalSales       ?? 0;
  const txCount       = summary?.transactionCount ?? 0;
  const avgSale       = summary?.averageOrderValue ?? 0;
  const newCustomers  = summary?.newCustomers     ?? 0;
  const refundTotal   = summary?.refundTotal      ?? 0;
  const discountTotal = summary?.discountTotal    ?? 0;
  const itemsSold     = summary?.itemsSold        ?? 0;

  /* GST calculation using merchant's configured rate */
  const gstRatePct    = parseFloat(String(taxData?.gstRate ?? 10));
  const gstRateStr    = taxData ? `${gstRatePct.toFixed(0)}%` : "10%";
  const gstInclusive  = taxData?.taxInclusive !== "false";
  const gstCollected  = gstInclusive
    ? totalSales * ((gstRatePct / 100) / (1 + gstRatePct / 100))
    : totalSales * (gstRatePct / 100);
  const revenueExGst  = totalSales - gstCollected;

  /* Active laybys outstanding balance */
  const activeLaybys  = laybyData?.items ?? [];
  const laybyBalance  = activeLaybys.reduce((s, l) => s + (l.balance ?? 0), 0);
  const laybyCount    = activeLaybys.length;

  /* Loyalty / store credit dollar value */
  const customers     = customerData?.items ?? [];
  const totalPoints   = customers.reduce((s, c) => s + (c.loyaltyPoints ?? 0), 0);
  const pointsPerDollar = loyaltyData?.pointsPerDollar ? Number(loyaltyData.pointsPerDollar) : 10;
  const loyaltyDollarValue = pointsPerDollar > 0 ? totalPoints / pointsPerDollar : 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loyaltyEnabled = !!(loyaltyData?.isEnabled as any);

  /* Yesterday values (for VS bar) */
  const ySales     = yesterday?.totalSales       ?? 0;
  const yTxCount   = yesterday?.transactionCount ?? 0;
  const yCustomers = yesterday?.newCustomers     ?? 0;

  /* Period label text */
  const periodLabel = period === "today" ? "today" : period === "month" ? "this month" : "this year";

  /* Activity data */
  const actServices     = activity?.services       ?? 0;
  const actAppts        = activity?.appointments   ?? 0;
  const actCustomers    = activity?.newCustomers   ?? 0;
  const prevServices    = activity?.prevServices   ?? 0;
  const prevAppts       = activity?.prevAppointments ?? 0;
  const prevCustomers   = activity?.prevNewCustomers ?? 0;
  const deviceTypes     = activity?.deviceTypes    ?? [];
  const totalDeviceJobs = deviceTypes.reduce((s, d) => s + d.count, 0);

  const actPeriodLabel = actPeriod === "day" ? "Today" : actPeriod === "week" ? "This Week" : actPeriod === "month" ? "This Month" : "This Year";
  const actTotal = actServices + actAppts + actCustomers;

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

          {/* Row 1 — core financial KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard
              title="Revenue"
              icon={DollarSign}
              iconBg="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600"
              value={isLoading ? "—" : formatCurrency(totalSales)}
              sub={`${txCount} sale${txCount !== 1 ? "s" : ""} ${periodLabel}`}
              valueClass="text-emerald-600"
              href="/management/sales-overview"
            />
            <KpiCard
              title="Revenue ex-GST"
              icon={TrendingUp}
              iconBg="bg-teal-100 dark:bg-teal-900/30 text-teal-600"
              value={isLoading ? "—" : formatCurrency(revenueExGst)}
              sub={`${gstRateStr} GST removed from revenue`}
              valueClass="text-teal-600"
              href="/management/sales-overview#profit-loss"
            />
            <KpiCard
              title="Sales"
              icon={ShoppingCart}
              iconBg="bg-blue-100 dark:bg-blue-900/30 text-blue-600"
              value={isLoading ? "—" : txCount.toString()}
              sub={`Transactions ${periodLabel}`}
              href="/management/sales-overview"
            />
            <KpiCard
              title="Avg Sale"
              icon={Activity}
              iconBg="bg-violet-100 dark:bg-violet-900/30 text-violet-600"
              value={isLoading ? "—" : formatCurrency(avgSale)}
              sub="Average transaction value"
              href="/management/sales-overview"
            />
            <KpiCard
              title="New Customers"
              icon={Users}
              iconBg="bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600"
              value={isLoading ? "—" : newCustomers.toString()}
              sub={`Joined ${periodLabel}`}
              href="/management/customers"
            />
            <KpiCard
              title="Loyalty Liability"
              icon={Gift}
              iconBg="bg-pink-100 dark:bg-pink-900/30 text-pink-600"
              value={formatCurrency(loyaltyDollarValue)}
              sub={loyaltyEnabled ? `${totalPoints.toLocaleString()} pts across ${customers.filter((c) => (c.loyaltyPoints ?? 0) > 0).length} customers` : "Loyalty programme inactive"}
              href="/management/sales-overview#store-credit"
            />
          </div>

          {/* Row 2 — cost / adjustment KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard
              title="Discounts"
              icon={TrendingDown}
              iconBg="bg-orange-100 dark:bg-orange-900/30 text-orange-600"
              value={isLoading ? "—" : formatCurrency(discountTotal)}
              sub="Total discounts given"
              valueClass={discountTotal > 0 ? "text-orange-500" : ""}
              href="/management/discounts"
            />
            <KpiCard
              title="Refunds"
              icon={RotateCcw}
              iconBg="bg-red-100 dark:bg-red-900/30 text-red-600"
              value={isLoading ? "—" : formatCurrency(refundTotal)}
              sub="Total refunded"
              valueClass={refundTotal > 0 ? "text-red-500" : ""}
              href="/management/sales-overview#refunds"
            />
            <KpiCard
              title="GST Collected"
              icon={Receipt}
              iconBg="bg-amber-100 dark:bg-amber-900/30 text-amber-600"
              value={isLoading ? "—" : formatCurrency(gstCollected)}
              sub="1/11th of revenue (10% GST)"
              valueClass="text-amber-600"
              href="/management/tax"
            />
            <KpiCard
              title="Items Sold"
              icon={Package}
              iconBg="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600"
              value={isLoading ? "—" : itemsSold.toString()}
              sub={`Units sold ${periodLabel}`}
              href="/management/sales-overview"
            />
            <KpiCard
              title="GST Rate"
              icon={Percent}
              iconBg="bg-lime-100 dark:bg-lime-900/30 text-lime-600"
              value={gstRateStr}
              sub={taxData?.gstEnabled === "true" ? `${gstInclusive ? "Inclusive" : "Exclusive"} · ${taxData.taxName ?? "GST"}` : "GST disabled"}
              valueClass="text-lime-600"
              href="/management/tax"
            />
            <KpiCard
              title="Laybys"
              icon={Package2}
              iconBg="bg-sky-100 dark:bg-sky-900/30 text-sky-600"
              value={formatCurrency(laybyBalance)}
              sub={laybyCount === 0 ? "No active laybys" : `${laybyCount} active layby${laybyCount === 1 ? "" : "s"} outstanding`}
              valueClass="text-sky-600"
              href="/management/layby"
            />
          </div>

          {/* VS Yesterday bar */}
          <div className="rounded-xl border bg-muted/30 px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-sm">
            <span className="font-semibold text-muted-foreground uppercase text-[11px] tracking-wider shrink-0">
              Today vs Yesterday:
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Revenue:</span>
              <span className="font-medium">{formatCurrency(totalSales > 0 || ySales > 0 ? totalSales : 0)}</span>
              <Delta current={totalSales} previous={ySales} prefix="$" />
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Sales:</span>
              <span className="font-medium">{txCount}</span>
              <Delta current={txCount} previous={yTxCount} />
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-muted-foreground">New Customers:</span>
              <span className="font-medium">{newCustomers}</span>
              <Delta current={newCustomers} previous={yCustomers} />
            </span>
          </div>
        </section>

        {/* ── Activity Overview ──────────────────────────────────────────── */}
        <section className="space-y-4">

          {/* Section header + period tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                Activity Overview
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Service jobs, appointments, and new customers — with comparison to the previous {actPeriod}
              </p>
            </div>
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

          {actTotal === 0 && !actLoading ? (
            /* Empty state */
            <div className="rounded-2xl border bg-card px-5 py-8 flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-muted-foreground/50" />
              </div>
              <div>
                <p className="font-semibold">No Activity</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  No service jobs, appointments, or new customers recorded {actPeriodLabel.toLowerCase()}.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* This period / VS prev period */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-2xl border bg-card p-5 space-y-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{actPeriodLabel}</p>
                  <div className="grid grid-cols-3 gap-4">
                    <ActivityTile label="Service Jobs" current={actServices}  previous={prevServices}  />
                    <ActivityTile label="Appointments" current={actAppts}     previous={prevAppts}     />
                    <ActivityTile label="New Customers" current={actCustomers} previous={prevCustomers} />
                  </div>
                  <p className="text-xs text-muted-foreground border-t pt-3">
                    {actTotal} total entries · arrows show vs previous {actPeriod}
                  </p>
                </div>
                <div className="rounded-2xl border bg-card p-5 space-y-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Previous {actPeriodLabel.replace(/^This /, "")}</p>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: "Service Jobs",  val: prevServices  },
                      { label: "Appointments",  val: prevAppts     },
                      { label: "New Customers", val: prevCustomers },
                    ].map(({ label, val }) => (
                      <div key={label}>
                        <p className="text-3xl font-bold text-muted-foreground">{val}</p>
                        <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground border-t pt-3">
                    {prevServices + prevAppts + prevCustomers} total entries
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Device Types — from service jobs in current period */}
          {deviceTypes.length > 0 && (
            <div className="rounded-2xl border bg-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-primary flex items-center gap-2">
                  <Monitor className="w-4 h-4" />
                  Device Types
                </p>
                <p className="text-xs text-muted-foreground">{totalDeviceJobs} job{totalDeviceJobs !== 1 ? "s" : ""} {actPeriodLabel.toLowerCase()}</p>
              </div>
              <div className="space-y-2">
                {deviceTypes.map(({ type, count }) => (
                  <div key={type}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-primary capitalize">{type}</span>
                      <span>{count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${totalDeviceJobs > 0 ? (count / totalDeviceJobs) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ── Customer Locations ─────────────────────────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <MapPin className="w-5 h-5 text-primary" />
              Map of Customers
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              See where your customer base is physically located. Pins appear for customers with a physical address city saved.
            </p>
          </div>
          <CustomerLocationMap />
        </section>

      </div>
    </AppLayout>
  );
}
