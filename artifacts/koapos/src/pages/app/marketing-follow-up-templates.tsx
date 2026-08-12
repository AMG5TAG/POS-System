import { useState, useEffect, useRef, useMemo } from "react";
import { Link } from "wouter";
import DOMPurify from "dompurify";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FileText, Plus, Search, Trash2, Pencil, Copy, Star, Clock, Mail, MessageSquare, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useListFollowUpTemplates,
  useCreateFollowUpTemplate,
  useUpdateFollowUpTemplate,
  useDeleteFollowUpTemplate,
  useListFollowUpShortcodes,
} from "@workspace/api-client-react";
import {
  ShortcodePalette, FALLBACK_SHORTCODES, insertShortcode,
  type FollowUpShortcode,
} from "@/components/marketing/follow-up-shortcodes";

/* ── Types ─────────────────────────────────────────────────────────────── */

type Channel = "email" | "sms" | "both";

interface Template {
  id: number;
  name: string;
  channel: Channel;
  subject: string;
  body: string;
  smsBody: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

type TemplateDraft = Omit<Template, "id" | "createdAt" | "updatedAt">;

const SMS_CHAR_LIMIT = 160;

const STARTER_TEMPLATES: TemplateDraft[] = [
  {
    name: "Service check-in",
    channel: "both",
    subject: "How's your {{device}} going, {{first_name}}?",
    body: "<p>Hi <strong>{{first_name}}</strong>,</p><p>It's been {{days_since}} days since we completed {{service_title}} (job {{job_number}}) on your {{device}}. We just wanted to check everything is still running the way it should.</p><p>If anything doesn't feel right, reply to this email or call us on {{business_phone}} and we'll take a look.</p><p>Thanks again for choosing {{business_name}}.</p>",
    smsBody: "Hi {{first_name}}, it's {{business_name}}. How has your {{device}} been since we repaired it? Reply here or call {{business_phone}} if anything needs a look.",
    isDefault: true,
  },
  {
    name: "Ask for a review",
    channel: "email",
    subject: "Would you mind leaving {{business_name}} a review?",
    body: "<p>Hi <strong>{{first_name}}</strong>,</p><p>Thanks for trusting us with {{service_title}} on {{completed_date}}. If you were happy with how it went, a short review makes a big difference to a local business like ours.</p><p><a href=\"{{review_link}}\">Leave a review</a></p><p>Thank you,<br/>{{staff_name}} at {{business_name}}</p>",
    smsBody: "",
    isDefault: false,
  },
  {
    name: "Time for your next service",
    channel: "both",
    subject: "{{first_name}}, it's been {{days_since}} days — time for a check-up?",
    body: "<p>Hi <strong>{{first_name}}</strong>,</p><p>Our records show it's been {{days_since}} days since your last visit for {{service_title}}. Most customers book their next service around now.</p><p>Give us a call on {{business_phone}} or reply to this email and we'll find a time that suits.</p><p>— {{business_name}}</p>",
    smsBody: "Hi {{first_name}}, it's been {{days_since}} days since your last service at {{business_name}}. Due for a check-up? Call {{business_phone}} to book.",
    isDefault: false,
  },
  {
    name: "Missed appointment win-back",
    channel: "sms",
    subject: "We'd love to see you again at {{business_name}}",
    body: "<p>Hi <strong>{{first_name}}</strong>,</p><p>We haven't seen you since {{completed_date}}. If there's anything we can help with, we'd love to have you back at {{business_name}}.</p>",
    smsBody: "Hi {{first_name}}, we haven't seen you at {{business_name}} since {{completed_date}}. We'd love to have you back — call {{business_phone}} to book.",
    isDefault: false,
  },
];

const CHANNEL_META: Record<Channel, { label: string; icon: typeof Mail; className: string }> = {
  email: { label: "Email",     icon: Mail,          className: "border-blue-300 text-blue-700" },
  sms:   { label: "SMS",       icon: MessageSquare, className: "border-violet-300 text-violet-700" },
  both:  { label: "Email + SMS", icon: Sparkles,    className: "border-emerald-300 text-emerald-700" },
};

/** Fill shortcodes with their example values so the editor can show a preview. */
function renderSample(text: string, shortcodes: FollowUpShortcode[]): string {
  const examples = new Map(shortcodes.map((s) => [s.code, s.example]));
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, key: string) => examples.get(key) ?? whole);
}

