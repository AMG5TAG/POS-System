import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Copy, CheckCircle2, Clock, Users, DollarSign, TrendingUp,
  Gift, Star, ExternalLink, ChevronRight, Mail, Building2,
} from "lucide-react";

/* ─── Constants ─────────────────────────────────────────────────────────── */

const REFERRAL_CODE = "DEMO-KP-AU7X";
const REFERRAL_URL  = `https://koapos.com/join?ref=${REFERRAL_CODE}`;

interface Referral {
  id: string;
  businessName: string;
  contact: string;
  email: string;
  referredOn: string;
  status: "active" | "pending" | "trial" | "churned";
  plan: string;
  bonusEarned: number;
}

const REFERRALS: Referral[] = [
  { id: "1", businessName: "Bayside Surf Co.",    contact: "Jamie Scott",  email: "jamie@baysidesurf.com.au",  referredOn: "2025-11-14", status: "active",  plan: "Growth",  bonusEarned: 100 },
  { id: "2", businessName: "The Plant Shed",       contact: "Priya Mehta",  email: "priya@theplantshd.com.au", referredOn: "2025-12-01", status: "active",  plan: "Starter", bonusEarned: 50  },
  { id: "3", businessName: "Altitude Outdoors",    contact: "Ben Crawford", email: "ben@altitudeout.com.au",   referredOn: "2026-01-22", status: "trial",   plan: "—",       bonusEarned: 0   },
  { id: "4", businessName: "Copper Lane Boutique", contact: "Lily Tan",    email: "lily@copperlane.com.au",    referredOn: "2026-02-10", status: "pending", plan: "—",       bonusEarned: 0   },
  { id: "5", businessName: "Mango Republic",       contact: "Sam Davies",   email: "sam@mangorepublic.com",    referredOn: "2025-09-03", status: "churned", plan: "—",       bonusEarned: 0   },
];

const BONUS_TIERS = [
  { label: "1st referral",  bonus: "$50 account credit",  icon: Star      },
  { label: "3 referrals",   bonus: "$175 account credit", icon: Gift      },
  { label: "5 referrals",   bonus: "1 month free",        icon: TrendingUp },
  { label: "10 referrals",  bonus: "2 months free",       icon: TrendingUp },
];

const STATUS_STYLES: Record<Referral["status"], string> = {
  active:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  trial:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  churned: "bg-muted text-muted-foreground",
};

const STATUS_LABELS: Record<Referral["status"], string> = {
  active:  "Active",
  trial:   "Trial",
  pending: "Invited",
  churned: "Churned",
};

export default function ManagementKoaPOSPage() {
  const [copied, setCopied] = useState(false);

  const activeCount  = REFERRALS.filter((r) => r.status === "active").length;
  const trialCount   = REFERRALS.filter((r) => r.status === "trial").length;
  const pendingCount = REFERRALS.filter((r) => r.status === "pending").length;
  const totalEarned  = REFERRALS.reduce((s, r) => s + r.bonusEarned, 0);

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
            { label: "Active referrals",  value: activeCount,           icon: CheckCircle2, color: "text-emerald-500" },
            { label: "In trial",          value: trialCount,            icon: Clock,        color: "text-blue-500"    },
            { label: "Invited (pending)", value: pendingCount,          icon: Users,        color: "text-amber-500"   },
            { label: "Total credits earned", value: `$${totalEarned}`,  icon: DollarSign,   color: "text-violet-500"  },
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
                  <p className="font-mono font-semibold tracking-widest text-sm">{REFERRAL_CODE}</p>
                </div>
                <Button size="sm" variant="secondary" className="gap-1.5 h-7 shrink-0" onClick={() => handleCopy(REFERRAL_CODE)}>
                  {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>

              {/* URL */}
              <div className="flex gap-2">
                <Input readOnly value={REFERRAL_URL} className="text-xs font-mono h-8" />
                <Button size="sm" variant="outline" className="shrink-0 h-8 gap-1.5" onClick={() => handleCopy(REFERRAL_URL)}>
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>

              <Separator />

              {/* Share actions */}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 gap-1.5 h-8"
                  onClick={() => {
                    const subject = encodeURIComponent("Try KoaPOS for your business");
                    const body = encodeURIComponent(`Hi,\n\nI've been using KoaPOS for my retail store and thought you'd find it useful.\n\nSign up with my referral link to get started:\n${REFERRAL_URL}\n\nCheers`);
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
                <CardDescription className="mt-0.5">{REFERRALS.length} total referrals · {activeCount} active</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
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
                  {REFERRALS.map((r, i) => (
                    <tr key={r.id} className={cn("border-b last:border-0 hover:bg-muted/20 transition-colors", i % 2 !== 0 && "bg-muted/10")}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="rounded-md bg-muted p-1.5 shrink-0">
                            <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                          <span className="font-medium">{r.businessName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{r.contact}</p>
                        <p className="text-xs text-muted-foreground">{r.email}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums whitespace-nowrap">
                        {new Date(r.referredOn).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3">
                        {r.plan !== "—" ? (
                          <Badge variant="secondary" className="text-[10px]">{r.plan}</Badge>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={cn("text-[10px] border-0", STATUS_STYLES[r.status])}>
                          {STATUS_LABELS[r.status]}
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
          </CardContent>
        </Card>

        <div className="text-xs text-muted-foreground border-t pt-4">
          Referral program terms and conditions apply. See <a href="https://koapos.com/referrals" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">koapos.com/referrals</a> for full details.
        </div>
      </div>
    </AppLayout>
  );
}
