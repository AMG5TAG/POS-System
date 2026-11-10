import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import QRCode from "qrcode";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  useListProducts, useListProductPromotions, useSaveProductPromotion, useDeleteProductPromotion,
  useGenerateProductPromotion, useGetPosSettings, useGetLoyaltySettings, getListProductPromotionsQueryKey,
  type Product, type ProductPromotion, type PromoCopy as ApiPromoCopy,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Megaphone, Search, Plus, Printer, Sparkles, X, Loader2, Package, Trash2, Check, Info,
} from "lucide-react";
import { parseHardwareConfig } from "@/lib/hardware-config";
import { printDocument } from "@/lib/print-router";
import { shopOrigin } from "@/lib/public-url";
import {
  buildPromoCardsHtml, emptyPromoCopy, formatPromoPrice, promoPaper, PROMO_SPEC_TILES, SQUARE_SIZES,
  type PromoAssets, type PromoCardData, type PromoCopy, type PromoTemplate, type SquareSize,
} from "@/lib/promo-card";
import classicBg from "@/assets/promo-template-6x4.png";
import productsBg from "@/assets/promo-template-products.png";
import computersBg from "@/assets/promo-template-computers.png";

/* Inventory › Promotions: pick products, let the system draft each card's
   words (Claude when connected, else the product's own description/specs),
   tweak, print. Copy is saved per product so a reprint is one click; name,
   price, photo and QR are always read live. Rendering is lib/promo-card.ts. */

const TEMPLATE_LABEL: Record<PromoTemplate, string> = {
  classic: "Classic — 6×4 portrait",
  products: "Products — square",
  computers: "Computers — square",
};
const REFURB_BANNER = "Refurbished - Works Perfectly - Fully Tested";
const SQUARE_KEY = "kk-promo-square-size";
const SAVE_DELAY_MS = 900;

interface Draft {
  template: PromoTemplate;
  copy: PromoCopy;
  generating?: boolean;
  saving?: boolean;
  dirty?: boolean;
}

function readSquare(): SquareSize {
  try {
    const n = Number(localStorage.getItem(SQUARE_KEY));
    return (SQUARE_SIZES as readonly number[]).includes(n) ? (n as SquareSize) : 6;
  } catch { return 6; }
}

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(typeof r.result === "string" ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch { return null; }
}

/** The API's copy has every field optional; the editor wants them all. */
function normaliseCopy(c: ApiPromoCopy | undefined): PromoCopy {
  const base = emptyPromoCopy();
  const specs = { ...base.specs };
  for (const k of Object.keys(specs) as Array<keyof typeof specs>) specs[k] = c?.specs?.[k] ?? "";
  return {
    headline: c?.headline ?? "", subtitle: c?.subtitle ?? "", banner: c?.banner ?? "",
    features: c?.features ?? [], pitch: c?.pitch ?? "", blurb: c?.blurb ?? "", specs,
  };
}

/** Browser path: print from a hidden iframe once the card's fit script has run. */
function printWhenReady(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;height:900px;border:0;";
  document.body.appendChild(iframe);
  const win = iframe.contentWindow as (Window & { __promoReady?: boolean }) | null;
  const doc = win?.document;
  if (!win || !doc) { iframe.remove(); return; }
  doc.open(); doc.write(html); doc.close();
  const started = Date.now();
  const tick = () => {
    if (!win.__promoReady && Date.now() - started < 4000) { window.setTimeout(tick, 100); return; }
    try { win.focus(); win.print(); } catch { /* the dialog was refused */ }
    window.setTimeout(() => iframe.remove(), 60_000);
  };
  window.setTimeout(tick, 150);
}

