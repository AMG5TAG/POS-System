import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { useListProducts, useCreateProduct, type Product } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import {
  Search, X, Plus, ChevronRight, AlertTriangle, Settings,
  ShoppingCart, Save, RotateCcw, Check, Package, Layers,
} from "lucide-react";
import {
  PC_PART_SLOTS, loadPCCompat, loadPCBuilderSettings,
  type PCCompatMap, type PCBuilderSettings,
} from "./management-calculators-pc-builder";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type Build = Record<string, number | null>; // slotId → productId

interface CompatWarning {
  slotA: string;
  slotB: string;
  message: string;
}

/* ─── Slot picker ────────────────────────────────────────────────────────── */

function SlotPicker({
  slotId,
  slotLabel,
  products,
  selectedId,
  onSelect,
  compatMap,
}: {
  slotId: string;
  slotLabel: string;
  products: Product[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  compatMap: PCCompatMap;
}) {
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState("");
  const ref                 = useRef<HTMLDivElement>(null);

  const tagged = products.filter((p) => compatMap[p.id.toString()]?.partType === slotId);
  const filtered = tagged.filter((p) =>
    !query || p.name.toLowerCase().includes(query.toLowerCase()) ||
    (p.sku || "").toLowerCase().includes(query.toLowerCase())
  );
  const selected = products.find((p) => p.id === selectedId) || null;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      {selected ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{selected.name}</p>
            {selected.sku && <p className="text-xs text-muted-foreground">SKU: {selected.sku}</p>}
            {compatMap[selected.id.toString()]?.socket && (
              <p className="text-xs text-muted-foreground">
                Socket: {compatMap[selected.id.toString()].socket}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => { onSelect(null); setQuery(""); }}
            className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed text-sm transition-colors text-left",
            tagged.length === 0
              ? "border-muted-foreground/20 text-muted-foreground/50 cursor-default"
              : "border-primary/30 text-muted-foreground hover:border-primary hover:text-foreground hover:bg-primary/5"
          )}
        >
          <Plus className="w-3.5 h-3.5 shrink-0" />
          {tagged.length === 0
            ? `No ${slotLabel} products configured`
            : `Choose a ${slotLabel}…`}
        </button>
      )}

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-80 bg-background border rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted/50">
              <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${slotLabel}…`}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {tagged.length === 0
                  ? "No products are tagged as this part type. Go to Products → Compatibility to set up."
                  : "No results for your search."}
              </p>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { onSelect(p.id); setOpen(false); setQuery(""); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/60 text-left transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.sku ? `SKU: ${p.sku} · ` : ""}
                      {formatCurrency(p.price)}
                      {compatMap[p.id.toString()]?.socket ? ` · ${compatMap[p.id.toString()].socket}` : ""}
                    </p>
                  </div>
                  {p.stockQuantity !== null && p.stockQuantity !== undefined && p.trackInventory && (
                    <Badge variant={p.stockQuantity > 0 ? "secondary" : "destructive"} className="text-[10px]">
                      {p.stockQuantity > 0 ? `${p.stockQuantity} in stock` : "Out of stock"}
                    </Badge>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Compatibility checker ──────────────────────────────────────────────── */

function checkCompatibility(build: Build, products: Product[], compatMap: PCCompatMap): CompatWarning[] {
  const warnings: CompatWarning[] = [];
  const getSocket = (slotId: string): string | null => {
    const pid = build[slotId];
    if (!pid) return null;
    return compatMap[pid.toString()]?.socket?.trim().toUpperCase() || null;
  };

  const cpuSocket = getSocket("cpu");
  const mbSocket  = getSocket("motherboard");
  if (cpuSocket && mbSocket && cpuSocket !== mbSocket) {
    warnings.push({ slotA: "cpu", slotB: "motherboard", message: `CPU socket (${cpuSocket}) doesn't match Motherboard socket (${mbSocket})` });
  }
  return warnings;
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function POSPCBuilderPage() {
  const [, navigate] = useLocation();

  const { data: productsData, isLoading } = useListProducts(
    { limit: 1000 },
    { query: { queryKey: ["products"] } }
  );
  const products = (productsData?.items || []) as Product[];

  const [compatMap, setCompatMap]       = useState<PCCompatMap>(() => loadPCCompat());
  const [settings, setSettings]         = useState<PCBuilderSettings>(() => loadPCBuilderSettings());
  const [buildName, setBuildName]       = useState("Custom PC Build");
  const [build, setBuild]               = useState<Build>({});
  const [showAllSlots, setShowAllSlots] = useState(false);
  const [assemblyHours, setAssemblyHours] = useState(() => Math.round(loadPCBuilderSettings().assemblyTimeMinutes / 60));
  const [bundleDialogOpen, setBundleDialogOpen] = useState(false);
  const [bundleName, setBundleName] = useState("");

  const createProductMutation = useCreateProduct();

  const markupNum = settings.applyDefaultMarkup ? settings.defaultMarkup : 0;

  const visibleSlots = useMemo(() => {
    return PC_PART_SLOTS.filter((s) =>
      showAllSlots || settings.enabledSlots.includes(s.id)
    );
  }, [settings.enabledSlots, showAllSlots]);

  const hiddenCount = PC_PART_SLOTS.length - settings.enabledSlots.length;

  const setSlot = (slotId: string, productId: number | null) => {
    setBuild((prev) => ({ ...prev, [slotId]: productId }));
  };

  /* ── Totals ── */
  const selectedProducts = useMemo(() => {
    return Object.entries(build)
      .filter(([, id]) => id !== null)
      .map(([slotId, id]) => {
        const product = products.find((p) => p.id === id);
        return product ? { slotId, product } : null;
      })
      .filter(Boolean) as { slotId: string; product: Product }[];
  }, [build, products]);

  const partsTotal     = selectedProducts.reduce((s, { product }) => s + product.price, 0);
  const laborCost      = settings.laborRate * assemblyHours;
  const markupAmount   = (partsTotal + laborCost) * (markupNum / 100);
  const subtotal       = partsTotal + laborCost + markupAmount;
  const gstAmount      = settings.includeGST ? subtotal / 11 : 0;
  const total          = subtotal;

  /* ── Compatibility ── */
  const warnings = useMemo(() => {
    if (!settings.showCompatWarnings) return [];
    return checkCompatibility(build, products, compatMap);
  }, [build, products, compatMap, settings.showCompatWarnings]);

  const handleClear = () => {
    setBuild({});
    setBuildName("Custom PC Build");
  };

  const handleSaveQuote = () => {
    const saved = JSON.parse(localStorage.getItem("koapos_pc_builds") || "[]");
    saved.unshift({
      id: Date.now(),
      name: buildName,
      build,
      total,
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem("koapos_pc_builds", JSON.stringify(saved.slice(0, 20)));
    toast.success(`Build "${buildName}" saved`);
  };

  const handleAddToCart = () => {
    toast.success(`${selectedProducts.length} component(s) added to cart`);
  };

  const handleOpenBundleDialog = () => {
    setBundleName(buildName);
    setBundleDialogOpen(true);
  };

  const handleSaveBundle = () => {
    if (!bundleName.trim()) { toast.error("Bundle name is required"); return; }
    const componentList = selectedProducts
      .map(({ slotId, product }) => {
        const slot = PC_PART_SLOTS.find((s) => s.id === slotId);
        return `${slot?.label ?? slotId}: ${product.name}`;
      })
      .join("\n");
    createProductMutation.mutate(
      {
        data: {
          name: bundleName.trim(),
          price: parseFloat(total.toFixed(2)),
          costPrice: parseFloat((partsTotal + laborCost).toFixed(2)),
          description: `PC Bundle — ${componentCount} component${componentCount !== 1 ? "s" : ""}\n\n${componentList}`,
          trackInventory: false,
          stockQuantity: 1,
          isActive: true,
          productType: "bundle",
        },
      },
      {
        onSuccess: () => {
          toast.success(`Bundle "${bundleName.trim()}" saved to Products`);
          setBundleDialogOpen(false);
        },
        onError: () => toast.error("Failed to save bundle"),
      }
    );
  };

  const componentCount = selectedProducts.length;

  return (
    <AppLayout>
      <div className="w-full px-6 py-6 space-y-5">

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div>
              <h1 className="text-2xl font-bold">PC Builder</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Select components to build a custom PC quote</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" className="gap-1.5"
              onClick={() => navigate("/management/calculators/pc-builder")}>
              <Settings className="w-3.5 h-3.5" /> Settings
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleClear}>
              <RotateCcw className="w-3.5 h-3.5" /> Clear
            </Button>
          </div>
        </div>

        {/* ── Build Name ── */}
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium shrink-0 text-muted-foreground">Build Name</label>
          <Input
            value={buildName}
            onChange={(e) => setBuildName(e.target.value)}
            className="max-w-xs"
            placeholder="e.g. Gaming PC Build"
          />
        </div>

        {/* ── Compatibility warnings ── */}
        {warnings.length > 0 && (
          <div className="space-y-2">
            {warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{w.message}</span>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          {/* ── Component slots ── */}
          <div className="lg:col-span-2 space-y-2">
            <div className="rounded-xl border overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[180px_1fr_100px_36px] gap-3 px-4 py-2.5 bg-muted/40 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <span>Component</span>
                <span>Selection</span>
                <span className="text-right">Price</span>
                <span />
              </div>

              {/* Slot rows */}
              {isLoading ? (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">Loading products…</div>
              ) : (
                visibleSlots.map(({ id, label, icon: Icon }) => {
                  const selectedId = build[id] || null;
                  const product = products.find((p) => p.id === selectedId);
                  const hasWarning = warnings.some((w) => w.slotA === id || w.slotB === id);

                  return (
                    <div
                      key={id}
                      className={cn(
                        "grid grid-cols-[180px_1fr_100px_36px] gap-3 px-4 py-3 border-b last:border-b-0 items-center transition-colors",
                        hasWarning ? "bg-amber-50/50" : "hover:bg-muted/20"
                      )}
                    >
                      {/* Label */}
                      <div className="flex items-center gap-2">
                        <Icon className={cn("w-4 h-4 shrink-0", hasWarning ? "text-amber-500" : "text-muted-foreground")} />
                        <span className="text-sm font-medium">{label}</span>
                      </div>

                      {/* Picker */}
                      <SlotPicker
                        slotId={id}
                        slotLabel={label}
                        products={products}
                        selectedId={selectedId}
                        onSelect={(pid) => setSlot(id, pid)}
                        compatMap={compatMap}
                      />

                      {/* Price */}
                      <div className="text-right text-sm font-medium">
                        {product ? formatCurrency(product.price) : <span className="text-muted-foreground/40">–</span>}
                      </div>

                      {/* Remove */}
                      <div />
                    </div>
                  );
                })
              )}

              {/* Show more / less */}
              {!showAllSlots && hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllSlots(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors border-t"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Show {hiddenCount} more slot{hiddenCount !== 1 ? "s" : ""} (Monitors, Peripherals…)
                </button>
              )}
              {showAllSlots && (
                <button
                  type="button"
                  onClick={() => setShowAllSlots(false)}
                  className="w-full flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors border-t"
                >
                  Show fewer slots
                </button>
              )}
            </div>

            {/* Tagged count info */}
            <p className="text-xs text-muted-foreground px-1">
              {products.filter((p) => Object.keys(compatMap).includes(p.id.toString())).length} of {products.length} products have PC compatibility set.{" "}
              <button type="button" className="text-primary hover:underline"
                onClick={() => navigate("/products")}>
                Configure in Products
              </button>
            </p>
          </div>

          {/* ── Build Summary ── */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-primary" />
                  Build Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {componentCount === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No components selected yet.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedProducts.map(({ slotId, product }) => {
                      const slot = PC_PART_SLOTS.find((s) => s.id === slotId);
                      return (
                        <div key={slotId} className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-muted-foreground truncate flex-1">{slot?.label ?? slotId}</span>
                          <span className="font-medium shrink-0">{formatCurrency(product.price)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                <Separator />

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Parts ({componentCount})</span>
                    <span>{formatCurrency(partsTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground gap-2">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-sm">Assembly</span>
                    </div>
                    <div className="flex items-center gap-1 ml-auto">
                      <input
                        type="number" min="0" step="1"
                        value={assemblyHours}
                        onChange={(e) => setAssemblyHours(parseInt(e.target.value) || 0)}
                        className="w-14 h-6 text-xs text-center rounded border border-input bg-background px-1 focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <span className="text-xs text-muted-foreground">hr</span>
                    </div>
                    <span className="text-sm shrink-0">{formatCurrency(laborCost)}</span>
                  </div>
                  {markupNum > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Markup ({markupNum}%)</span>
                      <span>{formatCurrency(markupAmount)}</span>
                    </div>
                  )}
                  {settings.includeGST && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>GST (10%)</span>
                      <span>{formatCurrency(gstAmount)}</span>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="flex justify-between font-bold text-base">
                  <span>Total</span>
                  <span>{formatCurrency(total)}</span>
                </div>

                {warnings.length > 0 && (
                  <div className="flex items-center gap-1.5 text-amber-600 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {warnings.length} compatibility warning{warnings.length !== 1 ? "s" : ""}
                  </div>
                )}

                <div className="space-y-2 pt-1">
                  <Button
                    className="w-full gap-1.5"
                    disabled={componentCount === 0}
                    onClick={handleAddToCart}
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Add to Cart
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full gap-1.5"
                    disabled={componentCount === 0}
                    onClick={handleOpenBundleDialog}
                  >
                    <Layers className="w-4 h-4" />
                    Save as Bundle
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full gap-1.5 text-muted-foreground"
                    disabled={componentCount === 0}
                    onClick={handleSaveQuote}
                  >
                    <Save className="w-4 h-4" />
                    Save Quote
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Markup info */}
            {componentCount > 0 && (
              <Card className="border-dashed">
                <CardContent className="py-3 px-4">
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div className="flex justify-between">
                      <span>Cost (parts + labour)</span>
                      <span>{formatCurrency(partsTotal + laborCost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Gross margin</span>
                      <span className="text-emerald-600 font-medium">
                        {partsTotal + laborCost > 0
                          ? `${Math.round((markupAmount / (partsTotal + laborCost)) * 100)}%`
                          : "–"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

        </div>
      </div>

      {/* Save as Bundle dialog */}
      <Dialog open={bundleDialogOpen} onOpenChange={setBundleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save as Bundle Product</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm">Bundle Name</Label>
              <Input
                className="mt-1.5"
                value={bundleName}
                onChange={(e) => setBundleName(e.target.value)}
                placeholder="e.g. Gaming PC Build — RTX 4080"
                onKeyDown={(e) => e.key === "Enter" && handleSaveBundle()}
              />
            </div>
            <div className="rounded-lg bg-muted/50 border p-3 space-y-1 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Cost price</span>
                <span>{formatCurrency(partsTotal + laborCost)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Sell price</span>
                <span>{formatCurrency(total)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground text-xs pt-1 border-t mt-1">
                <span>Components</span>
                <span>{componentCount} part{componentCount !== 1 ? "s" : ""}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              The bundle will be saved to your Products catalog and can be sold from the POS register.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBundleDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSaveBundle}
              disabled={!bundleName.trim() || createProductMutation.isPending}
            >
              <Layers className="w-4 h-4 mr-1.5" />
              {createProductMutation.isPending ? "Saving…" : "Save Bundle"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
