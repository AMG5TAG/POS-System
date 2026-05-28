import { useState, useEffect } from "react";
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

const TAX_LABELS = [
  { value: "GST",       label: "GST — Goods & Services Tax (Australia, NZ, Singapore, India)" },
  { value: "VAT",       label: "VAT — Value Added Tax (Europe, UAE, UK)" },
  { value: "HST",       label: "HST — Harmonised Sales Tax (Canada)" },
  { value: "PST",       label: "PST — Provincial Sales Tax (Canada)" },
  { value: "SST",       label: "SST — Sales & Service Tax (Malaysia)" },
  { value: "Sales Tax", label: "Sales Tax (United States)" },
  { value: "JCT",       label: "JCT — Japan Consumption Tax" },
  { value: "TVA",       label: "TVA — Taxe sur la Valeur Ajoutée (France)" },
  { value: "IVA",       label: "IVA — Impuesto al Valor Agregado (Spain / Latin America)" },
  { value: "BTW",       label: "BTW — Belasting over de Toegevoegde Waarde (Netherlands)" },
  { value: "Custom",    label: "Custom — Enter your own" },
];

const TAX_NUMBER_LABELS = [
  { value: "ABN",          label: "ABN — Australian Business Number" },
  { value: "ACN",          label: "ACN — Australian Company Number" },
  { value: "NZBN",         label: "NZBN — New Zealand Business Number" },
  { value: "VAT No.",      label: "VAT No. (Europe / UK)" },
  { value: "GST No.",      label: "GST No. (Canada / Singapore)" },
  { value: "TIN",          label: "TIN — Taxpayer Identification Number (US)" },
  { value: "EIN",          label: "EIN — Employer Identification Number (US)" },
  { value: "GSTIN",        label: "GSTIN — GST Identification Number (India)" },
  { value: "CRN",          label: "CRN — Company Registration Number (UK)" },
  { value: "SIRET",        label: "SIRET / SIREN (France)" },
  { value: "NIF",          label: "NIF / CIF (Spain)" },
  { value: "SSM No.",      label: "SSM No. (Malaysia)" },
  { value: "TRN",          label: "TRN — Tax Registration Number (UAE)" },
  { value: "Business No.", label: "Business No. (Generic)" },
];

interface ExtSettings {
  fiscalYearStart:  number;
  taxLabel:         string;
  customTaxLabel:   string;
  taxNumberLabel:   string;
  receiptPaperSize: "a4" | "80mm" | "58mm";
}

const EXT_DEFAULTS: ExtSettings = {
  fiscalYearStart:  7,
  taxLabel:         "GST",
  customTaxLabel:   "",
  taxNumberLabel:   "ABN",
  receiptPaperSize: "80mm",
};


