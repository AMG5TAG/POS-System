import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Truck, Pencil, Trash2, Search, Globe, Mail, Phone } from "lucide-react";
import { toast } from "sonner";

type Supplier = { id: number; name: string; contactName: string | null; email: string | null; phone: string | null; website: string | null; address: string | null; notes: string | null; createdAt: string };

const API = "/api/suppliers";
const headers = { "Content-Type": "application/json" };

export default function ProductsSuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", contactName: "", email: "", phone: "", website: "", address: "", notes: "" });

  const load = async () => {
    const res = await fetch(`${API}${search ? `?search=${encodeURIComponent(search)}` : ""}`, { credentials: "include" });
    if (res.ok) setSuppliers((await res.json()).items);
  };

  useEffect(() => { load(); }, [search]);

  const openCreate = () => { setEditing(null); setForm({ name: "", contactName: "", email: "", phone: "", website: "", address: "", notes: "" }); setDialogOpen(true); };
  const openEdit = (s: Supplier) => { setEditing(s); setForm({ name: s.name, contactName: s.contactName ?? "", email: s.email ?? "", phone: s.phone ?? "", website: s.website ?? "", address: s.address ?? "", notes: s.notes ?? "" }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.name) { toast.error("Name is required"); return; }
    setSaving(true);
    const body = JSON.stringify(form);
    const res = editing
      ? await fetch(`${API}/${editing.id}`, { method: "PATCH", headers, body, credentials: "include" })
      : await fetch(API, { method: "POST", headers, body, credentials: "include" });
    setSaving(false);
    if (!res.ok) { toast.error("Failed to save supplier"); return; }
    toast.success(editing ? "Supplier updated" : "Supplier added");
    setDialogOpen(false);
    load();
  };

  const handleDelete = async (id: number) => {
    await fetch(`${API}/${id}`, { method: "DELETE", credentials: "include" });
    toast.success("Supplier deleted");
    load();
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Truck className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Suppliers</h1>
          </div>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Add Supplier</Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search suppliers..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {suppliers.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <Truck className="w-16 h-16 text-muted-foreground/30" />
            <div><p className="font-medium text-lg">No suppliers yet</p><p className="text-muted-foreground text-sm">Add suppliers to link them to purchase orders.</p></div>
            <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Add Supplier</Button>
          </CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {suppliers.map((s) => (
              <Card key={s.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{s.name}</p>
                      {s.contactName && <p className="text-xs text-muted-foreground">{s.contactName}</p>}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    {s.email && <p className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 shrink-0" />{s.email}</p>}
                    {s.phone && <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 shrink-0" />{s.phone}</p>}
                    {s.website && <p className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 shrink-0" />{s.website}</p>}
                    {s.address && <p className="text-xs">{s.address}</p>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Supplier" : "Add Supplier"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            {[
              { key: "name", label: "Company Name *", full: true, placeholder: "Acme Wholesale" },
              { key: "contactName", label: "Contact Name", placeholder: "Jane Smith" },
              { key: "email", label: "Email", placeholder: "orders@acme.com" },
              { key: "phone", label: "Phone", placeholder: "+61 2 0000 0000" },
              { key: "website", label: "Website", placeholder: "https://acme.com" },
              { key: "address", label: "Address", full: true, placeholder: "123 Main St, Sydney NSW 2000" },
            ].map((f) => (
              <div key={f.key} className={`space-y-1.5 ${f.full ? "col-span-2" : ""}`}>
                <Label>{f.label}</Label>
                <Input value={(form as Record<string, string>)[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} placeholder={f.placeholder} />
              </div>
            ))}
            <div className="space-y-1.5 col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{editing ? "Save Changes" : "Add Supplier"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
