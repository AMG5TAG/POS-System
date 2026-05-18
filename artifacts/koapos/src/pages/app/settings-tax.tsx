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
import { Receipt, Percent, Mail, MessageSquare, Info } from "lucide-react";
import { PageTabsNav } from "@/components/ui/page-tabs-nav";

const TAX_TABS = [
  { href: "#gst-settings", label: "GST Settings", icon: Percent },
  { href: "#receipt",      label: "Receipt",       icon: Receipt },
  { href: "#email-sms",    label: "Email & SMS",   icon: Mail },
];
import { toast } from "sonner";

export default function SettingsTaxPage() {
  const { data: settings, isLoading } = useGetTaxSettings();
  const updateSettings = useUpdateTaxSettings();

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
            <h1 className="text-2xl font-bold tracking-tight">GST / Tax Configuration</h1>
            <p className="text-sm text-muted-foreground">Configure tax rates, receipt settings, and notification preferences</p>
          </div>
        </div>

        <PageTabsNav tabs={TAX_TABS} />

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
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">Tax Inclusive Pricing</p>
                    <p className="text-xs text-muted-foreground">Prices already include GST (standard in Australia)</p>
                  </div>
                  <Switch checked={bool(form.taxInclusive)}
                    onCheckedChange={() => setForm({ ...form, taxInclusive: toggleStr(form.taxInclusive) })} />
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

        {/* Receipt Customisation */}
        <Card id="receipt">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="w-4 h-4" /> Receipt Customisation
            </CardTitle>
            <CardDescription>Customise what appears at the top and bottom of customer receipts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Receipt Header</Label>
              <Textarea value={form.receiptHeader}
                onChange={(e) => setForm({ ...form, receiptHeader: e.target.value })}
                placeholder="e.g. Welcome to our store! Thank you for shopping with us."
                rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Receipt Footer</Label>
              <Textarea value={form.receiptFooter}
                onChange={(e) => setForm({ ...form, receiptFooter: e.target.value })}
                placeholder="e.g. Thank you! Returns accepted within 30 days with receipt."
                rows={2} />
            </div>
          </CardContent>
        </Card>

        </div>{/* end 2-col grid */}

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
