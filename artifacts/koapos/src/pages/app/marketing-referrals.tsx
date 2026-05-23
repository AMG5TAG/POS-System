import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Copy, CheckCircle2, Clock, Search, UserPlus, Star, Info,
} from "lucide-react";

/* ─── Storage ────────────────────────────────────────────────────────────── */

const SETTINGS_KEY = "koapos_customer_referral_settings";

interface ReferralSettings {
  enabled: boolean;
  minSpend: number;
  minVisits: number;
  qualifyDays: number;
  rewardType: "points" | "discount" | "gift";
  rewardAmount: number;
  rewardLabel: string;
  referrerRewardType: "points" | "discount";
  referrerRewardAmount: number;
}

const DEFAULT_SETTINGS: ReferralSettings = {
  enabled:             true,
  minSpend:            50,
  minVisits:           2,
  qualifyDays:         90,
  rewardType:          "points",
  rewardAmount:        200,
  rewardLabel:         "200 loyalty points",
  referrerRewardType:  "points",
  referrerRewardAmount:500,
};

function loadSettings(): ReferralSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) as Partial<ReferralSettings> } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

function saveSettings(s: ReferralSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

/* ─── Mock customer referral data ───────────────────────────────────────── */

interface CustomerRef {
  id: string;
  name: string;
  code: string;
  referrals: number;
  qualified: number;
  pending: number;
  pointsEarned: number;
  joinedAt: string;
  lastRef?: string;
}

const CUSTOMERS: CustomerRef[] = [
  { id: "c1", name: "Sarah Johnson",    code: "SJ-7KQP", referrals: 4, qualified: 3, pending: 1, pointsEarned: 1500, joinedAt: "2024-03-15", lastRef: "2026-04-02" },
  { id: "c2", name: "Mike Chen",        code: "MC-2WNR", referrals: 2, qualified: 1, pending: 1, pointsEarned: 500,  joinedAt: "2024-07-22", lastRef: "2026-03-18" },
  { id: "c3", name: "Aisha Patel",      code: "AP-9VBK", referrals: 1, qualified: 0, pending: 1, pointsEarned: 0,    joinedAt: "2025-01-08", lastRef: "2026-05-01" },
  { id: "c4", name: "James O'Sullivan", code: "JO-4FMX", referrals: 6, qualified: 5, pending: 1, pointsEarned: 2500, joinedAt: "2023-11-30", lastRef: "2026-04-20" },
  { id: "c5", name: "Lucy Tran",        code: "LT-3ZRC", referrals: 0, qualified: 0, pending: 0, pointsEarned: 0,    joinedAt: "2026-02-14" },
  { id: "c6", name: "Daniel Kowalski",  code: "DK-8HPE", referrals: 3, qualified: 2, pending: 1, pointsEarned: 1000, joinedAt: "2025-05-27", lastRef: "2026-03-30" },
];

interface PendingRef {
  id: string;
  name: string;
  referredBy: string;
  referredOn: string;
  spentSoFar: number;
  visitsSoFar: number;
  minSpend: number;
  minVisits: number;
  status: "in progress" | "qualified" | "expired";
}

const PENDING: PendingRef[] = [
  { id: "p1", name: "Ella Wang",       referredBy: "Sarah Johnson",    referredOn: "2026-04-02", spentSoFar: 38.50, visitsSoFar: 1, minSpend: 50, minVisits: 2, status: "in progress" },
  { id: "p2", name: "Tom Berger",      referredBy: "Mike Chen",        referredOn: "2026-03-18", spentSoFar: 15.00, visitsSoFar: 1, minSpend: 50, minVisits: 2, status: "in progress" },
  { id: "p3", name: "Grace Liu",       referredBy: "Aisha Patel",      referredOn: "2026-05-01", spentSoFar: 0,     visitsSoFar: 0, minSpend: 50, minVisits: 2, status: "in progress" },
  { id: "p4", name: "Nathan Carr",     referredBy: "James O'Sullivan", referredOn: "2026-04-20", spentSoFar: 67.20, visitsSoFar: 2, minSpend: 50, minVisits: 2, status: "qualified"   },
  { id: "p5", name: "Olivia Bright",   referredBy: "Daniel Kowalski",  referredOn: "2026-03-30", spentSoFar: 22.00, visitsSoFar: 1, minSpend: 50, minVisits: 2, status: "in progress" },
];

const PENDING_STYLES: Record<PendingRef["status"], string> = {
  "in progress": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "qualified":   "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  "expired":     "bg-muted text-muted-foreground",
};

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

/* ─── Page ──────────────────────────────────────────────────────────────── */

export default function MarketingReferralsPage() {
  const [settings] = useState<ReferralSettings>(() => loadSettings());
  const [search, setSearch]     = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    });
  };

  const filteredCustomers = CUSTOMERS.filter((c) =>
    search.trim().length === 0 ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase())
  );

  const totalReferrals  = CUSTOMERS.reduce((s, c) => s + c.referrals, 0);
  const totalQualified  = CUSTOMERS.reduce((s, c) => s + c.qualified, 0);
  const totalPending    = CUSTOMERS.reduce((s, c) => s + c.pending, 0);
  const totalPtsEarned  = CUSTOMERS.reduce((s, c) => s + c.pointsEarned, 0);

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
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className={cn("gap-1.5", settings.enabled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0" : "")}
            >
              {settings.enabled ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
              {settings.enabled ? "Program active" : "Program disabled"}
            </Badge>
          </div>
        </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Total referrals",     value: totalReferrals,  icon: UserPlus,     color: "text-blue-500"    },
                { label: "Qualified",           value: totalQualified,  icon: CheckCircle2, color: "text-emerald-500" },
                { label: "Pending",             value: totalPending,    icon: Clock,        color: "text-amber-500"   },
                { label: "Points awarded",      value: totalPtsEarned.toLocaleString(), icon: Star, color: "text-violet-500" },
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
                      <CardDescription className="mt-0.5">{CUSTOMERS.length} customers enrolled</CardDescription>
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
                      {filteredCustomers.map((c, i) => (
                        <tr key={c.id} className={cn("border-b last:border-0 hover:bg-muted/20 transition-colors", i % 2 !== 0 && "bg-muted/10")}>
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-sm">{c.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {c.qualified}/{c.referrals} qualified
                              {c.pending > 0 && <span className="text-amber-500 ml-1">· {c.pending} pending</span>}
                            </p>
                          </td>
                          <td className="px-4 py-2.5">
                            <button
                              className="flex items-center gap-1.5 font-mono text-xs bg-muted/60 hover:bg-muted rounded px-2 py-1 transition-colors group"
                              onClick={() => copyCode(c.code)}
                              title="Copy code"
                            >
                              {c.code}
                              {copiedCode === c.code
                                ? <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                : <Copy className="w-3 h-3 text-muted-foreground group-hover:text-foreground" />}
                            </button>
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-sm">
                            {c.referrals > 0 ? c.referrals : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            {c.pointsEarned > 0 ? (
                              <span className="font-semibold text-violet-600 dark:text-violet-400 tabular-nums">
                                +{c.pointsEarned.toLocaleString()}
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      ))}
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
                  {PENDING.map((p) => {
                    const spendPct = Math.min(100, (p.spentSoFar / p.minSpend) * 100);
                    const visitPct = Math.min(100, (p.visitsSoFar / p.minVisits) * 100);
                    return (
                      <div key={p.id} className="rounded-lg border bg-muted/20 px-3.5 py-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">{p.name}</p>
                            <p className="text-xs text-muted-foreground">
                              via {p.referredBy} · {new Date(p.referredOn).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                            </p>
                          </div>
                          <Badge className={cn("text-[10px] border-0 shrink-0", PENDING_STYLES[p.status])}>
                            {p.status}
                          </Badge>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span>Spend ${p.spentSoFar.toFixed(2)} / ${p.minSpend}</span>
                            <ProgressBar value={p.spentSoFar} max={p.minSpend} />
                          </div>
                          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span>{p.visitsSoFar} / {p.minVisits} visits</span>
                            <ProgressBar value={p.visitsSoFar} max={p.minVisits} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>

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
