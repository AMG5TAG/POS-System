import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetLoyaltyLeaderboard, useGetLoyaltySettings } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  Trophy, Medal, Crown, TrendingUp, Users, ArrowLeft,
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

function getInitials(first?: string | null, last?: string | null) {
  return `${(first ?? "").charAt(0)}${(last ?? "").charAt(0)}`.toUpperCase();
}

const RANK_ICONS = [
  { icon: Crown, color: "text-yellow-500", bg: "bg-yellow-500/10", label: "1st" },
  { icon: Medal, color: "text-slate-400",  bg: "bg-slate-400/10",  label: "2nd" },
  { icon: Medal, color: "text-amber-600",  bg: "bg-amber-600/10",  label: "3rd" },
];

export default function ManagementLoyaltyLeaderboardPage() {
  const { data: leaderboard, isLoading } = useGetLoyaltyLeaderboard();
  const { data: settings } = useGetLoyaltySettings();
  const items = leaderboard?.items ?? [];

  const tiers = settings?.tiers ?? [];
  const sortedTiers = [...tiers].sort(
    (a, b) => (b.pointsRequired ?? b.minSpend ?? 0) - (a.pointsRequired ?? a.minSpend ?? 0)
  );

  const totalPoints = items.reduce((s, it) => s + (it.customer.loyaltyPoints ?? 0), 0);

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/management/loyalty" className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm">
                <ArrowLeft className="w-4 h-4" /> Loyalty Program
              </Link>
            </div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Trophy className="w-6 h-6 text-yellow-500" />
              Top Loyalty Earners
            </h1>
            <p className="text-muted-foreground mt-1">
              Your most engaged customers ranked by loyalty points earned.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Card className="px-4 py-2">
              <div className="flex items-center gap-2 text-sm">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">Total members:</span>
                <span className="font-semibold">{items.length}</span>
              </div>
            </Card>
            <Card className="px-4 py-2">
              <div className="flex items-center gap-2 text-sm">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <span className="text-muted-foreground">Points pooled:</span>
                <span className="font-semibold">{totalPoints.toLocaleString()}</span>
              </div>
            </Card>
          </div>
        </div>

        {/* Leaderboard */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leaderboard</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : items.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No customers have earned loyalty points yet.
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((entry) => {
                  const { customer, rank, currentTier, pointsUntilNextTier } = entry;
                  const tierDef = sortedTiers.find((t) => t.name === currentTier);
                  const isTop3 = rank <= 3;
                  const rankMeta = RANK_ICONS[rank - 1];

                  return (
                    <div
                      key={customer.id}
                      className={cn(
                        "flex items-center gap-4 p-4 rounded-xl border transition-colors",
                        isTop3 ? "bg-primary/5 border-primary/20" : "bg-card hover:bg-muted/30"
                      )}
                    >
                      {/* Rank */}
                      <div className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full bg-muted font-bold text-sm">
                        {isTop3 && rankMeta ? (
                          <rankMeta.icon className={cn("w-5 h-5", rankMeta.color)} />
                        ) : (
                          <span className="text-muted-foreground">#{rank}</span>
                        )}
                      </div>

                      {/* Avatar */}
                      <Avatar className="w-10 h-10 shrink-0">
                        <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                          {getInitials(customer.firstName, customer.lastName)}
                        </AvatarFallback>
                      </Avatar>

                      {/* Customer info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm truncate">
                            {customer.firstName} {customer.lastName}
                          </p>
                          {currentTier && (
                            <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                              {currentTier}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {customer.email ?? customer.phone ?? ""}
                        </p>
                        {tierDef?.description && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {tierDef.description}
                          </p>
                        )}
                      </div>

                      {/* Stats */}
                      <div className="text-right shrink-0 space-y-1">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-lg font-bold text-emerald-600">
                            {(customer.loyaltyPoints ?? 0).toLocaleString()}
                          </span>
                          <span className="text-xs text-muted-foreground">pts</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          ${(customer.totalSpent ?? 0).toFixed(2)} lifetime spend
                        </p>
                        {pointsUntilNextTier != null && pointsUntilNextTier > 0 && (
                          <div className="w-40 ml-auto">
                            <Progress
                              value={Math.min(
                                100,
                                ((customer.loyaltyPoints ?? 0) /
                                  ((customer.loyaltyPoints ?? 0) + pointsUntilNextTier)) * 100
                              )}
                              className="h-1.5"
                            />
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {pointsUntilNextTier.toLocaleString()} pts to next tier
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
