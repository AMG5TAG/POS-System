import { useState, useRef, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FileText, Plus, Search, Trash2, Pencil, Copy, Bold, Italic, List,
  Link2, Undo2, Redo2, AlignLeft, AlignCenter, Eye, EyeOff,
  Building2, Star, Send, Mail, Megaphone,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import {
  useListEmailTemplates,
  useCreateEmailTemplate,
  useUpdateEmailTemplate,
  useDeleteEmailTemplate,
} from "@workspace/api-client-react";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface EmailTemplate {
  id: string;
  name: string;
  category: string;
  subject: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

type ApiTemplate = Record<string, unknown>;

function apiToLocal(t: ApiTemplate): EmailTemplate {
  return {
    id: String(t.id ?? ""),
    name: String(t.name ?? ""),
    category: String(t.category ?? "Other"),
    subject: String(t.subject ?? ""),
    body: String(t.body ?? ""),
    createdAt: String(t.createdAt ?? new Date().toISOString()),
    updatedAt: String(t.updatedAt ?? new Date().toISOString()),
  };
}

/* ── Constants ─────────────────────────────────────────────────────────── */

const CATEGORIES = ["All", "Promotional", "Transactional", "Welcome", "Loyalty", "Announcement", "Newsletter", "Other"];

const STARTER_TEMPLATES: Omit<EmailTemplate, "id" | "createdAt" | "updatedAt">[] = [
  {
    name: "Welcome New Customer", category: "Welcome",
    subject: "Welcome to {{business_name}}! 🎉",
    body: `<p>Hi <strong>{{first_name}}</strong>,</p><p><br></p><p>Welcome to <strong>{{business_name}}</strong>! We are so glad you've joined us.</p><p><br></p><p>Here's what you can look forward to:</p><ul><li>Friendly service every visit</li><li>Exclusive member offers</li><li>Loyalty rewards on every purchase</li></ul><p><br></p><p>We can't wait to see you again soon.</p><p><br></p><p>Warm regards,<br><strong>The {{business_name}} Team</strong></p>`,
  },
  {
    name: "Promotional Offer", category: "Promotional",
    subject: "🔥 Exclusive deal just for you, {{first_name}}",
    body: `<p>Hi <strong>{{first_name}}</strong>,</p><p><br></p><p>We have a <strong>special exclusive offer</strong> just for you — our valued customer!</p><p><br></p><p>For a limited time only. Don't miss out. Click the button below to claim your offer.</p><p><br></p><p>We appreciate your loyalty and look forward to seeing you soon.</p><p><br></p><p>Cheers,<br><strong>{{business_name}}</strong></p>`,
  },
  {
    name: "Thank You", category: "Transactional",
    subject: "Thank you for shopping with us!",
    body: `<p>Hi <strong>{{first_name}}</strong>,</p><p><br></p><p>Thank you so much for your recent purchase at <strong>{{business_name}}</strong>.</p><p><br></p><p>Your support truly means the world to us. We hope you love what you got!</p><p><br></p><p>If you have any questions about your purchase, please don't hesitate to get in touch.</p><p><br></p><p>See you next time!<br><strong>{{business_name}}</strong></p>`,
  },
  {
    name: "Loyalty Points Update", category: "Loyalty",
    subject: "Your loyalty balance: {{loyalty_points}} points 🌟",
    body: `<p>Hi <strong>{{first_name}}</strong>,</p><p><br></p><p>Just a quick update — you currently have <strong>{{loyalty_points}} loyalty points</strong> with us.</p><p><br></p><p>Your points never expire, and they can be redeemed on your next visit for great savings.</p><p><br></p><p>Thank you for your continued support!</p><p><br></p><p>With appreciation,<br><strong>{{business_name}}</strong></p>`,
  },
  {
    name: "Win-Back Campaign", category: "Promotional",
    subject: "We miss you, {{first_name}}! Come back soon 💛",
    body: `<p>Hi <strong>{{first_name}}</strong>,</p><p><br></p><p>It's been a while since we've seen you, and we just wanted to say — <strong>we miss you!</strong></p><p><br></p><p>We've had some exciting new arrivals and updates since your last visit. Come back and see what's new — we'd love to see you again.</p><p><br></p><p>Until then,<br><strong>{{business_name}}</strong></p>`,
  },
  {
    name: "Monthly Newsletter", category: "Newsletter",
    subject: "{{business_name}} — What's new this month",
    body: `<p>Hi <strong>{{first_name}}</strong>,</p><p><br></p><p>Here's what's been happening at <strong>{{business_name}}</strong> this month:</p><p><br></p><p><strong>📦 New Arrivals</strong></p><p>We've added some great new products to our range — come in and check them out.</p><p><br></p><p><strong>🎉 Upcoming Events</strong></p><p>Stay tuned for exciting events and promotions coming your way soon.</p><p><br></p><p>Thanks for being part of our community!</p><p><br></p><p>Warm regards,<br><strong>The {{business_name}} Team</strong></p>`,
  },
];

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
        { cmd: "bold",          icon: Bold,        title: "Bold (Ctrl+B)" },
        { cmd: "italic",        icon: Italic,      title: "Italic (Ctrl+I)" },
        { cmd: "insertUnorderedList", icon: List,  title: "Bullet list" },
        { cmd: "justifyLeft",   icon: AlignLeft,   title: "Align left" },
        { cmd: "justifyCenter", icon: AlignCenter, title: "Align center" },
      ].map(({ cmd, icon: Icon, title }) => (
        <button key={cmd} type="button" title={title}
          onMouseDown={(e) => { e.preventDefault(); exec(cmd); }}
          className="p-1.5 rounded hover:bg-muted transition-colors">
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
      <div className="w-px h-4 bg-border mx-1" />
      <button type="button" title="Insert link"
        onMouseDown={(e) => { e.preventDefault(); insertLink(); }}
        className="p-1.5 rounded hover:bg-muted transition-colors">
        <Link2 className="w-3.5 h-3.5" />
      </button>
      <button type="button" title="Undo"
        onMouseDown={(e) => { e.preventDefault(); exec("undo"); }}
        className="p-1.5 rounded hover:bg-muted transition-colors">
        <Undo2 className="w-3.5 h-3.5" />
      </button>
      <button type="button" title="Redo"
        onMouseDown={(e) => { e.preventDefault(); exec("redo"); }}
        className="p-1.5 rounded hover:bg-muted transition-colors">
        <Redo2 className="w-3.5 h-3.5" />
      </button>
      <div className="w-px h-4 bg-border mx-1" />
      <span className="text-[10px] text-muted-foreground px-1">Codes:</span>
      {["{{first_name}}", "{{business_name}}", "{{loyalty_points}}"].map((code) => (
        <button key={code} type="button" title={`Insert ${code}`}
          onMouseDown={(e) => { e.preventDefault(); exec("insertText", code); }}
          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted hover:bg-primary/10 hover:text-primary transition-colors">
          {code}
        </button>
      ))}
    </div>
  );
}

/* ── Editor dialog ─────────────────────────────────────────────────────── */

function TemplateEditorDialog({
  open, initial, onSave, onClose,
}: {
  open: boolean;
  initial: Partial<EmailTemplate> | null;
  onSave: (t: Omit<EmailTemplate, "id" | "createdAt" | "updatedAt">, id?: string) => void;
  onClose: () => void;
}) {
  const [name, setName]         = useState("");
  const [category, setCategory] = useState("Other");
  const [subject, setSubject]   = useState("");
  const [body, setBody]         = useState("");
  const [preview, setPreview]   = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setCategory(initial?.category ?? "Other");
    setSubject(initial?.subject ?? "");
    const initialBody = initial?.body ?? "<p>Hi <strong>{{first_name}}</strong>,</p><p><br></p><p>Write your message here…</p><p><br></p><p>Regards,<br><strong>{{business_name}}</strong></p>";
    setBody(initialBody);
    setPreview(false);
    setTimeout(() => {
      if (editorRef.current) editorRef.current.innerHTML = initialBody;
    }, 0);
  }, [open, initial]);

  const handleInput = () => {
    if (editorRef.current) setBody(editorRef.current.innerHTML);
  };

  const previewBody = body
    .replace(/\{\{first_name\}\}/g, "Sarah")
    .replace(/\{\{last_name\}\}/g, "Johnson")
    .replace(/\{\{business_name\}\}/g, "Your Business")
    .replace(/\{\{loyalty_points\}\}/g, "240")
    .replace(/\{\{unsubscribe_link\}\}/g, "#");

  const handleSave = () => {
    if (!name.trim()) { toast.error("Template name is required"); return; }
    onSave({ name: name.trim(), category, subject, body }, initial?.id);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            {initial?.id ? "Edit Template" : "New Email Template"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Template Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Monthly Promo" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.filter((c) => c !== "All").map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Subject Line</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. 🎉 A special message from {{business_name}}" />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Body</Label>
              <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-xs h-7"
                onClick={() => setPreview((p) => !p)}>
                {preview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {preview ? "Edit" : "Preview"}
              </Button>
            </div>

            {preview ? (
              <div className="border rounded-xl overflow-hidden">
                <div className="bg-muted/50 border-b px-4 py-2.5">
                  <p className="text-xs text-muted-foreground">Subject</p>
                  <p className="font-semibold text-sm">{subject || "(no subject)"}</p>
                </div>
                <div className="bg-white dark:bg-background px-6 py-6 max-h-[350px] overflow-y-auto">
                  <div className="text-sm prose prose-sm max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: previewBody }} />
                </div>
                <div className="bg-muted/30 border-t px-6 py-2 text-center">
                  <p className="text-[10px] text-muted-foreground">© Your Business · <span className="underline">Unsubscribe</span></p>
                </div>
              </div>
            ) : (
              <div className="border rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                <RichToolbar editorRef={editorRef} />
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={handleInput}
                  className="min-h-[260px] px-4 py-3 text-sm outline-none prose prose-sm max-w-none dark:prose-invert"
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} className="gap-2">
            <FileText className="w-4 h-4" /> Save Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Template card ─────────────────────────────────────────────────────── */

function TemplateCard({
  template, onEdit, onDuplicate, onDelete, onUse,
}: {
  template: EmailTemplate;
  onEdit: (t: EmailTemplate) => void;
  onDuplicate: (t: EmailTemplate) => void;
  onDelete: (id: string) => void;
  onUse: (t: EmailTemplate) => void;
}) {
  const preview = template.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return (
    <Card className="rounded-2xl hover:border-primary/30 hover:shadow-md transition-all group">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{template.name}</p>
            <Badge variant="secondary" className="text-[10px] mt-1">{template.category}</Badge>
          </div>
          <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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
        {template.subject && (
          <p className="text-xs font-medium text-primary truncate">✉ {template.subject}</p>
        )}
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{preview || "(empty body)"}</p>
        <div className="flex items-center justify-between pt-1">
          <p className="text-[10px] text-muted-foreground">
            Updated {new Date(template.updatedAt).toLocaleDateString("en-AU")}
          </p>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => onUse(template)}>
            <Send className="w-3 h-3" /> Use
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default function MarketingEmailTemplatesPage() {
  const { data: rawTemplates = [], isLoading, refetch } = useListEmailTemplates({ query: { queryKey: ["email-templates"] } });
  const createTemplate = useCreateEmailTemplate();
  const updateTemplate = useUpdateEmailTemplate();
  const deleteTemplate = useDeleteEmailTemplate();

  const templates: EmailTemplate[] = (rawTemplates as ApiTemplate[]).map(apiToLocal);

  const [search, setSearch]       = useState("");
  const [category, setCategory]   = useState("All");
  const [editTarget, setEditTarget] = useState<Partial<EmailTemplate> | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const filtered = templates.filter((t) => {
    const matchCat = category === "All" || t.category === category;
    const q = search.toLowerCase();
    const matchSearch = !q || t.name.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const handleSave = (data: Omit<EmailTemplate, "id" | "createdAt" | "updatedAt">, id?: string) => {
    if (id) {
      updateTemplate.mutate({ id: Number(id), data: { ...data, templateId: id } }, {
        onSuccess: () => { refetch(); setEditorOpen(false); toast.success("Template updated"); },
        onError: () => toast.error("Failed to update template"),
      });
    } else {
      createTemplate.mutate({ data: { ...data, templateId: `tmpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` } }, {
        onSuccess: () => { refetch(); setEditorOpen(false); toast.success("Template saved"); },
        onError: () => toast.error("Failed to save template"),
      });
    }
  };

  const handleDuplicate = (t: EmailTemplate) => {
    createTemplate.mutate({
      data: { templateId: `tmpl-${Date.now()}-dup`, name: `${t.name} (copy)`, category: t.category, subject: t.subject, body: t.body },
    }, {
      onSuccess: () => { refetch(); toast.success("Template duplicated"); },
      onError: () => toast.error("Failed to duplicate template"),
    });
  };

  const handleDelete = (id: string) => {
    deleteTemplate.mutate({ id: Number(id) }, {
      onSuccess: () => { refetch(); toast.success("Template deleted"); },
      onError: () => toast.error("Failed to delete template"),
    });
  };

  const handleUse = (t: EmailTemplate) => {
    sessionStorage.setItem("koapos_email_campaign_template", JSON.stringify(t));
    window.location.href = "/marketing/email/campaigns";
  };

  const addStarterTemplates = () => {
    const existingNames = new Set(templates.map((t) => t.name));
    const toAdd = STARTER_TEMPLATES.filter((t) => !existingNames.has(t.name));
    if (toAdd.length === 0) { toast("All starter templates already added"); return; }
    Promise.all(
      toAdd.map((t, i) => createTemplate.mutateAsync({ data: { ...t, templateId: `tmpl-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}` } }).catch(() => null))
    ).then((results) => {
      const added = results.filter(Boolean).length;
      refetch();
      toast.success(`Added ${added} starter template${added !== 1 ? "s" : ""}`);
    });
  };

  const openNew = () => { setEditTarget({}); setEditorOpen(true); };
  const openEdit = (t: EmailTemplate) => { setEditTarget(t); setEditorOpen(true); };

  if (isLoading) return <AppLayout><div className="p-8 text-muted-foreground">Loading…</div></AppLayout>;

  return (
    <AppLayout>
      <div className="w-full px-4 lg:px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="w-6 h-6 text-primary" />
              Email Templates
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Create and manage reusable email templates with a rich text editor.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/marketing">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Megaphone className="w-3.5 h-3.5" /> Overview
              </Button>
            </Link>
            <Button variant="outline" onClick={addStarterTemplates} className="gap-1.5" disabled={createTemplate.isPending}>
              <Star className="w-4 h-4" /> Add Starter Templates
            </Button>
            <Button onClick={openNew} className="gap-1.5">
              <Plus className="w-4 h-4" /> New Template
            </Button>
          </div>
        </div>

        {/* Search + category filter */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates…" className="pl-9" />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {CATEGORIES.map((cat) => (
              <button key={cat} onClick={() => setCategory(cat)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                  category === cat
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-muted text-muted-foreground",
                )}>
                {cat}
                {cat !== "All" && (
                  <span className="ml-1 opacity-70">({templates.filter((t) => t.category === cat).length})</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onEdit={openEdit}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
                onUse={handleUse}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed bg-muted/20 p-12 text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Mail className="w-6 h-6 text-muted-foreground/50" />
            </div>
            <p className="font-semibold">
              {search || category !== "All" ? "No templates match your search" : "No templates yet"}
            </p>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              {search || category !== "All"
                ? "Try a different search or category filter."
                : "Create your first template or load the starter pack to hit the ground running."}
            </p>
            {!search && category === "All" && (
              <div className="flex gap-2 justify-center pt-1">
                <Button onClick={addStarterTemplates} variant="outline" className="gap-1.5" disabled={createTemplate.isPending}>
                  <Star className="w-4 h-4" /> Add Starter Templates
                </Button>
                <Button onClick={openNew} className="gap-1.5">
                  <Plus className="w-4 h-4" /> New Template
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <TemplateEditorDialog
        open={editorOpen}
        initial={editTarget}
        onSave={handleSave}
        onClose={() => setEditorOpen(false)}
      />
    </AppLayout>
  );
}
