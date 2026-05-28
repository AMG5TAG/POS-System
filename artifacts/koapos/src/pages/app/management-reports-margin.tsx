import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useGetInventoryValuation,
  useGetProductPerformance,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  TrendingUp, Download, CalendarDays, Boxes, DollarSign,
  Percent, BarChart3, RefreshCw, ArrowUpDown,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

/* ── Helpers ─────────────────────────────────────────────────────────── */
const toISO = (d: Date) => d.toISOString().split("T")[0];
const fmt$  = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtP  = (n: number) => `${n.toFixed(1)}%`;

type Preset = "7" | "30" | "90" | "year" | "custom";
const PRESETS: { id: Preset; label: string }[] = [
  { id: "7",    label: "7 Days"  },
  { id: "30",   label: "30 Days" },
  { id: "90",   label: "90 Days" },
  { id: "year", label: "1 Year"  },
  { id: "custom", label: "Custom" },
];

function presetDates(p: Preset) {
  const now = new Date(); const to = toISO(now);
  if (p === "year") { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return { from: toISO(d), to }; }
  const days = p === "7" ? 7 : p === "30" ? 30 : 90;
  const d = new Date(now); d.setDate(d.getDate() - days); return { from: toISO(d), to };
}

function marginColor(pct: number) {
  if (pct >= 40) return "text-green-600";
  if (pct >= 20) return "text-amber-600";
  return "text-red-500";
}

function marginBg(pct: number) {
  if (pct >= 40) return "bg-green-500";
  if (pct >= 20) return "bg-amber-500";
  return "bg-red-500";
}

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--popover))",
  borderColor:     "hsl(var(--border))",
  borderRadius:    "var(--radius)",
} as const;

type SortKey = "name" | "marginPct" | "grossProfit" | "totalRevenue" | "quantitySold";
type SortDir = "asc" | "desc";

