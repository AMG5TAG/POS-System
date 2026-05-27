import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Zap, Plus, Trash2, Pencil, Play, RefreshCw, Mail, MessageSquare,
  Clock, CheckCircle2, XCircle, AlertTriangle, Info, Cake, Calendar,
  ShoppingBag, Wrench, FileWarning,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface AutomationRule {
  id: number;
  name: string;
  isActive: boolean;
  triggerEvent: string;
  channel: string;
  templateId: string | null;
  templateName: string | null;
  templateSubject: string | null;
  templateBody: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DispatchLog {
  id: number;
  ruleId: number;
  customerId: number | null;
  recordType: string | null;
  recordId: string | null;
  channel: string;
  status: string;
  error: string | null;
  sentAt: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category?: string;
}

/* ── Constants ─────────────────────────────────────────────────────────── */

const TRIGGER_EVENTS = [
  { value: "birthday",        label: "Customer Birthday",           icon: Cake,         desc: "Sent on the day matching a customer's date of birth" },
  { value: "anniversary",     label: "Customer Anniversary",        icon: Calendar,     desc: "Sent on the anniversary of a customer's account creation" },
  { value: "new_product",     label: "New Product Added",           icon: ShoppingBag,  desc: "Broadcast to opted-in customers when a new product is created" },
  { value: "new_service_job", label: "New Service Job Created",     icon: Wrench,       desc: "Sent to the customer linked to a newly created service job" },
  { value: "invoice_overdue", label: "Invoice Overdue (Repair Reminder)", icon: FileWarning, desc: "Sent to customers with overdue unpaid invoices (max once per 7 days per invoice)" },
];

const CHANNELS = [
  { value: "email", label: "Email",  icon: Mail },
  { value: "sms",   label: "SMS",    icon: MessageSquare },
];

const EMPTY_FORM = {
  name: "",
  triggerEvent: "",
  channel: "email",
  templateId: "",
};

/* ── Helpers ────────────────────────────────────────────────────────────── */

function readLocalTemplates(): EmailTemplate[] {
  try { return JSON.parse(localStorage.getItem("koapos_email_templates") ?? "[]") ?? []; }
  catch { return []; }
}

function triggerInfo(value: string) {
  return TRIGGER_EVENTS.find((t) => t.value === value);
}

function TriggerBadge({ value }: { value: string }) {
  const t = triggerInfo(value);
  if (!t) return <Badge variant="outline">{value}</Badge>;
  const Icon = t.icon;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      {t.label}
    </span>
  );
}

function ChannelBadge({ value }: { value: string }) {
  return (
    <Badge variant="outline" className="gap-1">
      {value === "email" ? <Mail className="w-3 h-3" /> : <MessageSquare className="w-3 h-3" />}
      {value === "email" ? "Email" : "SMS"}
    </Badge>
  );
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString("en-AU");
}

/* ── API ────────────────────────────────────────────────────────────────── */

const BASE = "/api";

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

/* ── Main Component ─────────────────────────────────────────────────────── */

