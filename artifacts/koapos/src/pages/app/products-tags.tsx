import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Hash, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Tag = { id: number; name: string; color: string; createdAt: string };

const API = "/api/tags";
const headers = { "Content-Type": "application/json" };
const COLORS = ["#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#6366f1","#a855f7","#ec4899","#6b7280","#0ea5e9","#14b8a6","#f59e0b"];

export default function ProductsTagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", color: COLORS[0] });

  const load = async () => {
    const res = await fetch(API, { credentials: "include" });
    if (res.ok) setTags((await res.json()).items);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ name: "", color: COLORS[0] }); setDialogOpen(true); };
  const openEdit = (t: Tag) => { setEditing(t); setForm({ name: t.name, color: t.color }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.name) { toast.error("Name is required"); return; }
    setSaving(true);
    const body = JSON.stringify(form);
    const res = editing
      ? await fetch(`${API}/${editing.id}`, { method: "PATCH", headers, body, credentials: "include" })
      : await fetch(API, { method: "POST", headers, body, credentials: "include" });
    setSaving(false);
    if (!res.ok) { toast.error("Failed to save tag"); return; }
    toast.success(editing ? "Tag updated" : "Tag added");
    setDialogOpen(false);
    load();
  };

  const handleDelete = async (id: number) => {
    await fetch(`${API}/${id}`, { method: "DELETE", credentials: "include" });
    toast.success("Tag deleted");
    load();
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Hash className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Tags</h1>
          </div>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Add Tag</Button>
        </div>

        {tags.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <Hash className="w-16 h-16 text-muted-foreground/30" />
            <div><p className="font-medium text-lg">No tags yet</p><p className="text-muted-foreground text-sm">Create tags to label and filter products.</p></div>
            <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Add Tag</Button>
          </CardContent></Card>
        ) : (
          <div className="flex flex-wrap gap-3">
            {tags.map((t) => (
              <div key={t.id} className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium" style={{ borderColor: t.color + "55", backgroundColor: t.color + "18", color: t.color }}>
                <Hash className="w-3.5 h-3.5" />
                {t.name}
                <button onClick={() => openEdit(t)} className="opacity-60 hover:opacity-100 transition-opacity"><Pencil className="w-3 h-3" /></button>
                <button onClick={() => handleDelete(t.id)} className="opacity-60 hover:opacity-100 transition-opacity"><Trash2 className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? "Edit Tag" : "Add Tag"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tag Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Sale" />
            </div>
            <div className="space-y-1.5">
              <Label>Colour</Label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setForm({ ...form, color: c })} className={`w-7 h-7 rounded-full border-2 transition-all ${form.color === c ? "border-foreground scale-110" : "border-transparent"}`} style={{ backgroundColor: c }} />
                ))}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full" style={{ backgroundColor: form.color + "22", color: form.color, border: `1px solid ${form.color}55` }}>
                  <Hash className="w-3.5 h-3.5" /> {form.name || "Preview"}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>{editing ? "Save Changes" : "Add Tag"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
