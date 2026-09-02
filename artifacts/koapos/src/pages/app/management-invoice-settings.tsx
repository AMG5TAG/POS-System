import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetInvoiceSettings, useUpdateInvoiceSettings, type InvoiceSettings,
} from "@workspace/api-client-react";
import {
  FileText, CalendarClock, BellRing, AlertTriangle, Send, Loader2, Gavel,
} from "lucide-react";

const INVOICE_SETTINGS_QUERY_KEY = ["/api/invoice-settings"] as const;

export default function ManagementInvoiceSettingsPage() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetInvoiceSettings();
  const updateMutation = useUpdateInvoiceSettings();
  const saving = updateMutation.isPending;

  function savePatch(patch: Partial<InvoiceSettings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    updateMutation.mutate({ data: next }, {
      onSuccess: () => {
        queryClient.setQueryData(INVOICE_SETTINGS_QUERY_KEY, next);
        queryClient.invalidateQueries({ queryKey: INVOICE_SETTINGS_QUERY_KEY });
      },
      onError: () => toast.error("Failed to save invoice settings"),
    });
  }

  return (
    <AppLayout>
      <div className="w-full px-4 lg:px-6 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            Invoices
          </h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
            Defaults and automations applied when you invoice clients. These settings apply across all
            staff and devices; every value can still be overridden on an individual invoice.
          </p>
        </div>

        {isLoading || !settings ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* ── Defaults ── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><CalendarClock className="w-5 h-5 text-primary" /> Invoice defaults</CardTitle>
                <CardDescription>Pre-filled on every new invoice you create.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                <NumberRow
                  label="Default due date"
                  hint="Days from the issue date. 0 means due on receipt."
                  suffix="days"
                  value={settings.defaultDueDays}
                  saving={saving}
                  onSave={(n) => savePatch({ defaultDueDays: n })}
                />
                <TextRow
                  label="Invoice number prefix"
                  hint="Shown before the invoice number, e.g. INV-."
                  value={settings.numberPrefix}
                  saving={saving}
                  onSave={(v) => savePatch({ numberPrefix: v })}
                />
                <TextAreaRow
                  label="Default notes"
                  hint="Added to the notes field of each new invoice and printed on the PDF."
                  placeholder="e.g. Thank you for your business."
                  value={settings.defaultNotes}
                  saving={saving}
                  onSave={(v) => savePatch({ defaultNotes: v })}
                />
                <TextAreaRow
                  label="Payment terms"
                  hint="Printed in the invoice footer."
                  placeholder="e.g. Payment due within 14 days. Late fees may apply."
                  value={settings.defaultTerms}
                  saving={saving}
                  onSave={(v) => savePatch({ defaultTerms: v })}
                />
              </CardContent>
            </Card>

            {/* ── Payment reminders ── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><BellRing className="w-5 h-5 text-primary" /> Automated payment reminders</CardTitle>
                <CardDescription>Nudge clients before an invoice falls due so you get paid on time.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                <ToggleRow
                  label="Send payment reminders"
                  hint="Email the customer a friendly reminder before the due date."
                  checked={settings.reminderEnabled}
                  saving={saving}
                  onChange={(v) => savePatch({ reminderEnabled: v })}
                />
                {settings.reminderEnabled && (
                  <NumberRow
                    label="Remind before due"
                    hint="How many days before the due date to send the reminder."
                    suffix="days before"
                    value={settings.reminderDaysBefore}
                    saving={saving}
                    onSave={(n) => savePatch({ reminderDaysBefore: n })}
                  />
                )}
              </CardContent>
            </Card>

            {/* ── Overdue notifications ── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-primary" /> Overdue invoice notifications</CardTitle>
                <CardDescription>Chase up unpaid invoices automatically once they pass their due date.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                <ToggleRow
                  label="Send overdue notices"
                  hint="Email the customer when an invoice becomes overdue."
                  checked={settings.overdueEnabled}
                  saving={saving}
                  onChange={(v) => savePatch({ overdueEnabled: v })}
                />
                {settings.overdueEnabled && (
                  <>
                    <NumberRow
                      label="First notice after due"
                      hint="Days after the due date before the first overdue notice is sent."
                      suffix="days after"
                      value={settings.overdueDaysAfter}
                      saving={saving}
                      onSave={(n) => savePatch({ overdueDaysAfter: n })}
                    />
                    <NumberRow
                      label="Repeat every"
                      hint="Resend the overdue notice on this cadence. 0 sends it once only."
                      suffix="days"
                      value={settings.overdueRepeatDays}
                      saving={saving}
                      onSave={(n) => savePatch({ overdueRepeatDays: n })}
                    />
                  </>
                )}
                <ToggleRow
                  label="Apply a late fee"
                  hint="Add a percentage-based late fee to overdue invoices."
                  checked={settings.lateFeeEnabled}
                  saving={saving}
                  onChange={(v) => savePatch({ lateFeeEnabled: v })}
                />
                {settings.lateFeeEnabled && (
                  <NumberRow
                    label="Late fee"
                    hint="Percentage of the invoice total added once overdue."
                    suffix="%"
                    step="0.1"
                    value={settings.lateFeePercent}
                    saving={saving}
                    onSave={(n) => savePatch({ lateFeePercent: n })}
                  />
                )}
                <ToggleRow
                  label="Add a surcharge after repeated reminders"
                  hint="Apply an extra percentage surcharge once an invoice has had several overdue reminders — on top of any late fee above."
                  checked={settings.surchargeEnabled}
                  saving={saving}
                  onChange={(v) => savePatch({ surchargeEnabled: v })}
                />
                {settings.surchargeEnabled && (
                  <>
                    <NumberRow
                      label="Surcharge"
                      hint="Percentage of the invoice total added as a surcharge."
                      suffix="%"
                      step="0.1"
                      value={settings.surchargePercent}
                      saving={saving}
                      onSave={(n) => savePatch({ surchargePercent: n })}
                    />
                    <NumberRow
                      label="Apply after"
                      hint="Number of overdue reminders sent before the surcharge is added. 0 applies it as soon as the invoice is overdue."
                      suffix="reminders"
                      value={settings.surchargeAfterReminders}
                      saving={saving}
                      onSave={(n) => savePatch({ surchargeAfterReminders: n })}
                    />
                  </>
                )}
              </CardContent>
            </Card>

            {/* ── Debt collection ── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Gavel className="w-5 h-5 text-primary" /> Debt collection</CardTitle>
                <CardDescription>Escalate customers whose overdue invoices pile up.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                <ToggleRow
                  label="Send a debt-collection notice"
                  hint="Email the customer a formal escalation notice once they build up too many overdue invoices."
                  checked={settings.debtCollectionEnabled}
                  saving={saving}
                  onChange={(v) => savePatch({ debtCollectionEnabled: v })}
                />
                {settings.debtCollectionEnabled && (
                  <NumberRow
                    label="Overdue invoices before escalating"
                    hint="Send the debt-collection email once a single customer reaches this many overdue invoices."
                    suffix="invoices"
                    value={settings.debtCollectionThreshold}
                    saving={saving}
                    onSave={(n) => savePatch({ debtCollectionThreshold: Math.max(1, n) })}
                  />
                )}
              </CardContent>
            </Card>

            {/* ── Sending options ── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Send className="w-5 h-5 text-primary" /> Default sending options</CardTitle>
                <CardDescription>How invoices are delivered to clients by default.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                <ToggleRow
                  label="Auto-send on creation"
                  hint="Send the invoice to the customer as soon as it's created."
                  checked={settings.autoSendOnCreate}
                  saving={saving}
                  onChange={(v) => savePatch({ autoSendOnCreate: v })}
                />
                <div className="flex items-center justify-between gap-4 py-3 border-t">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">Default delivery method</p>
                    <p className="text-xs text-muted-foreground">Channel pre-selected on the send dialog.</p>
                  </div>
                  <Select
                    value={settings.defaultSendMethod}
                    onValueChange={(v) => savePatch({ defaultSendMethod: v as InvoiceSettings["defaultSendMethod"] })}
                    disabled={saving}
                  >
                    <SelectTrigger className="w-40 shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                      <SelectItem value="both">Email & SMS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <ToggleRow
                  label="Attach PDF copy"
                  hint="Attach a PDF of the invoice to outgoing emails."
                  checked={settings.attachPdf}
                  saving={saving}
                  onChange={(v) => savePatch({ attachPdf: v })}
                />
                <ToggleRow
                  label="BCC the business"
                  hint="Send a blind copy of every invoice email to your business email address."
                  checked={settings.bccBusinessEmail}
                  saving={saving}
                  onChange={(v) => savePatch({ bccBusinessEmail: v })}
                />
                <TextRow
                  label="Email subject"
                  hint="Placeholders: {number}, {business}."
                  value={settings.emailSubject}
                  saving={saving}
                  onSave={(v) => savePatch({ emailSubject: v })}
                />
                <TextAreaRow
                  label="Email message"
                  hint="Placeholders: {number}, {business}, {total}, {dueDate}."
                  value={settings.emailMessage}
                  saving={saving}
                  onSave={(v) => savePatch({ emailMessage: v })}
                />
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

/* ── Reusable rows ───────────────────────────────────────────────────────── */

function RowShell({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-t first:border-t-0">
      <div className="min-w-0">
        <p className="font-medium text-sm">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function ToggleRow({
  label, hint, checked, saving, onChange,
}: { label: string; hint?: string; checked: boolean; saving: boolean; onChange: (v: boolean) => void }) {
  return (
    <RowShell label={label} hint={hint}>
      <Switch checked={checked} disabled={saving} onCheckedChange={onChange} aria-label={label} />
    </RowShell>
  );
}

/** Numeric field that commits on blur (or Enter) only when the value changed. */
function NumberRow({
  label, hint, value, suffix, step, saving, onSave,
}: {
  label: string; hint?: string; value: number; suffix?: string; step?: string;
  saving: boolean; onSave: (n: number) => void;
}) {
  const [text, setText] = useState(String(value ?? 0));
  useEffect(() => { setText(String(value ?? 0)); }, [value]);

  const commit = () => {
    const n = Math.max(0, parseFloat(text) || 0);
    if (n === (value ?? 0)) { setText(String(value ?? 0)); return; }
    onSave(n);
  };

  return (
    <RowShell label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          step={step ?? "1"}
          className="w-24 text-right"
          value={text}
          disabled={saving}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
        {suffix && <span className="text-xs text-muted-foreground w-16">{suffix}</span>}
      </div>
    </RowShell>
  );
}

/** Single-line text field that commits on blur only when changed. */
function TextRow({
  label, hint, value, saving, onSave,
}: { label: string; hint?: string; value: string; saving: boolean; onSave: (v: string) => void }) {
  const [text, setText] = useState(value ?? "");
  useEffect(() => { setText(value ?? ""); }, [value]);

  const commit = () => {
    if (text === (value ?? "")) return;
    onSave(text);
  };

  return (
    <RowShell label={label} hint={hint}>
      <Input
        type="text"
        className="w-56"
        value={text}
        disabled={saving}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      />
    </RowShell>
  );
}

/** Multi-line text field that commits on blur only when changed. Stacks full-width. */
function TextAreaRow({
  label, hint, value, placeholder, saving, onSave,
}: {
  label: string; hint?: string; value: string; placeholder?: string;
  saving: boolean; onSave: (v: string) => void;
}) {
  const [text, setText] = useState(value ?? "");
  useEffect(() => { setText(value ?? ""); }, [value]);

  const commit = () => {
    if (text === (value ?? "")) return;
    onSave(text);
  };

  return (
    <div className="py-3 border-t space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <Textarea
        rows={3}
        placeholder={placeholder}
        value={text}
        disabled={saving}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
      />
    </div>
  );
}
