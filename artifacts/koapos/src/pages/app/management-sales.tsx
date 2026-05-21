import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useGetDashboardSummary,
  useGetSalesChart,
  useGetTopProducts,
  useListTransactions,
  useListCustomers,
  useListStaff,
  useListInventory,
  useListCashDrawerEntries,
  useListWastage,
  useGetTaxSettings,
  useGetLoyaltySettings,
  GetDashboardSummaryPeriod,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";
import {
  TrendingUp, CreditCard, Package2, Monitor, DollarSign, Users,
  BarChart3, Activity, Banknote, SlidersHorizontal, LayoutGrid,
  CalendarDays, Gift, Wallet, RefreshCw, Download, Receipt,
  ShoppingCart, AlertCircle, CheckCircle2, Package, UserSquare2,
  ArrowUpRight, ArrowDownRight, Percent, Hash, Mail, Clock, Plus,
  FileText, Settings2, QrCode, Link2, Globe, ExternalLink,
  MousePointerClick,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, Cell, ResponsiveContainer,
  Tooltip, XAxis, YAxis, CartesianGrid, Pie, PieChart, Legend,
} from "recharts";

/* ─── Shared chart styles (module-level constants — never recreated) ─────── */

const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: "hsl(var(--popover))",
  borderColor:     "hsl(var(--border))",
  borderRadius:    "var(--radius)",
} as const;
const TOOLTIP_ITEM_STYLE = { color: "hsl(var(--foreground))" } as const;

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
  { id: "analytics",         label: "Analytics",         icon: Globe             },
] as const;

type ReportTabId = (typeof REPORT_TABS)[number]["id"];

/* ─── Shared UI helpers ──────────────────────────────────────────────────── */

function KpiTile({ label, value, sub, accent = false }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-5", accent ? "bg-primary/5" : "bg-card")}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("text-3xl font-bold mt-2", accent ? "text-primary" : "")}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b">
      <p className="font-semibold">{title}</p>
      {action}
    </div>
  );
}

const ExportBtn = () => (
  <Button variant="outline" size="sm" className="gap-1.5">
    <Download className="w-3.5 h-3.5" /> Export CSV
  </Button>
);

const PAYMENT_COLORS: Record<string, string> = {
  card: "#6366f1", cash: "#22c55e", split: "#f59e0b",
  voucher: "#ec4899", store_credit: "#8b5cf6", loyalty: "#06b6d4",
  laybuy: "#f97316", direct_deposit: "#14b8a6", other: "#94a3b8",
};

/* ─── Tab: Sales ─────────────────────────────────────────────────────────── */

function SalesTab({ summary, summaryLoading, chartData, chartLoading, totalSales, txCount, avgSaleValue }: {
  summary: { totalSales: number; transactionCount: number; averageOrderValue: number; posSales?: number; invoiceSales?: number; posCount?: number; invoiceCount?: number } | undefined;
  summaryLoading: boolean; chartData: { label: string; sales: number; transactions: number }[] | undefined;
  chartLoading: boolean; totalSales: number; txCount: number; avgSaleValue: number;
}) {
  const posSales     = summary?.posSales     ?? totalSales;
  const invoiceSales = summary?.invoiceSales ?? 0;
  const posCount     = summary?.posCount     ?? txCount;
  const invoiceCount = summary?.invoiceCount ?? 0;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile label="Total Revenue" value={summaryLoading ? "—" : formatCurrency(totalSales)} sub="POS + Invoices" accent />
        <KpiTile label="POS Transactions" value={summaryLoading ? "—" : posCount.toLocaleString()} sub={formatCurrency(posSales)} />
        <KpiTile label="Invoice Revenue" value={summaryLoading ? "—" : formatCurrency(invoiceSales)} sub={`${invoiceCount} paid invoice${invoiceCount !== 1 ? "s" : ""}`} />
        <KpiTile label="Avg Sale Value" value={summaryLoading ? "—" : formatCurrency(avgSaleValue)} sub="Per transaction" />
      </div>
      <div className="rounded-xl border bg-card overflow-hidden">
        <SectionHeader title="Daily Sales" action={<ExportBtn />} />
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
                  <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
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
              <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                <td className="px-5 py-3 text-muted-foreground">{row.label}</td>
                <td className="px-5 py-3 text-right font-medium">{formatCurrency(row.sales)}</td>
                <td className="px-5 py-3 text-right text-muted-foreground">{row.transactions ?? "—"}</td>
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
  );
}

/* ─── Tab: Payments ──────────────────────────────────────────────────────── */

