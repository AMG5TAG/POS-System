import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useListCustomers, useGenerateCustomerReferralCode, Customer } from "@workspace/api-client-react";
import { toast } from "sonner";
import {
  Copy, CheckCircle2, Clock, Search, UserPlus, Star, Info, Sparkles, Loader2,
} from "lucide-react";

/* ─── Settings (local defaults — referral program config) ──────────────────── */

const SETTINGS = {
  enabled:             true,
  minSpend:            50,
  minVisits:           2,
  qualifyDays:         90,
  rewardType:          "points" as const,
  rewardAmount:        200,
  rewardLabel:         "200 loyalty points",
  referrerRewardType:  "points" as const,
  referrerRewardAmount:500,
};

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0);
  return (
    <div className="h-1.5 rounded-full bg-muted overflow-hidden w-20">
      <div
        className={cn("h-full rounded-full transition-all", pct >= 100 ? "bg-emerald-500" : "bg-primary")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function nameOf(c: Customer) {
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unknown";
}

function daysSince(d?: string | null) {
  if (!d) return Infinity;
  return Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24));
}

/* ─── Activate card for a single customer without a code ───────────────────── */

function ActivateCodeCard({ customer, onActivated }: { customer: Customer; onActivated: (code: string) => void }) {
  const generate = useGenerateCustomerReferralCode();

  const handleActivate = () => {
    generate.mutate({ id: customer.id }, {
      onSuccess: (updated) => {
        const code = (updated as Customer).referralCode ?? "";
        onActivated(code);
        toast.success(`Referral code activated: ${code}`);
      },
      onError: () => toast.error("Failed to activate referral code"),
    });
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
          {nameOf(customer).slice(0, 2).toUpperCase()}
        </div>
        <p className="text-sm font-medium truncate">{nameOf(customer)}</p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 gap-1.5 text-primary border-primary/40 hover:bg-primary/5"
        onClick={handleActivate}
        disabled={generate.isPending}
      >
        {generate.isPending
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Sparkles className="w-3.5 h-3.5" />
        }
        {generate.isPending ? "Activating…" : "Activate My Referral Code"}
      </Button>
    </div>
  );
}

/* ─── Page ─────────────────────────────────────────────────────────────────── */

