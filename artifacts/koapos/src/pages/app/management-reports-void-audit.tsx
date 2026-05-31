import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import {
  ShieldAlert, Download, RefreshCw, Package, User, Clock, CalendarDays,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

type VoidEntry = {
  id: number;
  productName: string;
  quantity: number;
  unitPrice: number | null;
  action: "void" | "discount_override";
  reason: string | null;
  staffName: string | null;
  createdAt: string;
};

type DaysOption = 7 | 30 | 90;

const DAY_OPTIONS: { label: string; value: DaysOption }[] = [
  { label: "Last 7 days",  value: 7  },
  { label: "Last 30 days", value: 30 },
  { label: "Last 90 days", value: 90 },
];

const ACTION_LABELS: Record<string, string> = {
  void:              "Void",
  discount_override: "Discount Override",
};

const ACTION_COLORS: Record<string, string> = {
  void:              "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  discount_override: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function ManagementReportsVoidAuditPage() {
  const [days, setDays] = useState<DaysOption>(30);
  const [filterAction, setFilterAction] = useState<"" | "void" | "discount_override">("");

  const { data: entries = [], isLoading, isError, refetch } = useQuery<VoidEntry[]>({
    queryKey: ["void-audit", days],
    queryFn: async () => {
      const r = await fetch(`/api/void-audit?days=${days}&limit=500`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load void audit log");
      return r.json() as Promise<VoidEntry[]>;
    },
  });

  const filtered = filterAction ? entries.filter(e => e.action === filterAction) : entries;

  /* Summary stats */
  const totalVoided   = filtered.filter(e => e.action === "void").reduce((s, e) => s + (e.unitPrice ?? 0) * e.quantity, 0);
  const voidCount     = filtered.filter(e => e.action === "void").length;
  const discountCount = filtered.filter(e => e.action === "discount_override").length;
  const staffMap = new Map<string, number>();
  for (const e of filtered) {
    const name = e.staffName ?? "Unknown";
    staffMap.set(name, (staffMap.get(name) ?? 0) + 1);
  }
  const topStaff = [...staffMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  function handleExport() {
    const rows = [
      ["Date", "Action", "Product", "Qty", "Unit Price", "Value", "Staff", "Reason"],
      ...filtered.map(e => [
        new Date(e.createdAt).toLocaleString("en-AU"),
        ACTION_LABELS[e.action] ?? e.action,
        e.productName,
        String(e.quantity),
        e.unitPrice != null ? `$${e.unitPrice.toFixed(2)}` : "",
        e.unitPrice != null ? `$${(e.unitPrice * e.quantity).toFixed(2)}` : "",
        e.staffName ?? "",
        e.reason ?? "",
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })),
      download: `void-audit-${days}d.csv`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-primary" /> Void & Discount Audit
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Track every item removed from cart or discount override by staff — for shrinkage and loss prevention.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
            </Button>
            <Button size="sm" onClick={handleExport} disabled={isLoading || filtered.length === 0}>
              <Download className="w-4 h-4" /> Export CSV
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          {DAY_OPTIONS.map(o => (
            <button key={o.value} onClick={() => setDays(o.value)}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium border transition-colors",
                days === o.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-muted",
              )}>
              {o.label}
            </button>
          ))}
          <div className="h-4 w-px bg-border mx-1" />
          {(["", "void", "discount_override"] as const).map(a => (
            <button key={a} onClick={() => setFilterAction(a)}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium border transition-colors",
                filterAction === a
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-muted",
              )}>
              {a === "" ? "All" : ACTION_LABELS[a]}
            </button>
          ))}
          {!isLoading && (
            <Badge variant="secondary" className="text-xs ml-auto">
              <CalendarDays className="w-3 h-3 mr-1" />
              {filtered.length} event{filtered.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <ShieldAlert className="w-10 h-10 text-muted-foreground/30" />
            <p className="font-medium">Failed to load audit data</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
          </div>
        ) : (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { icon: Package,     label: "Items Voided",       value: String(voidCount),     sub: "Removed from cart", color: "text-red-600" },
                { icon: ShieldAlert, label: "Value Voided",       value: formatCurrency(totalVoided), sub: "At sale price", color: "text-red-600" },
                { icon: Clock,       label: "Discount Overrides", value: String(discountCount), sub: "Manual overrides",  color: "text-orange-600" },
                { icon: User,        label: "Most Active Staff",  value: topStaff[0]?.[0] ?? "—", sub: topStaff[0] ? `${topStaff[0][1]} event${topStaff[0][1] !== 1 ? "s" : ""}` : "No events", color: "text-foreground" },
              ].map(k => (
                <Card key={k.label}>
                  <CardContent className="pt-5 pb-4">
                    <k.icon className={cn("w-5 h-5 mb-2", k.color)} />
                    <p className="text-xs text-muted-foreground">{k.label}</p>
                    <p className={cn("text-2xl font-bold mt-0.5 truncate", k.color)}>{k.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{k.sub}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Staff summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="w-4 h-4" /> Events by Staff
                  </CardTitle>
                  <CardDescription>Who triggered the most void/discount events</CardDescription>
                </CardHeader>
                <CardContent>
                  {staffMap.size === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No events in this period</p>
                  ) : (
                    <div className="space-y-2">
                      {[...staffMap.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => {
                        const pct = filtered.length > 0 ? (count / filtered.length) * 100 : 0;
                        return (
                          <div key={name}>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="font-medium truncate max-w-[60%]">{name}</span>
                              <span className="text-muted-foreground">{count} event{count !== 1 ? "s" : ""}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Top voided products */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="w-4 h-4" /> Most Voided Products
                  </CardTitle>
                  <CardDescription>Products removed from cart most often</CardDescription>
                </CardHeader>
                <CardContent>
                  {filtered.filter(e => e.action === "void").length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No void events in this period</p>
                  ) : (() => {
                    const productMap = new Map<string, { count: number; value: number }>();
                    for (const e of filtered.filter(e => e.action === "void")) {
                      const prev = productMap.get(e.productName) ?? { count: 0, value: 0 };
                      productMap.set(e.productName, {
                        count: prev.count + e.quantity,
                        value: prev.value + (e.unitPrice ?? 0) * e.quantity,
                      });
                    }
                    return (
                      <div className="space-y-2">
                        {[...productMap.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 6).map(([name, s]) => (
                          <div key={name} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                            <span className="font-medium truncate max-w-[55%]">{name}</span>
                            <div className="text-right">
                              <span className="font-mono text-destructive">{formatCurrency(s.value)}</span>
                              <span className="text-muted-foreground text-xs ml-2">×{s.count}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </div>

            {/* Full log table */}
            {filtered.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Full Event Log
                </h2>
                <div className="rounded-lg border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="p-3 text-left font-medium">Date & Time</th>
                        <th className="p-3 text-left font-medium">Action</th>
                        <th className="p-3 text-left font-medium">Product</th>
                        <th className="p-3 text-right font-medium">Qty</th>
                        <th className="p-3 text-right font-medium">Value</th>
                        <th className="p-3 text-left font-medium hidden sm:table-cell">Staff</th>
                        <th className="p-3 text-left font-medium hidden md:table-cell">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filtered.slice(0, 200).map(e => (
                        <tr key={e.id} className="hover:bg-muted/30">
                          <td className="p-3 text-muted-foreground whitespace-nowrap">{fmtDate(e.createdAt)}</td>
                          <td className="p-3">
                            <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", ACTION_COLORS[e.action])}>
                              {ACTION_LABELS[e.action] ?? e.action}
                            </span>
                          </td>
                          <td className="p-3 font-medium max-w-[160px] truncate">{e.productName}</td>
                          <td className="p-3 text-right">{e.quantity}</td>
                          <td className="p-3 text-right font-mono">
                            {e.unitPrice != null ? formatCurrency(e.unitPrice * e.quantity) : "—"}
                          </td>
                          <td className="p-3 text-muted-foreground hidden sm:table-cell">{e.staffName ?? "—"}</td>
                          <td className="p-3 text-muted-foreground hidden md:table-cell">{e.reason ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filtered.length > 200 && (
                    <p className="p-3 text-xs text-muted-foreground border-t text-center">
                      Showing 200 of {filtered.length} events. Export CSV for the full log.
                    </p>
                  )}
                </div>
              </div>
            )}

            {filtered.length === 0 && !isLoading && (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <ShieldAlert className="w-10 h-10 text-muted-foreground/30" />
                <p className="font-medium">No events in this period</p>
                <p className="text-sm text-muted-foreground">Void and discount events will appear here as they happen at the POS.</p>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
