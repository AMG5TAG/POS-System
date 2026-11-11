/**
 * Products › product form › Import Details.
 *
 * Paste a product page link → the server reads the page (POST
 * /products/import-from-url) → every field is shown here for review: ticked,
 * editable, and empty where the page didn't say, so staff can type the missing
 * piece before applying. Nothing reaches the form until "Apply", and the form
 * still has to be saved. A field the form already holds starts unticked, so an
 * import never silently overwrites what someone typed.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link2, Loader2, Sparkles, ImageOff, ExternalLink } from "lucide-react";
import { useImportProductFromUrl, type ProductUrlImport } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { uploadFile } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { parseWarranty, matchByName } from "@/lib/product-url-import";
import { TreeCategorySelect } from "@/components/ui/tree-category-select";

type FieldKey =
  | "name" | "description" | "sku" | "barcode" | "brand" | "category" | "price" | "supplier" | "supplierCode"
  | "weightKg" | "lengthCm" | "widthCm" | "heightCm" | "warranty" | "technicalSpecs";

const FIELDS: { key: FieldKey; label: string; long?: boolean; numeric?: boolean; hint?: string }[] = [
  { key: "name", label: "Name" },
  { key: "brand", label: "Brand" },
  { key: "category", label: "Category" },
  { key: "supplier", label: "Supplier" },
  { key: "supplierCode", label: "Supplier code", hint: "The supplier's own code for this item, from their page." },
  { key: "sku", label: "SKU / model" },
  { key: "barcode", label: "Barcode" },
  { key: "price", label: "Sell price", numeric: true, hint: "The price on that site — check it's the price you want." },
  { key: "description", label: "Description", long: true },
  { key: "technicalSpecs", label: "Specifications", long: true, hint: "One \"Label: value\" per line — shown on the shop's Specifications tab." },
  { key: "weightKg", label: "Weight (kg)", numeric: true },
  { key: "lengthCm", label: "Length (cm)", numeric: true },
  { key: "widthCm", label: "Width (cm)", numeric: true },
  { key: "heightCm", label: "Height (cm)", numeric: true },
  { key: "warranty", label: "Warranty", hint: "e.g. \"12 months\" or \"2 years\"." },
];

/** What the form holds now, so a filled field starts unticked. */
export interface ImportCurrent {
  name: string; description: string; sku: string; barcode: string;
  brandId: string; categoryId: string; price: string; supplier: string; supplierCode: string;
  weight: string; lengthCm: string; widthCm: string; heightCm: string;
  warrantyDuration: string; technicalSpecs: string; photoCount: number;
}

export interface ImportApply {
  name?: string; description?: string; sku?: string; barcode?: string; price?: string;
  weightKg?: string; lengthCm?: string; widthCm?: string; heightCm?: string;
  technicalSpecs?: string;
  warranty?: { duration: string; unit: "months" | "years" };
  brand?: { id: string } | { createName: string };
  category?: { id: string };
  /** An existing supplier by name, or a new one to create with the site as its website. */
  supplier?: { name: string } | { createName: string; website: string };
  supplierCode?: string;
  /** Uploaded to this business's storage, in order. */
  photos: string[];
}

interface Named { id: number; name: string }
interface Category extends Named { parentId?: number | null }

/** "australiancomputertraders.com.au" → "Australiancomputertraders", when the site gives no name. */
const siteLabel = (host: string) => {
  const base = host.split(".")[0] ?? "";
  return base ? base[0]!.toUpperCase() + base.slice(1) : "";
};

const currentOf = (c: ImportCurrent, k: FieldKey): string => {
  switch (k) {
    case "brand": return c.brandId; case "category": return c.categoryId;
    case "weightKg": return c.weight; case "warranty": return c.warrantyDuration;
    case "price": return c.price === "0" ? "" : c.price;
    default: return (c as unknown as Record<string, string>)[k] ?? "";
  }
};

