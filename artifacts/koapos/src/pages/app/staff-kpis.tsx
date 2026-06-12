import { useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListStaff, useListTransactions, useListKpiTargets, useListInvoices, useListProducts, useGetKpiSettings } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Target, Trophy, BarChart3, Store, Users, Medal,
  UserSquare2, Clock, CalendarClock, ClipboardList, Coins, StickyNote, Link2,
  DollarSign, ShoppingCart, TrendingUp, UserPlus, Star, Tag, Zap, Wrench, AlertCircle, Layers,
  CheckCircle2, Banknote,
} from "lucide-react";

/* ─── Tabs ───────────────────────────────────────────────────────────────── */

/* ─── KPI data ─────────────────────────────────────────────────────────── */

type KpiMetric =
  | "revenue" | "transactions" | "avg_transaction" | "items_per_transaction"
  | "new_customers" | "loyalty_signups" | "category_revenue"
  | "appointments" | "services" | "refund_rate" | "gross_margin" | "upsell_rate"
  | "net_profit";

type KpiPeriod = "daily" | "weekly" | "monthly" | "quarterly" | "annual";
type RewardType = "cash" | "percent" | "voucher" | "time_off" | "badge" | "custom";

interface KpiReward { type: RewardType; value: number; label: string; note: string; }
interface KpiTarget {
  id: string; name: string; metric: KpiMetric; categoryId: string;
  period: KpiPeriod; target: number; staffIds: string[];
  reward: KpiReward | null; notes: string; isActive: boolean;
  startDate: string | null;
}

function mapKpiTarget(r: {
  id: number; targetId: string; name: string; metric: string; categoryId: string;
  period: string; target: number; staffIds: string; reward: string; notes: string; isActive: string;
  startDate?: string | null;
}): KpiTarget {
  let staffIds: string[] = [];
  let reward: KpiReward | null = null;
  try { staffIds = typeof r.staffIds === "string" ? JSON.parse(r.staffIds) : []; } catch { staffIds = []; }
  try { reward = typeof r.reward === "string" ? JSON.parse(r.reward) : null; } catch { reward = null; }
  return {
    id: String(r.id), name: r.name,
    metric: r.metric as KpiMetric, categoryId: r.categoryId ?? "",
    period: r.period as KpiPeriod, target: r.target,
    staffIds, reward, notes: r.notes ?? "",
    isActive: String(r.isActive) !== "false",
    startDate: r.startDate ?? null,
  };
}

/* ─── Period windows (mirrors Management → KPIs) ─────────────────────────── */

const WEEK_START_DAYS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

function getPeriodStart(period: KpiPeriod, weekStartDay = "monday", startDate?: string | null): Date {
  if (startDate) {
    const d = new Date(startDate + "T00:00:00");
    if (!isNaN(d.getTime())) return d;
  }
  const now = new Date();
  switch (period) {
    case "daily": {
      const d = new Date(now); d.setHours(0, 0, 0, 0); return d;
    }
    case "weekly": {
      const d = new Date(now);
      const startDow = WEEK_START_DAYS[weekStartDay] ?? 1;
      const daysBack = (d.getDay() - startDow + 7) % 7;
      d.setDate(d.getDate() - daysBack);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "monthly": {
      return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    }
    case "quarterly": {
      const q = Math.floor(now.getMonth() / 3);
      return new Date(now.getFullYear(), q * 3, 1, 0, 0, 0, 0);
    }
    case "annual": {
      return new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    }
    default: {
      return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    }
  }
}

/* ─── Metric metadata ────────────────────────────────────────────────────── */

const METRIC_META: Record<KpiMetric, { label: string; icon: React.ElementType; isCurrency: boolean; isInverse?: boolean }> = {
  revenue:              { label: "Total Revenue",         icon: DollarSign,    isCurrency: true  },
  transactions:         { label: "Transactions",          icon: ShoppingCart,  isCurrency: false },
  avg_transaction:      { label: "Avg Transaction",       icon: TrendingUp,    isCurrency: true  },
  items_per_transaction:{ label: "Items Per Transaction", icon: Layers,        isCurrency: false },
  new_customers:        { label: "New Customers",         icon: UserPlus,      isCurrency: false },
  loyalty_signups:      { label: "Loyalty Sign-ups",      icon: Star,          isCurrency: false },
  category_revenue:     { label: "Category Revenue",      icon: Tag,           isCurrency: true  },
  appointments:         { label: "Appointments",          icon: CalendarClock, isCurrency: false },
  services:             { label: "Services",              icon: Wrench,        isCurrency: false },
  refund_rate:          { label: "Refund Rate",           icon: AlertCircle,   isCurrency: false, isInverse: true },
  gross_margin:         { label: "Gross Margin",          icon: BarChart3,     isCurrency: false },
  upsell_rate:          { label: "Upsell Rate",           icon: Zap,           isCurrency: false },
  net_profit:           { label: "Net Profit",            icon: Banknote,      isCurrency: true  },
};

const PERIOD_LABELS: Record<KpiPeriod, string> = {
  daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", annual: "Annual",
};

const REWARD_META: Record<RewardType, { label: string }> = {
  cash: { label: "Cash Bonus" }, percent: { label: "% Bonus" }, voucher: { label: "Gift Voucher" },
  time_off: { label: "Time Off" }, badge: { label: "Badge" }, custom: { label: "Custom" },
};

function fmtVal(metric: KpiMetric, v: number) {
  const m = METRIC_META[metric];
  if (m.isCurrency) return `$${v.toLocaleString("en-AU", { minimumFractionDigits: 0 })}`;
  return v.toLocaleString();
}

function pctColor(pct: number, isInverse?: boolean) {
  const eff = isInverse ? 100 - pct : pct;
  if (eff >= 100) return "text-green-600";
  if (eff >= 70)  return "text-amber-500";
  return "text-rose-500";
}

/* ─── Medal component ────────────────────────────────────────────────────── */

function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) return <Medal className="w-5 h-5 text-yellow-500" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-slate-400" />;
  if (rank === 3) return <Medal className="w-5 h-5 text-amber-700" />;
  return <span className="w-5 h-5 flex items-center justify-center text-xs font-bold text-muted-foreground">#{rank}</span>;
}

