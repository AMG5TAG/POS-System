import { useState, useEffect, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Plus, Bookmark, Pencil, Trash2, Search, Globe, ImageIcon, X, Upload,
  Loader2, ChevronRight, ExternalLink, Package, ArrowUpDown, ArrowUp, ArrowDown,
  DollarSign,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Brand = {
  id: number;
  name: string;
  description: string | null;
  website: string | null;
  logoUrl: string | null;
  createdAt: string;
  productCount: number;
  retailValue: number;
};

type Product = {
  id: number;
  name: string;
  price: number;
  costPrice: number | null;
  imageUrl: string | null;
  sku: string | null;
  stockQuantity: number;
};

type SortKey = "name" | "retailValue" | "productCount";
type SortDir = "asc" | "desc";

const API = "/api/brands";
const hdrs = { "Content-Type": "application/json" };

const fmt = (n: number) =>
  n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

/* ─── Logo uploader ─────────────────────────────────────────────────────── */

function LogoUploader({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    setUploading(true);
    try {
      const urlRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
        credentials: "include",
      });
      if (!urlRes.ok) throw new Error("Could not get upload URL");
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
      const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!putRes.ok) throw new Error("Upload to storage failed");
      onChange(`/api/storage${objectPath}`);
      toast.success("Logo uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleFile = (files: FileList | null) => { if (files?.[0]) upload(files[0]); };

  return (
    <div className="space-y-1.5">
      <Label>Logo</Label>
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "w-20 h-20 rounded-xl border-2 border-dashed flex items-center justify-center shrink-0 overflow-hidden transition-colors cursor-pointer",
            dragOver ? "border-primary bg-primary/5" : "bg-muted/20 hover:bg-muted/30",
            uploading && "opacity-60 pointer-events-none",
          )}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files); }}
        >
          {uploading ? (
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          ) : value ? (
            <img src={value} alt="Logo" className="w-full h-full object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <ImageIcon className="w-7 h-7 text-muted-foreground/40" />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? "Uploading…" : value ? "Replace" : "Upload Logo"}
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground h-7 text-xs" onClick={() => onChange("")}>
              <X className="w-3 h-3" /> Remove
            </Button>
          )}
          <p className="text-[11px] text-muted-foreground leading-tight">PNG, JPG, SVG<br />Drag & drop or click</p>
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files)} />
    </div>
  );
}

/* ─── Sort header button ─────────────────────────────────────────────────── */

