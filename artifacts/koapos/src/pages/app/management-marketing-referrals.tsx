import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  CheckCircle2, Clock, Settings2, Wand2, Loader2, Link2,
  Percent, Star, Stamp, ChevronRight, Wrench, AlertTriangle,
} from "lucide-react";
import {
  useListCustomers,
  useGenerateMissingReferralCodes,
  useGetLoyaltySettings,
  useGetCustomerSettings,
  useUpdateCustomerSettings,
  LoyaltySettings,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

/* ─── Types ─────────────────────────────────────────────────────────────────── */

interface ReferralSettings {
  enabled: boolean;
  minSpend: number;
  minVisits: number;
  qualifyDays: number;
  refereeRewardValue: number;
  referrerRewardValue: number;
}

const DEFAULT_REFERRAL: ReferralSettings = {
  enabled:             true,
  minSpend:            50,
  minVisits:           2,
  qualifyDays:         90,
  refereeRewardValue:  200,
  referrerRewardValue: 500,
};

/* ─── Loyalty helpers ───────────────────────────────────────────────────────── */

type ProgramType = "cashback" | "points" | "tiered" | "stamp" | "custom";

const PROGRAM_ICONS: Record<ProgramType, React.ComponentType<{ className?: string }>> = {
  cashback: Percent,
  points:   Star,
  tiered:   ChevronRight,
  stamp:    Stamp,
  custom:   Wrench,
};

function getLoyaltyUnit(loyalty: LoyaltySettings | undefined): { label: string; isDecimal: boolean; hint: string } {
  const type = (loyalty?.programType ?? "points") as ProgramType;
  const naming = loyalty?.naming ?? {};

  switch (type) {
    case "cashback":
      return { label: naming.cashbackUnit ?? "Credits ($)", isDecimal: true,  hint: "Dollar value of store credit" };
    case "points":
      return { label: naming.pointsUnit   ?? "Points",      isDecimal: false, hint: "Whole point count" };
    case "tiered":
      return { label: naming.tieredUnit   ?? "Credits ($)", isDecimal: true,  hint: "Dollar value of store credit" };
    case "stamp":
      return { label: naming.stampUnit    ?? "Stamps",      isDecimal: false, hint: "Whole stamp count" };
    case "custom":
      return { label: naming.customUnit   ?? "Rewards",     isDecimal: false, hint: "Custom reward units" };
    default:
      return { label: "Points",                             isDecimal: false, hint: "Whole point count" };
  }
}

function getProgramLabel(loyalty: LoyaltySettings | undefined): string {
  const type = (loyalty?.programType ?? "points") as ProgramType;
  const naming = loyalty?.naming ?? {};
  if (naming.programName) return naming.programName;
  const labels: Record<ProgramType, string> = {
    cashback: "Cash Back", points: "Points", tiered: "Tiered Cash Back", stamp: "Stamp Card", custom: "Custom",
  };
  return labels[type] ?? "Loyalty";
}

/* ─── Settings panel ─────────────────────────────────────────────────────────── */

function SettingsPanel({
  settings,
  loyalty,
  saving,
  onSave,
}: {
  settings: ReferralSettings;
  loyalty: LoyaltySettings | undefined;
  saving: boolean;
  onSave: (s: ReferralSettings) => void;
}) {
  const [local, setLocal] = useState<ReferralSettings>(settings);
  const set = (patch: Partial<ReferralSettings>) => setLocal((prev) => ({ ...prev, ...patch }));
  const isDirty = JSON.stringify(local) !== JSON.stringify(settings);

  useEffect(() => { setLocal(settings); }, [settings]);

  const programType = (loyalty?.programType ?? "points") as ProgramType;
  const ProgramIcon = PROGRAM_ICONS[programType];
  const unit = getLoyaltyUnit(loyalty);
  const programLabel = getProgramLabel(loyalty);
  const loyaltyEnabled = loyalty?.isEnabled !== false;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label className="text-sm font-semibold">Enable Customer Referral Program</Label>
          <p className="text-xs text-muted-foreground mt-0.5">Customers will receive a unique referral code when added to the system.</p>
        </div>
        <Switch checked={local.enabled} onCheckedChange={(v) => set({ enabled: v })} />
      </div>

      <Separator />

      {/* Loyalty program linkage banner */}
      <div className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        loyaltyEnabled
          ? "border-primary/20 bg-primary/5 text-foreground"
          : "border-amber-200 bg-amber-50 text-amber-800",
      )}>
        {loyaltyEnabled ? (
          <>
            <ProgramIcon className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
            <div>
              <p className="font-medium">Rewards linked to your <span className="text-primary">{programLabel}</span> loyalty program</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Referral rewards are paid in <strong>{unit.label}</strong> — the same currency as your active loyalty program.
                {unit.hint && ` ${unit.hint}.`}
              </p>
            </div>
          </>
        ) : (
          <>
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Loyalty program is currently disabled</p>
              <p className="text-xs mt-0.5">Enable your loyalty program in Management → Loyalty to activate referral rewards.</p>
            </div>
          </>
        )}
      </div>

      <Separator />

      {/* Qualification criteria */}
      <div>
        <p className="text-sm font-semibold mb-1">Qualification Criteria</p>
        <p className="text-xs text-muted-foreground mb-4">
          A referred customer must meet all criteria within the qualification window to trigger a reward.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Min. Spend ($)</Label>
            <Input type="number" min={0} step={5} value={local.minSpend}
              onChange={(e) => set({ minSpend: parseFloat(e.target.value) || 0 })} className="h-8" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Min. Visits</Label>
            <Input type="number" min={1} step={1} value={local.minVisits}
              onChange={(e) => set({ minVisits: parseInt(e.target.value) || 1 })} className="h-8" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Qualification Window (days)</Label>
            <Input type="number" min={7} step={7} value={local.qualifyDays}
              onChange={(e) => set({ qualifyDays: parseInt(e.target.value) || 30 })} className="h-8" />
          </div>
        </div>
      </div>

      <Separator />

      {/* Rewards — two columns */}
      <div>
        <p className="text-sm font-semibold mb-1">Rewards</p>
        <p className="text-xs text-muted-foreground mb-4">
          Both rewards are paid in <strong>{unit.label}</strong>, consistent with your {programLabel} loyalty program.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

          {/* Referred customer (new customer) */}
          <div className="rounded-lg border p-4 space-y-3">
            <div>
              <p className="text-sm font-medium">New Customer Reward</p>
              <p className="text-xs text-muted-foreground mt-0.5">What the referred (new) customer receives upon qualifying.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{unit.label}</Label>
              <div className="relative">
                {unit.isDecimal && (
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                )}
                <Input
                  type="number"
                  min={0}
                  step={unit.isDecimal ? 0.01 : 1}
                  value={local.refereeRewardValue}
                  onChange={(e) => set({ refereeRewardValue: parseFloat(e.target.value) || 0 })}
                  className={cn("h-8", unit.isDecimal && "pl-6")}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {unit.isDecimal
                  ? `Referred customer earns $${local.refereeRewardValue.toFixed(2)} in ${unit.label.toLowerCase()}`
                  : `Referred customer earns ${local.refereeRewardValue} ${unit.label.toLowerCase()}`}
              </p>
            </div>
          </div>

          {/* Referrer (existing customer) */}
          <div className="rounded-lg border p-4 space-y-3">
            <div>
              <p className="text-sm font-medium">Referrer Reward</p>
              <p className="text-xs text-muted-foreground mt-0.5">What the existing customer receives when their referral qualifies.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{unit.label}</Label>
              <div className="relative">
                {unit.isDecimal && (
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                )}
                <Input
                  type="number"
                  min={0}
                  step={unit.isDecimal ? 0.01 : 1}
                  value={local.referrerRewardValue}
                  onChange={(e) => set({ referrerRewardValue: parseFloat(e.target.value) || 0 })}
                  className={cn("h-8", unit.isDecimal && "pl-6")}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {unit.isDecimal
                  ? `Referrer earns $${local.referrerRewardValue.toFixed(2)} in ${unit.label.toLowerCase()}`
                  : `Referrer earns ${local.referrerRewardValue} ${unit.label.toLowerCase()}`}
              </p>
            </div>
          </div>

        </div>
      </div>

      {isDirty && (
        <div className="flex gap-2 pt-2">
          <Button size="sm" onClick={() => onSave(local)} disabled={saving} className="gap-1.5">
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save Settings
          </Button>
          <Button size="sm" variant="outline" onClick={() => setLocal(settings)} disabled={saving}>Discard</Button>
        </div>
      )}
    </div>
  );
}

