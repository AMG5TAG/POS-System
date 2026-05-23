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
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CheckCircle2, Clock, Settings2 } from "lucide-react";

/* ─── Storage ──────────────────────────────────────────────────────────────────── */

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

/* ─── Settings panel ──────────────────────────────────────────────────────────────── */

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

/* ─── Page ───────────────────────────────────────────────────────────────────────── */

export default function ManagementMarketingReferralsPage() {
  const [settings, setSettings] = useState<ReferralSettings>(() => loadSettings());

  const handleSave = (s: ReferralSettings) => {
    setSettings(s);
    saveSettings(s);
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Customer Referral Settings</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Configure how the customer referral program works — qualification rules, rewards, and enrolment.
            </p>
          </div>
          <Badge
            variant="secondary"
            className={cn("gap-1.5", settings.enabled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0" : "")}
          >
            {settings.enabled ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
            {settings.enabled ? "Program active" : "Program disabled"}
          </Badge>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-muted-foreground" />
              <CardTitle className="text-base">Program Configuration</CardTitle>
            </div>
            <CardDescription>Control how customer referrals work, what triggers a reward, and what rewards are earned.</CardDescription>
          </CardHeader>
          <CardContent>
            <SettingsPanel settings={settings} onSave={handleSave} />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
