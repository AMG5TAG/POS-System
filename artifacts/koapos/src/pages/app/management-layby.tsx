import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Package2, Save, RotateCcw, Info } from "lucide-react";
import { toast } from "sonner";
import { useGetLaybySettings, useUpsertLaybySettings } from "@workspace/api-client-react";

const LAYBY_TABS = [
  { href: "#duration",      label: "Duration & Payments" },
  { href: "#deposit",       label: "Minimum Deposit" },
  { href: "#notifications", label: "Notifications" },
  { href: "#terms",         label: "Terms & Conditions" },
];

const DEFAULT_SETTINGS = {
  durationValue: 12,
  durationUnit: "weeks" as "weeks" | "months",
  paymentFrequency: "fortnightly" as "weekly" | "fortnightly" | "monthly",
  minimumDepositType: "percentage" as "percentage" | "fixed",
  minimumDepositValue: 20,
  allowPartialPayments: true,
  autoEmailOnCreation: true,
  printTermsOnReceipt: true,
  termsAndConditions:
    "1. A minimum deposit is required at the time of layby to secure the items.\n" +
    "2. The full balance must be paid within the agreed layby period.\n" +
    "3. Regular payments must be made in accordance with the agreed schedule.\n" +
    "4. Items held on layby will not be released until payment is received in full.\n" +
    "5. Layby may be cancelled if scheduled payments are not maintained.\n" +
    "6. In the event of cancellation, a cancellation fee may apply.\n" +
    "7. Goods cannot be exchanged or refunded once a layby has commenced.\n" +
    "8. This layby is subject to the store's standard terms and conditions.",
};

type LaybySettings = typeof DEFAULT_SETTINGS;

function apiToLocal(row: Record<string, unknown>): LaybySettings {
  return {
    durationValue: Number(row.durationValue) || DEFAULT_SETTINGS.durationValue,
    durationUnit: (row.durationUnit as LaybySettings["durationUnit"]) || DEFAULT_SETTINGS.durationUnit,
    paymentFrequency: (row.paymentFrequency as LaybySettings["paymentFrequency"]) || DEFAULT_SETTINGS.paymentFrequency,
    minimumDepositType: (row.minimumDepositType as LaybySettings["minimumDepositType"]) || DEFAULT_SETTINGS.minimumDepositType,
    minimumDepositValue: Number(row.minimumDepositValue) || DEFAULT_SETTINGS.minimumDepositValue,
    allowPartialPayments: row.allowPartialPayments === "true" || row.allowPartialPayments === true,
    autoEmailOnCreation: row.autoEmailOnCreation === "true" || row.autoEmailOnCreation === true,
    printTermsOnReceipt: row.printTermsOnReceipt === "true" || row.printTermsOnReceipt === true,
    termsAndConditions: (row.termsAndConditions as string) || DEFAULT_SETTINGS.termsAndConditions,
  };
}

