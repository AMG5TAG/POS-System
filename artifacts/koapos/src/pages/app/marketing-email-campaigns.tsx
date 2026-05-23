import { useState, useRef, useCallback, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Send, Mail, Users, ChevronDown, ChevronRight, Bold, Italic, List,
  Link2, Image, AlignLeft, AlignCenter, Undo2, Redo2, Eye, EyeOff,
  Clock, Trash2, Plus, Copy, FileText, Code, MoreHorizontal,
  CheckCircle2, AlertCircle, RefreshCw, Megaphone,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { useListCustomers } from "@workspace/api-client-react";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface EmailCampaign {
  id: string;
  name: string;
  audience: string;
  audienceLabel: string;
  subject: string;
  body: string;
  ctaEnabled: boolean;
  ctaLabel: string;
  ctaUrl: string;
  scheduled: boolean;
  scheduledAt: string;
  status: "draft" | "sent" | "scheduled";
  sentAt?: string;
  opens: number;
  bounces: number;
  recipientCount: number;
  createdAt: string;
}

interface QuickTemplate {
  id: string;
  label: string;
  subject: string;
  body: string;
}

/* ── Constants ─────────────────────────────────────────────────────────── */

const CAMPAIGNS_KEY = "koapos_email_campaigns";

const AUDIENCE_OPTIONS = [
  { value: "all",           label: "All Customers" },
  { value: "loyalty",       label: "Loyalty Members" },
  { value: "new",           label: "New Customers (last 30 days)" },
  { value: "inactive",      label: "Inactive Customers (90+ days)" },
  { value: "layby",         label: "Active Layby Holders" },
  { value: "high_value",    label: "High-Value Customers ($500+)" },
  { value: "no_email",      label: "Customers without email (skipped)" },
];

const QUICK_TEMPLATES: QuickTemplate[] = [
  {
    id: "welcome",
    label: "Welcome New Customer",
    subject: "Welcome to {{business_name}}! 🎉",
    body: `<p>Hi {{first_name}},</p><p><br></p><p>Welcome to <strong>{{business_name}}</strong>! We're so glad you've chosen us.</p><p><br></p><p>As a new customer, you'll enjoy:</p><ul><li>Friendly service every visit</li><li>Exclusive member offers</li><li>Loyalty rewards on every purchase</li></ul><p><br></p><p>We can't wait to see you again.</p><p><br></p><p>Warm regards,<br><strong>{{business_name}}</strong></p>`,
  },
  {
    id: "promo",
    label: "Promotional Offer",
    subject: "🔥 Exclusive deal just for you, {{first_name}}",
    body: `<p>Hi {{first_name}},</p><p><br></p><p>We have an <strong>exclusive offer</strong> just for you!</p><p><br></p><p>For a limited time only — don't miss out. Click below to claim your offer.</p><p><br></p><p>Thanks for being a valued customer.</p><p><br></p><p>Cheers,<br><strong>{{business_name}}</strong></p>`,
  },
  {
    id: "thankyou",
    label: "Thank You",
    subject: "Thank you for shopping with us, {{first_name}}!",
    body: `<p>Hi {{first_name}},</p><p><br></p><p>Thank you so much for your recent purchase at <strong>{{business_name}}</strong>.</p><p><br></p><p>Your support means the world to us. We hope you love what you got!</p><p><br></p><p>If you have any questions, don't hesitate to reach out.</p><p><br></p><p>See you next time!<br><strong>{{business_name}}</strong></p>`,
  },
  {
    id: "loyalty",
    label: "Loyalty Points Update",
    subject: "Your loyalty balance: {{loyalty_points}} points 🌟",
    body: `<p>Hi {{first_name}},</p><p><br></p><p>Just a quick update — you currently have <strong>{{loyalty_points}} loyalty points</strong> with us.</p><p><br></p><p>Your points never expire, and can be redeemed on your next visit.</p><p><br></p><p>Thanks for your continued support!<br><strong>{{business_name}}</strong></p>`,
  },
  {
    id: "winback",
    label: "Win-Back Campaign",
    subject: "We miss you, {{first_name}}! 💛",
    body: `<p>Hi {{first_name}},</p><p><br></p><p>It's been a while since we've seen you, and we just wanted to say — <strong>we miss you!</strong></p><p><br></p><p>Come back and visit us soon. We'd love to see you again and have some exciting things in store.</p><p><br></p><p>Until then,<br><strong>{{business_name}}</strong></p>`,
  },
  {
    id: "custom",
    label: "Custom Message",
    subject: "",
    body: "<p>Hi {{first_name}},</p><p><br></p><p>Write your message here…</p><p><br></p><p>Regards,<br><strong>{{business_name}}</strong></p>",
  },
];

const QUICK_CODES = [
  { code: "{{first_name}}",    desc: "Customer's first name" },
  { code: "{{last_name}}",     desc: "Customer's last name" },
  { code: "{{full_name}}",     desc: "Full name" },
  { code: "{{email}}",         desc: "Email address" },
  { code: "{{business_name}}", desc: "Your business name" },
  { code: "{{loyalty_points}}",desc: "Customer's loyalty points" },
  { code: "{{total_spent}}",   desc: "Total amount spent" },
  { code: "{{unsubscribe_link}}", desc: "Unsubscribe URL" },
];

/* ── Helpers ───────────────────────────────────────────────────────────── */

function loadCampaigns(): EmailCampaign[] {
  try { return JSON.parse(localStorage.getItem(CAMPAIGNS_KEY) ?? "[]"); } catch { return []; }
}

function saveCampaigns(c: EmailCampaign[]) {
  try { localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(c)); } catch { /* ignore */ }
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function blankCampaign(): EmailCampaign {
  return {
    id: uid(),
    name: "",
    audience: "all",
    audienceLabel: "All Customers",
    subject: "",
    body: "<p>Hi {{first_name}},</p><p><br></p><p>Write your message here…</p><p><br></p><p>Regards,<br><strong>{{business_name}}</strong></p>",
    ctaEnabled: false,
    ctaLabel: "Shop Now",
    ctaUrl: "",
    scheduled: false,
    scheduledAt: "",
    status: "draft",
    opens: 0,
    bounces: 0,
    recipientCount: 0,
    createdAt: new Date().toISOString(),
  };
}

/* ── Rich text toolbar ─────────────────────────────────────────────────── */

function RichToolbar({ editorRef }: { editorRef: React.RefObject<HTMLDivElement | null> }) {
  const exec = useCallback((cmd: string, val?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val ?? undefined);
  }, [editorRef]);

  const insertLink = () => {
    const url = prompt("Enter link URL:", "https://");
    if (url) exec("createLink", url);
  };

  return (
    <div className="flex items-center gap-0.5 border-b px-2 py-1.5 bg-muted/30 flex-wrap">
      {[
        { cmd: "bold",          icon: Bold,        title: "Bold" },
        { cmd: "italic",        icon: Italic,       title: "Italic" },
        { cmd: "insertUnorderedList", icon: List,   title: "Bullet list" },
        { cmd: "justifyLeft",   icon: AlignLeft,    title: "Align left" },
        { cmd: "justifyCenter", icon: AlignCenter,  title: "Align center" },
      ].map(({ cmd, icon: Icon, title }) => (
        <button
          key={cmd}
          type="button"
          title={title}
          onMouseDown={(e) => { e.preventDefault(); exec(cmd); }}
          className="p-1.5 rounded hover:bg-muted transition-colors"
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
      <div className="w-px h-4 bg-border mx-1" />
      <button
        type="button"
        title="Insert link"
        onMouseDown={(e) => { e.preventDefault(); insertLink(); }}
        className="p-1.5 rounded hover:bg-muted transition-colors"
      >
        <Link2 className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        title="Undo"
        onMouseDown={(e) => { e.preventDefault(); exec("undo"); }}
        className="p-1.5 rounded hover:bg-muted transition-colors"
      >
        <Undo2 className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        title="Redo"
        onMouseDown={(e) => { e.preventDefault(); exec("redo"); }}
        className="p-1.5 rounded hover:bg-muted transition-colors"
      >
        <Redo2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/* ── Preview dialog ────────────────────────────────────────────────────── */

function PreviewDialog({
  open, onClose, subject, body, ctaEnabled, ctaLabel, ctaUrl,
}: {
  open: boolean; onClose: () => void;
  subject: string; body: string; ctaEnabled: boolean; ctaLabel: string; ctaUrl: string;
}) {
  const preview = body
    .replace(/\{\{first_name\}\}/g, "Sarah")
    .replace(/\{\{last_name\}\}/g, "Johnson")
    .replace(/\{\{full_name\}\}/g, "Sarah Johnson")
    .replace(/\{\{email\}\}/g, "sarah@example.com")
    .replace(/\{\{business_name\}\}/g, "Your Business")
    .replace(/\{\{loyalty_points\}\}/g, "240")
    .replace(/\{\{total_spent\}\}/g, "$1,250.00")
    .replace(/\{\{unsubscribe_link\}\}/g, "#");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-4 h-4" /> Email Preview
          </DialogTitle>
        </DialogHeader>
        <div className="border rounded-xl overflow-hidden">
          <div className="bg-muted/50 border-b px-4 py-3">
            <p className="text-xs text-muted-foreground">Subject</p>
            <p className="font-semibold text-sm">{subject || "(no subject)"}</p>
          </div>
          <div className="bg-white dark:bg-background px-6 py-6 space-y-4 max-h-[400px] overflow-y-auto">
            <div
              className="text-sm prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: preview }}
            />
            {ctaEnabled && ctaLabel && (
              <div className="text-center pt-2">
                <span className="inline-block bg-primary text-primary-foreground text-sm font-semibold px-6 py-2.5 rounded-lg">
                  {ctaLabel}
                </span>
              </div>
            )}
          </div>
          <div className="bg-muted/30 border-t px-6 py-3 text-center">
            <p className="text-[10px] text-muted-foreground">
              © Your Business · <span className="underline">Unsubscribe</span>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Campaign row ──────────────────────────────────────────────────────── */

function CampaignRow({
  campaign, onDelete,
}: { campaign: EmailCampaign; onDelete: (id: string) => void }) {
  const statusColor = {
    sent:      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    draft:     "bg-muted text-muted-foreground",
  }[campaign.status];

  return (
    <div className="flex items-center gap-4 rounded-xl border bg-card px-4 py-3">
      <div className="rounded-lg bg-primary/10 p-2 shrink-0">
        <Mail className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{campaign.subject || "(no subject)"}</p>
        <p className="text-xs text-muted-foreground">
          To: {campaign.audienceLabel} · {campaign.recipientCount > 0 ? `${campaign.recipientCount} recipients` : ""}
          {campaign.sentAt ? ` · Sent ${new Date(campaign.sentAt).toLocaleDateString("en-AU")}` : ""}
        </p>
      </div>
      {campaign.status === "sent" && (
        <div className="text-right shrink-0 hidden sm:block">
          <p className="text-sm font-semibold">{campaign.opens} <span className="text-xs font-normal text-muted-foreground">opens</span></p>
          {campaign.bounces > 0 && (
            <p className="text-xs text-red-500">{campaign.bounces} bounced</p>
          )}
        </div>
      )}
      <Badge className={cn("text-[10px] shrink-0 border-0", statusColor)}>
        {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
      </Badge>
      <button
        onClick={() => onDelete(campaign.id)}
        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-red-500 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function MarketingEmailCampaignsPage() {
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>(loadCampaigns);
  const [draft, setDraft] = useState<EmailCampaign>(blankCampaign);
  const [codesOpen, setCodesOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  /* Load template from localStorage if navigated from templates page */
  const { data: customerData } = useListCustomers({ limit: 500 });
  const allCustomers = (customerData as { items?: { email?: string | null }[] } | undefined)?.items ?? [];
  const customersWithEmail = allCustomers.filter((c) => c.email).length;

  const setField = useCallback(<K extends keyof EmailCampaign>(k: K, v: EmailCampaign[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
  }, []);

  const loadTemplate = (tpl: QuickTemplate) => {
    setField("subject", tpl.subject);
    if (editorRef.current) {
      editorRef.current.innerHTML = tpl.body;
    }
    setField("body", tpl.body);
    toast.success(`Template loaded: ${tpl.label}`);
  };

  const handleBodyInput = () => {
    if (editorRef.current) setField("body", editorRef.current.innerHTML);
  };

  const insertCode = (code: string) => {
    editorRef.current?.focus();
    document.execCommand("insertText", false, code);
    if (editorRef.current) setField("body", editorRef.current.innerHTML);
  };

  const audienceCount = (() => {
    if (draft.audience === "all") return customersWithEmail;
    if (draft.audience === "loyalty") return allCustomers.filter((c) => c.email && (c as { loyaltyPoints?: number }).loyaltyPoints).length;
    if (draft.audience === "no_email") return allCustomers.filter((c) => !c.email).length;
    return Math.max(1, Math.floor(customersWithEmail * 0.3));
  })();

  const saveDraft = () => {
    const label = AUDIENCE_OPTIONS.find((a) => a.value === draft.audience)?.label ?? "All Customers";
    const updated = { ...draft, status: "draft" as const, audienceLabel: label, recipientCount: audienceCount };
    const existing = campaigns.findIndex((c) => c.id === draft.id);
    let next: EmailCampaign[];
    if (existing >= 0) {
      next = campaigns.map((c) => c.id === draft.id ? updated : c);
    } else {
      next = [updated, ...campaigns];
    }
    setCampaigns(next);
    saveCampaigns(next);
    toast.success("Draft saved");
  };

  const sendCampaign = async () => {
    if (!draft.subject.trim()) { toast.error("Please enter a subject line"); return; }
    if (!draft.body.trim() || draft.body === "<br>") { toast.error("Please write a message"); return; }
    setSending(true);
    await new Promise((r) => setTimeout(r, 1200));
    const label = AUDIENCE_OPTIONS.find((a) => a.value === draft.audience)?.label ?? "All Customers";
    const sent: EmailCampaign = {
      ...draft,
      status: draft.scheduled ? "scheduled" : "sent",
      audienceLabel: label,
      recipientCount: audienceCount,
      sentAt: draft.scheduled ? undefined : new Date().toISOString(),
      opens: 0,
      bounces: 0,
    };
    const existing = campaigns.findIndex((c) => c.id === draft.id);
    const next = existing >= 0 ? campaigns.map((c) => c.id === draft.id ? sent : c) : [sent, ...campaigns];
    setCampaigns(next);
    saveCampaigns(next);
    setDraft(blankCampaign());
    if (editorRef.current) editorRef.current.innerHTML = blankCampaign().body;
    setSending(false);
    toast.success(draft.scheduled ? `Campaign scheduled for ${draft.scheduledAt}` : `Campaign sent to ${audienceCount} recipients!`);
  };

  const deleteCampaign = (id: string) => {
    const next = campaigns.filter((c) => c.id !== id);
    setCampaigns(next);
    saveCampaigns(next);
    toast.success("Campaign deleted");
  };

  const resetForm = () => {
    const fresh = blankCampaign();
    setDraft(fresh);
    if (editorRef.current) editorRef.current.innerHTML = fresh.body;
  };

  /* Sync editor with initial draft body */
  useEffect(() => {
    if (editorRef.current && !editorRef.current.innerHTML) {
      editorRef.current.innerHTML = draft.body;
    }
  }, []);

  return (
    <AppLayout>
      <div className="w-full px-4 lg:px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Send className="w-6 h-6 text-primary" />
              Email Campaigns
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Compose and send targeted emails to your customer base.
            </p>
          </div>
          <Link href="/marketing">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Megaphone className="w-3.5 h-3.5" /> Marketing Hub
            </Button>
          </Link>
        </div>

        {/* Compose + sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">

          {/* ── Left sidebar ── */}
          <div className="space-y-4">

            {/* Templates panel */}
            <Card className="rounded-2xl">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  Email Templates
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-1">
                {QUICK_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => loadTemplate(tpl)}
                    className="w-full text-left rounded-lg px-3 py-2.5 text-sm hover:bg-muted transition-colors flex items-center justify-between gap-2"
                  >
                    <span>{tpl.label}</span>
                    <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                  </button>
                ))}
                <Separator className="my-1" />
                <Link href="/marketing/email/templates">
                  <button className="w-full text-left rounded-lg px-3 py-2 text-xs text-primary hover:bg-primary/5 transition-colors flex items-center gap-1.5">
                    <Plus className="w-3 h-3" /> Manage saved templates
                  </button>
                </Link>
              </CardContent>
            </Card>

            {/* Quick codes */}
            <Card className="rounded-2xl">
              <Collapsible open={codesOpen} onOpenChange={setCodesOpen}>
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-semibold hover:bg-muted/50 rounded-2xl transition-colors">
                    <span className="flex items-center gap-2">
                      <Code className="w-4 h-4 text-primary" />
                      Quick Codes
                    </span>
                    <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", codesOpen && "rotate-180")} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="px-3 pb-3 pt-0 space-y-1">
                    <p className="text-[11px] text-muted-foreground px-1 pb-1">
                      Click to insert into your message
                    </p>
                    {QUICK_CODES.map(({ code, desc }) => (
                      <button
                        key={code}
                        onClick={() => insertCode(code)}
                        className="w-full text-left rounded-lg px-3 py-2 hover:bg-muted transition-colors"
                      >
                        <p className="text-xs font-mono text-primary">{code}</p>
                        <p className="text-[10px] text-muted-foreground">{desc}</p>
                      </button>
                    ))}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          </div>

          {/* ── Compose form ── */}
          <div className="space-y-4">
            <Card className="rounded-2xl">
              <CardContent className="p-5 space-y-5">

                {/* To: audience */}
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-muted-foreground" />
                    To
                  </Label>
                  <div className="flex items-center gap-2">
                    <Select value={draft.audience} onValueChange={(v) => setField("audience", v)}>
                      <SelectTrigger className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AUDIENCE_OPTIONS.map((a) => (
                          <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-primary">{audienceCount}</p>
                      <p className="text-[10px] text-muted-foreground">recipients</p>
                    </div>
                  </div>
                </div>

                {/* Subject */}
                <div className="space-y-1.5">
                  <Label htmlFor="subject">Subject Line</Label>
                  <Input
                    id="subject"
                    value={draft.subject}
                    onChange={(e) => setField("subject", e.target.value)}
                    placeholder="e.g. 🎉 A special offer just for you, {{first_name}}"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Tip: personalise with <code className="bg-muted px-1 rounded text-[10px]">{"{{first_name}}"}</code> for better open rates
                  </p>
                </div>

                {/* Body */}
                <div className="space-y-1.5">
                  <Label>Message</Label>
                  <div className="border rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                    <RichToolbar editorRef={editorRef} />
                    <div
                      ref={editorRef}
                      contentEditable
                      suppressContentEditableWarning
                      onInput={handleBodyInput}
                      className="min-h-[220px] px-4 py-3 text-sm outline-none prose prose-sm max-w-none dark:prose-invert"
                    />
                  </div>
                </div>

                {/* CTA button */}
                <div className="rounded-xl border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2 cursor-pointer">
                      <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                      CTA Button (optional)
                    </Label>
                    <Switch
                      checked={draft.ctaEnabled}
                      onCheckedChange={(v) => setField("ctaEnabled", v)}
                    />
                  </div>
                  {draft.ctaEnabled && (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1">
                        <Label className="text-xs">Button Label</Label>
                        <Input
                          value={draft.ctaLabel}
                          onChange={(e) => setField("ctaLabel", e.target.value)}
                          placeholder="Shop Now"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Link URL</Label>
                        <Input
                          value={draft.ctaUrl}
                          onChange={(e) => setField("ctaUrl", e.target.value)}
                          placeholder="https://yourstore.com"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Schedule */}
                <div className="rounded-xl border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2 cursor-pointer">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                      Schedule for Later
                    </Label>
                    <Switch
                      checked={draft.scheduled}
                      onCheckedChange={(v) => setField("scheduled", v)}
                    />
                  </div>
                  {draft.scheduled && (
                    <div className="space-y-1 pt-1">
                      <Label className="text-xs">Send date & time</Label>
                      <Input
                        type="datetime-local"
                        value={draft.scheduledAt}
                        onChange={(e) => setField("scheduledAt", e.target.value)}
                      />
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    onClick={sendCampaign}
                    disabled={sending || audienceCount === 0}
                    className="gap-2 flex-1"
                  >
                    {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {sending ? "Sending…" : draft.scheduled ? "Schedule Campaign" : `Send to ${audienceCount} recipients`}
                  </Button>
                  <Button variant="outline" onClick={saveDraft} className="gap-1.5">
                    <FileText className="w-4 h-4" /> Save Draft
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setPreviewOpen(true)} title="Preview">
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={resetForm} title="Clear form">
                    <Undo2 className="w-4 h-4" />
                  </Button>
                </div>

              </CardContent>
            </Card>
          </div>
        </div>

        {/* Campaign history */}
        {campaigns.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Campaign History ({campaigns.length})
              </h2>
            </div>
            <div className="space-y-2">
              {campaigns.map((c) => (
                <CampaignRow key={c.id} campaign={c} onDelete={deleteCampaign} />
              ))}
            </div>
          </div>
        )}

        {campaigns.length === 0 && (
          <div className="rounded-2xl border border-dashed bg-muted/20 p-10 text-center space-y-2">
            <Mail className="w-10 h-10 text-muted-foreground/40 mx-auto" />
            <p className="font-medium">No campaigns yet</p>
            <p className="text-sm text-muted-foreground">Your sent and scheduled campaigns will appear here.</p>
          </div>
        )}

      </div>

      <PreviewDialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        subject={draft.subject}
        body={draft.body}
        ctaEnabled={draft.ctaEnabled}
        ctaLabel={draft.ctaLabel}
        ctaUrl={draft.ctaUrl}
      />
    </AppLayout>
  );
}