export default function InventoryPromotionsPage() {
  const queryClient = useQueryClient();
  const { data: productsData, isLoading: productsLoading } = useListProducts(
    { limit: 100000 }, { query: { queryKey: ["products", "promotions-full"] } },
  );
  const { data: saved = [] } = useListProductPromotions();
  const { data: posSettings } = useGetPosSettings({ query: { queryKey: ["pos-settings"] } });
  const { data: loyalty } = useGetLoyaltySettings();
  const saveMutation = useSaveProductPromotion();
  const deleteMutation = useDeleteProductPromotion();
  const generateMutation = useGenerateProductPromotion();

  const hardware = useMemo(() => parseHardwareConfig(posSettings?.hardwareConfig), [posSettings]);
  const products = useMemo(() => productsData?.items ?? [], [productsData]);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const savedById = useMemo(() => new Map(saved.map((s) => [s.productId, s])), [saved]);

  const [search, setSearch] = useState("");
  const [queue, setQueue] = useState<number[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [square, setSquare] = useState<SquareSize>(readSquare);
  const [backgrounds, setBackgrounds] = useState<PromoAssets["backgrounds"] | null>(null);
  const [photos, setPhotos] = useState<Record<number, string | null>>({});
  const [qrs, setQrs] = useState<Record<number, string>>({});
  const [aiNote, setAiNote] = useState<"none" | "failed" | null>(null);
  const saveTimers = useRef<Record<number, number>>({});
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  // The K coin reads "Earn 1% Kredit back as store credit" in the artwork.
  const showLoyaltyCoin = !!loyalty?.isEnabled && loyalty.programType === "cashback"
    && Math.abs((loyalty.cashbackRate ?? 0) - 0.01) < 1e-9;

  useEffect(() => {
    let live = true;
    void Promise.all([toDataUrl(classicBg), toDataUrl(productsBg), toDataUrl(computersBg)]).then(([c, p, k]) => {
      if (live && c && p && k) setBackgrounds({ classic: c, products: p, computers: k });
    });
    return () => { live = false; };
  }, []);

  useEffect(() => { try { localStorage.setItem(SQUARE_KEY, String(square)); } catch { /* per-device nicety */ } }, [square]);

  // Photo + QR for each queued product, fetched once.
  useEffect(() => {
    for (const id of queue) {
      const p = productById.get(id);
      if (!p) continue;
      if (!(id in photos)) {
        setPhotos((m) => ({ ...m, [id]: null }));
        if (p.imageUrl) void toDataUrl(p.imageUrl).then((d) => setPhotos((m) => ({ ...m, [id]: d })));
      }
      if (!qrs[id]) {
        void QRCode.toDataURL(`${shopOrigin()}/product/${id}`, {
          margin: 1, width: 360, errorCorrectionLevel: "M", color: { dark: "#007b7d", light: "#ffffff" },
        }).then((d) => setQrs((m) => ({ ...m, [id]: d })));
      }
    }
  }, [queue, productById, photos, qrs]);

  const persist = useCallback((productId: number) => {
    const d = draftsRef.current[productId];
    if (!d) return;
    setDrafts((m) => ({ ...m, [productId]: { ...m[productId]!, saving: true } }));
    saveMutation.mutate({ productId, data: { template: d.template, copy: d.copy } }, {
      onSuccess: (row) => {
        queryClient.setQueryData<ProductPromotion[]>(getListProductPromotionsQueryKey(), (old) =>
          [...(old ?? []).filter((r) => r.productId !== productId), row]);
        setDrafts((m) => m[productId] ? { ...m, [productId]: { ...m[productId]!, saving: false, dirty: false } } : m);
      },
      onError: () => {
        setDrafts((m) => m[productId] ? { ...m, [productId]: { ...m[productId]!, saving: false } } : m);
        toast.error("Couldn't save the promo copy");
      },
    });
  }, [saveMutation, queryClient]);

  const scheduleSave = useCallback((productId: number) => {
    window.clearTimeout(saveTimers.current[productId]);
    saveTimers.current[productId] = window.setTimeout(() => persist(productId), SAVE_DELAY_MS);
  }, [persist]);

  const update = (productId: number, patch: Partial<Draft>) => {
    setDrafts((m) => ({ ...m, [productId]: { ...m[productId]!, ...patch, dirty: true } }));
    scheduleSave(productId);
  };
  const updateCopy = (productId: number, patch: Partial<PromoCopy>) => {
    const d = draftsRef.current[productId];
    if (d) update(productId, { copy: { ...d.copy, ...patch } });
  };

  const generate = useCallback(async (productId: number, keep?: Draft) => {
    setDrafts((m) => ({
      ...m,
      [productId]: { ...(m[productId] ?? keep ?? { template: "products", copy: emptyPromoCopy() }), generating: true },
    }));
    try {
      const res = await generateMutation.mutateAsync({ productId });
      setAiNote(res.source === "ai" ? null : res.aiError ? "failed" : "none");
      setDrafts((m) => {
        const prev = m[productId];
        const copy = normaliseCopy(res.copy);
        // A regenerate keeps what staff typed over the product's own name and banner.
        if (prev?.copy.headline) copy.headline = prev.copy.headline;
        if (keep && prev?.copy.banner) copy.banner = prev.copy.banner;
        return {
          ...m,
          [productId]: { template: keep ? prev!.template : res.suggestedTemplate, copy, generating: false, dirty: true },
        };
      });
      scheduleSave(productId);
    } catch {
      toast.error("Couldn't draft the promo copy");
      setDrafts((m) => ({ ...m, [productId]: { ...(m[productId] ?? { template: "products", copy: emptyPromoCopy() }), generating: false } }));
    }
  }, [generateMutation, scheduleSave]);

  const addToQueue = (productId: number) => {
    if (queue.includes(productId)) return;
    setQueue((q) => [productId, ...q]);
    const s = savedById.get(productId);
    if (s) setDrafts((m) => ({ ...m, [productId]: { template: s.template, copy: normaliseCopy(s.copy) } }));
    else void generate(productId);
  };

  const removeFromQueue = (productId: number) => {
    // Flush a pending save rather than drop the last edit.
    if (saveTimers.current[productId] && draftsRef.current[productId]?.dirty) {
      window.clearTimeout(saveTimers.current[productId]);
      persist(productId);
    }
    setQueue((q) => q.filter((id) => id !== productId));
  };

  const forget = (productId: number) => {
    deleteMutation.mutate({ productId }, {
      onSuccess: () => {
        queryClient.setQueryData<ProductPromotion[]>(getListProductPromotionsQueryKey(), (old) =>
          (old ?? []).filter((r) => r.productId !== productId));
        toast.success("Saved promo copy removed");
      },
    });
  };

  const cardFor = (productId: number): PromoCardData | null => {
    const p = productById.get(productId);
    const d = drafts[productId];
    if (!p || !d) return null;
    return {
      template: d.template, copy: d.copy, productName: p.name, price: Number(p.price) || 0,
      photo: photos[productId] ?? null, qr: qrs[productId] ?? null,
    };
  };

  const print = async (ids: number[]) => {
    if (!backgrounds) { toast.error("The templates are still loading"); return; }
    const cards = ids.map(cardFor).filter((c): c is PromoCardData => !!c);
    if (!cards.length) return;
    for (const id of ids) if (draftsRef.current[id]?.dirty) { window.clearTimeout(saveTimers.current[id]); persist(id); }

    // One job per paper size: `@page` is per document.
    const groups = new Map<string, PromoCardData[]>();
    for (const c of cards) {
      const paper = promoPaper(c.template, square);
      const key = `${paper.w}x${paper.h}`;
      groups.set(key, [...(groups.get(key) ?? []), c]);
    }
    const assets: PromoAssets = { backgrounds, showLoyaltyCoin };
    for (const [size, group] of groups) {
      const html = buildPromoCardsHtml(group, assets, square);
      try {
        const method = await printDocument({
          purpose: "promotion", hw: hardware, paper: "auto",
          jobName: `Promo cards ${size.replace("x", "×")}in`,
          html: () => html,
          browserFallback: () => printWhenReady(html),
        });
        if (method !== "browser") toast.success(`Sent ${group.length} ${size.replace("x", "×")}in card${group.length === 1 ? "" : "s"} to the printer`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't print the promo cards");
      }
    }
  };

  const term = search.trim().toLowerCase();
  const results = useMemo(() => {
    if (!term) return [];
    return products
      .filter((p) => p.isActive !== false)
      .filter((p) => p.name.toLowerCase().includes(term) || (p.sku ?? "").toLowerCase().includes(term) || (p.barcode ?? "").toLowerCase().includes(term))
      .slice(0, 30);
  }, [products, term]);

  const savedProducts = useMemo(
    () => saved.map((s) => productById.get(s.productId)).filter((p): p is Product => !!p)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [saved, productById],
  );

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Megaphone className="w-6 h-6 text-primary" /> Promotions</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Print promo cards for products on the shelf. Features and a sales pitch are drafted for you; name, price, photo and QR come straight from the product.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Label className="text-xs text-muted-foreground">Square cards print at</Label>
            <Select value={String(square)} onValueChange={(v) => setSquare(Number(v) as SquareSize)}>
              <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SQUARE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}×{s} in</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={() => void print(queue)} disabled={!queue.length || !backgrounds}>
              <Printer className="w-4 h-4 mr-1.5" /> Print all{queue.length ? ` (${queue.length})` : ""}
            </Button>
          </div>
        </div>

        {aiNote && (
          <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
            <Info className="w-4 h-4 mt-0.5 text-primary shrink-0" />
            <div className="flex-1">
              {aiNote === "failed"
                ? "Claude couldn't write the last card, so it was filled from the product's description and specs."
                : <>The last card was filled from the product's description and specs. Connect Claude under{" "}
                    <Link href="/management/settings-integrations/integrations" className="underline">Management › Integrations › AI Providers</Link>{" "}
                    to have the features and pitch written for you.</>}
            </div>
            <button className="text-muted-foreground hover:text-foreground" onClick={() => setAiNote(null)} aria-label="Dismiss"><X className="w-4 h-4" /></button>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(300px,1fr)_minmax(0,2.4fr)] gap-6 items-start">
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Add products</CardTitle>
                <CardDescription>Search by name, SKU or barcode.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-8" placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                {productsLoading && <p className="text-xs text-muted-foreground">Loading products…</p>}
                {term && !results.length && !productsLoading && <p className="text-xs text-muted-foreground">No products match.</p>}
                <div className="divide-y max-h-[420px] overflow-y-auto">
                  {results.map((p) => (
                    <ProductRow key={p.id} p={p} saved={savedById.has(p.id)} queued={queue.includes(p.id)} onAdd={() => addToQueue(p.id)} />
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Saved promos</CardTitle>
                <CardDescription>Products whose card copy has been kept. Add one to reprint it at today's price.</CardDescription>
              </CardHeader>
              <CardContent>
                {!savedProducts.length
                  ? <p className="text-sm text-muted-foreground">None yet — every card you make is saved here.</p>
                  : (
                    <div className="divide-y max-h-[420px] overflow-y-auto">
                      {savedProducts.map((p) => (
                        <ProductRow key={p.id} p={p} saved queued={queue.includes(p.id)} onAdd={() => addToQueue(p.id)} onForget={() => forget(p.id)} />
                      ))}
                    </div>
                  )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {!queue.length && (
              <Card>
                <CardContent className="py-16 text-center text-muted-foreground">
                  <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="font-medium text-foreground">No cards yet</p>
                  <p className="text-sm mt-1">Add a product on the left and its card is drafted automatically.</p>
                </CardContent>
              </Card>
            )}
            {queue.map((id) => {
              const p = productById.get(id);
              const d = drafts[id];
              if (!p || !d) return null;
              const card = cardFor(id);
              return (
                <PromoEditor
                  key={id}
                  product={p}
                  draft={d}
                  previewHtml={backgrounds && card ? buildPromoCardsHtml([card], { backgrounds, showLoyaltyCoin }, square) : null}
                  paper={promoPaper(d.template, square)}
                  onTemplate={(t) => update(id, { template: t })}
                  onCopy={(patch) => updateCopy(id, patch)}
                  onRegenerate={() => void generate(id, d)}
                  onPrint={() => void print([id])}
                  onRemove={() => removeFromQueue(id)}
                />
              );
            })}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function ProductRow({ p, saved, queued, onAdd, onForget }: {
  p: Product; saved: boolean; queued: boolean; onAdd: () => void; onForget?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      {p.imageUrl
        ? <img src={p.imageUrl} alt="" className="w-10 h-10 rounded object-cover bg-muted shrink-0" />
        : <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0"><Package className="w-4 h-4 text-muted-foreground" /></div>}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{p.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {formatPromoPrice(Number(p.price) || 0)}{p.sku ? ` · ${p.sku}` : ""}
          {saved && <Badge variant="secondary" className="ml-2 text-[10px] py-0">Saved</Badge>}
        </p>
      </div>
      {onForget && (
        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={onForget} title="Forget saved copy">
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
      <Button size="sm" variant={queued ? "ghost" : "outline"} disabled={queued} onClick={onAdd}>
        {queued ? <><Check className="w-4 h-4 mr-1" />Added</> : <><Plus className="w-4 h-4 mr-1" />Add</>}
      </Button>
    </div>
  );
}

function PromoEditor({ product, draft, previewHtml, paper, onTemplate, onCopy, onRegenerate, onPrint, onRemove }: {
  product: Product;
  draft: Draft;
  previewHtml: string | null;
  paper: { w: number; h: number };
  onTemplate: (t: PromoTemplate) => void;
  onCopy: (patch: Partial<PromoCopy>) => void;
  onRegenerate: () => void;
  onPrint: () => void;
  onRemove: () => void;
}) {
  const { template, copy } = draft;
  const square = template !== "classic";
  const features = [0, 1, 2, 3, 4].map((i) => copy.features[i] ?? "");
  const setFeature = (i: number, v: string) => {
    // Blank rows stay in place while editing; the renderer skips them and
    // the server drops them on save.
    const next = [...features];
    next[i] = v;
    onCopy({ features: next });
  };

  // Preview at a fixed width; the iframe renders at true size and is scaled down.
  const PREVIEW_W = 300;
  const pxW = paper.w * 96;
  const pxH = paper.h * 96;
  const scale = PREVIEW_W / pxW;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base truncate">{product.name}</CardTitle>
            <CardDescription>
              {formatPromoPrice(Number(product.price) || 0)} · {paper.w}×{paper.h} in
              {draft.saving ? " · Saving…" : draft.dirty ? " · Unsaved" : " · Saved"}
            </CardDescription>
          </div>
          <Select value={template} onValueChange={(v) => onTemplate(v as PromoTemplate)}>
            <SelectTrigger className="w-52 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(TEMPLATE_LABEL) as PromoTemplate[]).map((t) => <SelectItem key={t} value={t}>{TEMPLATE_LABEL[t]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={onRegenerate} disabled={draft.generating}>
            {draft.generating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
            Redraft
          </Button>
          <Button size="sm" onClick={onPrint} disabled={!previewHtml || draft.generating}><Printer className="w-4 h-4 mr-1" />Print</Button>
          <Button size="icon" variant="ghost" className="h-9 w-9" onClick={onRemove} title="Remove from this batch"><X className="w-4 h-4" /></Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-6 items-start">
          <div className={`space-y-3 ${draft.generating ? "opacity-50 pointer-events-none" : ""}`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Name on the card">
                <Input value={copy.headline} placeholder={product.name} onChange={(e) => onCopy({ headline: e.target.value })} maxLength={80} />
              </Field>
              {square && (
                <Field label="Subtitle">
                  <Input value={copy.subtitle} placeholder="e.g. 128GB Android tablet - WiFi" onChange={(e) => onCopy({ subtitle: e.target.value })} maxLength={80} />
                </Field>
              )}
            </div>

            {square && (
              <Field label="Condition banner" hint="Leave blank for new stock.">
                <div className="flex gap-2">
                  <Input value={copy.banner} placeholder="Blank strip" onChange={(e) => onCopy({ banner: e.target.value })} maxLength={80} />
                  {copy.banner !== REFURB_BANNER && (
                    <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => onCopy({ banner: REFURB_BANNER })}>Refurbished</Button>
                  )}
                </div>
              </Field>
            )}

            {template === "computers" ? (
              <div>
                <Label className="text-xs">Spec tiles</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                  {PROMO_SPEC_TILES.map(({ key, label }) => (
                    <Input key={key} value={copy.specs[key]} placeholder={label} maxLength={30}
                      onChange={(e) => onCopy({ specs: { ...copy.specs, [key]: e.target.value } })} />
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <Label className="text-xs">Top 5 features</Label>
                <div className="space-y-2 mt-1">
                  {features.map((f, i) => (
                    <Input key={i} value={f} placeholder={`Feature ${i + 1}`} maxLength={60} onChange={(e) => setFeature(i, e.target.value)} />
                  ))}
                </div>
              </div>
            )}

            <Field label={square ? "Pitch heading" : "Sales pitch"}>
              <Input value={copy.pitch} placeholder={square ? "e.g. Tablet for the family" : "e.g. Best on the market for performance"}
                onChange={(e) => onCopy({ pitch: e.target.value })} maxLength={120} />
            </Field>
            {square && (
              <Field label="Pitch">
                <Textarea rows={3} value={copy.blurb} maxLength={220} placeholder="One or two sentences on who it suits and why."
                  onChange={(e) => onCopy({ blurb: e.target.value })} />
              </Field>
            )}
            {square && !product.imageUrl && (
              <p className="text-xs text-amber-600">This product has no photo, so the photo area prints blank. Add one in Products › Media.</p>
            )}
          </div>

          <div className="mx-auto">
            <div className="rounded-md border shadow-sm overflow-hidden bg-white" style={{ width: PREVIEW_W, height: pxH * scale }}>
              {previewHtml
                ? (
                  <iframe
                    title={`Preview of ${product.name}`}
                    srcDoc={previewHtml}
                    sandbox="allow-scripts"
                    style={{ width: pxW, height: pxH, border: 0, transform: `scale(${scale})`, transformOrigin: "0 0" }}
                  />
                )
                : <div className="w-full h-full flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}{hint && <span className="text-muted-foreground font-normal ml-1">{hint}</span>}</Label>
      {children}
    </div>
  );
}