/* ── Editor dialog ─────────────────────────────────────────────────────── */

function TemplateEditorDialog({
  open, initial, shortcodes, saving, onSave, onClose,
}: {
  open: boolean;
  initial: Partial<Template> | null;
  shortcodes: FollowUpShortcode[];
  saving: boolean;
  onSave: (draft: TemplateDraft, id?: number) => void;
  onClose: () => void;
}) {
  const [name, setName]         = useState("");
  const [channel, setChannel]   = useState<Channel>("email");
  const [subject, setSubject]   = useState("");
  const [body, setBody]         = useState("");
  const [smsBody, setSmsBody]   = useState("");
  const [isDefault, setIsDefault] = useState(false);

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef    = useRef<HTMLTextAreaElement>(null);
  const smsRef     = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState<"subject" | "body" | "sms">("body");

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setChannel((initial?.channel as Channel) ?? "email");
    setSubject(initial?.subject ?? "");
    setBody(initial?.body ?? "");
    setSmsBody(initial?.smsBody ?? "");
    setIsDefault(initial?.isDefault ?? false);
    setFocused("body");
  }, [open, initial]);

  const wantEmail = channel === "email" || channel === "both";
  const wantSms   = channel === "sms"   || channel === "both";

  const handleInsert = (code: string) => {
    if (focused === "subject") insertShortcode(subjectRef, subject, code, setSubject);
    else if (focused === "sms")  insertShortcode(smsRef, smsBody, code, setSmsBody);
    else insertShortcode(bodyRef, body, code, setBody);
  };

  const submit = () => {
    if (!name.trim()) { toast.error("Give the template a name"); return; }
    if (wantEmail && !subject.trim()) { toast.error("Email templates need a subject"); return; }
    if (wantEmail && !body.trim()) { toast.error("Email templates need a body"); return; }
    if (wantSms && !smsBody.trim() && !body.trim()) { toast.error("SMS templates need a message"); return; }
    onSave({ name: name.trim(), channel, subject, body, smsBody, isDefault }, initial?.id);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit follow-up template" : "New follow-up template"}</DialogTitle>
          <DialogDescription>
            Write once, then send it to any customer whose service or appointment is due a follow-up.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Editor */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-name">Template name</Label>
                <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Service check-in" />
              </div>
              <div className="space-y-1.5">
                <Label>Channel</Label>
                <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="both">Email + SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {wantEmail && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-subject">Email subject</Label>
                  <Input
                    id="tpl-subject" ref={subjectRef} value={subject}
                    onFocus={() => setFocused("subject")}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="How's your {{device}} going, {{first_name}}?"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-body">Email body (HTML supported)</Label>
                  <Textarea
                    id="tpl-body" ref={bodyRef} value={body} rows={10}
                    onFocus={() => setFocused("body")}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="<p>Hi {{first_name}},</p>"
                    className="font-mono text-xs"
                  />
                </div>
              </>
            )}

            {wantSms && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="tpl-sms">SMS message</Label>
                  <span className={cn("text-[11px]", smsBody.length > SMS_CHAR_LIMIT ? "text-amber-600" : "text-muted-foreground")}>
                    {smsBody.length}/{SMS_CHAR_LIMIT}
                  </span>
                </div>
                <Textarea
                  id="tpl-sms" ref={smsRef} value={smsBody} rows={4}
                  onFocus={() => setFocused("sms")}
                  onChange={(e) => setSmsBody(e.target.value)}
                  placeholder="Hi {{first_name}}, how has your {{device}} been?"
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  Leave blank to fall back to a plain-text version of the email body. An opt-out line is appended on send.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Click to insert into the {focused === "subject" ? "subject" : focused === "sms" ? "SMS" : "email body"}
              </Label>
              <ShortcodePalette shortcodes={shortcodes} onInsert={handleInsert} />
            </div>

            <div className="flex items-center justify-between gap-4 pt-1">
              <Label htmlFor="tpl-default" className="font-normal flex items-center gap-2">
                <Star className="w-4 h-4 text-muted-foreground" /> Pre-select this template when sending
              </Label>
              <Switch id="tpl-default" checked={isDefault} onCheckedChange={setIsDefault} />
            </div>
          </div>

          {/* Live preview with example values */}
          <div className="space-y-3 lg:sticky lg:top-2">
            <p className="text-sm font-semibold">Preview with example data</p>
            {wantEmail && (
              <Card>
                <CardContent className="p-4 space-y-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Email</p>
                  <p className="text-sm font-medium">{renderSample(subject, shortcodes) || "(no subject)"}</p>
                  <Separator />
                  <div
                    className="text-sm leading-relaxed [&_p]:mb-2"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderSample(body, shortcodes) || "<p class='text-muted-foreground'>(empty)</p>") }}
                  />
                </CardContent>
              </Card>
            )}
            {wantSms && (
              <Card>
                <CardContent className="p-4 space-y-2">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">SMS</p>
                  <p className="text-sm whitespace-pre-wrap rounded-lg bg-muted p-3">
                    {renderSample(smsBody, shortcodes) || "(empty — the email body will be used)"}
                    {"\n"}Reply STOP to unsubscribe.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save template"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Card ──────────────────────────────────────────────────────────────── */

function TemplateCard({
  template, onEdit, onDuplicate, onDelete,
}: {
  template: Template;
  onEdit: (t: Template) => void;
  onDuplicate: (t: Template) => void;
  onDelete: (id: number) => void;
}) {
  const meta = CHANNEL_META[template.channel] ?? CHANNEL_META.email;
  const Icon = meta.icon;
  const previewText = (template.channel === "sms" ? template.smsBody : template.body)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm truncate">{template.name}</h3>
              {template.isDefault && (
                <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 gap-1">
                  <Star className="w-2.5 h-2.5" /> Default
                </Badge>
              )}
            </div>
            <Badge variant="outline" className={cn("mt-1.5 text-[10px] gap-1", meta.className)}>
              <Icon className="w-2.5 h-2.5" /> {meta.label}
            </Badge>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={() => onEdit(template)} className="p-1.5 rounded hover:bg-muted transition-colors" title="Edit">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onDuplicate(template)} className="p-1.5 rounded hover:bg-muted transition-colors" title="Duplicate">
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onDelete(template.id)} className="p-1.5 rounded hover:bg-muted hover:text-red-500 transition-colors" title="Delete">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {template.channel !== "sms" && template.subject && (
          <p className="text-xs font-medium truncate">{template.subject}</p>
        )}
        <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed bg-muted/50 rounded-lg p-2">
          {previewText || "(empty)"}
        </p>
        <p className="text-[10px] text-muted-foreground">
          Updated {new Date(template.updatedAt).toLocaleDateString("en-AU")}
        </p>
      </CardContent>
    </Card>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function MarketingFollowUpTemplatesPage() {
  const { data, isLoading, refetch } = useListFollowUpTemplates({ query: { queryKey: ["follow-up-templates"] } });
  const { data: shortcodesData } = useListFollowUpShortcodes({ query: { queryKey: ["follow-up-shortcodes"] } });
  const createTemplate = useCreateFollowUpTemplate();
  const updateTemplate = useUpdateFollowUpTemplate();
  const deleteTemplate = useDeleteFollowUpTemplate();

  const templates = (data?.items ?? []) as unknown as Template[];
  const shortcodes = (shortcodesData?.items ?? FALLBACK_SHORTCODES) as FollowUpShortcode[];

  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<"all" | Channel>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Partial<Template> | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (channelFilter !== "all" && t.channel !== channelFilter) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q)
        || t.subject.toLowerCase().includes(q)
        || t.body.toLowerCase().includes(q)
        || t.smsBody.toLowerCase().includes(q);
    });
  }, [templates, search, channelFilter]);

  const handleSave = (draft: TemplateDraft, id?: number) => {
    if (id) {
      updateTemplate.mutate({ id, data: draft }, {
        onSuccess: () => { refetch(); setEditorOpen(false); toast.success("Template updated"); },
        onError: () => toast.error("Failed to update template"),
      });
    } else {
      createTemplate.mutate({ data: draft }, {
        onSuccess: () => { refetch(); setEditorOpen(false); toast.success("Template saved"); },
        onError: () => toast.error("Failed to save template"),
      });
    }
  };

  const handleDuplicate = (t: Template) => {
    createTemplate.mutate({
      data: { name: `${t.name} (copy)`, channel: t.channel, subject: t.subject, body: t.body, smsBody: t.smsBody, isDefault: false },
    }, {
      onSuccess: () => { refetch(); toast.success("Template duplicated"); },
      onError: () => toast.error("Failed to duplicate template"),
    });
  };

  const handleDelete = (id: number) => {
    deleteTemplate.mutate({ id }, {
      onSuccess: () => { refetch(); toast.success("Template deleted"); },
      onError: () => toast.error("Failed to delete template"),
    });
  };

  const addStarterTemplates = () => {
    const existing = new Set(templates.map((t) => t.name));
    const toAdd = STARTER_TEMPLATES.filter((t) => !existing.has(t.name))
      // Don't steal the default flag from a template the merchant already set.
      .map((t) => ({ ...t, isDefault: t.isDefault && templates.every((x) => !x.isDefault) }));
    if (toAdd.length === 0) { toast("All starter templates are already here"); return; }
    Promise.all(toAdd.map((t) => createTemplate.mutateAsync({ data: t }).catch(() => null)))
      .then((results) => {
        refetch();
        const added = results.filter(Boolean).length;
        toast.success(`Added ${added} starter template${added !== 1 ? "s" : ""}`);
      });
  };

  return (
    <AppLayout>
      <div className="w-full px-4 lg:px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="w-6 h-6 text-primary" />
              Follow Up Templates
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Reusable email and SMS messages with shortcodes that fill in each customer's details.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/marketing/follow-up">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Clock className="w-3.5 h-3.5" /> Follow Ups Due
              </Button>
            </Link>
            <Button variant="outline" onClick={addStarterTemplates} disabled={createTemplate.isPending} className="gap-1.5">
              <Star className="w-4 h-4" /> Add Starter Templates
            </Button>
            <Button onClick={() => { setEditTarget({}); setEditorOpen(true); }} className="gap-1.5">
              <Plus className="w-4 h-4" /> New Template
            </Button>
          </div>
        </div>

        {/* Shortcode reference */}
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-semibold">Available shortcodes</p>
            <p className="text-xs text-muted-foreground">
              Anything in double braces is replaced with the customer's own details when the message is sent.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-1.5 pt-1">
              {shortcodes.map((s) => (
                <div key={s.code} className="flex items-baseline gap-2 min-w-0">
                  <code className="font-mono text-[11px] bg-muted rounded px-1.5 py-0.5 shrink-0">{`{{${s.code}}}`}</code>
                  <span className="text-xs text-muted-foreground truncate">{s.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates…" className="pl-9" />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {(["all", "email", "sms", "both"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setChannelFilter(c)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                  channelFilter === c
                    ? "bg-primary text-primary-foreground border-primary"
                    : "pill-selector border-border hover:bg-muted text-muted-foreground",
                )}
              >
                {c === "all" ? "All" : CHANNEL_META[c].label}
                {c !== "all" && (
                  <span className="ml-1 opacity-70">({templates.filter((t) => t.channel === c).length})</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center space-y-2">
              <FileText className="w-8 h-8 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium">No templates yet</p>
              <p className="text-xs text-muted-foreground">
                Add the starter pack to get a service check-in, a review request and a win-back message in one click.
              </p>
              <Button variant="outline" size="sm" onClick={addStarterTemplates} className="gap-1.5 mt-2">
                <Star className="w-3.5 h-3.5" /> Add Starter Templates
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
            {filtered.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onEdit={(x) => { setEditTarget(x); setEditorOpen(true); }}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      <TemplateEditorDialog
        open={editorOpen}
        initial={editTarget}
        shortcodes={shortcodes}
        saving={createTemplate.isPending || updateTemplate.isPending}
        onSave={handleSave}
        onClose={() => setEditorOpen(false)}
      />
    </AppLayout>
  );
}