function SortBtn({ label, col, sort, onSort }: { label: string; col: SortKey; sort: { key: SortKey; dir: SortDir }; onSort: (k: SortKey) => void }) {
  const active = sort.key === col;
  const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      onClick={() => onSort(col)}
      className={cn("flex items-center gap-1 text-xs font-semibold uppercase tracking-wider select-none", active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
    >
      {label} <Icon className="w-3 h-3" />
    </button>
  );
}

/* ─── Expanded products row ─────────────────────────────────────────────── */

function BrandProducts({ brandId, showCost }: { brandId: number; showCost: boolean }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/products?brandId=${brandId}&limit=100`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setProducts(data.items ?? []))
      .finally(() => setLoading(false));
  }, [brandId]);

  if (loading) return (
    <div className="flex items-center justify-center py-4">
      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
    </div>
  );

  if (!products.length) return (
    <div className="flex items-center gap-2 py-4 px-4 text-sm text-muted-foreground">
      <Package className="w-4 h-4" /> No products linked to this brand
    </div>
  );

  return (
    <div className="divide-y bg-muted/20">
      {products.map((p) => (
        <div key={p.id} className="flex items-center gap-3 px-14 py-2.5">
          <div className="w-7 h-7 rounded-md bg-muted border flex items-center justify-center shrink-0 overflow-hidden">
            {p.imageUrl
              ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-contain" />
              : <Package className="w-3.5 h-3.5 text-muted-foreground/50" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{p.name}</p>
            {p.sku && <p className="text-xs text-muted-foreground">SKU: {p.sku}</p>}
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-semibold text-primary">{fmt(p.price)}</p>
            {showCost && p.costPrice != null && (
              <p className="text-xs text-muted-foreground">Cost: {fmt(p.costPrice)}</p>
            )}
          </div>
          <div className="w-16 text-right shrink-0">
            <p className="text-xs text-muted-foreground">Stock: {p.stockQuantity}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ProductsBrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [search, setSearch] = useState("");
  const [showCost, setShowCost] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "name", dir: "asc" });
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Brand | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", website: "", logoUrl: "", description: "" });

  const load = useCallback(async () => {
    const res = await fetch(`${API}${search ? `?search=${encodeURIComponent(search)}` : ""}`, { credentials: "include" });
    if (res.ok) setBrands((await res.json()).items);
  }, [search]);

  useEffect(() => { load(); }, [load]);

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
      ? await fetch(`${API}/${editing.id}`, { method: "PATCH", headers: hdrs, body, credentials: "include" })
      : await fetch(API, { method: "POST", headers: hdrs, body, credentials: "include" });
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

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSort = (key: SortKey) => {
    setSort((prev) => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" });
  };

  const sorted = [...brands].sort((a, b) => {
    const mul = sort.dir === "asc" ? 1 : -1;
    if (sort.key === "name") return mul * a.name.localeCompare(b.name);
    if (sort.key === "retailValue") return mul * (a.retailValue - b.retailValue);
    return mul * (a.productCount - b.productCount);
  });

  const totalProducts = brands.reduce((s, b) => s + b.productCount, 0);
  const totalRetail   = brands.reduce((s, b) => s + b.retailValue, 0);

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-5">
        <div>
          <h1 className="text-2xl font-bold">Brands</h1>
          <p className="text-sm text-muted-foreground">Manage product brands and their associated product lines.</p>
        </div>
        {/* Top bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative flex-1 min-w-0 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search brands..."
              className="pl-9 rounded-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <Button
              variant="outline"
              size="sm"
              className={cn("rounded-full gap-1.5", showCost && "border-primary text-primary")}
              onClick={() => setShowCost((v) => !v)}
            >
              <DollarSign className="w-3.5 h-3.5" /> Show Cost
            </Button>
            <Button size="sm" className="rounded-full gap-1.5" onClick={openCreate}>
              <Plus className="w-4 h-4" /> Add Brand
            </Button>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardContent className="py-4 px-5 text-center">
              <p className="text-2xl font-bold text-primary">{totalProducts}</p>
              <p className="text-sm text-muted-foreground">Total Products</p>
            </CardContent>
          </Card>
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="py-4 px-5 text-center">
              <p className="text-2xl font-bold text-primary">{fmt(totalRetail)}</p>
              <p className="text-sm text-muted-foreground">Total Retail Value</p>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
          {/* Header */}
          <div className="flex items-center border-b px-4 py-2.5 bg-muted/30">
            <div className="w-8 shrink-0" />
            <div className="flex-1">
              <SortBtn label="Brand" col="name" sort={sort} onSort={handleSort} />
            </div>
            <div className="flex items-center gap-6 shrink-0 mr-16">
              <SortBtn label="Retail Value" col="retailValue" sort={sort} onSort={handleSort} />
              <SortBtn label="Products" col="productCount" sort={sort} onSort={handleSort} />
            </div>
          </div>

          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <Bookmark className="w-16 h-16 text-muted-foreground/20" />
              <div>
                <p className="font-medium text-lg">No brands yet</p>
                <p className="text-muted-foreground text-sm">Organise your products by brand.</p>
              </div>
              <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Add Brand</Button>
            </div>
          ) : (
            <div className="divide-y">
              {sorted.map((b) => {
                const isOpen = expanded.has(b.id);
                return (
                  <div key={b.id}>
                    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                      {/* Expand chevron */}
                      <button
                        onClick={() => toggleExpand(b.id)}
                        className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      >
                        <ChevronRight className={cn("w-4 h-4 transition-transform", isOpen && "rotate-90")} />
                      </button>

                      {/* Logo */}
                      <div className="w-9 h-9 rounded-lg bg-muted/40 border flex items-center justify-center shrink-0 overflow-hidden">
                        {b.logoUrl ? (
                          <img src={b.logoUrl} alt={b.name} className="w-full h-full object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                        ) : (
                          <Bookmark className="w-4 h-4 text-primary/60" />
                        )}
                      </div>

                      {/* Name */}
                      <div className="flex-1 min-w-0 flex items-center gap-1.5">
                        <span className="font-medium text-primary truncate">{b.name}</span>
                        {b.website && (
                          <a
                            href={b.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-muted-foreground hover:text-foreground shrink-0"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-8 shrink-0">
                        <div className="text-right w-24">
                          <p className="text-[10px] text-muted-foreground leading-none mb-0.5">Retail Value</p>
                          <p className="text-sm font-semibold text-primary">{fmt(b.retailValue)}</p>
                        </div>
                        <div className="text-right w-16">
                          <p className="text-[10px] text-muted-foreground leading-none mb-0.5">Products</p>
                          <p className="text-sm font-semibold text-primary">{b.productCount}</p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => openEdit(b)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(b.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Expanded products */}
                    {isOpen && <BrandProducts brandId={b.id} showCost={showCost} />}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? "Edit Brand" : "Add Brand"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <LogoUploader value={form.logoUrl} onChange={(url) => setForm({ ...form, logoUrl: url })} />
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
