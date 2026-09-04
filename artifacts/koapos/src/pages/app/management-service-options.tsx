import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetServiceSettings, useUpdateServiceSettings, type ServiceSettings,
} from "@workspace/api-client-react";
import {
  Wrench, Wallet, ListChecks, Shield, Clock, PenLine, Truck, StickyNote, Loader2, FileText,
} from "lucide-react";

/* Only the boolean section-visibility keys (excludes the numeric warranty defaults). */
type SectionKey = {
  [K in keyof ServiceSettings]: ServiceSettings[K] extends boolean ? K : never;
}[keyof ServiceSettings];

/* Each toggle maps 1:1 to a section card in ServiceJobDetailDialog. The `key`
   matches the ServiceSettings field that gates that section. */
const SECTIONS: {
  key: SectionKey;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "showQuote",          label: "Quote",                   description: "Quote the customer for this job; offered at the till when linked to a sale.", icon: FileText },
  { key: "showPartsLabour",    label: "Parts & Labour",          description: "Parts and labour line items on a service job.",        icon: Wrench },
  { key: "showApprovalDeposit", label: "Approval & Deposit",      description: "Estimate approval and deposit collection.",            icon: Wallet },
  { key: "showDiagnostics",    label: "Diagnostics / QC Checklist", description: "Diagnostic and quality-control checklist.",          icon: ListChecks },
  { key: "showWarranty",       label: "Repair Warranty & Rework", description: "Repair warranty period and rework tracking.",         icon: Shield },
  { key: "showTechnicianTime", label: "Technician Time",         description: "Technician time tracking against the job.",            icon: Clock },
  { key: "showSignOff",        label: "Customer Sign-Off",       description: "On-screen customer signature capture.",                icon: PenLine },
  { key: "showShipping",       label: "Mail-In Shipping",        description: "Mail-in / shipping details and tracking.",             icon: Truck },
  { key: "showNotes",          label: "Notes",                   description: "Free-text notes appended to the job.",                 icon: StickyNote },
];

export default function ManagementServiceOptionsPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetServiceSettings();
  const updateMutation = useUpdateServiceSettings();

  function savePatch(patch: Partial<ServiceSettings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    updateMutation.mutate({ data: next }, {
      onSuccess: () => {
        queryClient.setQueryData(["/api/service-settings"], next);
        queryClient.invalidateQueries({ queryKey: ["/api/service-settings"] });
      },
      onError: () => toast.error("Failed to save service options"),
    });
  }

  function handleToggle(key: SectionKey, value: boolean) {
    savePatch({ [key]: value } as Partial<ServiceSettings>);
  }

  return (
    <AppLayout>
      <div className="w-full px-4 lg:px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wrench className="w-6 h-6 text-primary" />
            Service Options
          </h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-xl">
            Choose which sections appear in the service job menu. Hidden sections are removed from every
            service job for your business; turning one back on restores it instantly.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Service job sections</CardTitle>
            <CardDescription>These toggles apply across all staff devices.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {isLoading || !settings ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              SECTIONS.map((s, i) => (
                <div
                  key={s.key}
                  className={`flex items-center justify-between gap-4 py-3 ${i > 0 ? "border-t" : ""}`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="rounded-lg p-2 bg-primary/10 shrink-0">
                      <s.icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{s.label}</p>
                      <p className="text-xs text-muted-foreground">{s.description}</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings[s.key]}
                    onCheckedChange={(v) => handleToggle(s.key, v)}
                    disabled={updateMutation.isPending}
                    aria-label={`Show ${s.label}`}
                  />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5 text-primary" /> Warranty defaults</CardTitle>
            <CardDescription>
              Default repair-warranty windows. Repair warranty pre-fills new service jobs; rework warranty
              is applied to no-charge rework jobs. Either can still be changed per job.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading || !settings ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
                <WarrantyDaysField
                  label="Repair warranty (days)"
                  value={settings.repairWarrantyDays}
                  saving={updateMutation.isPending}
                  onSave={(n) => savePatch({ repairWarrantyDays: n })}
                />
                <WarrantyDaysField
                  label="Rework warranty (days)"
                  value={settings.reworkWarrantyDays}
                  saving={updateMutation.isPending}
                  onSave={(n) => savePatch({ reworkWarrantyDays: n })}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

/** A numeric warranty-days input that commits on blur (or Enter) when changed. */
function WarrantyDaysField({
  label, value, saving, onSave,
}: {
  label: string;
  value: number;
  saving: boolean;
  onSave: (days: number) => void;
}) {
  const [text, setText] = useState(String(value ?? 0));
  // Re-seed when the persisted value changes (e.g. after a successful save).
  useEffect(() => { setText(String(value ?? 0)); }, [value]);

  const commit = () => {
    const n = Math.max(0, Math.round(parseFloat(text) || 0));
    if (n === (value ?? 0)) { setText(String(value ?? 0)); return; }
    onSave(n);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Input
        type="number"
        min={0}
        value={text}
        disabled={saving}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      />
    </div>
  );
}