function PaymentsTab({ fromDate }: { fromDate: string }) {
  const { data, isLoading } = useListTransactions({ limit: 500 });
  const txs = (data?.items ?? []).filter((tx) => !fromDate || (tx.createdAt ?? "") >= fromDate);

  const breakdown = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    for (const tx of txs) {
      if (tx.status === "voided") continue;
      const m = tx.paymentMethod;
      if (!map[m]) map[m] = { count: 0, total: 0 };
      map[m].count++;
      map[m].total += tx.total;
    }
    return Object.entries(map)
      .map(([method, d]) => ({ method, ...d }))
      .sort((a, b) => b.total - a.total);
  }, [txs]);

  const grandTotal = breakdown.reduce((s, r) => s + r.total, 0);
  const grandCount = breakdown.reduce((s, r) => s + r.count, 0);

  const pieData = breakdown.map((r) => ({ name: r.method.replace("_", " "), value: r.total, fill: PAYMENT_COLORS[r.method] ?? "#94a3b8" }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiTile label="Total Collected" value={isLoading ? "—" : formatCurrency(grandTotal)} sub="All methods" accent />
        <KpiTile label="Transactions" value={isLoading ? "—" : grandCount.toString()} sub="Completed sales" />
        <KpiTile label="Payment Methods" value={isLoading ? "—" : breakdown.length.toString()} sub="In use" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl border bg-card overflow-hidden">
          <SectionHeader title="Breakdown by Method" action={<ExportBtn />} />
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
          ) : breakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No transactions in this period.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b">
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Method</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Count</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Total</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Share</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((r) => (
                  <tr key={r.method} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PAYMENT_COLORS[r.method] ?? "#94a3b8" }} />
                        <span className="capitalize font-medium">{r.method.replace("_", " ")}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right text-muted-foreground">{r.count}</td>
                    <td className="px-5 py-3 text-right font-medium">{formatCurrency(r.total)}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground">{grandTotal > 0 ? ((r.total / grandTotal) * 100).toFixed(1) : "0"}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="rounded-xl border bg-card overflow-hidden">
          <SectionHeader title="Payment Mix" />
          {pieData.length > 0 ? (
            <div className="p-5 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={2}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={TOOLTIP_CONTENT_STYLE} />
                  <Legend formatter={(v) => <span className="text-xs capitalize">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">No data yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: Inventory ─────────────────────────────────────────────────────── */

function InventoryTab() {
  const { data, isLoading } = useListInventory();
  const items = data ?? [];
  const lowStock = items.filter((i) => i.isLowStock);
  const totalValue = 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiTile label="Total SKUs" value={isLoading ? "—" : items.length.toString()} sub="Tracked products" accent />
        <KpiTile label="Low Stock" value={isLoading ? "—" : lowStock.length.toString()} sub="Below threshold" />
        <KpiTile label="Stock Value" value={formatCurrency(totalValue)} sub="Cost price basis" />
      </div>
      {lowStock.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 p-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            <strong>{lowStock.length} product{lowStock.length !== 1 ? "s" : ""}</strong> below reorder threshold.
          </p>
        </div>
      )}
      <div className="rounded-xl border bg-card overflow-hidden">
        <SectionHeader title="Stock Levels" action={<ExportBtn />} />
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">No inventory data found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b">
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Product</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">SKU</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Stock</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Threshold</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.productId} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-5 py-3 font-medium">{item.productName}</td>
                  <td className="px-5 py-3 text-muted-foreground font-mono text-xs">{item.sku ?? "—"}</td>
                  <td className="px-5 py-3 text-right font-medium">{item.stockQuantity}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground">{item.lowStockThreshold ?? "—"}</td>
                  <td className="px-5 py-3 text-right">
                    {item.isLowStock
                      ? <Badge variant="destructive" className="text-[10px]">Low</Badge>
                      : <Badge variant="secondary" className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">OK</Badge>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ─── Tab: Register Closures ─────────────────────────────────────────────── */

function RegisterClosuresTab() {
  const { data, isLoading } = useListCashDrawerEntries();
  const entries = data ?? [];

  const byDate = useMemo(() => {
    const map: Record<string, { date: string; in: number; out: number; count: number }> = {};
    for (const e of entries) {
      const d = e.shiftDate ?? e.createdAt?.split("T")[0] ?? "—";
      if (!map[d]) map[d] = { date: d, in: 0, out: 0, count: 0 };
      map[d].count++;
      if (e.amount >= 0) map[d].in  += e.amount;
      else               map[d].out += Math.abs(e.amount);
    }
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
  }, [entries]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiTile label="Closure Days" value={isLoading ? "—" : byDate.length.toString()} sub="Recorded shifts" accent />
        <KpiTile label="Total In" value={isLoading ? "—" : formatCurrency(byDate.reduce((s, r) => s + r.in, 0))} sub="Cash counted in" />
        <KpiTile label="Total Out" value={isLoading ? "—" : formatCurrency(byDate.reduce((s, r) => s + r.out, 0))} sub="Cash counted out" />
      </div>
      <div className="rounded-xl border bg-card overflow-hidden">
        <SectionHeader title="Daily Register Summary" action={<ExportBtn />} />
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
        ) : byDate.length === 0 ? (
          <div className="flex flex-col items-center py-14 gap-3">
            <Monitor className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No register closures recorded yet.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b">
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Entries</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Cash In</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Cash Out</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Net</th>
              </tr>
            </thead>
            <tbody>
              {byDate.map((row) => (
                <tr key={row.date} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-5 py-3 font-medium">{row.date}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground">{row.count}</td>
                  <td className="px-5 py-3 text-right text-emerald-600 font-medium">{formatCurrency(row.in)}</td>
                  <td className="px-5 py-3 text-right text-red-500 font-medium">{formatCurrency(row.out)}</td>
                  <td className={cn("px-5 py-3 text-right font-semibold", row.in - row.out >= 0 ? "text-emerald-600" : "text-red-500")}>
                    {formatCurrency(row.in - row.out)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ─── Tab: Profit & Loss ─────────────────────────────────────────────────── */

function ProfitLossTab({ summary, summaryLoading }: {
  summary: { totalSales: number; transactionCount: number; refundTotal?: number } | undefined;
  summaryLoading: boolean;
}) {
  const totalSales  = summary?.totalSales  ?? 0;
  const refunds     = summary?.refundTotal ?? 0;
  const netRevenue  = totalSales - refunds;
  const gst         = netRevenue / 11;
  const exGst       = netRevenue - gst;
  const cogs        = exGst * 0.42;
  const grossProfit = exGst - cogs;
  const grossMargin = exGst > 0 ? (grossProfit / exGst) * 100 : 0;

  const rows = [
    { label: "Gross Revenue",      value: totalSales,  positive: true  },
    { label: "Refunds",            value: -refunds,    positive: false },
    { label: "Net Revenue",        value: netRevenue,  positive: true,  bold: true  },
    { label: "GST Collected",      value: -gst,        positive: false },
    { label: "Revenue (ex-GST)",   value: exGst,       positive: true,  bold: true  },
    { label: "Est. COGS (42%)",    value: -cogs,       positive: false },
    { label: "Gross Profit",       value: grossProfit, positive: true,  bold: true, accent: true },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile label="Net Revenue" value={summaryLoading ? "—" : formatCurrency(netRevenue)} sub="After refunds" accent />
        <KpiTile label="GST Collected" value={summaryLoading ? "—" : formatCurrency(gst)} sub="10% of inc-GST revenue" />
        <KpiTile label="Gross Profit" value={summaryLoading ? "—" : formatCurrency(grossProfit)} sub="Est. after COGS" />
        <KpiTile label="Gross Margin" value={summaryLoading ? "—" : `${grossMargin.toFixed(1)}%`} sub="Before overheads" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl border bg-card overflow-hidden">
          <SectionHeader title="P&L Summary" action={<ExportBtn />} />
          <table className="w-full text-sm">
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={cn("border-b last:border-0", r.bold ? "bg-muted/20" : "")}>
                  <td className={cn("px-5 py-3", r.bold ? "font-semibold" : "text-muted-foreground")}>{r.label}</td>
                  <td className={cn("px-5 py-3 text-right font-medium", r.accent ? "text-primary text-lg" : r.positive ? "" : "text-red-500")}>
                    {summaryLoading ? "—" : (r.value < 0 ? `(${formatCurrency(Math.abs(r.value))})` : formatCurrency(r.value))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <p className="font-semibold">Margin Breakdown</p>
          {[
            { label: "Gross Margin",  pct: grossMargin,        color: "bg-primary" },
            { label: "GST Share",     pct: netRevenue > 0 ? (gst / netRevenue) * 100 : 0, color: "bg-amber-400" },
            { label: "COGS Share",    pct: exGst > 0 ? (cogs / exGst) * 100 : 0, color: "bg-red-400" },
          ].map((row) => (
            <div key={row.label} className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="font-medium">{row.pct.toFixed(1)}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className={cn("h-full rounded-full", row.color)} style={{ width: `${Math.min(row.pct, 100)}%` }} />
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground pt-2">COGS is an estimate (42% of ex-GST revenue). Connect cost prices in Products for exact figures.</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: Customer Insights ─────────────────────────────────────────────── */

function CustomerInsightsTab() {
  const { data, isLoading } = useListCustomers({ limit: 200 });
  const customers = data?.items ?? [];
  const topBySpend   = [...customers].sort((a, b) => (b.totalSpent ?? 0) - (a.totalSpent ?? 0)).slice(0, 10);
  const topByLoyalty = [...customers].sort((a, b) => (b.loyaltyPoints ?? 0) - (a.loyaltyPoints ?? 0)).slice(0, 5);
  const totalSpend   = customers.reduce((s, c) => s + (c.totalSpent ?? 0), 0);
  const totalPoints  = customers.reduce((s, c) => s + (c.loyaltyPoints ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiTile label="Total Customers" value={isLoading ? "—" : customers.length.toString()} sub="In database" accent />
        <KpiTile label="Total Customer Spend" value={isLoading ? "—" : formatCurrency(totalSpend)} sub="Lifetime" />
        <KpiTile label="Loyalty Points On Hand" value={isLoading ? "—" : totalPoints.toLocaleString()} sub="Unredeemed" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl border bg-card overflow-hidden">
          <SectionHeader title="Top Customers by Spend" action={<ExportBtn />} />
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
          ) : topBySpend.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No customer data.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b">
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">#</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Customer</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Total Spent</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Points</th>
                </tr>
              </thead>
              <tbody>
                {topBySpend.map((c, i) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-5 py-3 text-muted-foreground">{i + 1}</td>
                    <td className="px-5 py-3 font-medium">{c.firstName} {c.lastName}</td>
                    <td className="px-5 py-3 text-right font-medium">{formatCurrency(c.totalSpent ?? 0)}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground">{(c.loyaltyPoints ?? 0).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="rounded-xl border bg-card overflow-hidden">
          <SectionHeader title="Loyalty Leaderboard" />
          {topByLoyalty.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No loyalty data.</p>
          ) : (
            <div className="p-5 space-y-3">
              {topByLoyalty.map((c, i) => (
                <div key={c.id} className="flex items-center gap-3">
                  <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                    i === 0 ? "bg-yellow-100 text-yellow-700" : i === 1 ? "bg-slate-100 text-slate-600" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground")}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.firstName} {c.lastName}</p>
                    <div className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${topByLoyalty[0].loyaltyPoints ? ((c.loyaltyPoints ?? 0) / (topByLoyalty[0].loyaltyPoints ?? 1)) * 100 : 0}%` }} />
                    </div>
                  </div>
                  <span className="text-sm font-semibold shrink-0">{(c.loyaltyPoints ?? 0).toLocaleString()} pts</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: Top Products ──────────────────────────────────────────────────── */

function TopProductsTab({ apiPeriod }: { apiPeriod: GetDashboardSummaryPeriod }) {
  const safeTopPeriod = apiPeriod === "yesterday" ? "today" : apiPeriod;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, isLoading } = useGetTopProducts({ limit: 20, period: safeTopPeriod as any });
  const products = data ?? [];
  const maxRevenue = products[0]?.revenue ?? 1;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiTile label="Products Tracked" value={isLoading ? "—" : products.length.toString()} sub="With sales" accent />
        <KpiTile label="Top Product Revenue" value={isLoading || !products[0] ? "—" : formatCurrency(products[0].revenue)} sub={products[0]?.productName ?? "—"} />
        <KpiTile label="Total Units Sold" value={isLoading ? "—" : products.reduce((s, p) => s + p.quantitySold, 0).toString()} sub="This period" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl border bg-card overflow-hidden">
          <SectionHeader title="Top Products by Revenue" action={<ExportBtn />} />
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
          ) : products.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No sales data for this period.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b">
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">#</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Product</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Qty</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p, i) => (
                  <tr key={p.productId} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-5 py-3 text-muted-foreground">{i + 1}</td>
                    <td className="px-5 py-3 font-medium">{p.productName}</td>
                    <td className="px-5 py-3 text-right text-muted-foreground">{p.quantitySold}</td>
                    <td className="px-5 py-3 text-right font-medium">{formatCurrency(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="rounded-xl border bg-card overflow-hidden">
          <SectionHeader title="Revenue Chart" />
          {products.length > 0 ? (
            <div className="p-5">
              <div className="space-y-2.5">
                {products.slice(0, 8).map((p) => (
                  <div key={p.productId} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground truncate max-w-[60%]">{p.productName}</span>
                      <span className="font-medium">{formatCurrency(p.revenue)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${(p.revenue / maxRevenue) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">No data.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: User Activity ─────────────────────────────────────────────────── */

function UserActivityTab({ fromDate }: { fromDate: string }) {
  const { data: staffData, isLoading: staffLoading } = useListStaff();
  const { data: txData,    isLoading: txLoading    } = useListTransactions({ limit: 500 });
  const staff = staffData ?? [];
  const txs   = (txData?.items ?? []).filter((tx) => !fromDate || (tx.createdAt ?? "") >= fromDate);

  const staffSales = useMemo(() => {
    const map: Record<number, { name: string; count: number; total: number }> = {};
    for (const s of staff) map[s.id] = { name: `${s.firstName} ${s.lastName}`, count: 0, total: 0 };
    for (const tx of txs) {
      if (tx.status === "voided" || !tx.staffId) continue;
      if (!map[tx.staffId]) map[tx.staffId] = { name: `Staff #${tx.staffId}`, count: 0, total: 0 };
      map[tx.staffId].count++;
      map[tx.staffId].total += tx.total;
    }
    return Object.entries(map)
      .map(([id, d]) => ({ id: Number(id), ...d }))
      .sort((a, b) => b.total - a.total);
  }, [staff, txs]);

  const isLoading = staffLoading || txLoading;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiTile label="Staff Members" value={isLoading ? "—" : staff.length.toString()} sub="Active" accent />
        <KpiTile label="Assigned Transactions" value={isLoading ? "—" : txs.filter((t) => t.staffId).length.toString()} sub="Linked to staff" />
        <KpiTile label="Top Performer" value={isLoading || !staffSales[0] ? "—" : staffSales[0].name.split(" ")[0]} sub={staffSales[0] ? formatCurrency(staffSales[0].total) : "—"} />
      </div>
      <div className="rounded-xl border bg-card overflow-hidden">
        <SectionHeader title="Sales by Staff Member" action={<ExportBtn />} />
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
        ) : staffSales.length === 0 ? (
          <div className="flex flex-col items-center py-14 gap-3">
            <UserSquare2 className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No staff activity recorded.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b">
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Staff Member</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Sales</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Revenue</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Avg Sale</th>
              </tr>
            </thead>
            <tbody>
              {staffSales.map((s) => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-5 py-3 font-medium">{s.name}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground">{s.count}</td>
                  <td className="px-5 py-3 text-right font-medium">{formatCurrency(s.total)}</td>
                  <td className="px-5 py-3 text-right text-muted-foreground">{s.count > 0 ? formatCurrency(s.total / s.count) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ─── Tab: Cash Movements ────────────────────────────────────────────────── */

function CashMovementsTab() {
  const { data, isLoading } = useListCashDrawerEntries();
  const entries = data ?? [];
  const cashIn  = entries.filter((e) => e.amount >= 0).reduce((s, e) => s + e.amount, 0);
  const cashOut = entries.filter((e) => e.amount <  0).reduce((s, e) => s + Math.abs(e.amount), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiTile label="Net Cash Movement" value={isLoading ? "—" : formatCurrency(cashIn - cashOut)} sub="In minus out" accent />
        <KpiTile label="Cash In" value={isLoading ? "—" : formatCurrency(cashIn)} sub="Counted in" />
        <KpiTile label="Cash Out" value={isLoading ? "—" : formatCurrency(cashOut)} sub="Counted out" />
      </div>
      <div className="rounded-xl border bg-card overflow-hidden">
        <SectionHeader title="Cash Movement Log" action={<ExportBtn />} />
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center py-14 gap-3">
            <Banknote className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No cash movements recorded.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b">
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Note</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Amount</th>
              </tr>
            </thead>
            <tbody>
              {entries.slice().sort((a, b) => b.createdAt?.localeCompare(a.createdAt ?? "") ?? 0).map((e) => (
                <tr key={e.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-5 py-3 text-muted-foreground">{e.shiftDate ?? e.createdAt?.split("T")[0]}</td>
                  <td className="px-5 py-3 capitalize">{e.type}</td>
                  <td className="px-5 py-3 text-muted-foreground">{e.note ?? "—"}</td>
                  <td className={cn("px-5 py-3 text-right font-medium", e.amount >= 0 ? "text-emerald-600" : "text-red-500")}>
                    {e.amount >= 0 ? "+" : ""}{formatCurrency(e.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ─── Tab: Adjustments ───────────────────────────────────────────────────── */

function AdjustmentsTab() {
  const { data, isLoading } = useListWastage();
  const records = data ?? [];
  const totalQty  = records.reduce((s, r) => s + Math.abs(r.quantity ?? 0), 0);
  const totalCost = records.reduce((s, r) => s + Math.abs(r.cost ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiTile label="Adjustments" value={isLoading ? "—" : records.length.toString()} sub="Total records" accent />
        <KpiTile label="Units Adjusted" value={isLoading ? "—" : totalQty.toString()} sub="Quantity variance" />
        <KpiTile label="Est. Cost Impact" value={isLoading ? "—" : formatCurrency(totalCost)} sub="At cost price" />
      </div>
      <div className="rounded-xl border bg-card overflow-hidden">
        <SectionHeader title="Inventory Adjustments" action={<ExportBtn />} />
        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-12">Loading…</p>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center py-14 gap-3">
            <SlidersHorizontal className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No inventory adjustments recorded.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b">
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Product</th>
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Reason</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Qty</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Cost</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-5 py-3 text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-AU") : "—"}</td>
                  <td className="px-5 py-3 font-medium">{r.productName ?? "—"}</td>
                  <td className="px-5 py-3 text-muted-foreground capitalize">{r.reason ?? "—"}</td>
                  <td className={cn("px-5 py-3 text-right font-medium", (r.quantity ?? 0) < 0 ? "text-red-500" : "text-emerald-600")}>
                    {(r.quantity ?? 0) > 0 ? "+" : ""}{r.quantity ?? 0}
                  </td>
                  <td className="px-5 py-3 text-right text-muted-foreground">{formatCurrency(r.cost ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ─── Tab: Report Builder ────────────────────────────────────────────────── */

const BUILDER_FIELDS = [
  { id: "date",           label: "Date",            group: "Transaction" },
  { id: "revenue",        label: "Revenue",         group: "Transaction" },
  { id: "transactions",   label: "Transactions",    group: "Transaction" },
  { id: "avg_sale",       label: "Avg Sale",        group: "Transaction" },
  { id: "discounts",      label: "Discounts",       group: "Transaction" },
  { id: "refunds",        label: "Refunds",         group: "Transaction" },
  { id: "payment_method", label: "Payment Method",  group: "Transaction" },
  { id: "gst",            label: "GST Collected",   group: "Finance"     },
  { id: "gross_profit",   label: "Gross Profit",    group: "Finance"     },
  { id: "gross_margin",   label: "Gross Margin %",  group: "Finance"     },
  { id: "product",        label: "Product Name",    group: "Products"    },
  { id: "qty_sold",       label: "Qty Sold",        group: "Products"    },
  { id: "category",       label: "Category",        group: "Products"    },
  { id: "stock_level",    label: "Stock Level",     group: "Products"    },
  { id: "customer",       label: "Customer",        group: "Customers"   },
  { id: "customer_spend", label: "Lifetime Spend",  group: "Customers"   },
  { id: "loyalty_pts",    label: "Loyalty Points",  group: "Customers"   },
  { id: "staff",          label: "Staff Member",    group: "Staff"       },
  { id: "staff_sales",    label: "Staff Revenue",   group: "Staff"       },
];

const BUILDER_GROUPS = [...new Set(BUILDER_FIELDS.map((f) => f.group))];

function ReportBuilderTab() {
  const [selected, setSelected] = useState<string[]>(["date", "revenue", "transactions"]);
  const [groupBy, setGroupBy] = useState("date");
  const [format, setFormat] = useState("table");

  const toggle = (id: string) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <p className="font-semibold">Fields</p>
          {BUILDER_GROUPS.map((group) => (
            <div key={group} className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</p>
              <div className="space-y-1">
                {BUILDER_FIELDS.filter((f) => f.group === group).map((f) => (
                  <label key={f.id} className="flex items-center gap-2 cursor-pointer py-0.5">
                    <input type="checkbox" checked={selected.includes(f.id)} onChange={() => toggle(f.id)}
                      className="rounded text-primary accent-primary w-3.5 h-3.5" />
                    <span className="text-sm">{f.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <p className="font-semibold">Options</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Group By</label>
                <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}
                  className="w-full h-9 rounded-lg border bg-background px-3 text-sm">
                  <option value="date">Date</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                  <option value="product">Product</option>
                  <option value="staff">Staff</option>
                  <option value="payment">Payment Method</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Output Format</label>
                <select value={format} onChange={(e) => setFormat(e.target.value)}
                  className="w-full h-9 rounded-lg border bg-background px-3 text-sm">
                  <option value="table">Table</option>
                  <option value="chart">Chart</option>
                  <option value="csv">CSV Export</option>
                  <option value="pdf">PDF</option>
                </select>
              </div>
            </div>
            <Button className="gap-1.5">
              <BarChart3 className="w-4 h-4" /> Run Report
            </Button>
          </div>
          <div className="rounded-xl border bg-muted/30 p-5">
            <p className="text-sm font-semibold mb-3">Preview Columns</p>
            <div className="flex flex-wrap gap-2">
              {selected.length === 0
                ? <p className="text-sm text-muted-foreground">Select fields on the left.</p>
                : selected.map((id) => {
                    const f = BUILDER_FIELDS.find((x) => x.id === id)!;
                    return (
                      <div key={id} className="flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1 text-sm">
                        {f.label}
                        <button onClick={() => toggle(id)} className="text-muted-foreground hover:text-foreground">×</button>
                      </div>
                    );
                  })
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: Scheduled ─────────────────────────────────────────────────────── */

function ScheduledTab() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">0 scheduled reports</p>
        <Button size="sm" className="gap-1.5" disabled><Plus className="w-4 h-4" /> New Schedule</Button>
      </div>
      <div className="rounded-xl border bg-card flex flex-col items-center py-16 gap-4">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
          <CalendarDays className="w-7 h-7 text-muted-foreground/50" />
        </div>
        <div className="text-center">
          <p className="font-semibold">No scheduled reports</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Scheduled report delivery is coming soon. You'll be able to automatically email daily, weekly, or monthly reports in PDF or CSV format.
          </p>
        </div>
        <Badge variant="secondary" className="text-xs">Coming Soon</Badge>
      </div>
    </div>
  );
}

/* ─── Tab: GST / BAS ─────────────────────────────────────────────────────── */

function GstBasTab({ summary, summaryLoading }: {
  summary: { totalSales: number; transactionCount: number } | undefined;
  summaryLoading: boolean;
}) {
  const { data: taxData } = useGetTaxSettings();
  const totalSales   = summary?.totalSales  ?? 0;
  const gstRate      = parseFloat(String(taxData?.gstRate ?? 10)) / 100;
  const gstInclusive = taxData?.taxInclusive !== "false";
  const gstCollected = gstInclusive ? totalSales * (gstRate / (1 + gstRate)) : totalSales * gstRate;
  const salesExGst   = gstInclusive ? totalSales - gstCollected : totalSales;

  const quarter = Math.floor(new Date().getMonth() / 3) + 1;
  const year    = new Date().getFullYear();
  const quarters = [
    { label: `Q${quarter} ${year} (Current)`, sales: salesExGst, gst: gstCollected, current: true,  hasData: true  },
    { label: `Q${quarter > 1 ? quarter - 1 : 4} ${quarter > 1 ? year : year - 1}`,  sales: null,    gst: null,      current: false, hasData: false },
    { label: `Q${quarter > 2 ? quarter - 2 : 4 + quarter - 2} ${year - (quarter <= 2 ? 1 : 0)}`, sales: null, gst: null, current: false, hasData: false },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile label="Total Sales (inc. GST)" value={summaryLoading ? "—" : formatCurrency(totalSales)} sub={`${taxData?.taxName ?? "GST"} inclusive`} accent />
        <KpiTile label="Sales (ex-GST)" value={summaryLoading ? "—" : formatCurrency(salesExGst)} sub="Before tax" />
        <KpiTile label="GST Collected" value={summaryLoading ? "—" : formatCurrency(gstCollected)} sub={`${(gstRate * 100).toFixed(0)}% rate`} />
        <KpiTile label="GST Rate" value={`${(gstRate * 100).toFixed(0)}%`} sub={taxData?.gstEnabled === "true" ? "Enabled" : "Disabled"} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl border bg-card overflow-hidden">
          <SectionHeader title="BAS Quarters" action={<ExportBtn />} />
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b">
                <th className="text-left px-5 py-3 font-medium text-muted-foreground">Quarter</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Sales (ex-GST)</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">GST Collected</th>
                <th className="text-right px-5 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {quarters.map((q) => (
                <tr key={q.label} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-5 py-3 font-medium">{q.label}</td>
                  <td className="px-5 py-3 text-right">{q.hasData ? formatCurrency(q.sales ?? 0) : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-5 py-3 text-right font-medium text-amber-600">{q.hasData ? formatCurrency(q.gst ?? 0) : <span className="text-muted-foreground font-normal">—</span>}</td>
                  <td className="px-5 py-3 text-right">
                    {q.current
                      ? <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-700">In Progress</Badge>
                      : <Badge variant="secondary" className="text-[10px]">Not Available</Badge>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <p className="font-semibold">BAS G-Code Summary</p>
          {[
            { code: "G1",  label: "Total Sales (inc. GST)",   value: totalSales   },
            { code: "G2",  label: "GST-Free Sales",           value: 0            },
            { code: "G3",  label: "Input-Taxed Sales",        value: 0            },
            { code: "G10", label: "Capital Purchases",        value: 0            },
            { code: "1A",  label: "GST on Sales (remit ATO)", value: gstCollected },
            { code: "1B",  label: "GST Credits (purchases)",  value: 0            },
          ].map((row) => (
            <div key={row.code} className="flex items-center justify-between text-sm border-b pb-2 last:border-0 last:pb-0">
              <div className="flex items-center gap-2">
                <span className="w-7 h-6 rounded bg-muted text-[10px] font-bold flex items-center justify-center text-muted-foreground">{row.code}</span>
                <span className="text-muted-foreground">{row.label}</span>
              </div>
              <span className={cn("font-medium", row.code === "1A" ? "text-amber-600" : "")}>{formatCurrency(row.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: Gift Cards ────────────────────────────────────────────────────── */

function GiftCardsTab() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiTile label="Cards Issued" value="0" sub="Total issued" accent />
        <KpiTile label="Outstanding Balance" value={formatCurrency(0)} sub="Unredeemed value" />
        <KpiTile label="Redeemed" value={formatCurrency(0)} sub="Lifetime" />
      </div>
      <div className="rounded-xl border bg-card overflow-hidden">
        <SectionHeader title="Gift Card Activity" action={
          <Button size="sm" className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Issue Card</Button>
        } />
        <div className="flex flex-col items-center py-16 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
            <Gift className="w-8 h-8 text-pink-500" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-lg">No gift cards yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">Issue gift cards at the POS register. They'll appear here for tracking and reporting.</p>
          </div>
          <Button variant="outline" size="sm">Learn about Gift Cards</Button>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <p className="font-semibold">Configuration</p>
          <div className="space-y-3">
            {[
              { label: "Expiry Period",  value: "Never"  },
              { label: "Min. Value",     value: "$5.00"  },
              { label: "Max. Value",     value: "$500.00"},
              { label: "Partial Redemption", value: "Enabled" },
            ].map((r) => (
              <div key={r.label} className="flex justify-between text-sm border-b pb-2 last:border-0 last:pb-0">
                <span className="text-muted-foreground">{r.label}</span>
                <span className="font-medium">{r.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <p className="font-semibold">Liability Summary</p>
          <p className="text-xs text-muted-foreground">Total outstanding gift card balances represent a liability on your books.</p>
          {[
            { label: "Issued (all time)",  value: formatCurrency(0) },
            { label: "Redeemed (all time)",value: formatCurrency(0) },
            { label: "Expired",            value: formatCurrency(0) },
            { label: "Outstanding (Liability)", value: formatCurrency(0) },
          ].map((r) => (
            <div key={r.label} className="flex justify-between text-sm border-b pb-2 last:border-0 last:pb-0">
              <span className="text-muted-foreground">{r.label}</span>
              <span className="font-medium">{r.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: Store Credit ──────────────────────────────────────────────────── */

function StoreCreditTab() {
  const { data: loyaltyData } = useGetLoyaltySettings();
  const { data: customerData, isLoading } = useListCustomers({ limit: 200 });
  const customers    = customerData?.items ?? [];
  const totalPoints  = customers.reduce((s, c) => s + (c.loyaltyPoints ?? 0), 0);
  const dollarValue  = loyaltyData?.pointsPerDollar
    ? totalPoints / Number(loyaltyData.pointsPerDollar)
    : totalPoints / 10;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiTile label="Total Points Issued" value={isLoading ? "—" : totalPoints.toLocaleString()} sub="Across all customers" accent />
        <KpiTile label="Estimated Liability" value={isLoading ? "—" : formatCurrency(dollarValue)} sub="At redemption rate" />
        <KpiTile label="Customers with Points" value={isLoading ? "—" : customers.filter((c) => (c.loyaltyPoints ?? 0) > 0).length.toString()} sub="Active balances" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-xl border bg-card overflow-hidden">
          <SectionHeader title="Top Balances" />
          {customers.filter((c) => (c.loyaltyPoints ?? 0) > 0).length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-3">
              <Wallet className="w-10 h-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No store credit balances yet.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b">
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Customer</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Points</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Value</th>
                </tr>
              </thead>
              <tbody>
                {customers
                  .filter((c) => (c.loyaltyPoints ?? 0) > 0)
                  .sort((a, b) => (b.loyaltyPoints ?? 0) - (a.loyaltyPoints ?? 0))
                  .slice(0, 10)
                  .map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-5 py-3 font-medium">{c.firstName} {c.lastName}</td>
                      <td className="px-5 py-3 text-right font-medium">{(c.loyaltyPoints ?? 0).toLocaleString()}</td>
                      <td className="px-5 py-3 text-right text-muted-foreground">{formatCurrency((c.loyaltyPoints ?? 0) / (loyaltyData?.pointsPerDollar ? Number(loyaltyData.pointsPerDollar) : 10))}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          )}
        </div>
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <p className="font-semibold">Loyalty Programme Settings</p>
          {[
            { label: "Points per Dollar",    value: loyaltyData?.pointsPerDollar ?? "—"    },
            { label: "Redemption Rate",      value: loyaltyData?.pointsPerDollar ? `${loyaltyData.pointsPerDollar} pts = $1` : "—" },
            { label: "Min Redemption",       value: loyaltyData?.stampsRequired ? `${loyaltyData.stampsRequired} stamps` : "—" },
            { label: "Programme Status",     value: loyaltyData?.isEnabled ? "Active" : "Inactive" },
          ].map((r) => (
            <div key={r.label} className="flex justify-between text-sm border-b pb-2 last:border-0 last:pb-0">
              <span className="text-muted-foreground">{r.label}</span>
              <span className="font-medium">{String(r.value)}</span>
            </div>
          ))}
          <Button variant="outline" size="sm" className="gap-1.5 w-full">
            <Settings2 className="w-3.5 h-3.5" /> Configure Loyalty
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Tab: Analytics (Marketing) ────────────────────────────────────────── */

interface _QREntry   { id: string; label: string; url: string; createdAt: string; settings?: { template?: string; dotStyle?: string } }
interface _LinkEntry { id: string; label: string; longUrl: string; slug: string; createdAt: string; clicks: number; tags?: string }
interface _PageEntry { id: string; slug: string; title: string; links?: { enabled: boolean }[]; createdAt: string }

function _loadLS<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? "[]") as T[]; } catch { return []; }
}

function _groupByDay(items: { createdAt: string }[], days = 30): Record<string, number> {
  const result: Record<string, number> = {};
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    result[d.toISOString().split("T")[0]] = 0;
  }
  for (const item of items) {
    const day = (item.createdAt ?? "").split("T")[0];
    if (day in result) result[day]++;
  }
  return result;
}

function _countBy<T>(items: T[], key: (x: T) => string): { name: string; value: number }[] {
  const counts: Record<string, number> = {};
  for (const x of items) { const k = key(x); counts[k] = (counts[k] ?? 0) + 1; }
  return Object.entries(counts)
    .map(([n, v]) => ({ name: n.charAt(0).toUpperCase() + n.slice(1).replace(/-/g, " "), value: v }))
    .sort((a, b) => b.value - a.value);
}

const _CHART_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4", "#f97316", "#14b8a6"];

function AnalyticsTab() {
  const qr    = useMemo(() => _loadLS<_QREntry>("koapos_qr_history"), []);
  const links = useMemo(() => _loadLS<_LinkEntry>("koapos_shortlinks"), []);
  const pages = useMemo(() => _loadLS<_PageEntry>("koapos_landing_pages"), []);

  const totalClicks   = useMemo(() => links.reduce((s, l) => s + (l.clicks || 0), 0), [links]);
  const avgClicks     = links.length > 0 ? (totalClicks / links.length) : 0;
  const topLinks      = useMemo(() => [...links].sort((a, b) => (b.clicks || 0) - (a.clicks || 0)).slice(0, 8), [links]);
  const templates     = useMemo(() => _countBy(qr, (e) => e.settings?.template ?? "standard"), [qr]);
  const dotStyles     = useMemo(() => _countBy(qr, (e) => e.settings?.dotStyle ?? "square"), [qr]);

  const activityData = useMemo(() => {
    const qrByDay  = _groupByDay(qr, 30);
    const lkByDay  = _groupByDay(links, 30);
    return Object.keys(qrByDay).map((date) => ({
      date: new Date(date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
      "QR Codes":  qrByDay[date],
      "Shortlinks": lkByDay[date] ?? 0,
    }));
  }, [qr, links]);

  if (qr.length === 0 && links.length === 0 && pages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4 text-muted-foreground">
        <Globe className="w-16 h-16 opacity-10" />
        <div>
          <p className="font-semibold text-foreground">No marketing data yet</p>
          <p className="text-sm">Create QR codes, shortlinks, or landing pages to see analytics here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── KPI tiles ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <KpiTile label="QR Codes" value={qr.length.toString()} sub="Generated" />
        <KpiTile label="Shortlinks" value={links.length.toString()} sub="Created" />
        <KpiTile label="Total Clicks" value={totalClicks.toLocaleString()} sub="Across all shortlinks" accent />
        <KpiTile label="Avg. Clicks" value={avgClicks.toFixed(1)} sub="Per shortlink" />
        <KpiTile label="Landing Pages" value={pages.length.toString()} sub="Published" />
      </div>

      {/* ── Activity timeline ── */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <SectionHeader title="Activity — Last 30 Days" />
        <div className="p-5">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={activityData} barSize={6} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                interval={Math.floor(activityData.length / 6)} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={24} />
              <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="QR Codes"  fill="#6366f1" radius={[2, 2, 0, 0]} />
              <Bar dataKey="Shortlinks" fill="#22c55e" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Top shortlinks by clicks */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <SectionHeader title="Top Shortlinks by Clicks" action={
            <Link href="/marketing/generators/shortlinks">
              <Button variant="outline" size="sm" className="gap-1.5"><ExternalLink className="w-3.5 h-3.5" />Manage</Button>
            </Link>
          } />
          <div className="p-5">
            {topLinks.length === 0 ? (
              <div className="flex flex-col items-center py-10 gap-2 text-muted-foreground">
                <Link2 className="w-8 h-8 opacity-20" />
                <p className="text-sm">No shortlinks yet.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={topLinks.map((l) => ({ name: (l.label || l.slug || "").slice(0, 18), clicks: l.clicks || 0 }))}
                  layout="vertical" barSize={14}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={90} />
                  <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                  <Bar dataKey="clicks" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* QR template usage */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <SectionHeader title="QR Code Templates Used" action={
            <Link href="/marketing/generators/qr-codes">
              <Button variant="outline" size="sm" className="gap-1.5"><ExternalLink className="w-3.5 h-3.5" />Manage</Button>
            </Link>
          } />
          <div className="p-5">
            {templates.length === 0 ? (
              <div className="flex flex-col items-center py-10 gap-2 text-muted-foreground">
                <QrCode className="w-8 h-8 opacity-20" />
                <p className="text-sm">No QR codes generated yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={templates} barSize={22}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={24} />
                    <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
                    <Bar dataKey="value" name="Uses" radius={[4, 4, 0, 0]}>
                      {templates.map((_, i) => <Cell key={i} fill={_CHART_COLORS[i % _CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                {/* Dot styles */}
                {dotStyles.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <p className="w-full text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Dot Styles</p>
                    {dotStyles.map((d, i) => (
                      <span key={d.name} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium"
                        style={{ borderColor: _CHART_COLORS[i % _CHART_COLORS.length], color: _CHART_COLORS[i % _CHART_COLORS.length] }}>
                        {d.name} <span className="opacity-70">×{d.value}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Shortlinks table ── */}
      {links.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <SectionHeader title="All Shortlinks" action={<ExportBtn />} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-5 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Label</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Slug</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Destination</th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide text-right">
                    <span className="flex items-center gap-1 justify-end"><MousePointerClick className="w-3 h-3" />Clicks</span>
                  </th>
                  <th className="px-5 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Created</th>
                </tr>
              </thead>
              <tbody>
                {[...links].sort((a, b) => (b.clicks || 0) - (a.clicks || 0)).map((l, i) => (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3 font-medium">{l.label || <span className="text-muted-foreground italic">Unlabelled</span>}</td>
                    <td className="px-5 py-3 font-mono text-xs text-primary">{l.slug}</td>
                    <td className="px-5 py-3 text-muted-foreground text-xs max-w-[200px] truncate">{l.longUrl}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={cn("font-bold tabular-nums", i === 0 && "text-primary")}>
                        {(l.clicks || 0).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground whitespace-nowrap text-xs">
                      {new Date(l.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── QR codes table ── */}
      {qr.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <SectionHeader title="QR Code History" action={<ExportBtn />} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  {["Label", "URL", "Template", "Dot Style", "Created"].map((h) => (
                    <th key={h} className="px-5 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {qr.slice(0, 20).map((e) => (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3 font-medium max-w-[140px] truncate">{e.label || <span className="text-muted-foreground italic">Unlabelled</span>}</td>
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground max-w-[180px] truncate">{e.url}</td>
                    <td className="px-5 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-secondary font-medium capitalize">
                        {(e.settings?.template ?? "standard").replace(/-/g, " ")}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full border font-medium capitalize">
                        {(e.settings?.dotStyle ?? "square").replace(/-/g, " ")}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground whitespace-nowrap text-xs">
                      {new Date(e.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Landing pages summary ── */}
      {pages.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <SectionHeader title="Landing Pages" action={
            <Link href="/marketing/landing-pages">
              <Button variant="outline" size="sm" className="gap-1.5"><ExternalLink className="w-3.5 h-3.5" />Manage</Button>
            </Link>
          } />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  {["Title", "URL", "Active Links", "Last Updated"].map((h) => (
                    <th key={h} className="px-5 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pages.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3 font-medium">{p.title || "Untitled"}</td>
                    <td className="px-5 py-3 font-mono text-xs text-primary">/p/{p.slug}</td>
                    <td className="px-5 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-secondary font-medium">
                        {(p.links ?? []).filter((l) => l.enabled).length} links
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground whitespace-nowrap text-xs">
                      {new Date(p.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
  const safeChartPeriod = (apiPeriod === "today" || apiPeriod === "yesterday") ? "week" : apiPeriod;
  const { data: chartData, isLoading: chartLoading } = useGetSalesChart(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { period: safeChartPeriod as any },
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
              <Input type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setPreset("custom"); }} className="h-8 w-36 text-sm px-2" />
              <span className="text-muted-foreground">→</span>
              <Input type="date" value={toDate}   onChange={(e) => { setToDate(e.target.value);   setPreset("custom"); }} className="h-8 w-36 text-sm px-2" />
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
        {activeTab === "sales"             && <SalesTab summary={summary} summaryLoading={summaryLoading} chartData={chartData} chartLoading={chartLoading} totalSales={totalSales} txCount={txCount} avgSaleValue={avgSaleValue} />}
        {activeTab === "payments"          && <PaymentsTab fromDate={fromDate} />}
        {activeTab === "inventory"         && <InventoryTab />}
        {activeTab === "register-closures" && <RegisterClosuresTab />}
        {activeTab === "profit-loss"       && <ProfitLossTab summary={summary} summaryLoading={summaryLoading} />}
        {activeTab === "customer-insights" && <CustomerInsightsTab />}
        {activeTab === "top-products"      && <TopProductsTab apiPeriod={apiPeriod} />}
        {activeTab === "user-activity"     && <UserActivityTab fromDate={fromDate} />}
        {activeTab === "cash-movements"    && <CashMovementsTab />}
        {activeTab === "adjustments"       && <AdjustmentsTab />}
        {activeTab === "report-builder"    && <ReportBuilderTab />}
        {activeTab === "scheduled"         && <ScheduledTab />}
        {activeTab === "gst-bas"           && <GstBasTab summary={summary} summaryLoading={summaryLoading} />}
        {activeTab === "gift-cards"        && <GiftCardsTab />}
        {activeTab === "store-credit"      && <StoreCreditTab />}
        {activeTab === "analytics"         && <AnalyticsTab />}

      </div>
    </AppLayout>
  );
}