export default function ManagementMarketingAutomationPage() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [log, setLog] = useState<DispatchLog[]>([]);
  const [localTemplates, setLocalTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [logLoading, setLogLoading] = useState(true);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRule, setEditRule] = useState<AutomationRule | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<AutomationRule | null>(null);

  // Running state
  const [runningId, setRunningId] = useState<number | null>(null);

  // Load data
  const loadRules = useCallback(async () => {
    try {
      const data = await apiFetch<AutomationRule[]>("/marketing-automation");
      setRules(data);
    } catch { toast.error("Failed to load automation rules"); }
    finally { setLoading(false); }
  }, []);

  const loadLog = useCallback(async () => {
    try {
      const data = await apiFetch<DispatchLog[]>("/marketing-automation/log");
      setLog(data);
    } catch { /* silently fail */ }
    finally { setLogLoading(false); }
  }, []);

  useEffect(() => {
    loadRules();
    loadLog();
    setLocalTemplates(readLocalTemplates());
  }, [loadRules, loadLog]);

  // Compute selected template from form.templateId
  const selectedTemplate = localTemplates.find((t) => t.id === form.templateId) ?? null;

  /* ── Open create/edit dialog ────────────────────────────────────────── */

  function openCreate() {
    setEditRule(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(rule: AutomationRule) {
    setEditRule(rule);
    setForm({
      name: rule.name,
      triggerEvent: rule.triggerEvent,
      channel: rule.channel,
      templateId: rule.templateId ?? "",
    });
    setDialogOpen(true);
  }

  /* ── Save rule ──────────────────────────────────────────────────────── */

  async function handleSave() {
    if (!form.name.trim())     { toast.error("Rule name is required"); return; }
    if (!form.triggerEvent)    { toast.error("Please select a trigger event"); return; }
    if (!form.templateId)      { toast.error("Please link an email template"); return; }
    const tpl = localTemplates.find((t) => t.id === form.templateId);
    if (!tpl) { toast.error("Selected template not found"); return; }

    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        triggerEvent: form.triggerEvent,
        channel: form.channel,
        templateId: tpl.id,
        templateName: tpl.name,
        templateSubject: tpl.subject,
        templateBody: tpl.body,
        isActive: editRule ? editRule.isActive : true,
      };
      if (editRule) {
        await apiFetch(`/marketing-automation/${editRule.id}`, { method: "PUT", body: JSON.stringify(body) });
        toast.success("Rule updated");
      } else {
        await apiFetch("/marketing-automation", { method: "POST", body: JSON.stringify(body) });
        toast.success("Automation rule created");
      }
      setDialogOpen(false);
      loadRules();
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  }

  /* ── Toggle active ──────────────────────────────────────────────────── */

  async function handleToggle(rule: AutomationRule) {
    try {
      const updated = await apiFetch<AutomationRule>(`/marketing-automation/${rule.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...rule, isActive: !rule.isActive }),
      });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
    } catch { toast.error("Failed to update rule"); }
  }

  /* ── Delete ─────────────────────────────────────────────────────────── */

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/marketing-automation/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Rule deleted");
      setDeleteTarget(null);
      loadRules();
      loadLog();
    } catch { toast.error("Failed to delete rule"); }
  }

  /* ── Run now ────────────────────────────────────────────────────────── */

  async function handleRunNow(rule: AutomationRule) {
    setRunningId(rule.id);
    try {
      const result = await apiFetch<{ dispatched: number; trigger: string; error?: string }>(`/marketing-automation/${rule.id}/run`, { method: "POST" });
      if (result.error) {
        toast.warning(`Ran: ${result.error}`);
      } else {
        toast.success(`Ran successfully — ${result.dispatched} message${result.dispatched === 1 ? "" : "s"} dispatched`);
      }
      loadRules();
      loadLog();
    } catch (err) {
      toast.error(`Run failed: ${String(err)}`);
    } finally {
      setRunningId(null);
    }
  }

  /* ── Render ─────────────────────────────────────────────────────────── */

  const logByRule = (ruleId: number) => log.filter((l) => l.ruleId === ruleId);

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Marketing Automation</h1>
              <p className="text-sm text-muted-foreground">
                Define trigger-based rules to auto-send emails and SMS when events occur
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { loadRules(); loadLog(); }}>
              <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1.5" /> New Rule
            </Button>
          </div>
        </div>

        {/* Info banner */}
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-900">
          <CardContent className="p-4 flex gap-3">
            <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Rules are evaluated every 24 hours. Templates are pulled from your saved <strong>Email Templates</strong> — make sure to create them there first.
              SMS dispatch requires a third-party SMS gateway to be configured.
            </p>
          </CardContent>
        </Card>

        {/* Rules table */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Automation Rules</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Loading rules…</div>
            ) : rules.length === 0 ? (
              <div className="p-10 text-center">
                <Zap className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="font-medium text-sm">No automation rules yet</p>
                <p className="text-xs text-muted-foreground mt-1">Create your first rule to start sending automated messages</p>
                <Button size="sm" className="mt-4" onClick={openCreate}>
                  <Plus className="w-4 h-4 mr-1.5" /> Create Rule
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-center">Active</TableHead>
                    <TableHead>Rule Name</TableHead>
                    <TableHead>Trigger Event</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Last Run</TableHead>
                    <TableHead className="text-right pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => {
                    const sent = logByRule(rule.id).filter((l) => l.status === "sent").length;
                    const failed = logByRule(rule.id).filter((l) => l.status === "failed").length;
                    return (
                      <TableRow key={rule.id}>
                        <TableCell className="text-center">
                          <Switch
                            checked={rule.isActive}
                            onCheckedChange={() => handleToggle(rule)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{rule.name}</div>
                          {(sent > 0 || failed > 0) && (
                            <div className="flex gap-2 mt-0.5">
                              {sent > 0 && <span className="text-xs text-green-600">{sent} sent</span>}
                              {failed > 0 && <span className="text-xs text-red-500">{failed} failed</span>}
                            </div>
                          )}
                        </TableCell>
                        <TableCell><TriggerBadge value={rule.triggerEvent} /></TableCell>
                        <TableCell><ChannelBadge value={rule.channel} /></TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {rule.templateName ?? <span className="italic text-red-400">No template</span>}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">{timeAgo(rule.lastRunAt)}</span>
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8"
                              title="Run now"
                              disabled={runningId === rule.id}
                              onClick={() => handleRunNow(rule)}
                            >
                              {runningId === rule.id
                                ? <RefreshCw className="w-4 h-4 animate-spin" />
                                : <Play className="w-4 h-4" />
                              }
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8"
                              onClick={() => openEdit(rule)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteTarget(rule)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Dispatch log */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Dispatch Log</CardTitle>
              <span className="text-xs text-muted-foreground">Last 100 entries</span>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {logLoading ? (
              <div className="p-6 text-center text-muted-foreground text-sm">Loading log…</div>
            ) : log.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">No dispatch history yet</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule</TableHead>
                    <TableHead>Trigger Type</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Sent At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {log.slice(0, 50).map((entry) => {
                    const rule = rules.find((r) => r.id === entry.ruleId);
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="text-sm">{rule?.name ?? `Rule #${entry.ruleId}`}</TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground capitalize">
                            {entry.recordType ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell><ChannelBadge value={entry.channel} /></TableCell>
                        <TableCell>
                          <span className={cn("inline-flex items-center gap-1 text-xs font-medium",
                            entry.status === "sent"    ? "text-green-600" :
                            entry.status === "failed"  ? "text-red-500" :
                            "text-muted-foreground"
                          )}>
                            {entry.status === "sent"   && <CheckCircle2 className="w-3.5 h-3.5" />}
                            {entry.status === "failed" && <XCircle className="w-3.5 h-3.5" />}
                            {entry.status === "skipped"&& <AlertTriangle className="w-3.5 h-3.5" />}
                            {entry.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground truncate max-w-[200px] block">
                            {entry.error ?? (entry.customerId ? `Customer #${entry.customerId}` : entry.recordId ?? "—")}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(entry.sentAt).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" })}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editRule ? "Edit Automation Rule" : "New Automation Rule"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            {/* Name */}
            <div className="space-y-1.5">
              <Label>Rule Name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. Birthday Email"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            {/* Trigger Event */}
            <div className="space-y-1.5">
              <Label>Trigger Event <span className="text-destructive">*</span></Label>
              <Select
                value={form.triggerEvent}
                onValueChange={(v) => setForm((f) => ({ ...f, triggerEvent: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a trigger…" />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_EVENTS.map((t) => {
                    const Icon = t.icon;
                    return (
                      <SelectItem key={t.value} value={t.value}>
                        <span className="flex items-center gap-2">
                          <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                          {t.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {form.triggerEvent && (
                <p className="text-xs text-muted-foreground">
                  {triggerInfo(form.triggerEvent)?.desc}
                </p>
              )}
            </div>

            {/* Channel */}
            <div className="space-y-1.5">
              <Label>Channel <span className="text-destructive">*</span></Label>
              <Select
                value={form.channel}
                onValueChange={(v) => setForm((f) => ({ ...f, channel: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => {
                    const Icon = c.icon;
                    return (
                      <SelectItem key={c.value} value={c.value}>
                        <span className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-muted-foreground" />
                          {c.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {form.channel === "sms" && (
                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  SMS requires a third-party SMS gateway to be configured separately
                </p>
              )}
            </div>

            <Separator />

            {/* Template picker */}
            <div className="space-y-1.5">
              <Label>Message Template <span className="text-destructive">*</span></Label>
              {localTemplates.length === 0 ? (
                <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  No email templates found. Create templates in{" "}
                  <a href="/marketing/email/templates" className="underline">Marketing → Email Templates</a>.
                </p>
              ) : (
                <Select
                  value={form.templateId}
                  onValueChange={(v) => setForm((f) => ({ ...f, templateId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template…" />
                  </SelectTrigger>
                  <SelectContent>
                    {localTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                          {t.name}
                          {t.category && <span className="text-muted-foreground text-xs">({t.category})</span>}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Template preview */}
            {selectedTemplate && (
              <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                  <Mail className="w-3.5 h-3.5" /> Template Preview
                </div>
                <p className="text-xs"><span className="font-medium">Subject:</span> {selectedTemplate.subject}</p>
                <div
                  className="text-xs text-muted-foreground line-clamp-3 border-t pt-1.5 mt-1.5 prose prose-sm max-w-none [&>*]:text-xs [&>*]:text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: selectedTemplate.body }}
                />
                <p className="text-xs text-muted-foreground/60 italic">
                  Variables like &#123;&#123;first_name&#125;&#125; and &#123;&#123;business_name&#125;&#125; are substituted at dispatch time.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              {editRule ? "Save Changes" : "Create Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete automation rule?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong> and its full dispatch history will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
