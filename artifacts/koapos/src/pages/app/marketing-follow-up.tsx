import { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "wouter";
import DOMPurify from "dompurify";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Clock, Mail, MessageSquare, Send, Wrench, CalendarCheck, FileText, Search,
  CheckCircle2, AlertTriangle, History, Settings2, RefreshCw, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useListFollowUps,
  useListFollowUpTemplates,
  useListFollowUpShortcodes,
  useListFollowUpLog,
  useGetFollowUpSettings,
  useUpdateFollowUpSettings,
  useSendFollowUps,
  usePreviewFollowUp,
} from "@workspace/api-client-react";
import {
  ShortcodePalette, FALLBACK_SHORTCODES, insertShortcode,
  type FollowUpShortcode,
} from "@/components/marketing/follow-up-shortcodes";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface DueItem {
  id: string;
  sourceType: "service_job" | "appointment";
  sourceId: number;
  reference: string;
  title: string;
  device: string;
  staffName: string;
  completedAt: string;
  daysSince: number;
  customerId: number | null;
  customerName: string;
  email: string;
  phone: string;
  agreedToMarketing: boolean;
  lastFollowUpAt: string | null;
  followUpCount: number;
}

interface Template {
  id: number;
  name: string;
  channel: string;
  subject: string;
  body: string;
  smsBody: string;
  isDefault: boolean;
}

type Channel = "email" | "sms" | "both";
type WindowUnit = "days" | "weeks" | "months";

const UNIT_LABEL: Record<WindowUnit, string> = { days: "Days", weeks: "Weeks", months: "Months" };
const SMS_CHAR_LIMIT = 160;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

/* ── Send dialog ───────────────────────────────────────────────────────── */