export function ImportProductDetailsDialog({
  open, onOpenChange, current, brands, categories, suppliers, onCreateCategory, onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  current: ImportCurrent;
  brands: Named[];
  categories: Category[];
  suppliers: Named[];
  onCreateCategory: (name: string, onCreated: (id: number) => void) => void;
  onApply: (patch: ImportApply) => Promise<void> | void;
}) {
  const fetchPage = useImportProductFromUrl();
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<ProductUrlImport | null>(null);
  const [values, setValues] = useState<Record<FieldKey, string>>({} as Record<FieldKey, string>);
  const [ticked, setTicked] = useState<Record<FieldKey, boolean>>({} as Record<FieldKey, boolean>);
  const [photos, setPhotos] = useState<{ url: string; on: boolean; broken?: boolean }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [categoryHint, setCategoryHint] = useState("");

  const reset = () => { setCategoryHint(""); setResult(null); setValues({} as Record<FieldKey, string>); setTicked({} as Record<FieldKey, boolean>); setPhotos([]); setBusy(null); };
  const close = (o: boolean) => { if (!o && busy) return; if (!o) { reset(); setUrl(""); } onOpenChange(o); };

  const read = () => {
    if (!url.trim()) return;
    fetchPage.mutate({ data: { url: url.trim() } }, {
      onSuccess: (r) => {
        const p = r.product as Record<string, unknown>;
        const v = {} as Record<FieldKey, string>;
        const t = {} as Record<FieldKey, boolean>;
        for (const f of FIELDS) {
          const raw = p[f.key];
          v[f.key] = raw == null ? "" : String(raw);
          // Tick what the page gave us, unless the form already has its own value.
          t[f.key] = v[f.key] !== "" && !currentOf(current, f.key);
        }
        // The site is a supplier: their page's SKU is *their* code, not ours, so
        // it goes to Supplier code and the SKU row starts unticked.
        v.supplier = r.site.supplier?.name ?? r.site.name ?? siteLabel(r.site.host);
        t.supplier = v.supplier !== "" && !current.supplier;
        v.supplierCode = v.sku ?? "";
        t.supplierCode = v.supplierCode !== "" && !current.supplierCode;
        t.sku = false;
        // Category is picked from the tree; start on the one whose name matches.
        const cat = matchByName(categories, v.category);
        setCategoryHint(v.category ?? "");
        v.category = cat ? String(cat.id) : "";
        t.category = !!cat && !current.categoryId;
        setValues(v); setTicked(t);
        setPhotos(r.product.images.map((u) => ({ url: u, on: true })));
        setResult(r);
        if (r.aiError) toast.warning(r.aiError);
        const found = FIELDS.filter((f) => v[f.key]).length;
        if (!found && !r.product.images.length) toast.error("Couldn't find product details on that page — fill them in below, or try the maker's own page.");
      },
      onError: (err: unknown) => {
        const msg = (err as { data?: { error?: string } })?.data?.error;
        toast.error(msg ?? "Couldn't read that page");
      },
    });
  };

  const brandMatch = useMemo(() => matchByName(brands, values.brand), [brands, values.brand]);
  const supplierMatch = useMemo(() => matchByName(suppliers, values.supplier), [suppliers, values.supplier]);
  const warranty = parseWarranty(values.warranty ?? "");
  const aiFilled = new Set(result?.aiFilled ?? []);

  const setValue = (k: FieldKey, v: string) => {
    setValues((prev) => ({ ...prev, [k]: v }));
    // Typing into an empty row means "use this".
    if (v.trim()) setTicked((prev) => ({ ...prev, [k]: true }));
  };

  const use = (k: FieldKey) => ticked[k] && (values[k] ?? "").trim() !== "";
  const tickedCount = FIELDS.filter((f) => use(f.key)).length + photos.filter((p) => p.on && !p.broken).length;

  const apply = async () => {
    const patch: ImportApply = { photos: [] };
    for (const f of ["name", "description", "sku", "barcode", "technicalSpecs"] as const) if (use(f)) patch[f] = values[f]!.trim();
    for (const f of ["price", "weightKg", "lengthCm", "widthCm", "heightCm"] as const) {
      if (!use(f)) continue;
      const n = parseFloat(values[f]!.replace(/[^0-9.]/g, ""));
      if (Number.isFinite(n) && n > 0) patch[f] = String(f === "price" ? Math.round(n * 100) / 100 : n);
    }
    if (use("warranty") && warranty) patch.warranty = warranty;
    if (use("brand")) patch.brand = brandMatch ? { id: String(brandMatch.id) } : { createName: values.brand!.trim() };
    if (use("category")) patch.category = { id: values.category! };
    if (use("supplier")) {
      patch.supplier = supplierMatch
        ? { name: supplierMatch.name }
        : { createName: values.supplier!.trim(), website: result?.site.host ?? "" };
    }
    if (use("supplierCode")) patch.supplierCode = values.supplierCode!.trim();

    // Photos are copied into our own storage: the shop can't show a hot-linked
    // image, and the other site may move or block it later.
    const chosen = photos.filter((p) => p.on && !p.broken);
    let failed = 0;
    for (const [i, p] of chosen.entries()) {
      setBusy(`Copying photos… ${i + 1} of ${chosen.length}`);
      try {
        const r = await fetch(`/api/products/import-from-url/image?url=${encodeURIComponent(p.url)}`, { credentials: "include" });
        if (!r.ok) { failed++; continue; }
        const blob = await r.blob();
        const ext = blob.type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
        patch.photos.push((await uploadFile(new File([blob], `imported-${i + 1}.${ext}`, { type: blob.type }))).url);
      } catch { failed++; }
    }
    if (failed) toast.warning(`${failed} photo${failed === 1 ? "" : "s"} couldn't be copied — add them from the Media tab.`);
    setBusy("Applying…");
    try {
      await onApply(patch);
      toast.success("Details added to the form — check them and save the product.");
      close(false);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0">
          <DialogTitle className="flex items-center gap-2"><Link2 className="w-4 h-4" /> Import Details</DialogTitle>
          <DialogDescription>
            Paste a link to the product's page — the maker's own page usually has the most detail. Review each field, fill in anything missing, then apply it to the form.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-3 shrink-0 flex gap-2">
          <Input
            autoFocus
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); read(); } }}
            disabled={fetchPage.isPending || !!busy}
          />
          <Button onClick={read} disabled={!url.trim() || fetchPage.isPending || !!busy} className="shrink-0">
            {fetchPage.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Reading…</> : result ? "Read again" : "Read page"}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 min-h-0">
          {fetchPage.isPending && (
            <p className="text-sm text-muted-foreground py-8 text-center">Reading the page — this can take up to half a minute when Claude fills in gaps.</p>
          )}

          {result && !fetchPage.isPending && (
            <div className="space-y-4 pb-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline truncate max-w-full">
                  <ExternalLink className="w-3 h-3 shrink-0" /> <span className="truncate">{result.url}</span>
                </a>
                {result.aiUsed && aiFilled.size > 0 && (
                  <span className="inline-flex items-center gap-1"><Sparkles className="w-3 h-3 text-violet-500" /> marks fields Claude read from the page text — check those closely.</span>
                )}
              </div>

              {/* Photos */}
              <div className="rounded-lg border p-3">
                <p className="text-sm font-medium mb-2">
                  Photos <span className="text-muted-foreground font-normal">— {photos.length ? `added after the ${current.photoCount ? "product's existing photos" : "first one, which becomes the default"}` : "none found on the page"}</span>
                </p>
                {photos.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {photos.map((p, i) => (
                      <button
                        key={p.url}
                        type="button"
                        disabled={p.broken}
                        onClick={() => setPhotos((prev) => prev.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
                        className={cn("relative aspect-square rounded-md border-2 overflow-hidden bg-white", p.on && !p.broken ? "border-primary" : "border-transparent opacity-50")}
                        title={p.broken ? "Couldn't load this image" : p.on ? "Click to leave out" : "Click to include"}
                      >
                        {p.broken ? (
                          <ImageOff className="w-5 h-5 m-auto text-muted-foreground" />
                        ) : (
                          <img
                            src={`/api/products/import-from-url/image?url=${encodeURIComponent(p.url)}`}
                            alt=""
                            className="w-full h-full object-contain"
                            onError={() => setPhotos((prev) => prev.map((x, j) => (j === i ? { ...x, broken: true, on: false } : x)))}
                          />
                        )}
                        <span className="absolute top-1 left-1"><Checkbox checked={p.on && !p.broken} tabIndex={-1} /></span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Fields */}
              <div className="rounded-lg border divide-y">
                {FIELDS.map((f) => {
                  const has = (values[f.key] ?? "").trim() !== "";
                  const cur = currentOf(current, f.key);
                  return (
                    <div key={f.key} className="grid grid-cols-[auto_8rem_1fr] gap-3 p-3 items-start">
                      <Checkbox
                        className="mt-2.5"
                        checked={!!ticked[f.key] && has}
                        disabled={!has}
                        onCheckedChange={(c) => setTicked((prev) => ({ ...prev, [f.key]: c === true }))}
                      />
                      <div className="pt-2 text-sm font-medium leading-tight">
                        {f.label}
                        {aiFilled.has(f.key) && <Sparkles className="inline w-3 h-3 ml-1 text-violet-500" aria-label="Filled by Claude" />}
                        {!has && !(f.key === "category" && categoryHint) && <Badge variant="outline" className="mt-1 text-[10px] font-normal text-amber-700 border-amber-300 dark:text-amber-400">Not on page</Badge>}
                      </div>
                      <div className="space-y-1 min-w-0">
                        {f.key === "category" ? (
                          <TreeCategorySelect
                            categories={categories}
                            value={values.category ?? ""}
                            onChange={(v) => { setValues((prev) => ({ ...prev, category: v })); setTicked((prev) => ({ ...prev, category: !!v })); }}
                            onCreateCategory={onCreateCategory}
                            placeholder="Pick a category"
                          />
                        ) : f.long ? (
                          <Textarea rows={f.key === "description" ? 5 : 4} value={values[f.key] ?? ""} onChange={(e) => setValue(f.key, e.target.value)}
                            placeholder={has ? undefined : "Not found — type it here to add it"} />
                        ) : (
                          <Input value={values[f.key] ?? ""} onChange={(e) => setValue(f.key, e.target.value)}
                            inputMode={f.numeric ? "decimal" : undefined} noPhoneFormat
                            placeholder={has ? undefined : "Not found — type it here to add it"} />
                        )}
                        {f.key === "brand" && has && (
                          <p className="text-[11px] text-muted-foreground">{brandMatch ? `Matches your brand "${brandMatch.name}".` : `New brand — "${values.brand!.trim()}" will be created.`}</p>
                        )}
                        {f.key === "category" && categoryHint && (
                          <p className="text-[11px] text-muted-foreground">
                            {has ? `The page files it under "${categoryHint}".` : `The page files it under "${categoryHint}" — you have no category by that name. Pick one, or use New in the list to create it.`}
                          </p>
                        )}
                        {f.key === "supplier" && has && (
                          <p className="text-[11px] text-muted-foreground">
                            {result?.site.supplier && supplierMatch?.id === result.site.supplier.id
                              ? `Your supplier — its website is ${result.site.host}.`
                              : supplierMatch
                                ? `Matches your supplier "${supplierMatch.name}".`
                                : `No supplier has ${result?.site.host} as its website — "${values.supplier!.trim()}" will be created with it, so the next import from this site matches.`}
                          </p>
                        )}
                        {f.key === "warranty" && has && (
                          <p className={cn("text-[11px]", warranty ? "text-muted-foreground" : "text-destructive")}>
                            {warranty ? `Sets ${warranty.duration} ${warranty.unit}.` : "Couldn't read a length of time from this — write e.g. \"12 months\"."}
                          </p>
                        )}
                        {f.hint && <p className="text-[11px] text-muted-foreground">{f.hint}</p>}
                        {cur && has && (
                          <p className="text-[11px] text-amber-700 dark:text-amber-400">
                            The form already has {f.key === "brand" || f.key === "category" ? "one" : `"${cur.length > 60 ? `${cur.slice(0, 60)}…` : cur}"`} — tick to replace it.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0 gap-2">
          {busy && <span className="text-sm text-muted-foreground mr-auto flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {busy}</span>}
          <Button variant="outline" onClick={() => close(false)} disabled={!!busy}>Cancel</Button>
          <Button onClick={apply} disabled={!result || !!busy || tickedCount === 0}>
            Apply {tickedCount > 0 ? `${tickedCount} item${tickedCount === 1 ? "" : "s"}` : ""} to form
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
