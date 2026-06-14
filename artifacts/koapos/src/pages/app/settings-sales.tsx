import { useState, useEffect } from "react";

import { AppLayout } from "@/components/layout/app-layout";
import {
  useGetSalesSettings, useUpdateSalesSettings, getGetSalesSettingsQueryKey,
  useGetLaybySettings, useUpsertLaybySettings, getGetLaybySettingsQueryKey,
  useGetPosCodePrefixes, useUpdatePosCodePrefixes, getGetPosCodePrefixesQueryKey,
  type SalesSettings, type LaybySettings, type PosCodePrefixes,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Receipt, FileText, Package2, RotateCcw, ClipboardList, ShoppingCart, Loader2, Save, AlertCircle } from "lucide-react";
import { toast } from "sonner";

/* Booleans are stored as "true"/"false" text (matching layby_settings). */
const isOn = (v: string | undefined) => v === "true";
const asStr = (b: boolean) => (b ? "true" : "false");

/* ── Small presentational rows ─────────────────────────────────────────────── */
function ToggleRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
function NumberRow({ label, hint, value, onChange, suffix, min = 0, step = 1 }: { label: string; hint?: string; value: number; onChange: (v: number) => void; suffix?: string; min?: number; step?: number }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Input type="number" min={min} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} className="h-8 w-24 text-right text-sm" />
        {suffix && <span className="text-xs text-muted-foreground w-10">{suffix}</span>}
      </div>
    </div>
  );
}
function TextAreaRow({ label, hint, value, onChange, placeholder }: { label: string; hint?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="py-2.5 border-b last:border-b-0 space-y-1.5">
      <div className="text-sm font-medium">{label}</div>
      {hint && <div className="text-xs text-muted-foreground -mt-1">{hint}</div>}
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2} />
    </div>
  );
}
function TextInputRow({ label, hint, value, onChange, placeholder, width = "w-40" }: { label: string; hint?: string; value: string; onChange: (v: string) => void; placeholder?: string; width?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`h-8 ${width} text-sm`} />
    </div>
  );
}

