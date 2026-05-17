import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Bookmark, Pencil, Trash2, Search, Globe, ImageIcon, X } from "lucide-react";
import { toast } from "sonner";

type Brand = { id: number; name: string; description: string | null; website: string | null; logoUrl: string | null; createdAt: string };

const API = "/api/brands";
const headers = { "Content-Type": "application/json" };

export default function ProductsBrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Brand | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", website: "", logoUrl: "", description: "" });

  const load = async () => {
    const res = await fetch(`${API}${search ? `?search=${encodeURIComponent(search)}` : ""}`, { credentials: "include" });
    if (res.ok) setBrands((await res.json()).items);
  };

  useEffect(() => { load(); }, [search]);

  const openCreate = () => { setEditing(null); setForm({ name: "", website: "", logoUrl: "", description: "" }); setDialogOpen(true); };
  const openEdit = (b: Brand) => {
    setEditing(b);
    setForm({ name: b.name, website: b.website ?? "", logoUrl: b.logoUrl ?? "", description: b.description ?? "" });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name) { toast.error("Name is required"); return; }
    setSaving(true);
    const body = JSON.stringify(form);
    const res = editing
      ? await fetch(`${API}/${editing.id}`, { method: "PATCH", headers, body, credentials: "include" })
      : await fetch(API, { method: "POST", headers, body, credentials: "include" });
    setSaving(false);
    if (!res.ok) { toast.error("Failed to save brand"); return; }
    toast.success(editing ? "Brand updated" : "Brand added");
    setDialogOpen(false);
    load();
  };

  const handleDelete = async (id: number) => {
    await fetch(`${API}/${id}`, { method: "DELETE", credentials: "include" });
    toast.success("Brand deleted");
    load();
  };

  const filtered = brands.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Bookmark className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Brands</h1>
          </div>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Add Brand</Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search brands..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {filtered.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <Bookmark className="w-16 h-16 text-muted-foreground/30" />
            <div><p className="font-medium text-lg">No brands yet</p><p className="text-muted-foreground text-sm">Organise your products by brand.</p></div>
            <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Add Brand</Button>
          </CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((b) => (
              <Card key={b.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="w-10 h-10 rounded-lg bg-muted/40 border flex items-center justify-center shrink-0 overflow-hidden">
                      {b.logoUrl ? (
                        <img src={b.logoUrl} alt={b.name} className="w-full h-full object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <Bookmark className="w-4 h-4 text-primary" />
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(b)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(b.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                  <p className="font-semibold">{b.name}</p>
                  {b.website && (
                    <a href={b.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                      <Globe className="w-3 h-3" />{b.website.replace(/^https?:\/\//, "")}
                    </a>
                  )}
                  {b.description && <p className="text-xs text-muted-foreground line-clamp-2">{b.description}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? "Edit Brand" : "Add Brand"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* Logo upload / preview */}
            <div className="space-y-1.5">
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-xl border-2 border-dashed bg-muted/20 flex items-center justify-center overflow-hidden shrink-0">
                  {form.logoUrl ? (
                    <img src={form.logoUrl} alt="Logo preview" className="w-full h-full object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-muted-foreground/40" />
                  )}
                </div>
                <div className="flex-1 space-y-1.5">
                  <Input
                    value={form.logoUrl}
                    onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                    placeholder="Paste image URL..."
                    className="text-sm"
                  />
                  {form.logoUrl && (
                    <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground" onClick={() => setForm({ ...form, logoUrl: "" })}>
                      <X className="w-3 h-3 mr-1" /> Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Brand Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Samsung" />
            </div>

            <div className="space-y-1.5">
              <Label>Website</Label>
              <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://..." />
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description"
                className="resize-none"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>{editing ? "Save Changes" : "Add Brand"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