export default function SettingsTaxPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetTaxSettings();
  const updateSettings = useUpdateTaxSettings();
  const { data: dbExt } = useGetRegionalExtSettings();
  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const updateExt = useUpdateRegionalExtSettings();

  const [ext, setExt] = useState<ExtSettings>({ ...EXT_DEFAULTS });
  const patchExt = (patch: Partial<ExtSettings>) => setExt(prev => ({ ...prev, ...patch }));
  const activeTaxLabel = ext.taxLabel === "Custom" ? ext.customTaxLabel || "Tax" : ext.taxLabel;
  const fiscalEnd = MONTHS[((ext.fiscalYearStart - 1 + 11) % 12)];

  useEffect(() => {
    if (dbExt) {
      const anyExt = dbExt as any;
      setExt({
        fiscalYearStart: Number(anyExt.fiscalYearStart) || EXT_DEFAULTS.fiscalYearStart,
        taxLabel: anyExt.taxLabel || EXT_DEFAULTS.taxLabel,
        customTaxLabel: anyExt.customTaxLabel || EXT_DEFAULTS.customTaxLabel,
        taxNumberLabel: anyExt.taxNumberLabel || EXT_DEFAULTS.taxNumberLabel,
        receiptPaperSize: (anyExt.receiptPaperSize as "a4" | "80mm" | "58mm") || EXT_DEFAULTS.receiptPaperSize,
      });
    }
  }, [dbExt]);

  const handleSaveExt = () => {
    updateExt.mutate(
      {
        data: {
          fiscalYearStart: String(ext.fiscalYearStart),
          taxLabel: ext.taxLabel,
          customTaxLabel: ext.customTaxLabel,
          taxNumberLabel: ext.taxNumberLabel,
          receiptPaperSize: ext.receiptPaperSize,
        } as any,
      },
      {
        onSuccess: () => {
          toast.success("Tax settings saved");
          queryClient.invalidateQueries({ queryKey: ["regionalExtSettings"] });
        },
        onError: () => toast.error("Failed to save tax settings"),
      }
    );
  };

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

  useEffect(() => {
    if (settings) {
      const savedNumber = settings.gstNumber ?? "";
      setForm({
        gstEnabled: settings.gstEnabled ?? "true",
        gstRate: String(settings.gstRate ?? 10),
        gstNumber: savedNumber || (merchant as any)?.abn || "",
        taxInclusive: settings.taxInclusive ?? "true",
        showTaxOnReceipt: settings.showTaxOnReceipt ?? "true",
        taxName: settings.taxName ?? "GST",
        receiptHeader: settings.receiptHeader ?? "",
        receiptFooter: settings.receiptFooter ?? "",
      });
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate(
      { data: {
        ...form,
        gstRate: parseFloat(form.gstRate) || 10,
        gstNumber: form.gstNumber || undefined,
        receiptHeader: form.receiptHeader || undefined,
        receiptFooter: form.receiptFooter || undefined,
      } },
      {
        onSuccess: () => toast.success("Tax settings saved"),
        onError: () => toast.error("Failed to save settings"),
      }
    );
  };

  const bool = (v: string) => v === "true";
  const toggleStr = (v: string) => v === "true" ? "false" : "true";

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
                onCheckedChange={() => setForm({ ...form, gstEnabled: toggleStr(form.gstEnabled) })} />
            </div>

            {bool(form.gstEnabled) && (
              <>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Tax Name</Label>
                    <Input value={form.taxName} onChange={(e) => setForm({ ...form, taxName: e.target.value })}
                      placeholder="GST" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>GST Rate (%)</Label>
                    <Input type="number" step="0.1" value={form.gstRate}
                      onChange={(e) => setForm({ ...form, gstRate: e.target.value })} />
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
                          onClick={() => setForm({ ...form, gstNumber: bizAbn })}
                          className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                        >
                          <Copy className="w-3 h-3" />
                          Copy from Business Info
                        </button>
                      ) : null;
                    })()}
                  </div>
                  <Input value={form.gstNumber}
                    onChange={(e) => setForm({ ...form, gstNumber: e.target.value })}
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
                      onClick={() => setForm({ ...form, taxInclusive: "true" })}
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
                      onClick={() => setForm({ ...form, taxInclusive: "false" })}
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
                    onCheckedChange={() => setForm({ ...form, showTaxOnReceipt: toggleStr(form.showTaxOnReceipt) })} />
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
                          {m}  ({i === 0 ? "Jan" : i === 6 ? "Jul (AU/NZ standard)" : i === 3 ? "Apr (UK standard)" : m.slice(0, 3)})
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
                Australia &amp; NZ standard is 1 July — 30 June. US standard is January — December.
              </p>
              <div className="flex justify-end">
                <Button size="sm" onClick={handleSaveExt}>Save Fiscal Year</Button>
              </div>
            </CardContent>
          </Card>

        </div>{/* end 2-col grid */}

        {/* Tax & Compliance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Tax &amp; Compliance
            </CardTitle>
            <CardDescription>
              Customise tax terminology for your region. These labels appear on receipts, invoices, and reports.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <Label>Tax Label</Label>
                <Select value={ext.taxLabel} onValueChange={v => patchExt({ taxLabel: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {TAX_LABELS.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {ext.taxLabel === "Custom" && (
                <div className="space-y-1.5">
                  <Label>Custom Tax Name</Label>
                  <Input
                    value={ext.customTaxLabel}
                    onChange={e => patchExt({ customTaxLabel: e.target.value })}
                    placeholder="e.g. Consumption Tax"
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <Label>Business Registration Number Label</Label>
                <Select value={ext.taxNumberLabel} onValueChange={v => patchExt({ taxNumberLabel: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {TAX_NUMBER_LABELS.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Preview</Label>
                <div className="h-10 flex items-center px-3 rounded-md border bg-muted/50 text-sm font-mono text-muted-foreground">
                  {activeTaxLabel} incl. · {ext.taxNumberLabel}: 12 345 678 901
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={handleSaveExt}>Save Tax &amp; Compliance</Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={updateSettings.isPending} className="min-w-32">
            {updateSettings.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </div>

      </div>
    </AppLayout>
  );
}
