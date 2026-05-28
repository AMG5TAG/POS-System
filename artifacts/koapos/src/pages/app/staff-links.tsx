import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Plus, Pencil, Trash2, Link2, ExternalLink, ShieldCheck,
  Globe,
} from "lucide-react";
import {
  useListStaffLinks,
  useCreateStaffLink,
  useUpdateStaffLink,
  useDeleteStaffLink,
  type StaffLink as ApiStaffLink,
} from "@workspace/api-client-react";

/* ─── Role simulation ────────────────────────────────────────────────────── */

type StaffRole = "owner" | "manager" | "cashier" | "staff";
const SIM_ROLE_KEY = "koapos_sim_role";
function getSimRole(): StaffRole {
  return "manager";
}

function canManageLinks(role: StaffRole) {
  return role === "owner" || role === "manager";
}

function ensureHttp(url: string) {
  if (!url) return url;
  return url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`;
}

/* ─── Dialog ─────────────────────────────────────────────────────────────── */

const BLANK = { label: "", url: "", category: "" };

function LinkDialog({
  open, onOpenChange, initial, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: ApiStaffLink | null;
  onSave: (data: typeof BLANK) => void;
}) {
  const [form, setForm] = useState(
    initial ? { label: initial.label, url: initial.url, category: initial.category || "" } : { ...BLANK }
  );
  const setField = (k: keyof typeof BLANK, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSave = () => {
    if (!form.label.trim()) { toast.error("Link name is required"); return; }
    if (!form.url.trim()) { toast.error("URL is required"); return; }
    onSave(form);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Link" : "Add Link"}</DialogTitle>
          <DialogDescription>Add a helpful resource link for your staff team.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={form.label} onChange={(e) => setField("label", e.target.value)} placeholder="e.g. Staff Portal, Training Videos…" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>URL</Label>
            <Input value={form.url} onChange={(e) => setField("url", e.target.value)} placeholder="https://…" type="url" />
          </div>
          <div className="space-y-1.5">
            <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea
              value={form.category}
              onChange={(e) => setField("category", e.target.value)}
              placeholder="Brief description of what this link is for…"
              className="h-20 resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>{initial ? "Save Changes" : "Add Link"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function StaffLinksPage() {
  const { data: response, isLoading } = useListStaffLinks();
  const links = response?.items ?? [];
  const createLink = useCreateStaffLink();
  const updateLink = useUpdateStaffLink();
  const deleteLink = useDeleteStaffLink();

  const [role, setRole] = useState<StaffRole>(getSimRole);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ApiStaffLink | null>(null);

  const canManage = canManageLinks(role);

  const handleSave = (data: typeof BLANK) => {
    const url = ensureHttp(data.url);
    if (editing) {
      updateLink.mutate(
        { id: editing.id, data: { label: data.label, url, category: data.category || "general" } },
        { onSuccess: () => toast.success("Link updated"), onError: () => toast.error("Failed to update link") }
      );
    } else {
      createLink.mutate(
        { data: { linkId: crypto.randomUUID(), label: data.label, url, category: data.category || "general" } },
        { onSuccess: () => toast.success("Link added"), onError: () => toast.error("Failed to add link") }
      );
    }
    setEditing(null);
  };

  const handleDelete = (id: number) => {
    deleteLink.mutate(
      { id },
      { onSuccess: () => toast.success("Link removed"), onError: () => toast.error("Failed to remove link") }
    );
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Links</h1>
            <p className="text-sm text-muted-foreground mt-1">Helpful links and resources for your team.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground border rounded-lg px-3 py-2">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Viewing as:</span>
              <Select value={role} onValueChange={(v) => { const r = v as StaffRole; setRole(r); }}>
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
                <Plus className="h-4 w-4 mr-1" />Add Link
              </Button>
            )}
          </div>
        </div>


        {!canManage && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-4 py-2.5">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>Links are managed by managers and owners. Contact your manager to add or remove links.</span>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
          </div>
        ) : links.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed py-16 text-center text-muted-foreground">
            <Link2 className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="font-medium text-sm">No links yet</p>
            <p className="text-xs mt-1">{canManage ? "Add helpful resources for your team." : "Your manager hasn't added any links yet."}</p>
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            {/* Header row */}
            <div className="grid grid-cols-[1fr_1fr_2fr_auto] gap-4 px-5 py-2.5 bg-muted/30 border-b">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</p>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Link</p>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</p>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground w-16 text-right">Actions</p>
            </div>
            <div className="divide-y">
              {links.map((link) => (
                <div key={link.id} className="grid grid-cols-[1fr_1fr_2fr_auto] gap-4 px-5 py-3.5 items-center group hover:bg-muted/20 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
                      <Globe className="w-3.5 h-3.5" />
                    </div>
                    <p className="text-sm font-medium truncate">{link.label}</p>
                  </div>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-primary hover:underline min-w-0 truncate"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    <span className="truncate">{link.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
                  </a>
                  <p className="text-sm text-muted-foreground truncate">{link.category || <span className="italic opacity-50">—</span>}</p>
                  <div className={cn("flex gap-1 justify-end", !canManage && "invisible")}>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => { setEditing(link); setDialogOpen(true); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(link.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <LinkDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditing(null); }}
        initial={editing}
        onSave={handleSave}
      />
    </AppLayout>
  );
}
