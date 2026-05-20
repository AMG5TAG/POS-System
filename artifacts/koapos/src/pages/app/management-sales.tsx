import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useGetDashboardSummary,
  useGetSalesChart,
  GetDashboardSummaryPeriod,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatCurrency } from "@/lib/utils";
import {
  TrendingUp, CreditCard, Package2, Monitor, DollarSign, Users,
  BarChart3, Activity, Banknote, SlidersHorizontal, LayoutGrid,
  CalendarDays, Gift, Wallet, RefreshCw, Download, Receipt,
} from "lucide-react";
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from "recharts";

/* ─── Date helpers ───────────────────────────────────────────────────────── */

type Preset = "today" | "7" | "30" | "90" | "year" | "custom";

const DATE_PRESETS: { id: Preset; label: string }[] = [
  { id: "today", label: "Today"   },
  { id: "7",     label: "7 Days"  },
  { id: "30",    label: "30 Days" },
  { id: "90",    label: "90 Days" },
  { id: "year",  label: "Year"    },
];

function toISO(d: Date): string { return d.toISOString().split("T")[0]; }

function presetDates(p: Preset): { from: string; to: string } {
  const now = new Date();
  const to  = toISO(now);
  if (p === "today") return { from: to, to };
  const d = new Date(now);
  if (p === "year") d.setFullYear(d.getFullYear() - 1);
  else d.setDate(d.getDate() - (p === "7" ? 7 : p === "30" ? 30 : 90));
  return { from: toISO(d), to };
}

function presetToApiPeriod(p: Preset): GetDashboardSummaryPeriod {
  if (p === "today") return "today";
  if (p === "7")     return "week";
  if (p === "year")  return "year";
  return "month";
}

/* ─── Report tabs ────────────────────────────────────────────────────────── */

const REPORT_TABS = [
  { id: "sales",             label: "Sales",             icon: TrendingUp        },
  { id: "payments",          label: "Payments",          icon: CreditCard        },
  { id: "inventory",         label: "Inventory",         icon: Package2          },
  { id: "register-closures", label: "Register Closures", icon: Monitor           },
  { id: "profit-loss",       label: "Profit & Loss",     icon: DollarSign        },
  { id: "customer-insights", label: "Customer Insights", icon: Users             },
  { id: "top-products",      label: "Top Products",      icon: BarChart3         },
  { id: "user-activity",     label: "User Activity",     icon: Activity          },
  { id: "cash-movements",    label: "Cash Movements",    icon: Banknote          },
  { id: "adjustments",       label: "Adjustments",       icon: SlidersHorizontal },
  { id: "report-builder",    label: "Report Builder",    icon: LayoutGrid        },
  { id: "scheduled",         label: "Scheduled",         icon: CalendarDays      },
  { id: "gst-bas",           label: "GST / BAS",         icon: Receipt           },
  { id: "gift-cards",        label: "Gift Cards",        icon: Gift              },
  { id: "store-credit",      label: "Store Credit",      icon: Wallet            },
] as const;

type ReportTabId = (typeof REPORT_TABS)[number]["id"];

/* ─── Coming soon placeholder ────────────────────────────────────────────── */

