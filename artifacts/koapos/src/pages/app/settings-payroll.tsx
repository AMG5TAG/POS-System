import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useGetPayrollStatus,
  useGetPayrollSettings,
  useUpdatePayrollSettings,
  customFetch,
} from "@workspace/api-client-react";
import { toast } from "sonner";
import { Wallet, Plug, Link2Off, Building2 } from "lucide-react";

/** Supported payroll providers. The selected provider drives the OAuth flow. */
const PROVIDERS: Array<{ key: string; label: string }> = [
  { key: "xero_payroll", label: "Xero Payroll" },
  { key: "myob_payroll", label: "MYOB" },
];
const providerLabel = (key: string) => PROVIDERS.find((p) => p.key === key)?.label ?? key;

/** Account-mapping fields used when posting the payroll journal to accounting. */
const MAPPING_FIELDS: Array<{ key: string; label: string }> = [
  { key: "wagesExpenseAccount", label: "Wages Expense account code" },
  { key: "payeLiabilityAccount", label: "PAYG Withholding liability code" },
  { key: "superLiabilityAccount", label: "Superannuation liability code" },
  { key: "wagesPayableAccount", label: "Net Wages Payable code" },
];

export default function SettingsPayrollPage() {
  const { data: status, isLoading: statusLoading, refetch: refetchStatus } = useGetPayrollStatus();
  const { data: settings, isLoading: settingsLoading, refetch: refetchSettings } = useGetPayrollSettings();

  const [providerKey, setProviderKey] = useState("xero_payroll");
  const [region, setRegion] = useState("AU");
  const [payCalendarId, setPayCalendarId] = useState("");
  const [mappings, setMappings] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settings) {
      setProviderKey(settings.providerKey ?? "xero_payroll");
      setRegion(settings.region ?? "AU");
      setPayCalendarId(settings.payCalendarId ?? "");
      setMappings((settings.accountMappings as Record<string, string>) ?? {});
    }
  }, [settings]);

  const update = useUpdatePayrollSettings({
    mutation: {
      onSuccess: () => {
        toast.success("Payroll settings saved");
        refetchSettings();
        refetchStatus();
      },
      onError: () => toast.error("Failed to save settings"),
    },
  });

  const save = () =>
    update.mutate({ data: { providerKey, region, payCalendarId: payCalendarId || null, accountMappings: mappings } });

  // Persist the provider immediately so the Connect flow uses the latest choice.
  const changeProvider = (key: string) => {
    setProviderKey(key);
    update.mutate({ data: { providerKey: key } });
  };

  const disconnect = async () => {
    try {
      await customFetch("/api/payroll/disconnect", { method: "DELETE" });
      toast.success("Payroll provider disconnected");
      refetchStatus();
    } catch {
      toast.error("Failed to disconnect");
    }
  };

  const loading = statusLoading || settingsLoading;

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6" /> Payroll Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect a payroll provider that handles pay calculation, PAYG, super and STP lodgement.
          </p>
        </div>

        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            {/* Connection */}
            <Card className="h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" /> Provider connection
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5 max-w-xs">
                  <Label>Provider</Label>
                  <Select value={providerKey} onValueChange={changeProvider}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PROVIDERS.map((p) => (
                        <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{providerLabel(providerKey)}</p>
                    <p className="text-xs text-muted-foreground">
                      {status?.connected
                        ? `Connected${status.accountHandle ? ` — ${status.accountHandle}` : ""}`
                        : status?.configured
                          ? "Not connected"
                          : "Provider OAuth not configured on this server"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {status?.connected ? (
                      <>
                        <Badge variant="secondary">Connected</Badge>
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={disconnect}>
                          <Link2Off className="h-4 w-4" /> Disconnect
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        className="gap-1.5"
                        disabled={!status?.configured}
                        onClick={() => {
                          window.location.href = "/api/payroll/auth/start";
                        }}
                      >
                        <Plug className="h-4 w-4" /> Connect
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Configuration */}
            <Card className="h-full">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Region</Label>
                    <Select value={region} onValueChange={setRegion}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AU">Australia</SelectItem>
                        <SelectItem value="NZ">New Zealand</SelectItem>
                        <SelectItem value="UK">United Kingdom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Pay calendar ID</Label>
                    <Input
                      value={payCalendarId}
                      onChange={(e) => setPayCalendarId(e.target.value)}
                      placeholder="Provider pay-calendar id"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Accounting journal mapping</p>
                  <p className="text-xs text-muted-foreground">
                    Account codes used when posting a posted pay run's journal to your Xero accounting connection.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {MAPPING_FIELDS.map((f) => (
                      <div key={f.key} className="space-y-1.5">
                        <Label className="text-xs">{f.label}</Label>
                        <Input
                          value={mappings[f.key] ?? ""}
                          onChange={(e) => setMappings((m) => ({ ...m, [f.key]: e.target.value }))}
                          placeholder="e.g. 477"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={save} disabled={update.isPending}>
                    Save settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
