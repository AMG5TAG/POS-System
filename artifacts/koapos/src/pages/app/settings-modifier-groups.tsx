import { useState } from "react";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { useFormDirty } from "@/hooks/use-form-dirty";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { Layers, Plus, Pencil, Trash2, ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { toast } from "sonner";

interface Modifier { id: number; groupId: number; name: string; priceAdjustment: number; isDefault: boolean; isActive: boolean; sortOrder: number }
interface ModifierGroup { id: number; name: string; isRequired: boolean; minSelections: number; maxSelections: number; isActive: string; modifiers: Modifier[] }

const defaultGroupForm = () => ({ name: "", isRequired: false, minSelections: 0, maxSelections: 1 });
const defaultModForm = () => ({ name: "", priceAdjustment: 0, isDefault: false });

export default function SettingsModifierGroupsPage() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [groupDialog, setGroupDialog] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [groupForm, setGroupForm] = useState(defaultGroupForm());
  const [modDialog, setModDialog] = useState<{ open: boolean; groupId: number | null; editId: number | null }>({ open: false, groupId: null, editId: null });
  const [modForm, setModForm] = useState(defaultModForm());
  const { isDirty: isGroupDirty, markClean: markGroupClean } = useFormDirty(groupForm);
  const { isDirty: isModDirty, markClean: markModClean } = useFormDirty(modForm);
  const isDirty = isGroupDirty || isModDirty;

  const { ConfirmDialog: ModifierFormGuard } = useUnsavedChangesGuard(isDirty, {
    title: "Close modifier form?",
    description: "The modifier form has unsaved changes. If you leave now, your changes will be lost.",
    cancelLabel: "Stay on page",
    actionLabel: "Leave anyway",
  });

  const { data, isLoading } = useQuery<{ groups: ModifierGroup[] }>({
    queryKey: ["modifier-groups"],
    queryFn: async () => {
      const r = await fetch("/api/modifier-groups", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["modifier-groups"] });

  const saveGroup = useMutation({
    mutationFn: async (body: typeof groupForm & { id?: number }) => {
      const url = body.id ? `/api/modifier-groups/${body.id}` : "/api/modifier-groups";
      const r = await fetch(url, {
        method: body.id ? "PATCH" : "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Save failed");
      return r.json();
    },
    onSuccess: () => { invalidate(); setGroupDialog(false); markGroupClean(); toast.success(editingGroupId ? "Group updated" : "Group created"); },
    onError: () => toast.error("Save failed"),
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/modifier-groups/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Delete failed");
    },
    onSuccess: invalidate,
    onError: () => toast.error("Delete failed"),
  });

  const saveMod = useMutation({
    mutationFn: async (body: typeof modForm & { groupId: number; id?: number }) => {
      const url = body.id ? `/api/modifiers/${body.id}` : `/api/modifier-groups/${body.groupId}/modifiers`;
      const r = await fetch(url, {
        method: body.id ? "PATCH" : "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: body.name, priceAdjustment: body.priceAdjustment, isDefault: body.isDefault }),
      });
      if (!r.ok) throw new Error("Save failed");
      return r.json();
    },
    onSuccess: () => { invalidate(); setModDialog({ open: false, groupId: null, editId: null }); markModClean(); toast.success("Option saved"); },
    onError: () => toast.error("Save failed"),
  });

  const deleteMod = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/modifiers/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Delete failed");
    },
    onSuccess: invalidate,
    onError: () => toast.error("Delete failed"),
  });

  const openCreate = () => { const f = defaultGroupForm(); setEditingGroupId(null); setGroupForm(f); markGroupClean(f); setGroupDialog(true); };
  const openEditGroup = (g: ModifierGroup) => {
    const f = { name: g.name, isRequired: g.isRequired, minSelections: g.minSelections, maxSelections: g.maxSelections };
    setEditingGroupId(g.id);
    setGroupForm(f);
    markGroupClean(f);
    setGroupDialog(true);
  };
  const openAddMod = (groupId: number) => { const f = defaultModForm(); setModForm(f); markModClean(f); setModDialog({ open: true, groupId, editId: null }); };
  const openEditMod = (groupId: number, m: Modifier) => {
    const f = { name: m.name, priceAdjustment: m.priceAdjustment, isDefault: m.isDefault };
    setModForm(f);
    markModClean(f);
    setModDialog({ open: true, groupId, editId: m.id });
  };
  const toggleExpand = (id: number) => setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
              <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Modifier Groups</h1>
              <p className="text-sm text-muted-foreground">Product add-ons, sizes, variants — e.g. "Milk Type", "Size"</p>
            </div>
          </div>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Add Group</Button>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : !data?.groups.length ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Layers className="w-12 h-12 text-muted-foreground/40 mb-3" />
              <p className="font-medium text-muted-foreground">No modifier groups yet</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Create groups like "Size" or "Milk Type" and attach them to products</p>
              <Button className="mt-4" onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Create First Group</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {data.groups.map(g => (
              <Card key={g.id}>
                <div className="px-4 py-3 flex items-center gap-3 cursor-pointer select-none" onClick={() => toggleExpand(g.id)}>
                  <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{g.name}</span>
                      {g.isRequired && <Badge variant="destructive" className="text-[10px] py-0">Required</Badge>}
                      <Badge variant="secondary" className="text-[10px] py-0">
                        {g.modifiers.length} option{g.modifiers.length !== 1 ? "s" : ""}
                      </Badge>
                      <span className="text-xs text-muted-foreground">Select {g.minSelections}–{g.maxSelections}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); openEditGroup(g); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={e => { e.stopPropagation(); deleteGroup.mutate(g.id); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    {expanded.has(g.id) ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>
                {expanded.has(g.id) && (
                  <div className="border-t px-4 pb-4 pt-3">
                    <div className="space-y-1.5 mb-3">
                      {g.modifiers.length === 0 && (
                        <p className="text-sm text-muted-foreground italic">No options yet</p>
                      )}
                      {g.modifiers.map(m => (
                        <div key={m.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/40 group">
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <span className="text-sm font-medium">{m.name}</span>
                            {m.isDefault && <Badge variant="outline" className="text-[10px] py-0">Default</Badge>}
                            {m.priceAdjustment !== 0 && (
                              <span className={`text-xs font-mono ${m.priceAdjustment > 0 ? "text-emerald-600" : "text-red-600"}`}>
                                {m.priceAdjustment > 0 ? "+" : ""}{formatCurrency(m.priceAdjustment)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditMod(g.id, m)}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => deleteMod.mutate(m.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => openAddMod(g.id)}>
                      <Plus className="w-3.5 h-3.5 mr-1.5" />Add Option
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Group dialog */}
      <Dialog open={groupDialog} onOpenChange={(o) => { if (!o) markGroupClean(); setGroupDialog(o); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editingGroupId ? "Edit Group" : "New Modifier Group"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Group Name</Label>
              <Input value={groupForm.name} onChange={e => { setGroupForm(f => ({ ...f, name: e.target.value })); }} placeholder="e.g. Milk Type, Size" className="mt-1" />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={groupForm.isRequired} onCheckedChange={v => { setGroupForm(f => ({ ...f, isRequired: v })); }} id="req-switch" />
              <Label htmlFor="req-switch">Required selection</Label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Min selections</Label>
                <Input type="number" min={0} value={groupForm.minSelections}
                  onChange={e => { setGroupForm(f => ({ ...f, minSelections: parseInt(e.target.value) || 0 })); }} className="mt-1" />
              </div>
              <div>
                <Label>Max selections</Label>
                <Input type="number" min={1} value={groupForm.maxSelections}
                  onChange={e => { setGroupForm(f => ({ ...f, maxSelections: parseInt(e.target.value) || 1 })); }} className="mt-1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { markGroupClean(); setGroupDialog(false); }}>Cancel</Button>
            <Button onClick={() => saveGroup.mutate({ ...groupForm, ...(editingGroupId ? { id: editingGroupId } : {}) })}
              disabled={!groupForm.name || saveGroup.isPending}>
              {saveGroup.isPending ? "Saving…" : editingGroupId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modifier dialog */}
      <Dialog open={modDialog.open} onOpenChange={o => { if (!o) markModClean(); setModDialog(d => ({ ...d, open: o })); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{modDialog.editId ? "Edit Option" : "Add Option"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Option Name</Label>
              <Input value={modForm.name} onChange={e => { setModForm(f => ({ ...f, name: e.target.value })); }} placeholder="e.g. Small, Oat Milk" className="mt-1" />
            </div>
            <div>
              <Label>Price Adjustment</Label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <Input type="number" step="0.01" value={modForm.priceAdjustment}
                  onChange={e => { setModForm(f => ({ ...f, priceAdjustment: parseFloat(e.target.value) || 0 })); }}
                  className="pl-7" placeholder="0.00 = no change" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">Use negative for discounts (e.g. -0.50)</p>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={modForm.isDefault} onCheckedChange={v => { setModForm(f => ({ ...f, isDefault: v })); }} id="def-switch" />
              <Label htmlFor="def-switch">Pre-selected by default</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { markModClean(); setModDialog({ open: false, groupId: null, editId: null }); }}>Cancel</Button>
            <Button
              onClick={() => modDialog.groupId && saveMod.mutate({ ...modForm, groupId: modDialog.groupId, ...(modDialog.editId ? { id: modDialog.editId } : {}) })}
              disabled={!modForm.name || saveMod.isPending}>
              {saveMod.isPending ? "Saving…" : modDialog.editId ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ModifierFormGuard />
    </AppLayout>
  );
}