export default function SalesSettingsPage() {
  const queryClient = useQueryClient();

  const salesQ = useGetSalesSettings({ query: { queryKey: getGetSalesSettingsQueryKey() } });
  const laybyQ = useGetLaybySettings({ query: { queryKey: getGetLaybySettingsQueryKey() } });
  const prefixQ = useGetPosCodePrefixes({ query: { queryKey: getGetPosCodePrefixesQueryKey() } });

  const updateSales = useUpdateSalesSettings();
  const upsertLayby = useUpsertLaybySettings();
  const updatePrefixes = useUpdatePosCodePrefixes();

  const [sales, setSales] = useState<SalesSettings | null>(null);
  const [layby, setLayby] = useState<LaybySettings | null>(null);
  const [prefixes, setPrefixes] = useState<PosCodePrefixes | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (salesQ.data && !sales) setSales(salesQ.data as SalesSettings); }, [salesQ.data, sales]);
  useEffect(() => { if (laybyQ.data && !layby) setLayby(laybyQ.data as LaybySettings); }, [laybyQ.data, layby]);
  useEffect(() => { if (prefixQ.data && !prefixes) setPrefixes(prefixQ.data as PosCodePrefixes); }, [prefixQ.data, prefixes]);

  const { ConfirmDialog } = useUnsavedChangesGuard(dirty);

  // If any of the three settings endpoints fails (e.g. a 4xx/5xx), surface a
  // recoverable error instead of leaving the page on an endless spinner.
  const loadError = salesQ.isError || laybyQ.isError || prefixQ.isError;
  const retryLoad = () => { salesQ.refetch(); laybyQ.refetch(); prefixQ.refetch(); };

  const patchSales = (p: Partial<SalesSettings>) => { setSales((s) => (s ? { ...s, ...p } : s)); setDirty(true); };
  const patchLayby = (p: Partial<LaybySettings>) => { setLayby((s) => (s ? { ...s, ...p } : s)); setDirty(true); };

  const ready = sales && layby && prefixes;

  const handleSave = async () => {
    if (!ready) return;
    setSaving(true);
    try {
      const { id: _sid, merchantId: _smid, createdAt: _sc, updatedAt: _su, ...salesBody } = sales as SalesSettings & { createdAt?: string };
      const { id: _lid, merchantId: _lmid, updatedAt: _lu, ...laybyBody } = layby as LaybySettings;
      const { ...prefixBody } = prefixes as PosCodePrefixes;
      await Promise.all([
        updateSales.mutateAsync({ data: salesBody as Parameters<typeof updateSales.mutateAsync>[0]["data"] }),
        upsertLayby.mutateAsync({ data: laybyBody as Parameters<typeof upsertLayby.mutateAsync>[0]["data"] }),
        updatePrefixes.mutateAsync({ data: prefixBody as Parameters<typeof updatePrefixes.mutateAsync>[0]["data"] }),
      ]);
      queryClient.invalidateQueries({ queryKey: getGetSalesSettingsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetLaybySettingsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetPosCodePrefixesQueryKey() });
      setDirty(false);
      toast.success("Sales settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Receipt className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Sales Settings</h1>
              <p className="text-sm text-muted-foreground">Default policies for sales, invoices, laybys, refunds and quotes.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dirty && <Badge variant="outline" className="text-amber-600 border-amber-300">Unsaved changes</Badge>}
            <Button size="sm" onClick={handleSave} disabled={!dirty || saving || !ready}>
              {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />} Save settings
            </Button>
          </div>
        </div>

        {loadError ? (
          <div className="py-16 flex flex-col items-center gap-3 text-center">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <div>
              <p className="font-medium">Couldn't load sales settings</p>
              <p className="text-sm text-muted-foreground mt-1">The settings service didn't respond. Please try again.</p>
            </div>
            <Button size="sm" variant="outline" onClick={retryLoad}>
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Retry
            </Button>
          </div>
        ) : !ready ? (
          <div className="py-16 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : (
          <Tabs defaultValue="sales">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="sales" className="gap-1.5"><ShoppingCart className="w-3.5 h-3.5" /> Sales</TabsTrigger>
              <TabsTrigger value="invoices" className="gap-1.5"><FileText className="w-3.5 h-3.5" /> Invoices</TabsTrigger>
              <TabsTrigger value="laybys" className="gap-1.5"><Package2 className="w-3.5 h-3.5" /> Laybys</TabsTrigger>
              <TabsTrigger value="refunds" className="gap-1.5"><RotateCcw className="w-3.5 h-3.5" /> Refunds</TabsTrigger>
              <TabsTrigger value="quotes" className="gap-1.5"><ClipboardList className="w-3.5 h-3.5" /> Quotes</TabsTrigger>
            </TabsList>

            {/* ── Sales ── */}
            <TabsContent value="sales">
              <Card><CardContent className="p-4">
                <ToggleRow label="Require a customer on every sale" hint="Prompt staff to attach a customer before completing a sale." checked={isOn(sales!.saleRequireCustomer)} onChange={(v) => patchSales({ saleRequireCustomer: asStr(v) })} />
                <div className="flex items-center justify-between gap-4 py-2.5 border-b">
                  <div><div className="text-sm font-medium">After-sale receipt</div><div className="text-xs text-muted-foreground">What to do with the receipt once a sale completes.</div></div>
                  <Select value={sales!.saleReceiptDelivery} onValueChange={(v) => patchSales({ saleReceiptDelivery: v })}>
                    <SelectTrigger className="h-8 w-32 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ask">Ask</SelectItem>
                      <SelectItem value="print">Print</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <ToggleRow label="Round cash totals to nearest 5c" hint="Apply Australian cash rounding to the final cash amount." checked={isOn(sales!.saleRoundCashTo5c)} onChange={(v) => patchSales({ saleRoundCashTo5c: asStr(v) })} />
                <ToggleRow label="Require a reason for manual discounts" checked={isOn(sales!.saleRequireDiscountReason)} onChange={(v) => patchSales({ saleRequireDiscountReason: asStr(v) })} />
                <ToggleRow label="Allow selling out-of-stock items" checked={isOn(sales!.saleAllowOutOfStock)} onChange={(v) => patchSales({ saleAllowOutOfStock: asStr(v) })} />
                <TextInputRow label="Default sale note" hint="Pre-filled on the sale notes field." value={sales!.saleDefaultNote} onChange={(v) => patchSales({ saleDefaultNote: v })} width="w-56" />
              </CardContent></Card>
            </TabsContent>

            {/* ── Invoices ── */}
            <TabsContent value="invoices">
              <Card><CardContent className="p-4">
                <NumberRow label="Default due date" hint="Days from issue date." value={sales!.invoiceDueDays} onChange={(v) => patchSales({ invoiceDueDays: v })} suffix="days" />
                <ToggleRow label="Auto-email on creation" hint="Email the invoice to the customer as soon as it's created." checked={isOn(sales!.invoiceAutoEmail)} onChange={(v) => patchSales({ invoiceAutoEmail: asStr(v) })} />
                <TextAreaRow label="Default terms / notes" hint="Printed on every invoice." value={sales!.invoiceTerms} onChange={(v) => patchSales({ invoiceTerms: v })} placeholder="e.g. Payment due within 14 days…" />
              </CardContent></Card>
            </TabsContent>

            {/* ── Laybys (existing layby-settings backend) ── */}
            <TabsContent value="laybys">
              <Card><CardContent className="p-4">
                <div className="flex items-center justify-between gap-4 py-2.5 border-b">
                  <div className="text-sm font-medium">Default duration</div>
                  <div className="flex items-center gap-1.5">
                    <Input type="number" min={1} value={layby!.durationValue} onChange={(e) => patchLayby({ durationValue: parseInt(e.target.value) || 1 })} className="h-8 w-20 text-sm text-right" />
                    <Select value={layby!.durationUnit} onValueChange={(v) => patchLayby({ durationUnit: v })}>
                      <SelectTrigger className="h-8 w-28 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="weeks">weeks</SelectItem><SelectItem value="months">months</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 py-2.5 border-b">
                  <div className="text-sm font-medium">Payment frequency</div>
                  <Select value={layby!.paymentFrequency} onValueChange={(v) => patchLayby({ paymentFrequency: v })}>
                    <SelectTrigger className="h-8 w-36 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="fortnightly">Fortnightly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-4 py-2.5 border-b">
                  <div className="text-sm font-medium">Minimum deposit</div>
                  <div className="flex items-center gap-1.5">
                    <Select value={layby!.minimumDepositType} onValueChange={(v) => patchLayby({ minimumDepositType: v })}>
                      <SelectTrigger className="h-8 w-28 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="percentage">Percent</SelectItem><SelectItem value="fixed">Fixed $</SelectItem></SelectContent>
                    </Select>
                    <Input type="number" min={0} step={0.01} value={layby!.minimumDepositValue} onChange={(e) => patchLayby({ minimumDepositValue: parseFloat(e.target.value) || 0 })} className="h-8 w-20 text-sm text-right" />
                  </div>
                </div>
                <ToggleRow label="Allow partial payments" checked={isOn(layby!.allowPartialPayments)} onChange={(v) => patchLayby({ allowPartialPayments: asStr(v) })} />
                <ToggleRow label="Auto-email on creation" checked={isOn(layby!.autoEmailOnCreation)} onChange={(v) => patchLayby({ autoEmailOnCreation: asStr(v) })} />
                <ToggleRow label="Print terms on receipt" checked={isOn(layby!.printTermsOnReceipt)} onChange={(v) => patchLayby({ printTermsOnReceipt: asStr(v) })} />
                <TextAreaRow label="Terms &amp; conditions" value={layby!.termsAndConditions} onChange={(v) => patchLayby({ termsAndConditions: v })} placeholder="Layby terms shown to the customer…" />
              </CardContent></Card>
            </TabsContent>

            {/* ── Refunds ── */}
            <TabsContent value="refunds">
              <Card><CardContent className="p-4">
                <NumberRow label="Refund window" hint="Maximum days after a sale that a refund is allowed (0 = no limit)." value={sales!.refundWindowDays} onChange={(v) => patchSales({ refundWindowDays: v })} suffix="days" />
                <ToggleRow label="Require a reason for refunds" checked={isOn(sales!.refundRequireReason)} onChange={(v) => patchSales({ refundRequireReason: asStr(v) })} />
                <ToggleRow label="Require manager approval" hint="A manager PIN must approve each refund." checked={isOn(sales!.refundRequireApproval)} onChange={(v) => patchSales({ refundRequireApproval: asStr(v) })} />
                <NumberRow label="Restocking fee" hint="Deducted from refunds for returned goods." value={sales!.refundRestockingFeePct} onChange={(v) => patchSales({ refundRestockingFeePct: v })} suffix="%" step={0.5} />
                <ToggleRow label="Restrict to original payment method" hint="Refunds must go back to how the customer paid." checked={isOn(sales!.refundOriginalMethodOnly)} onChange={(v) => patchSales({ refundOriginalMethodOnly: asStr(v) })} />
                <TextInputRow label="Default refund note" value={sales!.refundDefaultNote} onChange={(v) => patchSales({ refundDefaultNote: v })} width="w-56" />
              </CardContent></Card>
            </TabsContent>

            {/* ── Quotes ── */}
            <TabsContent value="quotes">
              <Card><CardContent className="p-4">
                <NumberRow label="Default validity" hint="Pre-fills a new quote's expiry date." value={sales!.quoteExpiryDays} onChange={(v) => patchSales({ quoteExpiryDays: v })} suffix="days" />
                <NumberRow label="Default deposit" hint="Deposit pre-filled on new quotes, as a % of the total. 0 = none. Overridable per quote." value={sales!.quoteDepositPercent ?? 0} onChange={(v) => patchSales({ quoteDepositPercent: v })} suffix="%" />
                <ToggleRow label="Auto-email on creation" hint="Email the quote to the customer as soon as it's created." checked={isOn(sales!.quoteAutoEmail)} onChange={(v) => patchSales({ quoteAutoEmail: asStr(v) })} />
                <div className="flex items-center justify-between gap-4 py-2.5 border-b">
                  <div><div className="text-sm font-medium">Quote numbering</div><div className="text-xs text-muted-foreground">Prefix and number of digits.</div></div>
                  <div className="flex items-center gap-1.5">
                    <Input value={sales!.quotePrefix} onChange={(e) => patchSales({ quotePrefix: e.target.value })} className="h-8 w-24 text-sm" placeholder="QT-" />
                    <Input type="number" min={1} max={10} value={sales!.quoteDigits} onChange={(e) => patchSales({ quoteDigits: parseInt(e.target.value) || 1 })} className="h-8 w-16 text-sm text-center" />
                  </div>
                </div>
                <TextAreaRow label="Default terms / notes" hint="Printed on every quote." value={sales!.quoteTerms} onChange={(v) => patchSales({ quoteTerms: v })} placeholder="e.g. Quote valid for 30 days…" />
              </CardContent></Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
      <ConfirmDialog />
    </AppLayout>
  );
}
