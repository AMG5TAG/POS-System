import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useGetTaxSettings,
  useUpdateTaxSettings,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Receipt, Percent, Mail, MessageSquare, Info, Hash } from "lucide-react";
import { toast } from "sonner";

/* ─── Code prefix settings (localStorage) ───────────────────────────────── */

const CODE_PREFIX_KEY = "koapos_code_prefixes";

interface CodePrefixSettings {
  receiptPrefix:     string; receiptDigits:     number;
  invoicePrefix:     string; invoiceDigits:     number;
  servicePrefix:     string; serviceDigits:     number;
  appointmentPrefix: string; appointmentDigits: number;
}

const CODE_PREFIX_DEFAULTS: CodePrefixSettings = {
  receiptPrefix: "KR",     receiptDigits: 5,
  invoicePrefix: "KI",     invoiceDigits: 5,
  servicePrefix: "KS",     serviceDigits: 5,
  appointmentPrefix: "KA", appointmentDigits: 5,
};

function loadCodePrefixes(): CodePrefixSettings {
  try {
    const raw = localStorage.getItem(CODE_PREFIX_KEY);
    return raw ? { ...CODE_PREFIX_DEFAULTS, ...JSON.parse(raw) } : CODE_PREFIX_DEFAULTS;
  } catch { return CODE_PREFIX_DEFAULTS; }
}

function saveCodePrefixes(s: CodePrefixSettings) {
  localStorage.setItem(CODE_PREFIX_KEY, JSON.stringify(s));
}

function previewCode(prefix: string, digits: number) {
  return `${prefix}${"0".repeat(Math.max(1, digits - 1))}1`;
}

const TAX_TABS = [
  { href: "#gst-settings", label: "GST Settings",    icon: Percent },
  { href: "#receipt",      label: "Receipt",          icon: Receipt },
  { href: "#code-prefixes",label: "Document Codes",   icon: Hash    },
  { href: "#email-sms",    label: "Email & SMS",      icon: Mail    },
];

export default function SettingsTaxPage() {
  const { data: settings, isLoading } = useGetTaxSettings();
  const updateSettings = useUpdateTaxSettings();

  const [codePrefixes, setCodePrefixes] = useState<CodePrefixSettings>(() => loadCodePrefixes());

  const updatePrefix = <K extends keyof CodePrefixSettings>(key: K, value: CodePrefixSettings[K]) =>
    setCodePrefixes((prev) => ({ ...prev, [key]: value }));

  const handleSaveCodePrefixes = () => {
    saveCodePrefixes(codePrefixes);
    toast.success("Document code prefixes saved");
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
    emailReceiptsEnabled: "false",
    smsReceiptsEnabled: "false",
  });

  useEffect(() => {
    if (settings) {
      setForm({
        gstEnabled: settings.gstEnabled ?? "true",
        gstRate: String(settings.gstRate ?? 10),
        gstNumber: settings.gstNumber ?? "",
        taxInclusive: settings.taxInclusive ?? "true",
        showTaxOnReceipt: settings.showTaxOnReceipt ?? "true",
        taxName: settings.taxName ?? "GST",
        receiptHeader: settings.receiptHeader ?? "",
        receiptFooter: settings.receiptFooter ?? "",
        emailReceiptsEnabled: settings.emailReceiptsEnabled ?? "false",
        smsReceiptsEnabled: settings.smsReceiptsEnabled ?? "false",
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
        onSuccess: () => toast.success("Tax & receipt settings saved"),
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
            <h1 className="text-2xl font-bold">GST / Tax Configuration</h1>
            <p className="text-sm text-muted-foreground">Configure tax rates, receipt settings, and notification preferences</p>
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
                  <Label>GST Registration Number (ABN)</Label>
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

        </div>{/* end 2-col grid */}

        {/* Document Code Prefixes */}
        <Card id="code-prefixes">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Hash className="w-4 h-4" /> Document Code Prefixes
            </CardTitle>
            <CardDescription>Set the prefix and number length for receipts, invoices, service jobs and appointments.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(
                [
                  { label: "Receipt",     prefixKey: "receiptPrefix",     digitsKey: "receiptDigits"     },
                  { label: "Invoice",     prefixKey: "invoicePrefix",     digitsKey: "invoiceDigits"     },
                  { label: "Service Job", prefixKey: "servicePrefix",     digitsKey: "serviceDigits"     },
                  { label: "Appointment", prefixKey: "appointmentPrefix", digitsKey: "appointmentDigits" },
                ] as { label: string; prefixKey: keyof CodePrefixSettings; digitsKey: keyof CodePrefixSettings }[]
              ).map(({ label, prefixKey, digitsKey }) => (
                <div key={prefixKey} className="rounded-xl border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{label}</p>
                    <Badge variant="outline" className="font-mono text-xs">
                      {previewCode(String(codePrefixes[prefixKey]), Number(codePrefixes[digitsKey]))}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Prefix</Label>
                      <Input
                        value={String(codePrefixes[prefixKey])}
                        onChange={(e) => updatePrefix(prefixKey, e.target.value.toUpperCase())}
                        className="font-mono"
                        maxLength={6}
                        placeholder="KR"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Digits</Label>
                      <Input
                        type="number" min={1} max={10}
                        value={Number(codePrefixes[digitsKey])}
                        onChange={(e) => updatePrefix(digitsKey, Math.min(10, Math.max(1, parseInt(e.target.value) || 1)) as CodePrefixSettings[typeof digitsKey])}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={handleSaveCodePrefixes}>Save Code Prefixes</Button>
            </div>
          </CardContent>
        </Card>

        {/* Email & SMS Receipts */}
        <Card id="email-sms">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="w-4 h-4" /> Email & SMS Receipts
            </CardTitle>
            <CardDescription>Send receipts automatically to customers after a sale</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-3">
                <Mail className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Email Receipts</p>
                  <p className="text-xs text-muted-foreground">Send receipts to customers via email</p>
                </div>
              </div>
              <Switch checked={bool(form.emailReceiptsEnabled)}
                onCheckedChange={() => setForm({ ...form, emailReceiptsEnabled: toggleStr(form.emailReceiptsEnabled) })} />
            </div>
            {bool(form.emailReceiptsEnabled) && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Email delivery requires an email integration. Connect Mailchimp or another email provider in
                  <strong> Management → Integrations</strong> to enable automatic email receipts.
                  You can still manually send receipts from the Transactions page.
                </span>
              </div>
            )}
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-3">
                <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium text-sm">SMS Receipts</p>
                  <p className="text-xs text-muted-foreground">Send receipts to customers via SMS</p>
                </div>
              </div>
              <Switch checked={bool(form.smsReceiptsEnabled)}
                onCheckedChange={() => setForm({ ...form, smsReceiptsEnabled: toggleStr(form.smsReceiptsEnabled) })} />
            </div>
            {bool(form.smsReceiptsEnabled) && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  SMS delivery requires a Twilio or similar integration. Configure it in
                  <strong> Management → Integrations</strong>.
                </span>
              </div>
            )}
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