function SendDialog({
  open, targets, templates, shortcodes, defaultChannel, onClose, onSent,
}: {
  open: boolean;
  targets: DueItem[];
  templates: Template[];
  shortcodes: FollowUpShortcode[];
  defaultChannel: Channel;
  onClose: () => void;
  onSent: () => void;
}) {
  const [channel, setChannel]     = useState<Channel>(defaultChannel);
  const [templateId, setTemplateId] = useState<string>("none");
  const [subject, setSubject]     = useState("");
  const [body, setBody]           = useState("");
  const [smsBody, setSmsBody]     = useState("");
  const [preview, setPreview]     = useState<{ subject: string; html: string; sms: string } | null>(null);

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef    = useRef<HTMLTextAreaElement>(null);
  const smsRef     = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState<"subject" | "body" | "sms">("body");

  const sendFollowUps = useSendFollowUps();
  const previewFollowUp = usePreviewFollowUp();

  // Seed the editor from the default template (or the first one) each time the
  // dialog opens, without clobbering edits while it stays open.
  useEffect(() => {
    if (!open) return;
    setChannel(defaultChannel);
    setPreview(null);
    const preferred = templates.find((t) => t.isDefault) ?? templates[0];
    if (preferred) {
      setTemplateId(String(preferred.id));
      setSubject(preferred.subject);
      setBody(preferred.body);
      setSmsBody(preferred.smsBody);
    } else {
      setTemplateId("none");
      setSubject("");
      setBody("");
      setSmsBody("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const applyTemplate = (value: string) => {
    setTemplateId(value);
    const t = templates.find((x) => String(x.id) === value);
    if (!t) return;
    setSubject(t.subject);
    setBody(t.body);
    setSmsBody(t.smsBody);
    setPreview(null);
  };

  const handleInsert = (code: string) => {
    if (focused === "subject") insertShortcode(subjectRef, subject, code, setSubject);
    else if (focused === "sms")  insertShortcode(smsRef, smsBody, code, setSmsBody);
    else insertShortcode(bodyRef, body, code, setBody);
  };

  const wantEmail = channel === "email" || channel === "both";
  const wantSms   = channel === "sms"   || channel === "both";

  const reachable = targets.filter((t) => (wantEmail && t.email) || (wantSms && t.phone));
  const unreachable = targets.length - reachable.length;
  const notOptedIn = targets.filter((t) => !t.agreedToMarketing).length;

  const payload = () => ({
    targets: targets.map((t) => ({ sourceType: t.sourceType, sourceId: t.sourceId })),
    channel,
    templateId: templateId === "none" ? null : Number(templateId),
    subject,
    body,
    smsBody,
  });

  const handlePreview = () => {
    if (targets.length === 0) return;
    previewFollowUp.mutate({ data: { ...payload(), targets: [{ sourceType: targets[0]!.sourceType, sourceId: targets[0]!.sourceId }] } }, {
      onSuccess: (res) => setPreview({ subject: res.subject, html: res.html, sms: res.sms }),
      onError: () => toast.error("Could not render a preview"),
    });
  };

  const handleSend = () => {
    sendFollowUps.mutate({ data: payload() }, {
      onSuccess: (res) => {
        if (res.sent > 0) toast.success(`Sent ${res.sent} follow-up message${res.sent !== 1 ? "s" : ""}`);
        if (res.skipped > 0) toast.warning(`${res.skipped} skipped (no contact details or no marketing opt-in)`);
        if (res.failed > 0) toast.error(`${res.failed} failed to send`);
        if (res.sent === 0 && res.failed === 0 && res.skipped === 0) toast("Nothing was sent");
        onSent();
        onClose();
      },
      onError: (err) => toast.error((err as { message?: string })?.message ?? "Failed to send follow-ups"),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-4 h-4 text-primary" />
            Send follow-up to {targets.length} customer{targets.length !== 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            Shortcodes are replaced per customer when the message goes out.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Channel</Label>
              <Select value={channel} onValueChange={(v) => { setChannel(v as Channel); setPreview(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="both">Email + SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Template</Label>
              <Select value={templateId} onValueChange={applyTemplate}>
                <SelectTrigger><SelectValue placeholder="No template" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No template — write below</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}{t.isDefault ? " (default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {(unreachable > 0 || notOptedIn > 0) && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-200 space-y-1">
              {unreachable > 0 && (
                <p className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {unreachable} selected customer{unreachable !== 1 ? "s have" : " has"} no {channel === "sms" ? "phone number" : channel === "email" ? "email address" : "contact details"} on file and will be skipped.
                </p>
              )}
              {notOptedIn > 0 && (
                <p className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {notOptedIn} selected customer{notOptedIn !== 1 ? "s have" : " has"} not opted in to marketing — skipped unless you turn off the opt-in check in Follow Up settings.
                </p>
              )}
            </div>
          )}

          {wantEmail && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="fu-subject">Email subject</Label>
                <Input
                  id="fu-subject" ref={subjectRef} value={subject}
                  onFocus={() => setFocused("subject")}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="How did we go with your {{device}}?"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fu-body">Email body (HTML supported)</Label>
                <Textarea
                  id="fu-body" ref={bodyRef} value={body} rows={8}
                  onFocus={() => setFocused("body")}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="<p>Hi {{first_name}},</p><p>It's been {{days_since}} days since we finished {{service_title}}…</p>"
                  className="font-mono text-xs"
                />
              </div>
            </div>
          )}

          {wantSms && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="fu-sms">SMS message</Label>
                <span className={cn("text-[11px]", smsBody.length > SMS_CHAR_LIMIT ? "text-amber-600" : "text-muted-foreground")}>
                  {smsBody.length} chars {smsBody.length > SMS_CHAR_LIMIT ? `· ${Math.ceil(smsBody.length / SMS_CHAR_LIMIT)} segments` : ""}
                </span>
              </div>
              <Textarea
                id="fu-sms" ref={smsRef} value={smsBody} rows={4}
                onFocus={() => setFocused("sms")}
                onChange={(e) => setSmsBody(e.target.value)}
                placeholder="Hi {{first_name}}, how has your {{device}} been since we fixed it? — {{business_name}}"
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Leave blank to reuse the email body as plain text. &ldquo;Reply STOP to unsubscribe&rdquo; is appended automatically.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Insert a shortcode into the {focused === "subject" ? "subject" : focused === "sms" ? "SMS" : "email body"}</Label>
            <ShortcodePalette shortcodes={shortcodes} onInsert={handleInsert} />
          </div>

          {preview && (
            <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" /> Preview for {targets[0]?.customerName || "the first customer"}
              </p>
              {wantEmail && (
                <div className="space-y-1">
                  <p className="text-xs font-medium">{preview.subject}</p>
                  <div
                    className="text-xs bg-background rounded p-2 border prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(preview.html) }}
                  />
                </div>
              )}
              {wantSms && (
                <p className="text-xs bg-background rounded p-2 border whitespace-pre-wrap">{preview.sms}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="outline" onClick={handlePreview} disabled={previewFollowUp.isPending || targets.length === 0} className="gap-1.5">
            <Eye className="w-4 h-4" /> Preview
          </Button>
          <Button onClick={handleSend} disabled={sendFollowUps.isPending || reachable.length === 0} className="gap-1.5">
            <Send className="w-4 h-4" />
            {sendFollowUps.isPending ? "Sending…" : `Send to ${reachable.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function MarketingFollowUpPage() {
  const { data: settingsData, refetch: refetchSettings } = useGetFollowUpSettings({ query: { queryKey: ["follow-up-settings"] } });
  const updateSettings = useUpdateFollowUpSettings();

  const [windowValue, setWindowValue] = useState(30);
  const [windowUnit, setWindowUnit]   = useState<WindowUnit>("days");
  const [includeServices, setIncludeServices] = useState(true);
  const [includeAppointments, setIncludeAppointments] = useState(true);
  const [hideAlreadySent, setHideAlreadySent] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sendOpen, setSendOpen] = useState(false);
  const [sendTargets, setSendTargets] = useState<DueItem[]>([]);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Adopt the saved defaults once, then let the merchant drive the controls.
  useEffect(() => {
    if (!settingsData || settingsLoaded) return;
    setWindowValue(settingsData.windowValue);
    setWindowUnit(settingsData.windowUnit as WindowUnit);
    setIncludeServices(settingsData.includeServices);
    setIncludeAppointments(settingsData.includeAppointments);
    setHideAlreadySent(settingsData.hideAlreadySent);
    setSettingsLoaded(true);
  }, [settingsData, settingsLoaded]);

  const params = {
    windowValue,
    windowUnit,
    includeServices: includeServices ? ("true" as const) : ("false" as const),
    includeAppointments: includeAppointments ? ("true" as const) : ("false" as const),
    hideAlreadySent: hideAlreadySent ? ("true" as const) : ("false" as const),
  };

  const { data: dueData, isLoading, refetch: refetchDue, isFetching } = useListFollowUps(params, {
    query: { queryKey: ["follow-ups", params] },
  });
  const { data: templatesData } = useListFollowUpTemplates({ query: { queryKey: ["follow-up-templates"] } });
  const { data: shortcodesData } = useListFollowUpShortcodes({ query: { queryKey: ["follow-up-shortcodes"] } });
  const { data: logData, refetch: refetchLog } = useListFollowUpLog(undefined, { query: { queryKey: ["follow-up-log"] } });

  const items = (dueData?.items ?? []) as unknown as DueItem[];
  const templates = (templatesData?.items ?? []) as unknown as Template[];
  const shortcodes = (shortcodesData?.items ?? FALLBACK_SHORTCODES) as FollowUpShortcode[];
  const log = logData?.items ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      i.customerName.toLowerCase().includes(q) ||
      i.reference.toLowerCase().includes(q) ||
      i.title.toLowerCase().includes(q) ||
      i.device.toLowerCase().includes(q));
  }, [items, search]);

  const selectedItems = filtered.filter((i) => selected.has(i.id));
  const allVisibleSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filtered.forEach((i) => next.delete(i.id));
      else filtered.forEach((i) => next.add(i.id));
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openSend = (targets: DueItem[]) => {
    if (targets.length === 0) { toast("Select at least one customer first"); return; }
    setSendTargets(targets);
    setSendOpen(true);
  };

  const afterSend = () => {
    setSelected(new Set());
    refetchDue();
    refetchLog();
  };

  const saveAsDefault = () => {
    updateSettings.mutate({
      data: { windowValue, windowUnit, includeServices, includeAppointments, hideAlreadySent },
    }, {
      onSuccess: () => { refetchSettings(); toast.success("Saved as your default follow-up window"); },
      onError: () => toast.error("Could not save settings"),
    });
  };

  const saveCompliance = (patch: { requireOptIn?: boolean; reviewUrl?: string; defaultChannel?: Channel }) => {
    updateSettings.mutate({ data: patch }, {
      onSuccess: () => { refetchSettings(); toast.success("Follow Up settings updated"); },
      onError: () => toast.error("Could not save settings"),
    });
  };

  const withEmail = filtered.filter((i) => i.email).length;
  const withPhone = filtered.filter((i) => i.phone).length;
  const optedIn   = filtered.filter((i) => i.agreedToMarketing).length;

  const [reviewUrlDraft, setReviewUrlDraft] = useState("");
  useEffect(() => { if (settingsData) setReviewUrlDraft(settingsData.reviewUrl); }, [settingsData]);

  return (
    <AppLayout>
      <div className="w-full px-4 lg:px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Clock className="w-6 h-6 text-primary" />
              Follow Up
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Reconnect with customers a set time after their service or appointment was completed.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => refetchDue()} disabled={isFetching}>
              <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} /> Refresh
            </Button>
            <Link href="/marketing/follow-up/templates">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <FileText className="w-3.5 h-3.5" /> Templates
              </Button>
            </Link>
            <Button className="gap-1.5" onClick={() => openSend(selectedItems)} disabled={selectedItems.length === 0}>
              <Send className="w-4 h-4" /> Send Follow Up ({selectedItems.length})
            </Button>
          </div>
        </div>

        {/* Window + settings */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" /> Follow-up window
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-end gap-3 flex-wrap">
                <div className="space-y-1.5">
                  <Label htmlFor="fu-window">Completed more than</Label>
                  <Input
                    id="fu-window" type="number" min={0} max={3650} value={windowValue}
                    onChange={(e) => setWindowValue(Math.max(0, Number(e.target.value) || 0))}
                    className="w-28"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>&nbsp;</Label>
                  <Select value={windowUnit} onValueChange={(v) => setWindowUnit(v as WindowUnit)}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(UNIT_LABEL) as WindowUnit[]).map((u) => (
                        <SelectItem key={u} value={u}>{UNIT_LABEL[u]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-sm text-muted-foreground pb-2.5">ago</p>
                <Button variant="outline" size="sm" onClick={saveAsDefault} disabled={updateSettings.isPending} className="mb-0.5">
                  Save as default
                </Button>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="fu-services" className="flex items-center gap-2 font-normal">
                    <Wrench className="w-4 h-4 text-muted-foreground" /> Include completed service jobs
                  </Label>
                  <Switch id="fu-services" checked={includeServices} onCheckedChange={setIncludeServices} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="fu-appts" className="flex items-center gap-2 font-normal">
                    <CalendarCheck className="w-4 h-4 text-muted-foreground" /> Include completed appointments
                  </Label>
                  <Switch id="fu-appts" checked={includeAppointments} onCheckedChange={setIncludeAppointments} />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="fu-hide" className="flex items-center gap-2 font-normal">
                    <CheckCircle2 className="w-4 h-4 text-muted-foreground" /> Hide records already followed up
                  </Label>
                  <Switch id="fu-hide" checked={hideAlreadySent} onCheckedChange={setHideAlreadySent} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-primary" /> Sending defaults
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Due now", value: filtered.length },
                  { label: "With email", value: withEmail },
                  { label: "With mobile", value: withPhone },
                  { label: "Opted in", value: optedIn },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border bg-muted/40 p-3">
                    <p className="text-xl font-bold">{s.value}</p>
                    <p className="text-[11px] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <Label>Default channel</Label>
                <Select
                  value={(settingsData?.defaultChannel ?? "email") as Channel}
                  onValueChange={(v) => saveCompliance({ defaultChannel: v as Channel })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="both">Email + SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fu-review">Review link — available as <code className="font-mono text-[11px]">{"{{review_link}}"}</code></Label>
                <div className="flex gap-2">
                  <Input
                    id="fu-review" value={reviewUrlDraft} placeholder="https://g.page/r/…"
                    onChange={(e) => setReviewUrlDraft(e.target.value)}
                  />
                  <Button variant="outline" onClick={() => saveCompliance({ reviewUrl: reviewUrlDraft })} disabled={updateSettings.isPending}>
                    Save
                  </Button>
                </div>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label htmlFor="fu-optin" className="font-normal">Only send to customers opted in to marketing</Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Required for promotional messages under the Spam Act 2003. Turn off only if you treat follow-ups as service messages.
                  </p>
                </div>
                <Switch
                  id="fu-optin"
                  checked={settingsData?.requireOptIn ?? true}
                  onCheckedChange={(v) => saveCompliance({ requireOptIn: v })}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Due list / history */}
        <Tabs defaultValue="due">
          <TabsList>
            <TabsTrigger value="due" className="gap-1.5"><Clock className="w-3.5 h-3.5" /> Due ({filtered.length})</TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5"><History className="w-3.5 h-3.5" /> History ({log.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="due" className="mt-4 space-y-3">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer, job number, device…" className="pl-9" />
            </div>

            <Card>
              <CardContent className="p-0 overflow-x-auto">
                {isLoading ? (
                  <p className="p-8 text-sm text-muted-foreground">Loading…</p>
                ) : filtered.length === 0 ? (
                  <div className="p-10 text-center space-y-1">
                    <CheckCircle2 className="w-8 h-8 text-muted-foreground mx-auto" />
                    <p className="text-sm font-medium">Nothing due</p>
                    <p className="text-xs text-muted-foreground">
                      No completed work older than {windowValue} {UNIT_LABEL[windowUnit].toLowerCase()} is waiting on a follow-up.
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                        </TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Work</TableHead>
                        <TableHead>Completed</TableHead>
                        <TableHead className="text-right">Days ago</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Last follow-up</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((i) => (
                        <TableRow key={i.id} className={cn(selected.has(i.id) && "bg-muted/50")}>
                          <TableCell>
                            <Checkbox checked={selected.has(i.id)} onCheckedChange={() => toggleOne(i.id)} aria-label={`Select ${i.reference}`} />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-sm">{i.customerName || "—"}</div>
                            {!i.agreedToMarketing && (
                              <Badge variant="outline" className="mt-1 text-[10px] border-amber-300 text-amber-700">No marketing opt-in</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5 text-sm">
                              {i.sourceType === "service_job"
                                ? <Wrench className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                : <CalendarCheck className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                              <span className="font-mono text-xs">{i.reference}</span>
                            </div>
                            <div className="text-xs text-muted-foreground">{[i.title, i.device].filter(Boolean).join(" · ")}</div>
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{fmtDate(i.completedAt)}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{i.daysSince}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Mail className={cn("w-3.5 h-3.5", i.email ? "text-emerald-600" : "text-muted-foreground/30")} />
                              <MessageSquare className={cn("w-3.5 h-3.5", i.phone ? "text-emerald-600" : "text-muted-foreground/30")} />
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {i.lastFollowUpAt ? `${fmtDate(i.lastFollowUpAt)} (${i.followUpCount})` : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => openSend([i])}>
                              <Send className="w-3 h-3" /> Send
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                {log.length === 0 ? (
                  <p className="p-8 text-sm text-muted-foreground">No follow-ups have been sent yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sent</TableHead>
                        <TableHead>Record</TableHead>
                        <TableHead>Channel</TableHead>
                        <TableHead>Recipient</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Detail</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {log.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {new Date(r.sentAt).toLocaleString("en-AU")}
                          </TableCell>
                          <TableCell className="text-xs font-mono">
                            {r.sourceType === "service_job" ? "Job" : "Appt"} #{r.sourceId}
                          </TableCell>
                          <TableCell className="text-xs capitalize">{r.channel}</TableCell>
                          <TableCell className="text-xs">{r.recipient || "—"}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px]",
                                r.status === "sent" && "border-emerald-300 text-emerald-700",
                                r.status === "failed" && "border-red-300 text-red-700",
                                r.status === "skipped" && "border-amber-300 text-amber-700",
                              )}
                            >
                              {r.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                            {r.error ?? r.subject ?? ""}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <SendDialog
        open={sendOpen}
        targets={sendTargets}
        templates={templates}
        shortcodes={shortcodes}
        defaultChannel={(settingsData?.defaultChannel ?? "email") as Channel}
        onClose={() => setSendOpen(false)}
        onSent={afterSend}
      />
    </AppLayout>
  );
}
