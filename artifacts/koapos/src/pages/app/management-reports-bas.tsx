import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetProfitLoss } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Receipt, Download, CalendarDays, Info, TrendingUp, DollarSign,
  Percent, BarChart3, RefreshCw,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

/* ── Date helpers ──────────────────────────────────────────────────────── */
const toISO = (d: Date) => d.toISOString().split("T")[0];

type Preset = "quarter" | "month" | "ytd" | "custom";

function presetDates(p: Preset): { from: string; to: string } {
  const now = new Date();
  const to  = toISO(now);
  if (p === "month") {
    const d = new Date(now); d.setDate(d.getDate() - 30);
    return { from: toISO(d), to };
  }
  if (p === "quarter") {
    const d = new Date(now); d.setDate(d.getDate() - 91);
    return { from: toISO(d), to };
  }
  if (p === "ytd") {
    return { from: `${now.getFullYear()}-01-01`, to };
  }
  return { from: toISO(now), to };
}

const PRESETS: { id: Preset; label: string }[] = [
  { id: "month",   label: "Last 30 days" },
  { id: "quarter", label: "Last Quarter" },
  { id: "ytd",     label: "Year to Date" },
  { id: "custom",  label: "Custom"       },
];

const fmt$  = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtN  = (n: number) => n.toLocaleString("en-AU");

const CHART_COLORS = { gst: "#7c3aed", exGst: "#2563eb", refund: "#dc2626" };

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--popover))",
  borderColor:     "hsl(var(--border))",
  borderRadius:    "var(--radius)",
} as const;

