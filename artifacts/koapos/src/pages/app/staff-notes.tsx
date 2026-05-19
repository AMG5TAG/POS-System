import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PageTabsNav } from "@/components/ui/page-tabs-nav";
import {
  Pin, Star, Trash2, Pencil, Plus, StickyNote,
  ShieldCheck, AlertCircle, Eye, UserSquare2, Clock,
  CalendarClock, ClipboardList, Coins, Target, Link2,
} from "lucide-react";

/* ─── Tabs ───────────────────────────────────────────────────────────────── */

const STAFF_TABS = [
  { href: "/staff",                label: "Employees", icon: UserSquare2  },
  { href: "/staff/timesheet",      label: "Timesheet", icon: Clock        },
  { href: "/staff/rostering",      label: "Rostering", icon: CalendarClock },
  { href: "/staff/leave-requests", label: "Leave",     icon: ClipboardList },
  { href: "/staff/cost-summary",   label: "Costs",     icon: Coins        },
  { href: "/staff/notes",          label: "Notes",     icon: StickyNote   },
  { href: "/staff/kpis",           label: "KPIs",      icon: Target       },
  { href: "/staff/links",          label: "Links",     icon: Link2        },
];

/* ─── Role simulation ────────────────────────────────────────────────────── */

type StaffRole = "owner" | "manager" | "cashier" | "staff";
const SIM_ROLE_KEY = "koapos_sim_role";
function getSimRole(): StaffRole {
  return (localStorage.getItem(SIM_ROLE_KEY) as StaffRole) ?? "manager";
}

const ROLE_LABELS: Record<StaffRole, string> = {
  owner:   "Owner",
  manager: "Manager",
  cashier: "Cashier",
  staff:   "Staff",
};

/* ─── Note types ─────────────────────────────────────────────────────────── */

type NoteVisibility = "all" | "management" | "owner";

interface StaffNote {
  id: string;
  title: string;
  content: string;
  isImportant: boolean;
  isPinned: boolean;
  visibleTo: NoteVisibility;
  createdBy: string;
  createdAt: string;
}

const NOTES_KEY = "koapos_staff_notes";