/* ─── Page ─────────────────────────────────────────────────────────────────── */

export default function ManagementMarketingReferralsPage() {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: loyaltyData } = useGetLoyaltySettings();
  const loyalty = loyaltyData as LoyaltySettings | undefined;

  const { data: customerSettingsData, isLoading: settingsLoading } = useGetCustomerSettings();
  const updateCustomerSettings = useUpdateCustomerSettings();

  const { data: customersData, refetch } = useListCustomers({ limit: 500, offset: 0 });
  const customers = customersData?.items ?? [];
  const missingCount = customers.filter((c) => !c.referralCode).length;

  const generateMissing = useGenerateMissingReferralCodes();

  /* Derive persisted referral settings from customer settings */
  const savedReferral = (customerSettingsData as any)?.referralSettings as Partial<ReferralSettings> | undefined;
  const settings: ReferralSettings = {
    enabled:             savedReferral?.enabled             ?? DEFAULT_REFERRAL.enabled,
    minSpend:            savedReferral?.minSpend            ?? DEFAULT_REFERRAL.minSpend,
    minVisits:           savedReferral?.minVisits           ?? DEFAULT_REFERRAL.minVisits,
    qualifyDays:         savedReferral?.qualifyDays         ?? DEFAULT_REFERRAL.qualifyDays,
    refereeRewardValue:  savedReferral?.refereeRewardValue  ?? DEFAULT_REFERRAL.refereeRewardValue,
    referrerRewardValue: savedReferral?.referrerRewardValue ?? DEFAULT_REFERRAL.referrerRewardValue,
  };

  const saving = updateCustomerSettings.isPending;

  function handleSave(updated: ReferralSettings) {
    if (!customerSettingsData) return;
    updateCustomerSettings.mutate(
      { data: { ...(customerSettingsData as any), referralSettings: updated } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/customer-settings"] });
          toast.success("Referral settings saved");
        },
        onError: () => toast.error("Failed to save referral settings"),
      },
    );
  }

  const handleGenerate = () => {
    generateMissing.mutate(undefined, {
      onSuccess: (result) => {
        setConfirmOpen(false);
        const count = (result as { updated: number }).updated;
        toast.success(
          count === 0
            ? "All customers already have referral codes"
            : `Generated ${count} referral code${count === 1 ? "" : "s"} successfully`,
        );
        void refetch();
      },
      onError: () => {
        setConfirmOpen(false);
        toast.error("Failed to generate referral codes");
      },
    });
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Customer Referral Settings</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Configure how the customer referral program works — qualification rules, rewards, and enrolment.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="outline"
              className="gap-2 border-primary/40 text-primary hover:bg-primary/5"
              onClick={() => setConfirmOpen(true)}
              disabled={generateMissing.isPending}
            >
              {generateMissing.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Wand2 className="w-4 h-4" />
              }
              Generate Missing Codes
              {missingCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-semibold w-5 h-5">
                  {missingCount}
                </span>
              )}
            </Button>
            <Badge
              variant="secondary"
              className={cn("gap-1.5", settings.enabled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0" : "")}
            >
              {settings.enabled ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
              {settings.enabled ? "Program active" : "Program disabled"}
            </Badge>
          </div>
        </div>

        {/* Missing codes callout */}
        {missingCount > 0 && (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 px-4 py-3">
            <div className="flex items-center gap-3">
              <Wand2 className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                <span className="font-semibold">{missingCount} customer{missingCount === 1 ? "" : "s"}</span>{" "}
                {missingCount === 1 ? "is" : "are"} missing a referral code and won't appear in the referral dashboard.
              </p>
            </div>
            <Button size="sm" variant="outline"
              className="shrink-0 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/30"
              onClick={() => setConfirmOpen(true)}>
              Fix now
            </Button>
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-base">Program Configuration</CardTitle>
            </div>
            <CardDescription className="flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 shrink-0" />
              Rewards are automatically linked to your{" "}
              <strong>{getProgramLabel(loyalty)}</strong> loyalty program —
              change your program type in Management → Loyalty to update reward units here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {settingsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading settings…
              </div>
            ) : (
              <SettingsPanel
                settings={settings}
                loyalty={loyalty}
                saving={saving}
                onSave={handleSave}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-primary" />
              Generate Missing Referral Codes
            </DialogTitle>
            <DialogDescription className="pt-1">
              This will generate a unique referral code for every customer who doesn't already have one.
              {missingCount > 0
                ? ` ${missingCount} customer${missingCount === 1 ? "" : "s"} will be updated.`
                : " All customers already have codes."
              }
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg bg-muted/40 border px-4 py-3 text-sm text-muted-foreground">
            Codes are generated in the format <code className="font-mono text-foreground bg-muted px-1 rounded text-xs">KOA7X92B</code> — 8-character alphanumeric, guaranteed unique per merchant.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={generateMissing.isPending}>
              Cancel
            </Button>
            <Button onClick={handleGenerate} disabled={generateMissing.isPending || missingCount === 0} className="gap-2">
              {generateMissing.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                : <><Wand2 className="w-4 h-4" /> Generate {missingCount > 0 ? `${missingCount} Code${missingCount === 1 ? "" : "s"}` : "Codes"}</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
