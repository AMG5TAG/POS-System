import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CheckCircle2, Clock, Settings2, Wand2, Loader2 } from "lucide-react";
import { useListCustomers, useGenerateMissingReferralCodes } from "@workspace/api-client-react";

/* ─── Settings ─────────────────────────────────────────────────────────────── */

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

/* ─── Settings panel ────────────────────────────────────────────────────────── */

function SettingsPanel({ settings, onSave }: { settings: ReferralSettings; onSave: (s: ReferralSettings) => void }) {
  const [local, setLocal] = useState<ReferralSettings>(settings);
  const set = (patch: Partial<ReferralSettings>) => setLocal((prev) => ({ ...prev, ...patch }));
  const isDirty = JSON.stringify(local) !== JSON.stringify(settings);

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

      <div>
        <p className="text-sm font-semibold mb-3">Qualification Criteria</p>
        <p className="text-xs text-muted-foreground mb-4">A referred customer must meet all criteria within the qualification window to trigger a reward.</p>
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

      <div>
        <p className="text-sm font-semibold mb-1">Referred Customer Reward</p>
        <p className="text-xs text-muted-foreground mb-3">What the new (referred) customer receives upon qualifying.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Reward Type</Label>
            <Select value={local.rewardType} onValueChange={(v) => set({ rewardType: v as ReferralSettings["rewardType"] })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="points">Loyalty Points</SelectItem>
                <SelectItem value="discount">Discount ($)</SelectItem>
                <SelectItem value="gift">Gift Item</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">
              {local.rewardType === "points" ? "Points" : local.rewardType === "discount" ? "Discount Amount ($)" : "Gift Label"}
            </Label>
            <Input
              type={local.rewardType === "gift" ? "text" : "number"} min={0}
              value={local.rewardType === "gift" ? local.rewardLabel : local.rewardAmount}
              onChange={(e) =>
                local.rewardType === "gift"
                  ? set({ rewardLabel: e.target.value })
                  : set({ rewardAmount: parseFloat(e.target.value) || 0 })
              }
              className="h-8"
            />
          </div>
        </div>
      </div>

      <Separator />

      <div>
        <p className="text-sm font-semibold mb-1">Referrer Reward</p>
        <p className="text-xs text-muted-foreground mb-3">What the existing customer (referrer) receives when their referral qualifies.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Reward Type</Label>
            <Select value={local.referrerRewardType} onValueChange={(v) => set({ referrerRewardType: v as ReferralSettings["referrerRewardType"] })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="points">Loyalty Points</SelectItem>
                <SelectItem value="discount">Discount ($)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">
              {local.referrerRewardType === "points" ? "Points" : "Discount Amount ($)"}
            </Label>
            <Input type="number" min={0} value={local.referrerRewardAmount}
              onChange={(e) => set({ referrerRewardAmount: parseFloat(e.target.value) || 0 })} className="h-8" />
          </div>
        </div>
      </div>

      {isDirty && (
        <div className="flex gap-2 pt-2">
          <Button size="sm" onClick={() => { onSave(local); toast.success("Settings saved"); }}>Save Settings</Button>
          <Button size="sm" variant="outline" onClick={() => setLocal(settings)}>Discard</Button>
        </div>
      )}
    </div>
  );
}

/* ─── Page ─────────────────────────────────────────────────────────────────── */

export default function ManagementMarketingReferralsPage() {
  const [settings, setSettings] = useState<ReferralSettings>(DEFAULT_SETTINGS);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data, refetch } = useListCustomers({ limit: 500, offset: 0 });
  const customers = data?.items ?? [];
  const missingCount = customers.filter((c) => !c.referralCode).length;

  const generateMissing = useGenerateMissingReferralCodes();

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
                <span className="font-semibold">{missingCount} customer{missingCount === 1 ? "" : "s"}</span> {missingCount === 1 ? "is" : "are"} missing a referral code and won't appear in the referral dashboard.
              </p>
            </div>
            <Button size="sm" variant="outline" className="shrink-0 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/30" onClick={() => setConfirmOpen(true)}>
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
            <CardDescription>Control how customer referrals work, what triggers a reward, and what rewards are earned.</CardDescription>
          </CardHeader>
          <CardContent>
            <SettingsPanel settings={settings} onSave={setSettings} />
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
