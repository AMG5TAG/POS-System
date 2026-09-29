import { useState, useEffect, useCallback } from "react";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useGetTaxSettings,
  useUpdateTaxSettings,
  useGetRegionalExtSettings,
  useUpdateRegionalExtSettings,
  useGetMerchant,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Percent, Info, Calendar, DollarSign, Copy } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

interface ExtSettings {
  fiscalYearStart:  number;
  defaultTaxRate:   string;
}

const EXT_DEFAULTS: ExtSettings = {
  fiscalYearStart:  7,
  defaultTaxRate:   "10",
};


export default function SettingsTaxPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetTaxSettings();
  const updateSettings = useUpdateTaxSettings();
  const { data: dbExt } = useGetRegionalExtSettings();
  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const updateExt = useUpdateRegionalExtSettings();

  const [dirtyGst, setDirtyGst] = useState(false);
  const [dirtyExt, setDirtyExt] = useState(false);
  const isDirty = dirtyGst || dirtyExt;

  const [ext, setExt] = useState<ExtSettings>({ ...EXT_DEFAULTS });
  const patchExt = useCallback((patch: Partial<ExtSettings>) => {
    setExt(prev => ({ ...prev, ...patch }));
    setDirtyExt(true);
  }, []);
  const fiscalEnd = MONTHS[((ext.fiscalYearStart - 1 + 11) % 12)];

  useEffect(() => {
    if (dbExt) {
      const anyExt = dbExt as any;
      setExt({
        fiscalYearStart: Number(anyExt.fiscalYearStart) || EXT_DEFAULTS.fiscalYearStart,
        defaultTaxRate: anyExt.defaultTaxRate ?? EXT_DEFAULTS.defaultTaxRate,
      });
    }
  }, [dbExt]);


  const [form, setForm] = useState({
    gstEnabled: "true",
    gstRate: "10",
    gstNumber: "",
    taxInclusive: "true",
    showTaxOnReceipt: "true",
    taxName: "GST",
    receiptHeader: "",
    receiptFooter: "",
  });
  const patchForm = useCallback((patch: Partial<typeof form>) => {
    setForm(prev => ({ ...prev, ...patch }));
    setDirtyGst(true);
  }, []);

  useEffect(() => {
    if (settings) {
      const savedNumber = settings.gstNumber ?? "";
      setForm({
        gstEnabled: settings.gstEnabled ?? "true",
        gstRate: String(settings.gstRate ?? 10),
        gstNumber: savedNumber || (merchant as any)?.abn || "",
        taxInclusive: settings.taxInclusive ?? "true",
        showTaxOnReceipt: settings.showTaxOnReceipt ?? "true",
        taxName: "GST", // Australia only — the tax is always GST
        receiptHeader: settings.receiptHeader ?? "",
        receiptFooter: settings.receiptFooter ?? "",
      });
    }
  }, [settings, merchant]);

  const handleSave = async () => {
    try {
      await Promise.all([
        updateSettings.mutateAsync({
          data: {
            ...form,
            gstRate: parseFloat(form.gstRate) || 10,
            gstNumber: form.gstNumber || undefined,
            receiptHeader: form.receiptHeader || undefined,
            receiptFooter: form.receiptFooter || undefined,
          },
        }),
        updateExt.mutateAsync({
          data: {
            fiscalYearStart: String(ext.fiscalYearStart),
            // Australia only: the tax is always GST and the number an ABN.
            taxLabel: "GST",
            customTaxLabel: "",
            taxNumberLabel: "ABN",
            defaultTaxRate: ext.defaultTaxRate,
          } as any,
        }),
      ]);
      toast.success("Tax settings saved");
      setDirtyGst(false);
      setDirtyExt(false);
      queryClient.invalidateQueries({ queryKey: ["regionalExtSettings"] });
    } catch {
      toast.error("Failed to save settings");
    }
  };

  const bool = (v: string) => v === "true";
  const toggleStr = (v: string) => v === "true" ? "false" : "true";

  const { ConfirmDialog } = useUnsavedChangesGuard(isDirty);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-6 md:p-8 space-y-6">
          <Skeleton className="h-8 w-48" />
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <Percent className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Tax Settings</h1>
            <p className="text-sm text-muted-foreground">Configure GST rates, fiscal year, and tax compliance terminology</p>
          </div>
        </div>


        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">

          {/* GST Settings */}
          <Card id="gst-settings">
            <CardHeader>
              <CardTitle className="text-base">GST Settings</CardTitle>
              <CardDescription>Configure how GST/tax is calculated and displayed</CardDescription>
            </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">GST Enabled</p>
                <p className="text-xs text-muted-foreground">Apply GST to sales transactions</p>
              </div>
              <Switch checked={bool(form.gstEnabled)}
                onCheckedChange={() => patchForm({ gstEnabled: toggleStr(form.gstEnabled) })} />
            </div>

            {bool(form.gstEnabled) && (
              <>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>GST Rate (%)</Label>
                    <Input type="number" step="0.1" value={form.gstRate}
                      onChange={(e) => patchForm({ gstRate: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>GST Registration Number (ABN)</Label>
                    {(() => {
                      const bizAbn = (merchant as any)?.abn || "";
                      return bizAbn ? (
                        <button
                          type="button"
                          onClick={() => patchForm({ gstNumber: bizAbn })}
                          className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                        >
                          <Copy className="w-3 h-3" />
                          Copy from Business Info
                        </button>
                      ) : null;
                    })()}
                  </div>
                  <Input value={form.gstNumber}
                    onChange={(e) => patchForm({ gstNumber: e.target.value })}
                    placeholder="e.g. 12 345 678 901" />
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="font-medium text-sm">Default Pricing</p>
                    <p className="text-xs text-muted-foreground">How product prices are entered and stored in the system</p>
                  </div>
                  <div className="flex rounded-lg border overflow-hidden">
                    <button
                      type="button"
                      onClick={() => patchForm({ taxInclusive: "true" })}
                      className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                        form.taxInclusive === "true"
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      Inc Tax
                    </button>
                    <button
                      type="button"
                      onClick={() => patchForm({ taxInclusive: "false" })}
                      className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                        form.taxInclusive === "false"
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      Ex Tax
                    </button>
                  </div>
                  <p className={`text-xs rounded-lg px-3 py-2 ${
                    form.taxInclusive === "true"
                      ? "bg-blue-50 border border-blue-200 text-blue-700"
                      : "bg-amber-50 border border-amber-200 text-amber-700"
                  }`}>
                    {form.taxInclusive === "true"
                      ? `Inc Tax: Prices entered for products already include ${form.taxName || "GST"}. Tax is extracted from the total at checkout. (Standard in Australia)`
                      : `Ex Tax: Prices entered for products are exclusive of ${form.taxName || "GST"}. Tax is added on top at checkout.`}
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Show Tax on Receipt</p>
                    <p className="text-xs text-muted-foreground">Display GST breakdown on customer receipts</p>
                  </div>
                  <Switch checked={bool(form.showTaxOnReceipt)}
                    onCheckedChange={() => patchForm({ showTaxOnReceipt: toggleStr(form.showTaxOnReceipt) })} />
                </div>
              </>
            )}
          </CardContent>
          </Card>

          {/* Fiscal Year */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Fiscal Year
              </CardTitle>
              <CardDescription>
                Sets the financial reporting period for your business. Affects sales reports and analytics.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <Label>Fiscal Year Start</Label>
                  <Select
                    value={String(ext.fiscalYearStart)}
                    onValueChange={v => patchExt({ fiscalYearStart: Number(v) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                          {m}{i === 6 ? "  (Australian standard)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Fiscal Year End</Label>
                  <div className="h-10 flex items-center px-3 rounded-md border bg-muted/50 text-sm text-muted-foreground">
                    {fiscalEnd}  (auto-calculated)
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Your fiscal year runs from <strong>{MONTHS[ext.fiscalYearStart - 1]}</strong> to <strong>{fiscalEnd}</strong>.
                The Australian financial year runs 1 July — 30 June.
              </p>
            </CardContent>
          </Card>

        </div>{/* end 2-col grid */}

        {/* Invoice default */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Invoices
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label>Default Invoice Line Tax Rate (%)</Label>
              <p className="text-xs text-muted-foreground">
                Pre-filled GST rate for new invoice line items. Set to 0 for GST-free goods.
              </p>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={ext.defaultTaxRate}
                onChange={(e) => patchExt({ defaultTaxRate: e.target.value })}
                placeholder="10"
                className="max-w-40"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={updateSettings.isPending || updateExt.isPending} className="min-w-32">
            {updateSettings.isPending || updateExt.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </div>

      </div>
      <ConfirmDialog />
    </AppLayout>
  );
}
