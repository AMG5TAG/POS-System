import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useGetLoyaltySettings, useUpdateLoyaltySettings, LoyaltySettings } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { DEFAULT_CUSTOMER_GROUPS } from "@/lib/customer-settings";
import {
  Gift, Percent, Star, Stamp, Wrench, Check, ChevronRight,
  Plus, Trash2, Info,
} from "lucide-react";

/* ─── Program types ──────────────────────────────────────────────────────── */

type ProgramType = "cashback" | "points" | "tiered" | "stamp" | "custom";

interface Tier {
  name: string;
  minSpend: number;
  rate: number;
}

const PROGRAMS: {
  type: ProgramType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}[] = [
  {
    type: "cashback",
    label: "Cash Back",
    description: "Customers earn a percentage of each sale back as store credit.",
    icon: Percent,
    badge: "Default",
  },
  {
    type: "points",
    label: "Points",
    description: "Earn points per dollar spent, redeemable for discounts.",
    icon: Star,
  },
  {
    type: "tiered",
    label: "Tiered Cash Back",
    description: "Different cashback rates based on customer's total spend history.",
    icon: ChevronRight,
  },
  {
    type: "stamp",
    label: "Stamp Card",
    description: "Earn a stamp per visit. Collect enough stamps to claim a reward.",
    icon: Stamp,
  },
  {
    type: "custom",
    label: "Custom",
    description: "Define your own loyalty reward system with a custom description.",
    icon: Wrench,
  },
];