/* ── BAS label row ────────────────────────────────────────────────────── */
function BasRow({ code, label, description, value, highlight = false }: {
  code: string; label: string; description: string; value: string; highlight?: boolean;
}) {
  return (
    <div className={cn("flex items-start gap-4 py-3 border-b last:border-0 text-sm", highlight && "bg-muted/30 -mx-4 px-4 rounded")}>
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 font-bold text-primary text-xs">
        {code}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <p className={cn("font-mono font-semibold shrink-0 text-right", highlight && "text-lg text-primary")}>{value}</p>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */
export default function ManagementReportsBasPage() {
  const [preset, setPreset]       = useState<Preset>("quarter");
  const [customFrom, setCustomFrom] = useState(toISO(new Date(new Date().setDate(new Date().getDate() - 91))));
  const [customTo, setCustomTo]   = useState(toISO(new Date()));

  const { from, to } = preset === "custom"
    ? { from: customFrom, to: customTo }
    : presetDates(preset);

  const { data, isLoading, isError, refetch } = useGetProfitLoss(
    { startDate: from, endDate: to },
    { query: { queryKey: ["reports-bas", from, to], enabled: !!from && !!to } }
  );

  /* Derived BAS figures */
  const grossRevenue    = data?.grossRevenue    ?? 0;
  const taxCollected    = data?.taxCollected    ?? 0;
  const exGstRevenue    = data?.exGstRevenue    ?? 0;
  const refundTotal     = data?.refundTotal     ?? 0;
  const txCount         = data?.transactionCount ?? 0;

  /* G1 = Total sales (inc. GST), 1A = GST on sales */
  const g1  = grossRevenue;
  const oneA = taxCollected;

  /* Chart: daily GST breakdown */
  const chartData = (data?.dailyBreakdown ?? []).map(d => ({
    date:    d.date,
    exGst:   d.exGstRevenue,
    gst:     d.taxCollected,
    refund:  d.refundTotal,
  }));

  const canExport = !isLoading && !isError && grossRevenue > 0;

  function handleExportCsv() {
    const rows = [
      ["BAS Field", "Description", "Amount (AUD)"],
      ["G1",  "Total Sales (including GST)",  grossRevenue.toFixed(2)],
      ["1A",  "GST on Sales",                 taxCollected.toFixed(2)],
      ["G2",  "Export Sales (GST-free)",       "0.00"],
      ["Net", "Net Sales excluding GST",       exGstRevenue.toFixed(2)],
      ["",    "Total Refunds",                 refundTotal.toFixed(2)],
      ["",    "Transaction Count",             txCount.toString()],
      ["",    "Period",                        `${from} to ${to}`],
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
      download: `bas-report-${from}-${to}.csv`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Receipt className="w-6 h-6 text-primary" /> BAS / GST Report
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Business Activity Statement figures — G1 total sales and 1A GST on sales.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
            </Button>
            <Button size="sm" onClick={handleExportCsv} disabled={!canExport}>
              <Download className="w-4 h-4" /> Export CSV
            </Button>
          </div>
        </div>

        {/* ── Date filter ── */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          <div className="flex gap-2 flex-wrap">
            {PRESETS.map(p => (
              <button key={p.id} onClick={() => setPreset(p.id)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm font-medium border transition-colors",
                  preset === p.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground border-border hover:bg-muted"
                )}>
                {p.label}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="flex items-end gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">From</Label>
                <Input type="date" className="h-8 text-sm" value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">To</Label>
                <Input type="date" className="h-8 text-sm" value={customTo}
                  onChange={e => setCustomTo(e.target.value)} />
              </div>
            </div>
          )}
          {!isLoading && (
            <Badge variant="secondary" className="text-xs">
              <CalendarDays className="w-3 h-3 mr-1" />
              {from} → {to}
            </Badge>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <BarChart3 className="w-12 h-12 text-muted-foreground/30" />
            <p className="font-medium">Failed to load report data</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
          </div>
        ) : (
          <>
            {/* ── KPI row ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { icon: DollarSign, label: "G1 — Total Sales", value: fmt$(g1), sub: "Inc. GST", color: "text-primary" },
                { icon: Percent,    label: "1A — GST on Sales", value: fmt$(oneA), sub: "Net GST payable", color: "text-violet-600" },
                { icon: TrendingUp, label: "Net Sales ex-GST",  value: fmt$(exGstRevenue), sub: "Excluding tax", color: "text-blue-600" },
                { icon: Receipt,    label: "Transactions",       value: fmtN(txCount), sub: `${from} → ${to}`, color: "text-foreground" },
              ].map(k => (
                <Card key={k.label}>
                  <CardContent className="pt-5 pb-4">
                    <k.icon className={cn("w-5 h-5 mb-2", k.color)} />
                    <p className="text-xs text-muted-foreground">{k.label}</p>
                    <p className={cn("text-2xl font-bold mt-0.5", k.color)}>{k.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{k.sub}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* ── BAS worksheet ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">BAS Worksheet</CardTitle>
                  <CardDescription>
                    Standard ATO Business Activity Statement fields for GST reporting.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <BasRow code="G1" label="Total Sales" highlight
                    description="All sales including GST-inclusive amounts (report on your BAS as G1)"
                    value={fmt$(g1)} />
                  <BasRow code="1A" label="GST on Sales" highlight
                    description="GST collected on taxable sales — amount to remit to the ATO"
                    value={fmt$(oneA)} />
                  <BasRow code="G2" label="Export Sales (GST-free)"
                    description="Sales to overseas customers — GST-free under A New Tax System Act"
                    value="$0.00" />
                  <BasRow code="Net" label="Net Sales Excluding GST"
                    description="Total revenue after removing the GST component (G1 minus 1A)"
                    value={fmt$(exGstRevenue)} />
                  {refundTotal > 0 && (
                    <BasRow code="Adj" label="Refunds / Adjustments"
                      description="Credit adjustments reducing your taxable sales for the period"
                      value={`(${fmt$(refundTotal)})`} />
                  )}
                  <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      This report is informational only. Always verify totals with your accountant before lodging a BAS. GST-free product sales require correct tax rates set per product.
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* ── Daily chart ── */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" /> Daily Sales Breakdown
                  </CardTitle>
                  <CardDescription>GST vs. ex-GST revenue by day</CardDescription>
                </CardHeader>
                <CardContent>
                  {chartData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                      <BarChart3 className="w-8 h-8 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">No sales data for this period.</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }}
                          tickFormatter={v => v.slice(5)} />
                        <YAxis tick={{ fontSize: 10 }}
                          tickFormatter={v => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} />
                        <Tooltip
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(v: number, name: string) => [fmt$(v), name === "gst" ? "GST" : name === "exGst" ? "Ex-GST" : "Refund"]}
                          labelFormatter={l => `Date: ${l}`}
                        />
                        <Bar dataKey="exGst" stackId="a" fill={CHART_COLORS.exGst} name="exGst" />
                        <Bar dataKey="gst"   stackId="a" fill={CHART_COLORS.gst}   name="gst" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ── Daily table ── */}
            {data?.dailyBreakdown && data.dailyBreakdown.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Daily Breakdown
                </h2>
                <div className="rounded-lg border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="p-3 text-left font-medium">Date</th>
                        <th className="p-3 text-right font-medium">G1 Total Sales</th>
                        <th className="p-3 text-right font-medium">1A GST</th>
                        <th className="p-3 text-right font-medium hidden sm:table-cell">Ex-GST</th>
                        <th className="p-3 text-right font-medium hidden md:table-cell">Refunds</th>
                        <th className="p-3 text-right font-medium hidden md:table-cell">Transactions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.dailyBreakdown.map(d => (
                        <tr key={d.date} className="hover:bg-muted/30">
                          <td className="p-3">{d.date}</td>
                          <td className="p-3 text-right font-medium">{fmt$(d.grossRevenue)}</td>
                          <td className="p-3 text-right text-violet-600">{fmt$(d.taxCollected)}</td>
                          <td className="p-3 text-right hidden sm:table-cell text-muted-foreground">{fmt$(d.exGstRevenue)}</td>
                          <td className="p-3 text-right hidden md:table-cell text-red-500">{d.refundTotal > 0 ? `(${fmt$(d.refundTotal)})` : "—"}</td>
                          <td className="p-3 text-right hidden md:table-cell text-muted-foreground">{d.transactionCount}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t bg-muted/30">
                      <tr>
                        <td className="p-3 font-semibold">Total</td>
                        <td className="p-3 text-right font-bold">{fmt$(grossRevenue)}</td>
                        <td className="p-3 text-right font-bold text-violet-600">{fmt$(taxCollected)}</td>
                        <td className="p-3 text-right font-semibold hidden sm:table-cell">{fmt$(exGstRevenue)}</td>
                        <td className="p-3 text-right font-semibold hidden md:table-cell text-red-500">{refundTotal > 0 ? `(${fmt$(refundTotal)})` : "—"}</td>
                        <td className="p-3 text-right font-semibold hidden md:table-cell">{fmtN(txCount)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
