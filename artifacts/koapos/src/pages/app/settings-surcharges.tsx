import { useState, useEffect, useCallback, useMemo } from "react";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useGetPaymentSurcharges,
  useUpdatePaymentSurcharges,
  useGetPosSettings,
} from "@workspace/api-client-react";
import { ALL_PAYMENT_METHODS } from "./management-registers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Percent, DollarSign, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// "split" is excluded: its cost is attributed to the underlying tendered
// methods, not the split itself (mirrors the API's SURCHARGEABLE_METHODS).
const NON_SURCHARGEABLE = new Set(["split"]);

interface Row {
  percent: string;
  fixed: string;
  passOn: boolean;
  enabled: boolean;
}

const EMPTY_ROW: Row = { percent: "0", fixed: "0", passOn: true, enabled: false };

const fmtMoney = (n: number) => `$${n.toFixed(2)}`;

export default function SettingsSurchargesPage() {
  const { data: surcharges, isLoading: loadingSurcharges } = useGetPaymentSurcharges({ query: { queryKey: ["payment-surcharges"] } });
  const { data: posSettings, isLoading: loadingPos } = useGetPosSettings({ query: { queryKey: ["pos-settings"] } });
  const update = useUpdatePaymentSurcharges();
  const isLoading = loadingSurcharges || loadingPos;

  // Which payment methods the merchant has activated (defaults to all when unset).
  const enabledMethods = useMemo<string[]>(() => {
    try {
      if (posSettings?.enabledPaymentMethods) return JSON.parse(posSettings.enabledPaymentMethods) as string[];
    } catch { /* ignore */ }
    return ALL_PAYMENT_METHODS.map((m) => m.id);
  }, [posSettings]);

  const methods = useMemo(
    () => ALL_PAYMENT_METHODS.filter((m) => enabledMethods.includes(m.id) && !NON_SURCHARGEABLE.has(m.id)),
    [enabledMethods],
  );

  const [rows, setRows] = useState<Record<string, Row>>({});
  const [dirty, setDirty] = useState(false);
  useUnsavedChangesGuard(dirty);

  // Seed local state from the saved config once both queries have resolved.
  useEffect(() => {
    if (isLoading) return;
    const byMethod = new Map((surcharges?.items ?? []).map((s) => [s.paymentMethod, s]));
    const next: Record<string, Row> = {};
    for (const m of methods) {
      const saved = byMethod.get(m.id);
      next[m.id] = saved
        ? { percent: String(saved.percent ?? 0), fixed: String(saved.fixed ?? 0), passOn: saved.passOn ?? true, enabled: saved.enabled ?? false }
        : { ...EMPTY_ROW };
    }
    setRows(next);
    setDirty(false);
  }, [isLoading, surcharges, methods]);

  const patch = useCallback((id: string, p: Partial<Row>) => {
    setRows((prev) => ({ ...prev, [id]: { ...(prev[id] ?? EMPTY_ROW), ...p } }));
    setDirty(true);
  }, []);

  const handleSave = async () => {
    const items = methods.map((m) => {
      const r = rows[m.id] ?? EMPTY_ROW;
      return {
        paymentMethod: m.id,
        percent: Math.max(0, Math.min(100, parseFloat(r.percent) || 0)),
        fixed: Math.max(0, parseFloat(r.fixed) || 0),
        passOn: r.passOn,
        enabled: r.enabled,
      };
    });
    try {
      await update.mutateAsync({ data: { items } });
      toast.success("Surcharges saved");
      setDirty(false);
    } catch {
      toast.error("Failed to save surcharges");
    }
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6 max-w-3xl">
        <div className="flex items-center gap-3">
          <Percent className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Surcharges</h1>
            <p className="text-sm text-muted-foreground">
              Set the cost of accepting each payment method. Pass it on to the customer as a surcharge, or absorb it and track it as a cost of business in your reports.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            Each surcharge is <strong>percent of the sale + a fixed fee</strong>. When <strong>passed on</strong>, it's added to the customer's total at checkout. When <strong>absorbed</strong>, it isn't charged to the customer but is deducted as a cost of business across all sales reports.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
          </div>
        ) : methods.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
            No payment methods are enabled. Enable them under Management → Registers first.
          </CardContent></Card>
        ) : (
          <div className="space-y-4">
            {methods.map((m) => {
              const r = rows[m.id] ?? EMPTY_ROW;
              const Icon = m.icon;
              const pct = Math.max(0, Math.min(100, parseFloat(r.percent) || 0));
              const fixed = Math.max(0, parseFloat(r.fixed) || 0);
              const exampleOn100 = (pct / 100) * 100 + fixed;
              return (
                <Card key={m.id} className={cn(!r.enabled && "opacity-75")}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Icon className="w-4 h-4" /> {m.label}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`enabled-${m.id}`} className="text-xs text-muted-foreground">
                          {r.enabled ? "On" : "Off"}
                        </Label>
                        <Switch
                          id={`enabled-${m.id}`}
                          checked={r.enabled}
                          onCheckedChange={(v) => patch(m.id, { enabled: v })}
                        />
                      </div>
                    </div>
                    <CardDescription>{m.description}</CardDescription>
                  </CardHeader>
                  {r.enabled && (
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Percentage</Label>
                          <div className="relative">
                            <Input
                              type="number" min="0" max="100" step="0.01" inputMode="decimal"
                              value={r.percent}
                              onChange={(e) => patch(m.id, { percent: e.target.value })}
                              className="pr-8"
                            />
                            <Percent className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Fixed fee</Label>
                          <div className="relative">
                            <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <Input
                              type="number" min="0" step="0.01" inputMode="decimal"
                              value={r.fixed}
                              onChange={(e) => patch(m.id, { fixed: e.target.value })}
                              className="pl-7"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{r.passOn ? "Pass on to customer" : "Absorb as cost of business"}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.passOn
                              ? "Added to the customer's total at checkout as a surcharge."
                              : "Not charged to the customer — deducted as a cost in your reports."}
                          </p>
                        </div>
                        <Switch checked={r.passOn} onCheckedChange={(v) => patch(m.id, { passOn: v })} />
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="font-normal">Example</Badge>
                        On a $100 sale: {r.passOn
                          ? <span>customer pays <strong className="text-foreground">+{fmtMoney(exampleOn100)}</strong></span>
                          : <span>you absorb <strong className="text-foreground">{fmtMoney(exampleOn100)}</strong></span>}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={!dirty || update.isPending} className="min-w-32">
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