export default function ManagementLaybyPage() {
  const { data: apiSettings, isLoading } = useGetLaybySettings({ query: { queryKey: ["layby-settings"] } });
  const upsert = useUpsertLaybySettings();

  const [settings, setSettings] = useState<LaybySettings>({ ...DEFAULT_SETTINGS });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (apiSettings) {
      setSettings(apiToLocal(apiSettings as unknown as Record<string, unknown>));
      setDirty(false);
    }
  }, [apiSettings]);

  function update<K extends keyof LaybySettings>(key: K, value: LaybySettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function handleSave() {
    upsert.mutate({
      data: {
        durationValue: settings.durationValue,
        durationUnit: settings.durationUnit,
        paymentFrequency: settings.paymentFrequency,
        minimumDepositType: settings.minimumDepositType,
        minimumDepositValue: settings.minimumDepositValue,
        allowPartialPayments: String(settings.allowPartialPayments),
        autoEmailOnCreation: String(settings.autoEmailOnCreation),
        printTermsOnReceipt: String(settings.printTermsOnReceipt),
        termsAndConditions: settings.termsAndConditions,
      },
    }, {
      onSuccess: () => { setDirty(false); toast.success("Layby settings saved"); },
      onError: () => toast.error("Failed to save layby settings"),
    });
  }

  function handleReset() {
    setSettings({ ...DEFAULT_SETTINGS });
    setDirty(true);
  }

  const depositLabel = settings.minimumDepositType === "percentage"
    ? `${settings.minimumDepositValue}% of total`
    : `$${settings.minimumDepositValue.toFixed(2)} fixed`;

  if (isLoading) return <AppLayout><div className="p-8 text-muted-foreground">Loading…</div></AppLayout>;

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Package2 className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Layby</h1>
              <p className="text-sm text-muted-foreground">Configure layby rules, deposits, and printed terms</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dirty && <Badge variant="outline" className="text-amber-600 border-amber-300">Unsaved changes</Badge>}
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset defaults
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!dirty || upsert.isPending}>
              <Save className="w-3.5 h-3.5 mr-1.5" /> Save settings
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">

        <Card id="duration">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Duration & Payments</CardTitle>
            <CardDescription>Set the maximum layby period and payment schedule</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Maximum Duration</Label>
                <div className="flex gap-2">
                  <Input
                    type="number" min={1} max={999}
                    value={settings.durationValue}
                    onChange={(e) => update("durationValue", Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-24"
                  />
                  <Select value={settings.durationUnit} onValueChange={(v) => update("durationUnit", v as LaybySettings["durationUnit"])}>
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weeks">Weeks</SelectItem>
                      <SelectItem value="months">Months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">Customer must collect within this period</p>
              </div>
              <div className="space-y-1.5">
                <Label>Payment Frequency</Label>
                <Select value={settings.paymentFrequency} onValueChange={(v) => update("paymentFrequency", v as LaybySettings["paymentFrequency"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="fortnightly">Fortnightly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Default instalment schedule</p>
              </div>
            </div>
            <div className="flex items-center justify-between py-2 border-t">
              <div>
                <p className="text-sm font-medium">Allow partial payments</p>
                <p className="text-xs text-muted-foreground">Customers can pay any amount above the minimum instalment</p>
              </div>
              <Switch checked={settings.allowPartialPayments} onCheckedChange={(v) => update("allowPartialPayments", v)} />
            </div>
          </CardContent>
        </Card>

        <Card id="deposit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Minimum Deposit</CardTitle>
            <CardDescription>The deposit amount required to secure a layby</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Deposit Type</Label>
                <Select value={settings.minimumDepositType} onValueChange={(v) => update("minimumDepositType", v as LaybySettings["minimumDepositType"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage of total</SelectItem>
                    <SelectItem value="fixed">Fixed amount ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{settings.minimumDepositType === "percentage" ? "Percentage (%)" : "Fixed Amount ($)"}</Label>
                <Input
                  type="number" min={0}
                  step={settings.minimumDepositType === "percentage" ? 1 : 0.01}
                  max={settings.minimumDepositType === "percentage" ? 100 : undefined}
                  value={settings.minimumDepositValue}
                  onChange={(e) => update("minimumDepositValue", parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2.5">
              <Info className="w-4 h-4 text-primary shrink-0" />
              <p className="text-sm text-primary">Current setting: <strong>{depositLabel}</strong> required at time of layby</p>
            </div>
          </CardContent>
        </Card>

        <Card id="notifications">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Notifications & Receipt</CardTitle>
            <CardDescription>Control when terms are sent or printed</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">Email terms on creation</p>
                <p className="text-xs text-muted-foreground">Automatically email the layby agreement and T&amp;C when a new layby is created</p>
              </div>
              <Switch checked={settings.autoEmailOnCreation} onCheckedChange={(v) => update("autoEmailOnCreation", v)} />
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">Print terms on A4 receipt</p>
                <p className="text-xs text-muted-foreground">Include the full terms &amp; conditions on the printed A4 layby receipt</p>
              </div>
              <Switch checked={settings.printTermsOnReceipt} onCheckedChange={(v) => update("printTermsOnReceipt", v)} />
            </div>
          </CardContent>
        </Card>

        <Card id="terms">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Terms & Conditions</CardTitle>
            <CardDescription>
              These terms appear on emailed layby agreements and printed A4 receipts
              {settings.printTermsOnReceipt ? " (currently enabled for print)" : " (print is currently disabled)"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={settings.termsAndConditions}
              onChange={(e) => update("termsAndConditions", e.target.value)}
              rows={12}
              className="font-mono text-sm resize-y"
              placeholder="Enter your layby terms and conditions..."
            />
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <p>Tip: number each clause for clarity. This text is printed verbatim on the A4 receipt and included in customer emails.</p>
            </div>
          </CardContent>
        </Card>

        </div>

        <div className="flex justify-end gap-2 pt-2 pb-8">
          <Button variant="outline" onClick={handleReset}>Reset to defaults</Button>
          <Button onClick={handleSave} disabled={!dirty || upsert.isPending}>
            <Save className="w-4 h-4 mr-2" /> Save settings
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
