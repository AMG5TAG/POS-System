import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Copy, CheckCircle2, Clock, Users, DollarSign, TrendingUp,
  Gift, Star, ExternalLink, ChevronRight, Mail, Building2,
} from "lucide-react";
import { useListPartnerReferrals } from "@workspace/api-client-react";

/* ─── Constants ─────────────────────────────────────────────────────────── */

type ReferralStatus = "active" | "pending" | "trial" | "churned";

const BONUS_TIERS = [
  { label: "1st referral",  bonus: "$50 account credit",  icon: Star      },
  { label: "3 referrals",   bonus: "$175 account credit", icon: Gift      },
  { label: "5 referrals",   bonus: "1 month free",        icon: TrendingUp },
  { label: "10 referrals",  bonus: "2 months free",       icon: TrendingUp },
];

const STATUS_STYLES: Record<ReferralStatus, string> = {
  active:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  trial:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  churned: "bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<ReferralStatus, string> = {
  active:  "Active",
  trial:   "Trial",
  pending: "Invited",
  churned: "Churned",
};

export default function ManagementKoaPOSPage() {
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useListPartnerReferrals({
    query: { queryKey: ["partner-referrals"] },
  });

  const referrals = data?.referrals ?? [];
  const activeCount  = referrals.filter((r) => r.status === "active").length;
  const trialCount   = referrals.filter((r) => r.status === "trial").length;
  const pendingCount = referrals.filter((r) => r.status === "pending").length;
  const totalEarned  = referrals.reduce((s, r) => s + r.bonusEarned, 0);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">KoaPOS Partner Referrals</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Refer other Australian retailers to KoaPOS and earn account credits and free months for every successful sign-up.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Active referrals",     value: activeCount,          icon: CheckCircle2, color: "text-emerald-500" },
            { label: "In trial",             value: trialCount,           icon: Clock,        color: "text-blue-500"    },
            { label: "Invited (pending)",    value: pendingCount,         icon: Users,        color: "text-amber-500"   },
            { label: "Total credits earned", value: `$${totalEarned}`,   icon: DollarSign,   color: "text-violet-500"  },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
                  <Icon className={cn("w-4 h-4", color)} />
                </div>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <p className="text-2xl font-bold">{value}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Referral link */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Your Referral Link</CardTitle>
              <CardDescription>Share this link with other business owners to invite them to KoaPOS.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Code */}
              <div className="rounded-lg bg-muted/50 border px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Referral code</p>
                  {isLoading ? (
                    <Skeleton className="h-5 w-28 mt-1" />
                  ) : (
                    <p className="font-mono font-semibold tracking-widest text-sm">{data?.referralCode}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-1.5 h-7 shrink-0"
                  disabled={isLoading || !data?.referralCode}
                  onClick={() => handleCopy(data?.referralCode ?? "")}
                >
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>

              {/* URL */}
              <div className="flex gap-2">
                {isLoading ? (
                  <Skeleton className="h-8 flex-1" />
                ) : (
                  <Input readOnly value={data?.referralUrl ?? ""} className="text-xs font-mono h-8" />
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 h-8 gap-1.5"
                  disabled={isLoading || !data?.referralUrl}
                  onClick={() => handleCopy(data?.referralUrl ?? "")}
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>

              <Separator />

              {/* Share actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 h-8"
                  disabled={isLoading || !data?.referralUrl}
                  onClick={() => {
                    const subject = encodeURIComponent("Try KoaPOS for your business");
                    const body = encodeURIComponent(
                      `Hi,\n\nI've been using KoaPOS for my retail store and thought you'd find it useful.\n\nSign up with my referral link to get started:\n${data?.referralUrl}\n\nCheers`
                    );
                    window.open(`mailto:?subject=${subject}&body=${body}`);
                  }}
                >
                  <Mail className="w-3.5 h-3.5" /> Email Invite
                </Button>
                <a href="https://koapos.com" target="_blank" rel="noopener noreferrer" className="flex-1">
                  <Button variant="outline" size="sm" className="w-full gap-1.5 h-8">
                    <ExternalLink className="w-3.5 h-3.5" /> View KoaPOS Site
                  </Button>
                </a>
              </div>
            </CardContent>
          </Card>

          {/* Bonus tiers */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Reward Tiers</CardTitle>
              <CardDescription>Bonuses are applied to your account once a referred merchant completes their first paid month.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {BONUS_TIERS.map(({ label, bonus, icon: Icon }) => (
                <div key={label} className="flex items-center gap-3 py-2 border-b last:border-0">
                  <div className="rounded-lg bg-violet-100 dark:bg-violet-900/30 p-1.5 shrink-0">
                    <Icon className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{label}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant="secondary" className="font-semibold">{bonus}</Badge>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                </div>
              ))}
              <div className="pt-2 rounded-lg bg-muted/40 border px-3 py-2.5 text-xs text-muted-foreground">
                Credits are applied within 5 business days of qualifying. Additional referrals earn cumulative rewards.
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Referrals table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Referred Businesses</CardTitle>
                <CardDescription className="mt-0.5">
                  {isLoading ? (
                    <Skeleton className="h-4 w-40 inline-block" />
                  ) : (
                    `${referrals.length} total referral${referrals.length !== 1 ? "s" : ""} · ${activeCount} active`
                  )}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : referrals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <Building2 className="w-10 h-10 text-muted-foreground/40 mb-3" />
                <p className="font-medium text-sm">No referrals yet</p>
                <p className="text-xs text-muted-foreground mt-1">Share your partner link to get started.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      {["Business", "Contact", "Referred On", "Plan", "Status", "Bonus Earned"].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {referrals.map((r, i) => (
                      <tr key={r.id} className={cn("border-b last:border-0 hover:bg-muted/20 transition-colors", i % 2 !== 0 && "bg-muted/10")}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="rounded-md bg-muted p-1.5 shrink-0">
                              <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                            </div>
                            <span className="font-medium">{r.referredBusinessName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{r.contactName}</p>
                          <p className="text-xs text-muted-foreground">{r.contactEmail}</p>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground tabular-nums whitespace-nowrap">
                          {new Date(r.referredAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                        <td className="px-4 py-3">
                          {r.plan ? (
                            <Badge variant="secondary" className="text-[10px]">{r.plan}</Badge>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={cn("text-[10px] border-0", STATUS_STYLES[r.status as ReferralStatus] ?? "bg-muted text-muted-foreground")}>
                            {STATUS_LABELS[r.status as ReferralStatus] ?? r.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-semibold tabular-nums">
                          {r.bonusEarned > 0 ? (
                            <span className="text-emerald-600 dark:text-emerald-400">${r.bonusEarned}</span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-xs text-muted-foreground border-t pt-4">
          Referral program terms and conditions apply. See <a href="https://koapos.com/referrals" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">koapos.com/referrals</a> for full details.
        </div>
      </div>
    </AppLayout>
  );
}
