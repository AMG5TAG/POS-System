import { useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  MessageSquare, Users, ChevronDown, ChevronRight,
  Clock, Trash2, Plus, FileText, Code, RefreshCw, Megaphone, Send, Link2, Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import {
  useListCustomers,
  useListSmsCampaigns,
  useCreateSmsCampaign,
  useDeleteSmsCampaign,
} from "@workspace/api-client-react";
import type { Customer } from "@workspace/api-client-react";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface SmsCampaign {
  id: string;
  name: string;
  audience: string;
  audienceLabel: string;
  body: string;
  linkUrl: string;
  scheduled: boolean;
  scheduledAt: string;
  status: "draft" | "sent" | "scheduled";
  sentAt?: string;
  delivered: number;
  failed: number;
  recipientCount: number;
  customerId?: number;
  createdAt: string;
}

type ApiCampaign = Record<string, unknown>;

function apiToLocal(c: ApiCampaign): SmsCampaign {
  return {
    id: String(c.id ?? ""),
    name: String(c.name ?? ""),
    audience: String(c.audience ?? "all"),
    audienceLabel: String(c.audienceLabel ?? "All Customers"),
    body: String(c.body ?? ""),
    linkUrl: String(c.linkUrl ?? ""),
    scheduled: c.scheduled === "true" || c.scheduled === true,
    scheduledAt: String(c.scheduledAt ?? ""),
    status: (c.status as "draft" | "sent" | "scheduled") ?? "draft",
    sentAt: c.sentAt ? String(c.sentAt) : undefined,
    delivered: Number(c.delivered ?? 0),
    failed: Number(c.failed ?? 0),
    recipientCount: Number(c.recipientCount ?? 0),
    customerId: c.customerId ? Number(c.customerId) : undefined,
    createdAt: String(c.createdAt ?? new Date().toISOString()),
  };
}

interface QuickTemplate {
  id: string;
  label: string;
  body: string;
}

/* ── Constants ─────────────────────────────────────────────────────────── */

const SMS_CHAR_LIMIT = 160;

const AUDIENCE_OPTIONS = [
  { value: "all",        label: "All Customers" },
  { value: "specific",   label: "Specific Customer" },
  { value: "loyalty",    label: "Loyalty Members" },
  { value: "new",        label: "New Customers (last 30 days)" },
  { value: "inactive",   label: "Inactive Customers (90+ days)" },
  { value: "high_value", label: "High-Value Customers ($500+)" },
];

const QUICK_TEMPLATES: QuickTemplate[] = [
  { id: "welcome",  label: "Welcome New Customer",  body: "Hi {{first_name}}, welcome to {{business_name}}! We're glad to have you. See you soon." },
  { id: "promo",    label: "Promotional Offer",      body: "Hi {{first_name}}, {{business_name}} has a special offer just for you! Visit us today." },
  { id: "thankyou", label: "Thank You",              body: "Hi {{first_name}}, thank you for visiting {{business_name}}! We hope to see you again soon." },
  { id: "loyalty",  label: "Loyalty Points Update",  body: "Hi {{first_name}}, you have loyalty points with {{business_name}}. Visit us to redeem them!" },
  { id: "winback",  label: "Win-Back Campaign",      body: "Hi {{first_name}}, we miss you at {{business_name}}! Come back and see what's new." },
  { id: "reminder", label: "Appointment Reminder",   body: "Hi {{first_name}}, this is a reminder of your upcoming appointment at {{business_name}}. See you soon!" },
  { id: "custom",   label: "Custom Message",         body: "Hi {{first_name}}, " },
];

const QUICK_CODES = [
  { code: "{{first_name}}",    desc: "Customer's first name" },
  { code: "{{last_name}}",     desc: "Customer's last name" },
  { code: "{{business_name}}", desc: "Your business name" },
];

/* ── Helpers ───────────────────────────────────────────────────────────── */

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function blankDraft() {
  return {
    id: uid(),
    name: "",
    audience: "all",
    audienceLabel: "All Customers",
    body: "",
    linkUrl: "",
    scheduled: false,
    scheduledAt: "",
    status: "draft" as const,
    delivered: 0,
    failed: 0,
    recipientCount: 0,
    customerId: null as number | null,
    createdAt: new Date().toISOString(),
  };
}

function smsSegments(chars: number) {
  if (chars === 0) return 0;
  if (chars <= SMS_CHAR_LIMIT) return 1;
  return Math.ceil(chars / 153);
}

/* ── Campaign row ──────────────────────────────────────────────────────── */

function CampaignRow({ campaign, onDelete }: { campaign: SmsCampaign; onDelete: (id: string) => void }) {
  const statusColor = {
    sent:      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    draft:     "bg-muted text-muted-foreground",
  }[campaign.status];
  return (
    <div className="flex items-center gap-4 rounded-xl border bg-card px-4 py-3">
      <div className="rounded-lg bg-primary/10 p-2 shrink-0"><MessageSquare className="w-4 h-4 text-primary" /></div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{campaign.body.slice(0, 60) || "(empty message)"}{campaign.body.length > 60 ? "…" : ""}</p>
        <p className="text-xs text-muted-foreground">
          To: {campaign.audienceLabel}{campaign.recipientCount > 0 ? ` · ${campaign.recipientCount} recipients` : ""}
          {campaign.sentAt ? ` · Sent ${new Date(campaign.sentAt).toLocaleDateString("en-AU")}` : ""}
        </p>
      </div>
      {campaign.status === "sent" && (
        <div className="text-right shrink-0 hidden sm:block">
          <p className="text-sm font-semibold">{campaign.delivered} <span className="text-xs font-normal text-muted-foreground">delivered</span></p>
          {campaign.failed > 0 && <p className="text-xs text-red-500">{campaign.failed} failed</p>}
        </div>
      )}
      <Badge className={cn("text-[10px] shrink-0 border-0", statusColor)}>
        {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
      </Badge>
      <button onClick={() => onDelete(campaign.id)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-red-500 transition-colors">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function MarketingSmsCampaignsPage() {
  const { data: rawCampaigns, refetch } = useListSmsCampaigns({ query: { queryKey: ["sms-campaigns"] } });
  const createCampaign = useCreateSmsCampaign();
  const deleteCampaignMutation = useDeleteSmsCampaign();

  const campaigns: SmsCampaign[] = ((rawCampaigns?.items ?? []) as unknown as ApiCampaign[]).map(apiToLocal);

  const [draft, setDraft] = useState(blankDraft);
  const [codesOpen, setCodesOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const { data: customerData } = useListCustomers({ limit: 500 });
  const allCustomers = (customerData?.items ?? []) as Customer[];
  const customersWithPhone = allCustomers.filter((c) => c.phone).length;
  const specificCustomer = draft.audience === "specific" && draft.customerId
    ? allCustomers.find((c) => c.id === draft.customerId)
    : null;

  const setField = useCallback(<K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
  }, []);

  const loadTemplate = (tpl: QuickTemplate) => {
    setField("body", tpl.body);
    toast.success(`Template loaded: ${tpl.label}`);
  };

  const insertCode = (code: string) => {
    setField("body", draft.body + code);
  };

  const audienceCount = (() => {
    if (draft.audience === "all") return customersWithPhone;
    if (draft.audience === "specific") return specificCustomer ? 1 : 0;
    if (draft.audience === "loyalty") return allCustomers.filter((c) => c.phone && c.loyaltyPoints).length;
    return Math.max(1, Math.floor(customersWithPhone * 0.3));
  })();

  const resolveAudienceLabel = () => {
    if (draft.audience === "specific" && specificCustomer) {
      return `${specificCustomer.firstName ?? ""} ${specificCustomer.lastName ?? ""}`.trim() || specificCustomer.phone || "Customer";
    }
    return AUDIENCE_OPTIONS.find((a) => a.value === draft.audience)?.label ?? "All Customers";
  };

  const charCount = draft.body.length;
  const segments = smsSegments(charCount);

  const saveDraft = () => {
    const label = resolveAudienceLabel();
    createCampaign.mutate({
      data: {
        campaignId: `sms-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: draft.body.slice(0, 30) || "Draft",
        audience: draft.audience,
        audienceLabel: label,
        body: draft.body,
        linkUrl: draft.linkUrl,
        scheduled: String(draft.scheduled),
        scheduledAt: draft.scheduledAt || undefined,
        status: "draft",
        delivered: 0,
        failed: 0,
        recipientCount: audienceCount,
        customerId: draft.customerId ?? undefined,
      },
    }, {
      onSuccess: () => { refetch(); toast.success("Draft saved"); },
      onError: () => toast.error("Failed to save draft"),
    });
  };

  const sendCampaign = async () => {
    if (!draft.body.trim()) { toast.error("Please write a message"); return; }
    if (draft.audience === "specific" && !specificCustomer) { toast.error("Please select a customer"); return; }
    setSending(true);
    await new Promise((r) => setTimeout(r, 1200));
    const label = resolveAudienceLabel();
    createCampaign.mutate({
      data: {
        campaignId: `sms-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: draft.body.slice(0, 30),
        audience: draft.audience,
        audienceLabel: label,
        body: draft.body,
        linkUrl: draft.linkUrl,
        scheduled: String(draft.scheduled),
        scheduledAt: draft.scheduledAt || undefined,
        status: draft.scheduled ? "scheduled" : "sent",
        sentAt: draft.scheduled ? undefined : new Date().toISOString(),
        delivered: 0,
        failed: 0,
        recipientCount: audienceCount,
        customerId: draft.customerId ?? undefined,
      },
    }, {
      onSuccess: () => {
        refetch();
        setDraft(blankDraft());
        setSending(false);
        toast.success(draft.scheduled ? `Campaign scheduled for ${draft.scheduledAt}` : `Campaign sent to ${audienceCount} recipients!`);
      },
      onError: () => { setSending(false); toast.error("Failed to send campaign"); },
    });
  };

  const deleteCampaign = (id: string) => {
    deleteCampaignMutation.mutate({ id: Number(id) }, {
      onSuccess: () => { refetch(); toast.success("Campaign deleted"); },
      onError: () => toast.error("Failed to delete campaign"),
    });
  };

  const resetForm = () => setDraft(blankDraft());

  return (
    <AppLayout>
      <div className="w-full px-4 lg:px-6 py-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Send className="w-6 h-6 text-primary" /> SMS Campaigns</h1>
            <p className="text-muted-foreground text-sm mt-1">Compose and send targeted SMS messages to your customer base.</p>
          </div>
          <Link href="/marketing">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs"><Megaphone className="w-3.5 h-3.5" /> Overview</Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">
          {/* Sidebar */}
          <div className="space-y-4">
            <Card className="rounded-2xl">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4 text-primary" /> SMS Templates</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-1">
                {QUICK_TEMPLATES.map((tpl) => (
                  <button key={tpl.id} onClick={() => loadTemplate(tpl)}
                    className="w-full text-left rounded-lg px-3 py-2.5 text-sm hover:bg-muted transition-colors flex items-center justify-between gap-2">
                    <span>{tpl.label}</span>
                    <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                  </button>
                ))}
                <Separator className="my-1" />
                <Link href="/marketing/sms/templates">
                  <button className="w-full text-left rounded-lg px-3 py-2 text-xs text-primary hover:bg-primary/5 transition-colors flex items-center gap-1.5">
                    <Plus className="w-3 h-3" /> Manage saved templates
                  </button>
                </Link>
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <Collapsible open={codesOpen} onOpenChange={setCodesOpen}>
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-semibold hover:bg-muted/50 rounded-2xl transition-colors">
                    <span className="flex items-center gap-2"><Code className="w-4 h-4 text-primary" /> Quick Codes</span>
                    <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", codesOpen && "rotate-180")} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="px-3 pb-3 pt-0 space-y-1">
                    <p className="text-[11px] text-muted-foreground px-1 pb-1">Click to insert into your message</p>
                    {QUICK_CODES.map(({ code, desc }) => (
                      <button key={code} onClick={() => insertCode(code)}
                        className="w-full text-left rounded-lg px-3 py-2 hover:bg-muted transition-colors">
                        <p className="text-xs font-mono text-primary">{code}</p>
                        <p className="text-[10px] text-muted-foreground">{desc}</p>
                      </button>
                    ))}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          </div>

          {/* Compose form */}
          <div className="space-y-4">
            <Card className="rounded-2xl">
              <CardContent className="p-5 space-y-5">
                {/* To */}
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-muted-foreground" /> To</Label>
                  <div className="flex items-center gap-2">
                    <Select value={draft.audience} onValueChange={(v) => { setField("audience", v); if (v !== "specific") setField("customerId", null); }}>
                      <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {AUDIENCE_OPTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-primary">{audienceCount}</p>
                      <p className="text-[10px] text-muted-foreground">recipients</p>
                    </div>
                  </div>
                  {draft.audience === "specific" && (
                    <div className="pt-1">
                      <Select value={draft.customerId ? String(draft.customerId) : ""} onValueChange={(v) => setField("customerId", v ? parseInt(v) : null)}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Select a customer…" /></SelectTrigger>
                        <SelectContent>
                          {allCustomers.filter((c) => c.phone).sort((a, b) => `${a.firstName ?? ""}`.localeCompare(`${b.firstName ?? ""}`)).map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {`${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || "Unnamed"}
                              <span className="text-muted-foreground ml-1.5">({c.phone})</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* Message */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Message</Label>
                    <span className={cn("text-[11px] tabular-nums", charCount > SMS_CHAR_LIMIT ? "text-amber-500" : "text-muted-foreground")}>
                      {charCount} char{charCount !== 1 ? "s" : ""} · {segments} SMS
                    </span>
                  </div>
                  <Textarea
                    value={draft.body}
                    onChange={(e) => setField("body", e.target.value)}
                    placeholder="Hi {{first_name}}, write your SMS message here…"
                    className="min-h-[120px] resize-none font-mono text-sm"
                  />
                  {charCount > SMS_CHAR_LIMIT && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      Message exceeds 160 characters — will be split into {segments} SMS segments.
                    </p>
                  )}
                </div>

                {/* Optional link */}
                <div className="rounded-xl border p-4 space-y-2">
                  <Label className="flex items-center gap-2"><Link2 className="w-3.5 h-3.5 text-muted-foreground" /> Link URL (optional)</Label>
                  <Input value={draft.linkUrl} onChange={(e) => setField("linkUrl", e.target.value)} placeholder="https://yourstore.com" />
                  <p className="text-[11px] text-muted-foreground">Appended to the end of the message.</p>
                </div>

                {/* Schedule */}
                <div className="rounded-xl border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2 cursor-pointer"><Clock className="w-3.5 h-3.5 text-muted-foreground" /> Schedule for Later</Label>
                    <Switch checked={draft.scheduled} onCheckedChange={(v) => setField("scheduled", v)} />
                  </div>
                  {draft.scheduled && (
                    <div className="space-y-1 pt-1">
                      <Label className="text-xs">Send date & time</Label>
                      <Input type="datetime-local" value={draft.scheduledAt} onChange={(e) => setField("scheduledAt", e.target.value)} />
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <Button onClick={sendCampaign} disabled={sending || audienceCount === 0} className="gap-2 flex-1">
                    {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {sending ? "Sending…" : draft.scheduled ? "Schedule Campaign" : `Send to ${audienceCount} recipients`}
                  </Button>
                  <Button variant="outline" onClick={saveDraft} className="gap-1.5"><FileText className="w-4 h-4" /> Save Draft</Button>
                  <Button variant="ghost" size="icon" onClick={resetForm} title="Clear form"><Undo2 className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Campaign history */}
        {campaigns.length > 0 ? (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Campaign History ({campaigns.length})</h2>
            <div className="space-y-2">
              {campaigns.map((c) => <CampaignRow key={c.id} campaign={c} onDelete={deleteCampaign} />)}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed bg-muted/20 p-10 text-center space-y-2">
            <MessageSquare className="w-10 h-10 text-muted-foreground/40 mx-auto" />
            <p className="font-medium">No SMS campaigns yet</p>
            <p className="text-sm text-muted-foreground">Your sent and scheduled SMS campaigns will appear here.</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