function loadNotes(): StaffNote[] {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveNotes(notes: StaffNote[]) {
  localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
}

/* ─── Permissions ────────────────────────────────────────────────────────── */

function canSeeNote(note: StaffNote, role: StaffRole): boolean {
  if (note.visibleTo === "all") return true;
  if (note.visibleTo === "management") return role === "owner" || role === "manager";
  if (note.visibleTo === "owner") return role === "owner";
  return true;
}

function canManageNotes(role: StaffRole) {
  return role === "owner" || role === "manager";
}

/* ─── Visibility badge colours ───────────────────────────────────────────── */

const VISIBILITY_META: Record<NoteVisibility, { label: string; cls: string }> = {
  all:        { label: "All Staff",  cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"  },
  management: { label: "Management", cls: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  owner:      { label: "Owner Only", cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"   },
};

/* ─── Note Card ──────────────────────────────────────────────────────────── */

function NoteCard({
  note, role, onEdit, onDelete, onTogglePin, onToggleImportant,
}: {
  note: StaffNote;
  role: StaffRole;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onToggleImportant: () => void;
}) {
  const vis = VISIBILITY_META[note.visibleTo];
  const canManage = canManageNotes(role);

  return (
    <div className={cn(
      "rounded-xl border bg-card p-4 flex flex-col gap-3 transition-all relative",
      note.isImportant && "border-amber-400 bg-amber-50/50 dark:bg-amber-950/20",
      note.isPinned && "ring-1 ring-primary/30",
    )}>
      {note.isPinned && (
        <div className="absolute top-3 right-3 text-primary">
          <Pin className="w-3.5 h-3.5 fill-primary" />
        </div>
      )}

      <div className="flex items-start gap-3 pr-5">
        <div className={cn(
          "p-2 rounded-lg shrink-0",
          note.isImportant ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30" : "bg-muted text-muted-foreground"
        )}>
          {note.isImportant ? <AlertCircle className="w-4 h-4" /> : <StickyNote className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm leading-tight">{note.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap line-clamp-4">{note.content}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {note.isImportant && (
          <Badge className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            <Star className="w-3 h-3 mr-1 fill-current" />Important
          </Badge>
        )}
        <Badge className={cn("text-xs", vis.cls)}>
          <Eye className="w-3 h-3 mr-1" />{vis.label}
        </Badge>
        <span className="text-xs text-muted-foreground ml-auto">
          {note.createdBy} · {new Date(note.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
        </span>
      </div>

      {canManage && (
        <div className="flex gap-1.5 pt-1 border-t border-border">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={onTogglePin}>
            <Pin className={cn("w-3.5 h-3.5 mr-1", note.isPinned && "fill-current text-primary")} />
            {note.isPinned ? "Unpin" : "Pin"}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={onToggleImportant}>
            <Star className={cn("w-3.5 h-3.5 mr-1", note.isImportant && "fill-amber-500 text-amber-500")} />
            {note.isImportant ? "Unmark" : "Important"}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={onEdit}>
            <Pencil className="w-3.5 h-3.5 mr-1" />Edit
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto" onClick={onDelete}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

/* ─── Dialog ─────────────────────────────────────────────────────────────── */

const BLANK: Omit<StaffNote, "id" | "createdAt" | "createdBy"> = {
  title: "", content: "", isImportant: false, isPinned: false, visibleTo: "all",
};

function NoteDialog({
  open, onOpenChange, initial, authorName, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: StaffNote | null;
  authorName: string;
  onSave: (n: Omit<StaffNote, "id" | "createdAt" | "createdBy">) => void;
}) {
  const [form, setForm] = useState<Omit<StaffNote, "id" | "createdAt" | "createdBy">>(
    initial ? { title: initial.title, content: initial.content, isImportant: initial.isImportant, isPinned: initial.isPinned, visibleTo: initial.visibleTo }
            : { ...BLANK }
  );

  const setField = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm((p) => ({ ...p, [k]: v }));

  const handleSave = () => {
    if (!form.title.trim()) { toast.error("Note title is required"); return; }
    if (!form.content.trim()) { toast.error("Note content is required"); return; }
    onSave(form);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Note" : "New Note"}</DialogTitle>
          <DialogDescription>Notes are visible to staff based on the visibility setting.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => setField("title", e.target.value)} placeholder="Note title…" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Content</Label>
            <Textarea value={form.content} onChange={(e) => setField("content", e.target.value)} placeholder="Note content…" className="h-32 resize-none" />
          </div>
          <div className="space-y-1.5">
            <Label>Visible to</Label>
            <Select value={form.visibleTo} onValueChange={(v) => setField("visibleTo", v as NoteVisibility)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Staff</SelectItem>
                <SelectItem value="management">Management (Manager + Owner)</SelectItem>
                <SelectItem value="owner">Owner Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Mark as Important</p>
              <p className="text-xs text-muted-foreground">Highlights the note for attention.</p>
            </div>
            <Switch checked={form.isImportant} onCheckedChange={(v) => setField("isImportant", v)} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Pin to Top</p>
              <p className="text-xs text-muted-foreground">Pinned notes always appear first.</p>
            </div>
            <Switch checked={form.isPinned} onCheckedChange={(v) => setField("isPinned", v)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>{initial ? "Save Changes" : "Create Note"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function StaffNotesPage() {
  const [notes, setNotes] = useState<StaffNote[]>(loadNotes);
  const [role, setRole] = useState<StaffRole>(getSimRole);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StaffNote | null>(null);
  const [filterImportant, setFilterImportant] = useState(false);

  const canManage = canManageNotes(role);

  const persist = (next: StaffNote[]) => { setNotes(next); saveNotes(next); };

  const handleSave = (data: Omit<StaffNote, "id" | "createdAt" | "createdBy">) => {
    if (editing) {
      persist(notes.map((n) => n.id === editing.id ? { ...editing, ...data } : n));
      toast.success("Note updated");
    } else {
      persist([...notes, {
        id: crypto.randomUUID(), ...data,
        createdBy: ROLE_LABELS[role], createdAt: new Date().toISOString(),
      }]);
      toast.success("Note created");
    }
    setEditing(null);
  };

  const handleDelete = (id: string) => {
    if (!canManage) { toast.error("Only managers and owners can delete notes"); return; }
    persist(notes.filter((n) => n.id !== id));
    toast.success("Note deleted");
  };

  const togglePin = (id: string) => persist(notes.map((n) => n.id === id ? { ...n, isPinned: !n.isPinned } : n));
  const toggleImportant = (id: string) => persist(notes.map((n) => n.id === id ? { ...n, isImportant: !n.isImportant } : n));

  const visible = useMemo(() => {
    let list = notes.filter((n) => canSeeNote(n, role));
    if (filterImportant) list = list.filter((n) => n.isImportant);
    return [
      ...list.filter((n) => n.isPinned).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      ...list.filter((n) => !n.isPinned).sort((a, b) => {
        if (a.isImportant !== b.isImportant) return a.isImportant ? -1 : 1;
        return b.createdAt.localeCompare(a.createdAt);
      }),
    ];
  }, [notes, role, filterImportant]);

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Staff</h1>
            <p className="text-sm text-muted-foreground mt-1">Team notes, announcements and reminders.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground border rounded-lg px-3 py-2">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Viewing as:</span>
              <Select value={role} onValueChange={(v) => { const r = v as StaffRole; setRole(r); localStorage.setItem(SIM_ROLE_KEY, r); }}>
                <SelectTrigger className="h-6 text-xs border-0 p-0 shadow-none w-24 focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="cashier">Cashier</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {canManage && (
              <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                <Plus className="h-4 w-4 mr-1" />New Note
              </Button>
            )}
          </div>
        </div>

        <PageTabsNav tabs={STAFF_TABS} />

        <div className="flex items-center gap-3">
          <Button
            variant={filterImportant ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterImportant((v) => !v)}
          >
            <Star className={cn("w-3.5 h-3.5 mr-1.5", filterImportant && "fill-current")} />
            Important only
          </Button>
          <span className="text-xs text-muted-foreground ml-auto">
            {visible.length} note{visible.length !== 1 ? "s" : ""} visible to you
          </span>
        </div>

        {visible.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed py-16 text-center text-muted-foreground">
            <StickyNote className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="font-medium text-sm">No notes yet</p>
            <p className="text-xs mt-1">{canManage ? `Click "New Note" to create the first one.` : "Check back later for updates from your manager."}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {visible.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                role={role}
                onEdit={() => { setEditing(note); setDialogOpen(true); }}
                onDelete={() => handleDelete(note.id)}
                onTogglePin={() => togglePin(note.id)}
                onToggleImportant={() => toggleImportant(note.id)}
              />
            ))}
          </div>
        )}
      </div>

      <NoteDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditing(null); }}
        initial={editing}
        authorName={ROLE_LABELS[role]}
        onSave={handleSave}
      />
    </AppLayout>
  );
}