function ComingSoon({ tab }: { tab: ReportTabId }) {
  const def = REPORT_TABS.find((t) => t.id === tab)!;
  const Icon = def.icon;
  return (
    <div className="flex flex-col items-center justify-center py-28 text-center gap-4">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
        <Icon className="w-8 h-8 text-muted-foreground/40" />
      </div>
      <div>
        <p className="font-semibold text-lg">{def.label} Report</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          In-depth analytics for {def.label.toLowerCase()} are coming soon.
        </p>
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<ReportTabId>("sales");
  const [preset, setPreset]       = useState<Preset>("30");
  const init                      = presetDates("30");
  const [fromDate, setFromDate]   = useState(init.from);
  const [toDate,   setToDate]     = useState(init.to);
  const [apiPeriod, setApiPeriod] = useState<GetDashboardSummaryPeriod>(presetToApiPeriod("30"));
  const [refreshKey, setRefresh]  = useState(0);

  useEffect(() => {
    const hash = window.location.hash.replace("#", "") as ReportTabId;
    if (hash && REPORT_TABS.some((t) => t.id === hash)) setActiveTab(hash);
  }, []);

  const selectPreset = (id: Preset) => {
    setPreset(id);
    const { from, to } = presetDates(id);
    setFromDate(from);
    setToDate(to);
  };

  const handleRefresh = () => {
    setApiPeriod(presetToApiPeriod(preset));
    setRefresh((k) => k + 1);
  };

  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary(
    { period: apiPeriod },
    { query: { queryKey: ["reports-summary", apiPeriod, refreshKey] } },
  );
  const { data: chartData, isLoading: chartLoading } = useGetSalesChart(
    { period: apiPeriod === "today" ? "week" : apiPeriod },
    { query: { queryKey: ["reports-chart", apiPeriod, refreshKey] } },
  );

  const totalSales   = summary?.totalSales       ?? 0;
  const txCount      = summary?.transactionCount ?? 0;
  const avgSaleValue = txCount > 0 ? totalSales / txCount : 0;

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-5">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-primary" />
              Reports
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Business intelligence and analytics across all areas of KoaPOS
            </p>
          </div>

          {/* Date controls */}
          <div className="flex flex-wrap items-center gap-2">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => selectPreset(p.id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border",
                  preset === p.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted text-foreground border-border",
                )}
              >
                {p.label}
              </button>
            ))}
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setPreset("custom"); }}
                className="h-8 w-36 text-sm px-2"
              />
              <span className="text-muted-foreground">→</span>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); setPreset("custom"); }}
                className="h-8 w-36 text-sm px-2"
              />
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={handleRefresh}>
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </Button>
          </div>
        </div>

        {/* ── Tab bar ──────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-1.5 border-b pb-3">
          {REPORT_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                activeTab === id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* ── Tab content ──────────────────────────────────────────────────── */}
        {activeTab === "sales" ? (
          <div className="space-y-5">

            {/* KPI cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-xl border bg-primary/5 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Total Revenue</p>
                <p className="text-3xl font-bold text-primary mt-2">
                  {summaryLoading ? "—" : formatCurrency(totalSales)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">POS + Invoices</p>
              </div>
              <div className="rounded-xl border bg-card p-5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Transactions</p>
                <p className="text-3xl font-bold mt-2">
                  {summaryLoading ? "—" : txCount.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{txCount} POS · 0 Invoices</p>
              </div>
              <div className="rounded-xl border bg-card p-5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Invoice Revenue</p>
                <p className="text-3xl font-bold mt-2">{formatCurrency(0)}</p>
                <p className="text-xs text-muted-foreground mt-1">0 paid invoices</p>
              </div>
              <div className="rounded-xl border bg-card p-5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Avg Sale Value</p>
                <p className="text-3xl font-bold mt-2">
                  {summaryLoading ? "—" : formatCurrency(avgSaleValue)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Per transaction</p>
              </div>
            </div>

            {/* Daily Sales */}
            <div className="rounded-xl border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <p className="font-semibold">Daily Sales</p>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </Button>
              </div>

              <div className="p-5">
                {chartLoading ? (
                  <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Loading chart…</div>
                ) : chartData?.length ? (
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorReportSales" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}   />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                        <Tooltip
                          contentStyle={{ backgroundColor: "hsl(var(--popover))", borderColor: "hsl(var(--border))", borderRadius: "var(--radius)" }}
                          itemStyle={{ color: "hsl(var(--foreground))" }}
                        />
                        <Area type="monotone" dataKey="sales" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorReportSales)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-12">No sales in this period.</p>
                )}
              </div>

              <table className="w-full text-sm border-t">
                <thead>
                  <tr className="bg-muted/30 border-b">
                    <th className="text-left px-5 py-3 font-medium text-muted-foreground">Date</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Revenue</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Transactions</th>
                    <th className="text-right px-5 py-3 font-medium text-muted-foreground">Discounts</th>
                  </tr>
                </thead>
                <tbody>
                  {chartData?.map((row, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3 text-muted-foreground">{row.label}</td>
                      <td className="px-5 py-3 text-right font-medium">{formatCurrency(row.sales)}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">—</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!chartData?.length && !chartLoading && (
                <p className="text-sm text-muted-foreground text-center px-5 py-4">No data for this period.</p>
              )}
            </div>

          </div>
        ) : (
          <ComingSoon tab={activeTab} />
        )}

      </div>
    </AppLayout>
  );
}