export default function MarketingReferralsPage() {
  const [search, setSearch] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const { data, isLoading, refetch } = useListCustomers({ limit: 500, offset: 0 });
  const customers = data?.items ?? [];

  /* Build referral code -> referrer name map */
  const codeToName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of customers) {
      if (c.referralCode) map.set(c.referralCode, nameOf(c));
    }
    return map;
  }, [customers]);

  /* Customers with a referral code = enrolled referrers */
  const enrolled = useMemo(() => customers.filter((c) => !!c.referralCode), [customers]);

  /* Customers WITHOUT a referral code */
  const notEnrolled = useMemo(() => customers.filter((c) => !c.referralCode), [customers]);

  /* Referred customers: customers with referredBy matching an enrolled code */
  const referredCustomers = useMemo(() =>
    customers.filter((c) => c.referredBy && codeToName.has(c.referredBy)),
    [customers, codeToName],
  );

  /* Count qualified vs pending per referrer */
  const statsByCustomer = useMemo(() => {
    const stats = new Map<number, { referrals: number; qualified: number; pending: number; points: number }>();
    for (const c of enrolled) stats.set(c.id, { referrals: 0, qualified: 0, pending: 0, points: 0 });
    for (const r of referredCustomers) {
      const code = r.referredBy!;
      const referrer = enrolled.find((c) => c.referralCode === code);
      if (!referrer) continue;
      const s = stats.get(referrer.id)!;
      s.referrals += 1;
      const days = daysSince(r.createdAt);
      const isQualified = ((r.totalSpent ?? 0) >= SETTINGS.minSpend)
        && ((r.visitCount ?? 0) >= SETTINGS.minVisits)
        && (days <= SETTINGS.qualifyDays);
      if (isQualified) { s.qualified += 1; s.points += SETTINGS.referrerRewardAmount; }
      else s.pending += 1;
    }
    return stats;
  }, [enrolled, referredCustomers]);

  const filteredCustomers = enrolled.filter((c) =>
    search.trim().length === 0 ||
    nameOf(c).toLowerCase().includes(search.toLowerCase()) ||
    (c.referralCode ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const totalReferrals = enrolled.reduce((s, c) => s + (statsByCustomer.get(c.id)?.referrals ?? 0), 0);
  const totalQualified = enrolled.reduce((s, c) => s + (statsByCustomer.get(c.id)?.qualified ?? 0), 0);
  const totalPending   = enrolled.reduce((s, c) => s + (statsByCustomer.get(c.id)?.pending ?? 0), 0);
  const totalPtsEarned = enrolled.reduce((s, c) => s + (statsByCustomer.get(c.id)?.points ?? 0), 0);

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-6 md:p-8 space-y-6">
          <div className="animate-pulse h-8 w-48 bg-muted rounded" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <div className="h-64 bg-muted rounded-lg animate-pulse" />
            <div className="h-64 bg-muted rounded-lg animate-pulse" />
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Customer Referrals</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Customers receive a unique referral code on enrolment. When their referee meets the criteria, both parties earn rewards.
            </p>
          </div>
          <Badge
            variant="secondary"
            className={cn("gap-1.5", SETTINGS.enabled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0" : "")}
          >
            {SETTINGS.enabled ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
            {SETTINGS.enabled ? "Program active" : "Program disabled"}
          </Badge>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total referrals",     value: totalReferrals,                   icon: UserPlus,     color: "text-blue-500"    },
            { label: "Qualified",           value: totalQualified,                   icon: CheckCircle2, color: "text-emerald-500" },
            { label: "Pending",             value: totalPending,                     icon: Clock,        color: "text-amber-500"   },
            { label: "Points awarded",      value: totalPtsEarned.toLocaleString(),  icon: Star,         color: "text-violet-500"  },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
                  <Icon className={cn("w-4 h-4", color)} />
                </div>
                <p className="text-2xl font-bold">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Customer referral table */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Customer Referral Codes</CardTitle>
                  <CardDescription className="mt-0.5">{enrolled.length} customer{enrolled.length === 1 ? "" : "s"} enrolled</CardDescription>
                </div>
                <div className="relative w-44">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-7 text-xs"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    {["Customer", "Code", "Refs", "Points"].map((h) => (
                      <th key={h} className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">
                        No customers with referral codes yet.
                      </td>
                    </tr>
                  )}
                  {filteredCustomers.map((c, i) => {
                    const stats = statsByCustomer.get(c.id)!;
                    return (
                      <tr key={c.id} className={cn("border-b last:border-0 hover:bg-muted/20 transition-colors", i % 2 !== 0 && "bg-muted/10")}>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-sm">{nameOf(c)}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {stats.qualified}/{stats.referrals} qualified
                            {stats.pending > 0 && <span className="text-amber-500 ml-1">· {stats.pending} pending</span>}
                          </p>
                        </td>
                        <td className="px-4 py-2.5">
                          <button
                            className="flex items-center gap-1.5 font-mono text-xs bg-muted/60 hover:bg-muted rounded px-2 py-1 transition-colors group"
                            onClick={() => copyCode(c.referralCode!)}
                            title="Copy code"
                          >
                            {c.referralCode}
                            {copiedCode === c.referralCode
                              ? <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                              : <Copy className="w-3 h-3 text-muted-foreground group-hover:text-foreground" />}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 tabular-nums text-sm">
                          {stats.referrals > 0 ? stats.referrals : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          {stats.points > 0 ? (
                            <span className="font-semibold text-violet-600 dark:text-violet-400 tabular-nums">
                              +{stats.points.toLocaleString()}
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Pending referrals */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pending Referrals</CardTitle>
              <CardDescription className="mt-0.5">Referred customers yet to meet the qualification criteria</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {referredCustomers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No referred customers yet. Customers with a <em>Referred By</em> code matching an enrolled referrer will appear here.
                </p>
              ) : (
                referredCustomers.map((r) => {
                  const spendPct = Math.min(100, ((r.totalSpent ?? 0) / SETTINGS.minSpend) * 100);
                  void spendPct;
                  const days = daysSince(r.createdAt);
                  const isExpired = days > SETTINGS.qualifyDays;
                  const isQualified = !isExpired && (r.totalSpent ?? 0) >= SETTINGS.minSpend && (r.visitCount ?? 0) >= SETTINGS.minVisits;
                  const status: "in progress" | "qualified" | "expired" = isQualified ? "qualified" : isExpired ? "expired" : "in progress";
                  const badgeStyle: Record<typeof status, string> = {
                    "in progress": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                    "qualified":   "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                    "expired":     "bg-muted text-muted-foreground",
                  };
                  return (
                    <div key={r.id} className="rounded-lg border bg-muted/20 px-3.5 py-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{nameOf(r)}</p>
                          <p className="text-xs text-muted-foreground">
                            via {codeToName.get(r.referredBy!) ?? r.referredBy} · {new Date(r.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                          </p>
                        </div>
                        <Badge className={cn("text-[10px] border-0 shrink-0", badgeStyle[status])}>
                          {status}
                        </Badge>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>Spend ${(r.totalSpent ?? 0).toFixed(2)} / ${SETTINGS.minSpend}</span>
                          <ProgressBar value={r.totalSpent ?? 0} max={SETTINGS.minSpend} />
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>{r.visitCount ?? 0} / {SETTINGS.minVisits} visits</span>
                          <ProgressBar value={r.visitCount ?? 0} max={SETTINGS.minVisits} />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* Customers without a referral code */}
        {notEnrolled.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    Activate Referral Codes
                  </CardTitle>
                  <CardDescription className="mt-0.5">
                    {notEnrolled.length} customer{notEnrolled.length === 1 ? "" : "s"} {notEnrolled.length === 1 ? "doesn't" : "don't"} have a referral code yet. Activate one to enrol them in the program.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {notEnrolled.map((c) => (
                <ActivateCodeCard
                  key={c.id}
                  customer={c}
                  onActivated={() => void refetch()}
                />
              ))}
            </CardContent>
          </Card>
        )}

        {/* Info banner */}
        <div className="flex items-start gap-3 rounded-lg border bg-muted/30 px-4 py-3">
          <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Auto-assigned codes: </span>
            New customers added to the system are automatically assigned a referral code based on their initials. Codes are shown on the customer profile and can be shared directly by the customer or copied from this page.
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