/* ─── KPI progress row ───────────────────────────────────────────────────── */

function KpiRow({ kpi, current }: { kpi: KpiTarget; current: number }) {
  const meta = METRIC_META[kpi.metric];
  const Icon = meta.icon;
  const pct = kpi.target > 0 ? Math.min(Math.round((current / kpi.target) * 100), 100) : 0;
  const color = pctColor(pct, meta.isInverse);
  const hit = pct >= 100;

  return (
    <div className="py-3 border-b last:border-0 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{kpi.name}</span>
          {hit && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
        </div>
        <span className={cn("text-sm font-semibold shrink-0 tabular-nums", color)}>
          {fmtVal(kpi.metric, current)} / {fmtVal(kpi.metric, kpi.target)}
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{pct}% of target</span>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs py-0 h-5">{PERIOD_LABELS[kpi.period]}</Badge>
          {kpi.reward && (
            <span className="flex items-center gap-1 text-amber-600">
              <Trophy className="w-3 h-3" />{REWARD_META[kpi.reward.type].label}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function StaffKpisPage() {
  const { data: staffData } = useListStaff({ query: { queryKey: ["staff"] } });
  const { data: settingsRaw } = useGetKpiSettings({ query: { queryKey: ["kpi-settings"] } });
  const weekStartDay = String(settingsRaw?.weekStartDay ?? "monday");

  const staffList = (Array.isArray(staffData) ? staffData : []) as { id: number; name: string; role?: string }[];

  const { data: kpiData } = useListKpiTargets({ query: { queryKey: ["kpi-targets"] } });
  const rawTargets = (kpiData as { items?: unknown[] } | undefined)?.items ?? [];
  const targets = useMemo(
    () => (rawTargets as Parameters<typeof mapKpiTarget>[0][]).map(mapKpiTarget).filter((t) => t.isActive && t.metric in METRIC_META),
    [rawTargets],
  );

  /* Fetch transactions back to the earliest active KPI window so every
     target's actual covers its full period (mirrors Management → KPIs). */
  const txFromDate = useMemo(() => {
    if (targets.length === 0) return getPeriodStart("monthly", weekStartDay);
    const starts = targets.map((t) => getPeriodStart(t.period, weekStartDay, t.startDate));
    return new Date(Math.min(...starts.map((d) => d.getTime())));
  }, [targets, weekStartDay]);
  const txFromISO = txFromDate.toISOString().slice(0, 10);

  const { data: txData } = useListTransactions(
    { from: txFromISO, limit: 5000 },
    { query: { queryKey: ["transactions", txFromISO] } },
  );
  const txList = (txData?.items ?? []) as {
    total?: number; taxTotal?: number; status?: string; createdAt?: string;
    items?: { quantity?: number; costPrice?: number; productId?: number }[];
  }[];

  /* Product cost prices, used to value COGS for the net_profit metric when a
     line item doesn't carry a costPrice snapshot (mirrors Management → KPIs). */
  const { data: productsData } = useListProducts(
    { limit: 1000 },
    { query: { queryKey: ["staff-kpi-products"] } },
  );
  const productCostById = useMemo(() => {
    const m = new Map<number, number>();
    const list = (productsData?.items ?? []) as { id: number; costPrice?: number | null }[];
    for (const p of list) if (p.costPrice != null) m.set(p.id, p.costPrice);
    return m;
  }, [productsData]);

  /* Paid invoices count toward the revenue / transactions / avg_transaction
     metrics, matching the dashboard KPI tile and Management → KPIs — without
     them, paying an invoice never moves these targets. */
  const { data: invoicesData } = useListInvoices(
    { status: "paid", limit: 1000 },
    { query: { queryKey: ["staff-kpi-invoices"] } },
  );
  const paidInvoices = (invoicesData?.items ?? []) as { total?: number; paidAt?: string | null }[];

  /* Per-KPI actual values, each filtered to its own period window. */
  const actualByKpiId = useMemo(() => {
    const result: Record<string, number> = {};
    // COGS for a set of transactions: prefer the line-item costPrice snapshot,
    // fall back to the product's current cost price, then 0. Mirrors the
    // server-side Net Profit calculation and Management → KPIs.
    const cogsOf = (txns: typeof txList) =>
      txns.reduce((s, t) => {
        const items = t.items ?? [];
        return s + items.reduce((si, i) => {
          const unitCost = i.costPrice ?? (i.productId != null ? productCostById.get(i.productId) ?? 0 : 0);
          return si + unitCost * (i.quantity ?? 1);
        }, 0);
      }, 0);
    for (const kpi of targets) {
      const periodStart = getPeriodStart(kpi.period, weekStartDay, kpi.startDate);
      const txInPeriod = txList.filter(
        (t) => t.status === "completed" && t.createdAt != null && new Date(t.createdAt) >= periodStart,
      );
      const invInPeriod = paidInvoices.filter(
        (inv) => inv.paidAt != null && new Date(inv.paidAt) >= periodStart,
      );
      const revenue =
        txInPeriod.reduce((s, t) => s + (t.total ?? 0), 0) +
        invInPeriod.reduce((s, inv) => s + (inv.total ?? 0), 0);
      const count = txInPeriod.length + invInPeriod.length;
      switch (kpi.metric) {
        case "revenue":         result[kpi.id] = Math.round(revenue * 100) / 100; break;
        case "transactions":    result[kpi.id] = count; break;
        case "avg_transaction": result[kpi.id] = count > 0 ? Math.round((revenue / count) * 100) / 100 : 0; break;
        case "items_per_transaction": {
          // Average line-item quantity per transaction. Divides by transaction
          // count only (invoices excluded), matching Management → KPIs.
          const totalItems = txInPeriod.reduce(
            (s, t) => s + (t.items ?? []).reduce((si, i) => si + (i.quantity ?? 1), 0), 0,
          );
          result[kpi.id] = txInPeriod.length > 0 ? Math.round((totalItems / txInPeriod.length) * 100) / 100 : 0;
          break;
        }
        case "net_profit": {
          // Ex-GST transaction revenue (total minus the GST component) less COGS,
          // matching the Profit & Loss report. Invoices are excluded here, as in
          // Management → KPIs, since they carry no line-item cost basis.
          const exGstRevenue = txInPeriod.reduce((s, t) => s + ((t.total ?? 0) - (t.taxTotal ?? 0)), 0);
          result[kpi.id] = Math.round((exGstRevenue - cogsOf(txInPeriod)) * 100) / 100;
          break;
        }
        case "gross_margin": {
          // (Ex-GST revenue − COGS) / ex-GST revenue, as a percentage. Same
          // basis as net_profit and Management → KPIs.
          const exGstRevenue = txInPeriod.reduce((s, t) => s + ((t.total ?? 0) - (t.taxTotal ?? 0)), 0);
          result[kpi.id] = exGstRevenue > 0
            ? Math.round(((exGstRevenue - cogsOf(txInPeriod)) / exGstRevenue) * 10000) / 100
            : 0;
          break;
        }
        default:                result[kpi.id] = 0;
      }
    }
    return result;
  }, [targets, txList, paidInvoices, weekStartDay, productCostById]);

  const storeKpis = targets.filter((t) => t.staffIds.length === 0);
  const staffKpis = targets.filter((t) => t.staffIds.length > 0);

  /* Build per-staff summary for leaderboard */
  const leaderboard = useMemo(() => {
    return staffList.map((member) => {
      const myKpis = staffKpis.filter((k) => k.staffIds.includes(String(member.id)));
      const hitCount = myKpis.filter((k) => {
        const actual = actualByKpiId[k.id] ?? 0;
        const pct = k.target > 0 ? (actual / k.target) * 100 : 0;
        return METRIC_META[k.metric].isInverse ? pct <= 100 : pct >= 100;
      }).length;
      const totalTargets = myKpis.length;
      const score = totalTargets > 0 ? Math.round((hitCount / totalTargets) * 100) : 0;
      return { ...member, myKpis, hitCount, totalTargets, score };
    })
    .filter((m) => m.totalTargets > 0)
    .sort((a, b) => b.score - a.score || b.hitCount - a.hitCount);
  }, [staffList, staffKpis, actualByKpiId]);

  /* Group staff KPIs by staff member */
  const staffGroups = useMemo(() => {
    const map = new Map<string, { name: string; kpis: KpiTarget[] }>();
    for (const kpi of staffKpis) {
      for (const sid of kpi.staffIds) {
        if (!map.has(sid)) {
          const m = staffList.find((s) => String(s.id) === sid);
          map.set(sid, { name: m?.name ?? `Staff #${sid}`, kpis: [] });
        }
        map.get(sid)!.kpis.push(kpi);
      }
    }
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v }));
  }, [staffKpis, staffList]);

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">KPIs</h1>
            <p className="text-sm text-muted-foreground mt-1">KPI tracker and team leaderboard.</p>
          </div>
        </div>


        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* ── LEFT ───────────────────────────────────────────────────────── */}
          <div className="space-y-6">

            {/* Store KPIs */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-primary" />
                <h2 className="font-semibold">Store KPIs</h2>
                <Badge variant="secondary">{storeKpis.length}</Badge>
              </div>

              {storeKpis.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed py-8 text-center text-muted-foreground">
                  <Store className="h-7 w-7 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No store KPIs configured.</p>
                  <p className="text-xs mt-1">Set them up in Management › KPIs & Targets.</p>
                </div>
              ) : (
                <Card>
                  <CardContent className="pt-4">
                    {storeKpis.map((kpi) => (
                      <KpiRow key={kpi.id} kpi={kpi} current={actualByKpiId[kpi.id] ?? 0} />
                    ))}
                  </CardContent>
                </Card>
              )}
            </section>

            {/* Staff KPI groups */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <h2 className="font-semibold">Staff KPIs</h2>
                <Badge variant="secondary">{staffKpis.length}</Badge>
              </div>

              {staffGroups.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed py-8 text-center text-muted-foreground">
                  <Users className="h-7 w-7 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No staff KPIs configured.</p>
                  <p className="text-xs mt-1">Assign them in Management › KPIs & Targets.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {staffGroups.map((group) => (
                    <div key={group.id} className="rounded-xl border overflow-hidden">
                      <div className="px-4 py-3 bg-muted/20 border-b flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-muted-foreground" />
                        <p className="font-semibold text-sm">{group.name}</p>
                        <Badge variant="secondary" className="text-xs ml-auto">{group.kpis.length} targets</Badge>
                      </div>
                      <div className="px-4">
                        {group.kpis.map((kpi) => (
                          <KpiRow key={kpi.id} kpi={kpi} current={actualByKpiId[kpi.id] ?? 0} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* ── RIGHT ──────────────────────────────────────────────────────── */}
          <div className="space-y-6">

            {/* Leaderboard */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-primary" />
                <h2 className="font-semibold">Leaderboard</h2>
              </div>

              {leaderboard.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed py-8 text-center text-muted-foreground">
                  <Trophy className="h-7 w-7 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No staff KPIs to rank yet.</p>
                  <p className="text-xs mt-1">Assign staff KPIs to see the leaderboard.</p>
                </div>
              ) : (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Team Rankings</CardTitle>
                    <CardDescription className="text-xs">Ranked by % of assigned targets reached.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-0 divide-y">
                    {leaderboard.map((member, idx) => (
                      <div key={member.id} className={cn(
                        "flex items-center gap-3 py-3",
                        idx === 0 && "bg-yellow-50/50 dark:bg-yellow-950/10 -mx-6 px-6 rounded-t-lg"
                      )}>
                        <RankMedal rank={idx + 1} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{member.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {member.hitCount} / {member.totalTargets} target{member.totalTargets !== 1 ? "s" : ""} hit
                          </p>
                          <Progress value={member.score} className="h-1.5 mt-1.5" />
                        </div>
                        <span className={cn(
                          "text-sm font-bold tabular-nums shrink-0",
                          member.score >= 100 ? "text-green-600" : member.score >= 70 ? "text-amber-500" : "text-rose-500"
                        )}>
                          {member.score}%
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </section>

            {/* Summary stats */}
            {targets.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  <h2 className="font-semibold">Quick Stats</h2>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Total KPIs",   value: targets.length,       icon: Target },
                    { label: "Store KPIs",   value: storeKpis.length,     icon: Store  },
                    { label: "Staff KPIs",   value: staffKpis.length,     icon: Users  },
                    { label: "With Rewards", value: targets.filter((t) => t.reward).length, icon: Trophy },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="rounded-xl border bg-card p-4 flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        <p className="text-xl font-bold">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