/* ── Page ─────────────────────────────────────────────────────────────── */
export default function ManagementReportsMarginPage() {
  const [preset, setPreset]         = useState<Preset>("30");
  const [customFrom, setCustomFrom] = useState(toISO(new Date(new Date().setDate(new Date().getDate() - 30))));
  const [customTo, setCustomTo]     = useState(toISO(new Date()));
  const [tab, setTab]               = useState<"performance" | "valuation">("performance");
  const [sortKey, setSortKey]       = useState<SortKey>("grossProfit");
  const [sortDir, setSortDir]       = useState<SortDir>("desc");
  const [searchQ, setSearchQ]       = useState("");

  const { from, to } = preset === "custom"
    ? { from: customFrom, to: customTo }
    : presetDates(preset);

  const { data: valData, isLoading: valLoading, refetch: refetchVal } =
    useGetInventoryValuation({ query: { queryKey: ["inventory-valuation"] } });

  const { data: perfData, isLoading: perfLoading, refetch: refetchPerf } =
    useGetProductPerformance(
      { startDate: from, endDate: to },
      { query: { queryKey: ["product-performance", from, to], enabled: !!from && !!to } }
    );

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const perfItems = (perfData?.items ?? [])
    .filter(i => !searchQ || i.name.toLowerCase().includes(searchQ.toLowerCase()) || (i.sku ?? "").toLowerCase().includes(searchQ.toLowerCase()))
    .sort((a, b) => {
      const av = a[sortKey as keyof typeof a] as number | string;
      const bv = b[sortKey as keyof typeof b] as number | string;
      const r  = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? r : -r;
    });

  const valItems = (valData?.items ?? [])
    .filter(i => !searchQ || i.name.toLowerCase().includes(searchQ.toLowerCase()) || (i.sku ?? "").toLowerCase().includes(searchQ.toLowerCase()))
    .sort((a, b) => {
      const av = a[sortKey as keyof typeof a] as number | string;
      const bv = b[sortKey as keyof typeof b] as number | string;
      const r  = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? r : -r;
    });

  /* Top 10 for chart */
  const top10 = perfItems.slice(0, 10).map(i => ({
    name:    i.name.length > 14 ? `${i.name.slice(0, 13)}…` : i.name,
    margin:  i.marginPct,
    profit:  i.grossProfit,
    revenue: i.totalRevenue,
  }));

  function handleExportCsv() {
    const rows = tab === "performance"
      ? [
          ["Product", "SKU", "Qty Sold", "Revenue", "COGS", "Gross Profit", "Margin %"],
          ...perfItems.map(i => [i.name, i.sku ?? "", i.quantitySold, i.totalRevenue, i.totalCogs, i.grossProfit, i.marginPct]),
        ]
      : [
          ["Product", "SKU", "Stock", "Cost Price", "Retail Price", "Cost Value", "Retail Value", "Margin %"],
          ...valItems.map(i => [i.name, i.sku ?? "", i.stockQuantity, i.costPrice, i.retailPrice, i.costValue, i.retailValue, i.marginPct]),
        ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
      download: `margin-report-${tab}-${toISO(new Date())}.csv`,
    });
    a.click(); URL.revokeObjectURL(a.href);
  }

  function SortTh({ label, k }: { label: string; k: SortKey }) {
    return (
      <th className="p-3 text-right font-medium whitespace-nowrap cursor-pointer select-none hover:text-foreground"
        onClick={() => handleSort(k)}>
        <span className="inline-flex items-center gap-1 justify-end">
          {label}
          {sortKey === k && <ArrowUpDown className={cn("w-3 h-3", sortDir === "desc" ? "rotate-180" : "")} />}
        </span>
      </th>
    );
  }

  const isLoading = tab === "performance" ? perfLoading : valLoading;

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-primary" /> Margin & Profitability
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Gross margin, COGS, and profit by product — sold performance and current inventory value.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm"
              onClick={() => tab === "performance" ? refetchPerf() : refetchVal()}
              disabled={isLoading}>
              <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
            </Button>
            <Button size="sm" onClick={handleExportCsv} disabled={isLoading}>
              <Download className="w-4 h-4" /> Export CSV
            </Button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-2 border-b">
          {([
            { id: "performance", label: "Sold Performance" },
            { id: "valuation",   label: "Inventory Valuation" },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Performance tab ── */}
        {tab === "performance" && (
          <>
            {/* Date filter */}
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
              {!perfLoading && (
                <Badge variant="secondary" className="text-xs">
                  <CalendarDays className="w-3 h-3 mr-1" />{from} → {to}
                </Badge>
              )}
            </div>

            {/* Summary KPIs */}
            {!perfLoading && perfData && (() => {
              const totalRev    = perfItems.reduce((s, i) => s + i.totalRevenue, 0);
              const totalCogs   = perfItems.reduce((s, i) => s + i.totalCogs, 0);
              const totalProfit = perfItems.reduce((s, i) => s + i.grossProfit, 0);
              const avgMargin   = totalRev > 0 ? (totalProfit / totalRev) * 100 : 0;
              return (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { icon: DollarSign, label: "Total Revenue",   value: fmt$(totalRev),    color: "text-primary" },
                    { icon: Boxes,      label: "Total COGS",       value: fmt$(totalCogs),   color: "text-foreground" },
                    { icon: TrendingUp, label: "Gross Profit",     value: fmt$(totalProfit), color: "text-green-600" },
                    { icon: Percent,    label: "Avg Gross Margin", value: fmtP(avgMargin),   color: marginColor(avgMargin) },
                  ].map(k => (
                    <Card key={k.label}>
                      <CardContent className="pt-5 pb-4">
                        <k.icon className={cn("w-5 h-5 mb-2", k.color)} />
                        <p className="text-xs text-muted-foreground">{k.label}</p>
                        <p className={cn("text-2xl font-bold mt-0.5", k.color)}>{k.value}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              );
            })()}

            {/* Chart */}
            {!perfLoading && top10.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Top 10 — Gross Profit ($)</CardTitle>
                    <CardDescription>Highest contributing products by profit</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={top10} layout="vertical" margin={{ top: 0, right: 4, left: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }}
                          tickFormatter={v => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                        <Tooltip contentStyle={TOOLTIP_STYLE}
                          formatter={(v: number) => [fmt$(v), "Gross Profit"]} />
                        <Bar dataKey="profit" radius={[0, 4, 4, 0]}>
                          {top10.map((_, i) => <Cell key={i} fill={`hsl(${142 - i * 6}, 70%, 45%)`} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Top 10 — Margin %</CardTitle>
                    <CardDescription>Highest-margin products sold this period</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={top10} layout="vertical" margin={{ top: 0, right: 4, left: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} domain={[0, 100]}
                          tickFormatter={v => `${v}%`} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={90} />
                        <Tooltip contentStyle={TOOLTIP_STYLE}
                          formatter={(v: number) => [`${v.toFixed(1)}%`, "Margin"]} />
                        <Bar dataKey="margin" radius={[0, 4, 4, 0]}>
                          {top10.map((e, i) => <Cell key={i} fill={e.margin >= 40 ? "#16a34a" : e.margin >= 20 ? "#d97706" : "#dc2626"} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Search + table */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <Input placeholder="Search products…" className="max-w-xs h-8 text-sm"
                  value={searchQ} onChange={e => setSearchQ(e.target.value)} />
                {searchQ && <Button variant="ghost" size="sm" onClick={() => setSearchQ("")} className="h-8">Clear</Button>}
                <span className="text-xs text-muted-foreground ml-auto">{perfItems.length} products</span>
              </div>
              {perfLoading ? (
                <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
              ) : perfItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                  <BarChart3 className="w-10 h-10 text-muted-foreground/30" />
                  <p className="text-muted-foreground text-sm">No sales data for this period.</p>
                </div>
              ) : (
                <div className="rounded-lg border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="p-3 text-left font-medium">Product</th>
                        <SortTh label="Qty Sold" k="quantitySold" />
                        <SortTh label="Revenue" k="totalRevenue" />
                        <SortTh label="COGS" k="totalRevenue" />
                        <SortTh label="Gross Profit" k="grossProfit" />
                        <SortTh label="Margin %" k="marginPct" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {perfItems.map(i => (
                        <tr key={i.productId} className="hover:bg-muted/30">
                          <td className="p-3">
                            <p className="font-medium">{i.name}</p>
                            {i.sku && <p className="text-xs text-muted-foreground font-mono">{i.sku}</p>}
                          </td>
                          <td className="p-3 text-right text-muted-foreground">{i.quantitySold}</td>
                          <td className="p-3 text-right">{fmt$(i.totalRevenue)}</td>
                          <td className="p-3 text-right text-muted-foreground">{fmt$(i.totalCogs)}</td>
                          <td className="p-3 text-right font-medium text-green-600">{fmt$(i.grossProfit)}</td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden hidden sm:block">
                                <div className={cn("h-full rounded-full", marginBg(i.marginPct))}
                                  style={{ width: `${Math.min(i.marginPct, 100)}%` }} />
                              </div>
                              <span className={cn("font-semibold tabular-nums", marginColor(i.marginPct))}>
                                {fmtP(i.marginPct)}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Valuation tab ── */}
        {tab === "valuation" && (
          <>
            {/* Summary KPIs */}
            {!valLoading && valData && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { icon: Boxes,      label: "SKUs Tracked",       value: valData.totalSkus.toLocaleString(),                    color: "text-primary" },
                  { icon: DollarSign, label: "Cost Value",          value: fmt$(valData.totalCostValue),                          color: "text-foreground" },
                  { icon: TrendingUp, label: "Retail Value",        value: fmt$(valData.totalRetailValue),                        color: "text-blue-600" },
                  { icon: Percent,    label: "Potential Profit",    value: fmt$(valData.potentialProfit),                         color: "text-green-600" },
                ].map(k => (
                  <Card key={k.label}>
                    <CardContent className="pt-5 pb-4">
                      <k.icon className={cn("w-5 h-5 mb-2", k.color)} />
                      <p className="text-xs text-muted-foreground">{k.label}</p>
                      <p className={cn("text-2xl font-bold mt-0.5", k.color)}>{k.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Search + table */}
            <div>
              <div className="flex items-center gap-3 mb-3">
                <Input placeholder="Search products…" className="max-w-xs h-8 text-sm"
                  value={searchQ} onChange={e => setSearchQ(e.target.value)} />
                {searchQ && <Button variant="ghost" size="sm" onClick={() => setSearchQ("")} className="h-8">Clear</Button>}
                <span className="text-xs text-muted-foreground ml-auto">{valItems.length} products</span>
              </div>
              {valLoading ? (
                <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
              ) : valItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                  <Boxes className="w-10 h-10 text-muted-foreground/30" />
                  <p className="text-muted-foreground text-sm">No tracked inventory found.</p>
                </div>
              ) : (
                <div className="rounded-lg border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="p-3 text-left font-medium">Product</th>
                        <th className="p-3 text-right font-medium">Stock</th>
                        <th className="p-3 text-right font-medium hidden sm:table-cell">Cost</th>
                        <th className="p-3 text-right font-medium hidden sm:table-cell">Retail</th>
                        <th className="p-3 text-right font-medium">Cost Value</th>
                        <th className="p-3 text-right font-medium hidden md:table-cell">Retail Value</th>
                        <th className="p-3 text-right font-medium">Margin %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {valItems.map(i => (
                        <tr key={i.productId} className="hover:bg-muted/30">
                          <td className="p-3">
                            <p className="font-medium">{i.name}</p>
                            {i.sku && <p className="text-xs text-muted-foreground font-mono">{i.sku}</p>}
                          </td>
                          <td className="p-3 text-right font-medium">{i.stockQuantity}</td>
                          <td className="p-3 text-right text-muted-foreground hidden sm:table-cell">{fmt$(i.costPrice)}</td>
                          <td className="p-3 text-right hidden sm:table-cell">{fmt$(i.retailPrice)}</td>
                          <td className="p-3 text-right">{fmt$(i.costValue)}</td>
                          <td className="p-3 text-right text-blue-600 hidden md:table-cell">{fmt$(i.retailValue)}</td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden hidden sm:block">
                                <div className={cn("h-full rounded-full", marginBg(i.marginPct))}
                                  style={{ width: `${Math.min(i.marginPct, 100)}%` }} />
                              </div>
                              <span className={cn("font-semibold tabular-nums", marginColor(i.marginPct))}>
                                {fmtP(i.marginPct)}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
