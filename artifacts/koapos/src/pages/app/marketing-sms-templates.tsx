import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FileText, Plus, Search, Trash2, Pencil, Copy, Star, Send, MessageSquare, Megaphone,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import {
  useListSmsTemplates,
  useCreateSmsTemplate,
  useUpdateSmsTemplate,
  useDeleteSmsTemplate,
} from "@workspace/api-client-react";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface SmsTemplate {
  id: string;
  name: string;
  category: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

type ApiTemplate = Record<string, unknown>;

function apiToLocal(t: ApiTemplate): SmsTemplate {
  return {
    id: String(t.id ?? ""),
    name: String(t.name ?? ""),
    category: String(t.category ?? "Other"),
    body: String(t.body ?? ""),
    createdAt: String(t.createdAt ?? new Date().toISOString()),
    updatedAt: String(t.updatedAt ?? new Date().toISOString()),
  };
}

/* ── Constants ─────────────────────────────────────────────────────────── */

const SMS_CHAR_LIMIT = 160;
const CATEGORIES = ["All", "Promotional", "Transactional", "Welcome", "Loyalty", "Announcement", "Reminder", "Other"];

const STARTER_TEMPLATES: Omit<SmsTemplate, "id" | "createdAt" | "updatedAt">[] = [
  { name: "Welcome New Customer",  category: "Welcome",       body: "Hi {{first_name}}, welcome to {{business_name}}! We're glad you've chosen us. See you soon." },
  { name: "Promotional Offer",     category: "Promotional",   body: "Hi {{first_name}}, {{business_name}} has an exclusive offer just for you! Visit us today." },
  { name: "Thank You",             category: "Transactional", body: "Hi {{first_name}}, thank you for visiting {{business_name}}! We hope to see you again soon." },
  { name: "Loyalty Points Update", category: "Loyalty",       body: "Hi {{first_name}}, you have loyalty points with {{business_name}}. Redeem them on your next visit!" },
  { name: "Win-Back Campaign",     category: "Promotional",   body: "Hi {{first_name}}, we miss you at {{business_name}}! Come back and see what's new." },
  { name: "Appointment Reminder",  category: "Reminder",      body: "Hi {{first_name}}, reminder of your upcoming appointment at {{business_name}}. See you soon!" },
];

/* ── Editor dialog ─────────────────────────────────────────────────────── */

function TemplateEditorDialog({
  open, initial, onSave, onClose,
}: {
  open: boolean;
  initial: Partial<SmsTemplate> | null;
  onSave: (t: Omit<SmsTemplate, "id" | "createdAt" | "updatedAt">, id?: string) => void;
  onClose: () => void;
}) {
  const [name, setName]         = useState("");
  const [category, setCategory] = useState("Other");
  const [body, setBody]         = useState("");

  const charCount = body.length;
  const segments = charCount === 0 ? 0 : charCount <= SMS_CHAR_LIMIT ? 1 : Math.ceil(charCount / 153);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setCategory(initial?.category ?? "Other");
    setBody(initial?.body ?? "");
  }, [open, initial]);

  const handleSave = () => {
    if (!name.trim()) { toast.error("Template name is required"); return; }
    onSave({ name: name.trim(), category, body }, initial?.id);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            {initial?.id ? "Edit SMS Template" : "New SMS Template"}
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
            <div className="flex items-center justify-between">
              <Label>Message</Label>
              <span className={cn("text-[11px] tabular-nums", charCount > SMS_CHAR_LIMIT ? "text-amber-500" : "text-muted-foreground")}>
                {charCount} chars · {segments} SMS
              </span>
            </div>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hi {{first_name}}, write your SMS template here…"
              className="min-h-[120px] resize-none font-mono text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Use <code className="bg-muted px-1 rounded">{"{{first_name}}"}</code>, <code className="bg-muted px-1 rounded">{"{{business_name}}"}</code> as placeholders.
            </p>
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
  template: SmsTemplate;
  onEdit: (t: SmsTemplate) => void;
  onDuplicate: (t: SmsTemplate) => void;
  onDelete: (id: string) => void;
  onUse: (t: SmsTemplate) => void;
}) {
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
        <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed font-mono bg-muted/50 rounded-lg p-2">
          {template.body || "(empty)"}
        </p>
        <div className="flex items-center justify-between pt-1">
          <p className="text-[10px] text-muted-foreground">
            {template.body.length} chars · Updated {new Date(template.updatedAt).toLocaleDateString("en-AU")}
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

export default function MarketingSmsTemplatesPage() {
  const { data: rawTemplates, isLoading, refetch } = useListSmsTemplates({ query: { queryKey: ["sms-templates"] } });
  const createTemplate = useCreateSmsTemplate();
  const updateTemplate = useUpdateSmsTemplate();
  const deleteTemplate = useDeleteSmsTemplate();

  const templates: SmsTemplate[] = ((rawTemplates?.items ?? []) as unknown as ApiTemplate[]).map(apiToLocal);

  const [search, setSearch]       = useState("");
  const [category, setCategory]   = useState("All");
  const [editTarget, setEditTarget] = useState<Partial<SmsTemplate> | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const filtered = templates.filter((t) => {
    const matchCat = category === "All" || t.category === category;
    const q = search.toLowerCase();
    const matchSearch = !q || t.name.toLowerCase().includes(q) || t.body.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const handleSave = (data: Omit<SmsTemplate, "id" | "createdAt" | "updatedAt">, id?: string) => {
    if (id) {
      updateTemplate.mutate({ id: Number(id), data: { ...data, templateId: id } }, {
        onSuccess: () => { refetch(); setEditorOpen(false); toast.success("Template updated"); },
        onError: () => toast.error("Failed to update template"),
      });
    } else {
      createTemplate.mutate({ data: { ...data, templateId: `smstmpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` } }, {
        onSuccess: () => { refetch(); setEditorOpen(false); toast.success("Template saved"); },
        onError: () => toast.error("Failed to save template"),
      });
    }
  };

  const handleDuplicate = (t: SmsTemplate) => {
    createTemplate.mutate({
      data: { templateId: `smstmpl-${Date.now()}-dup`, name: `${t.name} (copy)`, category: t.category, body: t.body },
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

  const handleUse = (t: SmsTemplate) => {
    sessionStorage.setItem("koapos_sms_campaign_template", JSON.stringify(t));
    window.location.href = "/marketing/sms/campaigns";
  };

  const addStarterTemplates = () => {
    const existingNames = new Set(templates.map((t) => t.name));
    const toAdd = STARTER_TEMPLATES.filter((t) => !existingNames.has(t.name));
    if (toAdd.length === 0) { toast("All starter templates already added"); return; }
    Promise.all(
      toAdd.map((t, i) => createTemplate.mutateAsync({ data: { ...t, templateId: `smstmpl-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}` } }).catch(() => null))
    ).then((results) => {
      const added = results.filter(Boolean).length;
      refetch();
      toast.success(`Added ${added} starter template${added !== 1 ? "s" : ""}`);
    });
  };

  const openNew = () => { setEditTarget({}); setEditorOpen(true); };
  const openEdit = (t: SmsTemplate) => { setEditTarget(t); setEditorOpen(true); };

  if (isLoading) return <AppLayout><div className="p-8 text-muted-foreground">Loading…</div></AppLayout>;

  return (
    <AppLayout>
      <div className="w-full px-4 lg:px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="w-6 h-6 text-primary" />
              SMS Templates
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Create and manage reusable SMS message templates.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/marketing/overview">
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
              <MessageSquare className="w-6 h-6 text-muted-foreground/50" />
            </div>
            <p className="font-semibold">
              {search || category !== "All" ? "No templates match your search" : "No SMS templates yet"}
            </p>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              {search || category !== "All"
                ? "Try a different search or category filter."
                : "Create your first template or load the starter pack to get started."}
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
