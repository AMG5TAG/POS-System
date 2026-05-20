import { useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListStaff, useListTransactions } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Target, Trophy, BarChart3, Store, Users, Medal,
  UserSquare2, Clock, CalendarClock, ClipboardList, Coins, StickyNote, Link2,
  DollarSign, ShoppingCart, TrendingUp, UserPlus, Star, Tag, Zap, Wrench, AlertCircle, Layers,
  CheckCircle2,
} from "lucide-react";

/* ─── Tabs ───────────────────────────────────────────────────────────────── */

/* ─── KPI data from localStorage ─────────────────────────────────────────── */

type KpiMetric =
  | "revenue" | "transactions" | "avg_transaction" | "items_per_transaction"
  | "new_customers" | "loyalty_signups" | "category_revenue"
  | "appointments" | "services" | "refund_rate" | "gross_margin" | "upsell_rate";

type KpiPeriod = "daily" | "weekly" | "monthly" | "quarterly" | "annual";
type RewardType = "cash" | "percent" | "voucher" | "time_off" | "badge" | "custom";

interface KpiReward { type: RewardType; value: number; label: string; note: string; }
interface KpiTarget {
  id: string; name: string; metric: KpiMetric; categoryId: string;
  period: KpiPeriod; target: number; staffIds: string[];
  reward: KpiReward | null; notes: string; isActive: boolean;
}

function loadKpiTargets(): KpiTarget[] {
  try {
    const raw = localStorage.getItem("koapos_kpis");
    const store = raw ? JSON.parse(raw) : {};
    return Array.isArray(store.targets) ? store.targets : [];
  } catch { return []; }
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
  const { data: txData } = useListTransactions(undefined, { query: { queryKey: ["transactions"] } });

  const staffList = (Array.isArray(staffData) ? staffData : []) as { id: number; name: string; role?: string }[];
  const txList = (Array.isArray(txData) ? txData : []) as { total?: number; status?: string }[];

  const targets = useMemo(() => loadKpiTargets().filter((t) => t.isActive), []);

  /* Compute actual store-level values */
  const completedTx = txList.filter((t) => t.status === "completed");
  const totalRevenue = completedTx.reduce((s, t) => s + (t.total ?? 0), 0);
  const txCount      = completedTx.length;
  const avgTx        = txCount > 0 ? totalRevenue / txCount : 0;

  const actualValues: Partial<Record<KpiMetric, number>> = {
    revenue: totalRevenue, transactions: txCount, avg_transaction: avgTx,
  };

  const storeKpis = targets.filter((t) => t.staffIds.length === 0);
  const staffKpis = targets.filter((t) => t.staffIds.length > 0);

  /* Build per-staff summary for leaderboard */
  const leaderboard = useMemo(() => {
    return staffList.map((member) => {
      const myKpis = staffKpis.filter((k) => k.staffIds.includes(String(member.id)));
      const hitCount = myKpis.filter((k) => {
        const actual = actualValues[k.metric] ?? 0;
        const pct = k.target > 0 ? (actual / k.target) * 100 : 0;
        return METRIC_META[k.metric].isInverse ? pct <= 100 : pct >= 100;
      }).length;
      const totalTargets = myKpis.length;
      const score = totalTargets > 0 ? Math.round((hitCount / totalTargets) * 100) : 0;
      return { ...member, myKpis, hitCount, totalTargets, score };
    })
    .filter((m) => m.totalTargets > 0)
    .sort((a, b) => b.score - a.score || b.hitCount - a.hitCount);
  }, [staffList, staffKpis]);

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
                      <KpiRow key={kpi.id} kpi={kpi} current={actualValues[kpi.metric] ?? 0} />
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
                          <KpiRow key={kpi.id} kpi={kpi} current={actualValues[kpi.metric] ?? 0} />
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