const ICONS: Record<ProgramType, React.ComponentType<{ className?: string }>> = {
  cashback: Percent,
  points:   Star,
  tiered:   ChevronRight,
  stamp:    Stamp,
  custom:   Wrench,
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function toForm(s: LoyaltySettings) {
  return {
    programType:            s.programType as ProgramType,
    isEnabled:              s.isEnabled ?? true,
    cashbackRate:           ((s.cashbackRate ?? 0.01) * 100).toString(),
    pointsPerDollar:        (s.pointsPerDollar ?? 1).toString(),
    dollarPerPoint:         (s.dollarPerPoint ?? 0.01).toString(),
    tiers:                  (s.tiers ?? [{ name: "Bronze", minSpend: 0, rate: 1 }, { name: "Silver", minSpend: 500, rate: 2 }, { name: "Gold", minSpend: 1000, rate: 3 }]) as Tier[],
    stampsRequired:         (s.stampsRequired ?? 10).toString(),
    stampRewardValue:       (s.stampRewardValue ?? 10).toString(),
    customDescription:      s.customDescription ?? "",
    customValue:            ((s.customValue ?? 0.01) * 100).toString(),
    excludedCustomerGroups: (s.excludedCustomerGroups ?? []) as string[],
  };
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ManagementLoyaltyPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetLoyaltySettings();
  const updateMutation = useUpdateLoyaltySettings();

  const [form, setForm] = useState({
    programType:            "cashback" as ProgramType,
    isEnabled:              true,
    cashbackRate:           "1",
    pointsPerDollar:        "1",
    dollarPerPoint:         "0.01",
    tiers:                  [
      { name: "Bronze", minSpend: 0,    rate: 1 },
      { name: "Silver", minSpend: 500,  rate: 2 },
      { name: "Gold",   minSpend: 1000, rate: 3 },
    ] as Tier[],
    stampsRequired:         "10",
    stampRewardValue:       "10",
    customDescription:      "",
    customValue:            "1",
    excludedCustomerGroups: [] as string[],
  });

  useEffect(() => {
    if (settings) setForm(toForm(settings));
  }, [settings]);

  const set = <K extends keyof typeof form>(key: K, value: typeof form[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleGroup = (id: string) =>
    set(
      "excludedCustomerGroups",
      form.excludedCustomerGroups.includes(id)
        ? form.excludedCustomerGroups.filter((g) => g !== id)
        : [...form.excludedCustomerGroups, id]
    );

  const addTier = () =>
    set("tiers", [...form.tiers, { name: "New Tier", minSpend: 0, rate: 1 }]);

  const removeTier = (i: number) =>
    set("tiers", form.tiers.filter((_, idx) => idx !== i));

  const updateTier = (i: number, key: keyof Tier, value: string | number) =>
    set("tiers", form.tiers.map((t, idx) => idx === i ? { ...t, [key]: typeof value === "string" ? value : Number(value) } : t));

  const handleSave = () => {
    updateMutation.mutate({
      data: {
        programType:            form.programType,
        isEnabled:              form.isEnabled,
        cashbackRate:           parseFloat(form.cashbackRate) / 100,
        pointsPerDollar:        parseFloat(form.pointsPerDollar),
        dollarPerPoint:         parseFloat(form.dollarPerPoint),
        tiers:                  form.tiers.map(t => ({ ...t, rate: t.rate / 100 })),
        stampsRequired:         parseInt(form.stampsRequired),
        stampRewardValue:       parseFloat(form.stampRewardValue),
        customDescription:      form.customDescription,
        customValue:            parseFloat(form.customValue) / 100,
        excludedCustomerGroups: form.excludedCustomerGroups,
      },
    }, {
      onSuccess: () => {
        toast.success("Loyalty settings saved");
        queryClient.invalidateQueries({ queryKey: ["/api/loyalty/settings"] });
      },
      onError: () => toast.error("Failed to save loyalty settings"),
    });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-6 md:p-8 text-center text-muted-foreground">Loading loyalty settings...</div>
      </AppLayout>
    );
  }

  const ProgramIcon = ICONS[form.programType];

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Loyalty Program</h1>
            <p className="text-muted-foreground mt-1">Reward customers for repeat purchases.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                checked={form.isEnabled}
                onCheckedChange={(v) => set("isEnabled", v)}
              />
              <Label className="text-sm">{form.isEnabled ? "Enabled" : "Disabled"}</Label>
            </div>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>

        {/* Program selector */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Program Type</CardTitle>
            <CardDescription>Choose how customers earn rewards.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {PROGRAMS.map(({ type, label, description, icon: Icon, badge }) => {
                const active = form.programType === type;
                return (
                  <button
                    key={type}
                    onClick={() => set("programType", type)}
                    className={cn(
                      "relative text-left rounded-xl border-2 p-4 transition-all focus:outline-none focus:ring-2 focus:ring-primary/40",
                      active
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40 bg-card"
                    )}
                  >
                    {badge && (
                      <Badge className="absolute top-3 right-3 text-[10px] px-1.5 py-0 h-4">{badge}</Badge>
                    )}
                    {active && (
                      <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-3 h-3 text-primary-foreground" />
                      </div>
                    )}
                    <Icon className={cn("w-5 h-5 mb-2", active ? "text-primary" : "text-muted-foreground")} />
                    <p className={cn("font-semibold text-sm", active && "text-primary")}>{label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{description}</p>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Program config */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ProgramIcon className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">
                {PROGRAMS.find(p => p.type === form.programType)?.label} Settings
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {form.programType === "cashback" && (
              <div className="space-y-4">
                <div className="max-w-xs">
                  <Label>Cashback Rate (%)</Label>
                  <p className="text-xs text-muted-foreground mb-2">Percentage of the sale total customers earn back.</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number" step="0.1" min="0" max="100"
                      value={form.cashbackRate}
                      onChange={(e) => set("cashbackRate", e.target.value)}
                      className="max-w-[120px]"
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                </div>
                <div className="rounded-lg bg-muted/40 border px-4 py-3 text-sm flex items-start gap-2">
                  <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">
                    Example: A {form.cashbackRate}% cashback rate means a $100 sale earns ${(parseFloat(form.cashbackRate || "0") / 100 * 100).toFixed(2)} in store credit.
                  </span>
                </div>
              </div>
            )}

            {form.programType === "points" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
                  <div>
                    <Label>Points Per Dollar Spent</Label>
                    <p className="text-xs text-muted-foreground mb-2">Points earned per $1 of sale value.</p>
                    <Input
                      type="number" step="1" min="1"
                      value={form.pointsPerDollar}
                      onChange={(e) => set("pointsPerDollar", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Redemption ($ per point)</Label>
                    <p className="text-xs text-muted-foreground mb-2">Dollar value of each point when redeemed.</p>
                    <Input
                      type="number" step="0.01" min="0.01"
                      value={form.dollarPerPoint}
                      onChange={(e) => set("dollarPerPoint", e.target.value)}
                    />
                  </div>
                </div>
                <div className="rounded-lg bg-muted/40 border px-4 py-3 text-sm flex items-start gap-2">
                  <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">
                    Example: A $100 sale earns {Math.floor(parseFloat(form.pointsPerDollar || "1") * 100)} points,
                    worth ${(Math.floor(parseFloat(form.pointsPerDollar || "1") * 100) * parseFloat(form.dollarPerPoint || "0.01")).toFixed(2)} in discounts.
                  </span>
                </div>
              </div>
            )}

            {form.programType === "tiered" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Set cashback rates for different customer spend tiers. Tiers are matched based on the customer's lifetime total spend.</p>
                <div className="space-y-3">
                  {form.tiers.map((tier, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl border bg-muted/20">
                      <div className="flex-1 grid grid-cols-3 gap-3">
                        <div>
                          <Label className="text-xs">Tier Name</Label>
                          <Input
                            value={tier.name}
                            onChange={(e) => updateTier(i, "name", e.target.value)}
                            className="h-8 mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Min Spend ($)</Label>
                          <Input
                            type="number" min="0"
                            value={tier.minSpend}
                            onChange={(e) => updateTier(i, "minSpend", parseFloat(e.target.value) || 0)}
                            className="h-8 mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Cashback Rate (%)</Label>
                          <Input
                            type="number" min="0" max="100" step="0.1"
                            value={tier.rate}
                            onChange={(e) => updateTier(i, "rate", parseFloat(e.target.value) || 0)}
                            className="h-8 mt-1"
                          />
                        </div>
                      </div>
                      <Button
                        variant="ghost" size="icon" className="shrink-0 text-destructive hover:text-destructive"
                        onClick={() => removeTier(i)}
                        disabled={form.tiers.length <= 1}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={addTier} className="gap-1.5">
                  <Plus className="w-4 h-4" /> Add Tier
                </Button>
              </div>
            )}

            {form.programType === "stamp" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
                  <div>
                    <Label>Stamps Required</Label>
                    <p className="text-xs text-muted-foreground mb-2">Number of purchases to earn a reward.</p>
                    <Input
                      type="number" min="1"
                      value={form.stampsRequired}
                      onChange={(e) => set("stampsRequired", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Reward Value ($)</Label>
                    <p className="text-xs text-muted-foreground mb-2">Dollar value of the reward when earned.</p>
                    <Input
                      type="number" step="0.50" min="0.50"
                      value={form.stampRewardValue}
                      onChange={(e) => set("stampRewardValue", e.target.value)}
                    />
                  </div>
                </div>
                <div className="rounded-lg bg-muted/40 border px-4 py-3 text-sm flex items-start gap-2">
                  <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">
                    Customers earn 1 stamp per visit. After {form.stampsRequired} visits they earn a ${form.stampRewardValue} reward.
                  </span>
                </div>
              </div>
            )}

            {form.programType === "custom" && (
              <div className="space-y-4">
                <div>
                  <Label>Custom Program Description</Label>
                  <p className="text-xs text-muted-foreground mb-2">Describe how your loyalty program works.</p>
                  <textarea
                    className="w-full border rounded-lg p-3 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                    rows={3}
                    value={form.customDescription}
                    onChange={(e) => set("customDescription", e.target.value)}
                    placeholder="e.g. Earn 5% back on all purchases over $50. Rewards are applied automatically on your next visit."
                  />
                </div>
                <div className="max-w-xs">
                  <Label>Effective Reward Rate (%)</Label>
                  <p className="text-xs text-muted-foreground mb-2">Used to calculate loyalty preview on the POS screen.</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number" step="0.1" min="0" max="100"
                      value={form.customValue}
                      onChange={(e) => set("customValue", e.target.value)}
                      className="max-w-[120px]"
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Customer group exclusions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Excluded Customer Groups</CardTitle>
            <CardDescription>Customers in these groups will not earn loyalty rewards.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {DEFAULT_CUSTOMER_GROUPS.map((group) => {
                const excluded = form.excludedCustomerGroups.includes(group.id);
                return (
                  <button
                    key={group.id}
                    onClick={() => toggleGroup(group.id)}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-xl border-2 text-sm font-medium transition-all focus:outline-none",
                      excluded
                        ? "border-destructive/60 bg-destructive/5 text-destructive"
                        : "border-border bg-card hover:border-primary/40"
                    )}
                  >
                    <div
                      className="w-7 h-7 rounded-full"
                      style={{ backgroundColor: group.color + "33", border: `2px solid ${group.color}` }}
                    />
                    <span>{group.name}</span>
                    {excluded && <span className="text-[10px] text-destructive font-normal">Excluded</span>}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Tip: Commonly excluded groups include "Staff" to avoid staff members earning rewards on their own purchases.
            </p>
          </CardContent>
        </Card>

        {/* Program summary */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Gift className="w-4 h-4 text-primary" />
              <CardTitle className="text-base text-primary">Program Summary</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm space-y-2 text-muted-foreground">
            {!form.isEnabled && (
              <p className="text-destructive font-medium">Loyalty program is currently disabled.</p>
            )}
            {form.isEnabled && form.programType === "cashback" && (
              <p>Eligible customers earn <strong>{form.cashbackRate}%</strong> cashback on each sale.</p>
            )}
            {form.isEnabled && form.programType === "points" && (
              <p>Customers earn <strong>{form.pointsPerDollar} point{parseFloat(form.pointsPerDollar) !== 1 ? "s" : ""} per $1</strong> spent. Each point is worth <strong>${form.dollarPerPoint}</strong>.</p>
            )}
            {form.isEnabled && form.programType === "tiered" && (
              <p>Tiered cashback: {form.tiers.map(t => `${t.name} (${t.rate}% from $${t.minSpend})`).join(", ")}.</p>
            )}
            {form.isEnabled && form.programType === "stamp" && (
              <p>Customers earn 1 stamp per visit. Every <strong>{form.stampsRequired} stamps</strong> earns a <strong>${form.stampRewardValue}</strong> reward.</p>
            )}
            {form.isEnabled && form.programType === "custom" && form.customDescription && (
              <p>{form.customDescription}</p>
            )}
            {form.excludedCustomerGroups.length > 0 && (
              <p>Excluded groups: <strong>{form.excludedCustomerGroups.join(", ")}</strong>.</p>
            )}
            <p className="text-xs">Loyalty amounts are displayed on the POS screen and printed on receipts.</p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
