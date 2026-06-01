import { useState, useCallback, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import {
  useListInventory, useUpdateInventory, useListSuppliers,
  useListStockTakes, useCreateStockTake, useSaveStockTakeProgress, useSubmitStockTake,
  useDeleteStockTake,
  useCreatePurchaseOrder,
} from "@workspace/api-client-react";
import type { StockTake, StockTakeLine } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Boxes, AlertTriangle, ShoppingCart, ClipboardList, History,
  ChevronUp, ChevronDown, ChevronsUpDown, Plus, Minus,
  ChevronLeft, ChevronRight, Search, X, CheckCircle2, TrendingUp, TrendingDown,
  ArrowLeft, Save, SendHorizonal, Trash2, ChevronRightIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type SortKey = "name" | "stock" | "threshold" | "status";
type SortDir  = "asc" | "desc";
type PageView = "inventory" | "stocktake" | "history";

interface InventoryItem {
  productId: number;
  productName: string;
  sku?: string | null;
  trackInventory: boolean;
  stockQuantity: number;
  lowStockThreshold: number | null;
  isLowStock: boolean;
}

const PAGE_SIZE = 50;

/* ─── Sort header ────────────────────────────────────────────────────────── */

function SortTh({ label, sortKey, active, dir, onSort, className, align = "left" }: {
  label: string; sortKey: SortKey; active: SortKey; dir: SortDir;
  onSort: (k: SortKey) => void; className?: string; align?: "left" | "right";
}) {
  const isActive = active === sortKey;
  return (
    <th className={cn("p-3 font-medium whitespace-nowrap cursor-pointer select-none group", align === "right" ? "text-right" : "text-left", className)}
      onClick={() => onSort(sortKey)}>
      <span className={cn("inline-flex items-center gap-1 hover:text-foreground transition-colors", align === "right" && "flex-row-reverse")}>
        {label}
        <span className={cn("transition-colors", isActive ? "text-foreground" : "text-muted-foreground/40 group-hover:text-muted-foreground")}>
          {isActive ? dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" /> : <ChevronsUpDown className="w-3 h-3" />}
        </span>
      </span>
    </th>
  );
}

/* ─── Reorder quantities state ──────────────────────────────────────────── */

type ReorderLines = Record<number, { qty: number; unitCost: string; selected: boolean }>;

/* ─── Variance indicator ─────────────────────────────────────────────────── */

function VarianceBadge({ variance }: { variance: number | null }) {
  if (variance === null) return <span className="text-muted-foreground text-xs">—</span>;
  if (variance === 0)    return <Badge variant="secondary" className="text-xs">No change</Badge>;
  const positive = variance > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold", positive ? "text-emerald-600" : "text-red-600")}>
      {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {positive ? "+" : ""}{variance}
    </span>
  );
}

/* ─── History detail dialog ──────────────────────────────────────────────── */

function HistoryDetailDialog({ take, onClose }: { take: StockTake; onClose: () => void }) {
  const [catFilter, setCatFilter] = useState<string>("all");
  const categories = [...new Set(take.lines.map(l => l.categoryName ?? "Uncategorised"))].sort();
  const filtered = catFilter === "all" ? take.lines : take.lines.filter(l => (l.categoryName ?? "Uncategorised") === catFilter);
  const adjustments = take.lines.filter(l => l.variance !== null && l.variance !== 0).length;

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" />
            Stock Take — {format(new Date(take.startedAt), "d MMM yyyy, h:mm a")}
          </DialogTitle>
          <DialogDescription>
            {take.countedLines} of {take.totalLines} products counted · {adjustments} adjustment{adjustments !== 1 ? "s" : ""}
            {take.appliedAt && ` · Applied ${format(new Date(take.appliedAt), "d MMM yyyy, h:mm a")}`}
          </DialogDescription>
        </DialogHeader>

        {/* Category filter */}
        {categories.length > 1 && (
          <div className="flex gap-1.5 flex-wrap pb-1">
            {["all", ...categories].map(c => (
              <button key={c} onClick={() => setCatFilter(c)}
                className={cn("px-2.5 py-1 rounded-full text-xs font-medium transition-colors border",
                  catFilter === c
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-muted hover:border-foreground/30")}>
                {c === "all" ? "All" : c}
              </button>
            ))}
          </div>
        )}

        <div className="overflow-y-auto flex-1 rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b sticky top-0">
              <tr>
                <th className="p-3 text-left font-medium">Product</th>
                <th className="p-3 text-right font-medium">System Qty</th>
                <th className="p-3 text-right font-medium">Counted</th>
                <th className="p-3 text-right font-medium">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(line => (
                <tr key={line.id} className={cn("bg-background", line.variance !== null && line.variance !== 0 && "bg-amber-50/40")}>
                  <td className="p-3">
                    <p className="font-medium">{line.productName}</p>
                    {line.sku && <p className="text-xs text-muted-foreground font-mono">{line.sku}</p>}
                    {line.categoryName && <p className="text-xs text-muted-foreground">{line.categoryName}</p>}
                  </td>
                  <td className="p-3 text-right text-muted-foreground">{line.systemQty}</td>
                  <td className="p-3 text-right font-semibold">
                    {line.countedQty !== null ? line.countedQty : <span className="text-muted-foreground font-normal">—</span>}
                  </td>
                  <td className="p-3 text-right"><VarianceBadge variance={line.variance ?? null} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Variance review dialog ─────────────────────────────────────────────── */

function VarianceReviewDialog({
  take,
  counts,
  onConfirm,
  onCancel,
  isSubmitting,
}: {
  take: StockTake;
  counts: Record<number, string>;
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  // Merge live counts with existing lines
  const linesWithCounts: (StockTakeLine & { liveCounted: number | null })[] = take.lines.map(l => {
    const raw = counts[l.productId];
    const liveCounted = raw !== undefined && raw !== "" ? parseInt(raw) : (l.countedQty ?? null);
    return { ...l, liveCounted };
  });

  const counted     = linesWithCounts.filter(l => l.liveCounted !== null);
  const uncounted   = linesWithCounts.filter(l => l.liveCounted === null);
  const adjustments = counted.filter(l => l.liveCounted !== l.systemQty);
  const increases   = adjustments.filter(l => (l.liveCounted ?? 0) > l.systemQty);
  const decreases   = adjustments.filter(l => (l.liveCounted ?? 0) < l.systemQty);

  return (
    <Dialog open onOpenChange={onCancel}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SendHorizonal className="w-4 h-4 text-primary" /> Review & Submit Stock Take
          </DialogTitle>
          <DialogDescription>
            {counted.length} of {linesWithCounts.length} products counted.
            {uncounted.length > 0 && ` ${uncounted.length} uncounted product${uncounted.length !== 1 ? "s" : ""} will be skipped.`}
          </DialogDescription>
        </DialogHeader>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border p-3 text-center">
            <p className="text-2xl font-bold">{counted.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Counted</p>
          </div>
          <div className={cn("rounded-lg border p-3 text-center", increases.length > 0 && "border-emerald-200 bg-emerald-50")}>
            <p className={cn("text-2xl font-bold", increases.length > 0 && "text-emerald-600")}>+{increases.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Stock up</p>
          </div>
          <div className={cn("rounded-lg border p-3 text-center", decreases.length > 0 && "border-red-200 bg-red-50")}>
            <p className={cn("text-2xl font-bold", decreases.length > 0 && "text-red-600")}>-{decreases.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Stock down</p>
          </div>
        </div>

        {/* Lines with variances */}
        {adjustments.length > 0 && (
          <div className="overflow-y-auto flex-1 rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b sticky top-0">
                <tr>
                  <th className="p-3 text-left font-medium">Product</th>
                  <th className="p-3 text-right font-medium">System</th>
                  <th className="p-3 text-right font-medium">Counted</th>
                  <th className="p-3 text-right font-medium">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {adjustments.map(l => {
                  const variance = (l.liveCounted ?? 0) - l.systemQty;
                  return (
                    <tr key={l.id}>
                      <td className="p-3 font-medium">{l.productName}</td>
                      <td className="p-3 text-right text-muted-foreground">{l.systemQty}</td>
                      <td className="p-3 text-right font-semibold">{l.liveCounted}</td>
                      <td className="p-3 text-right">
                        <VarianceBadge variance={variance} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {adjustments.length === 0 && counted.length > 0 && (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
            All counted quantities match system stock levels — no adjustments needed.
          </div>
        )}

        {uncounted.length > 0 && (
          <p className="text-xs text-muted-foreground bg-muted/40 rounded p-2">
            <strong>{uncounted.length} uncounted:</strong>{" "}
            {uncounted.slice(0, 5).map(l => l.productName).join(", ")}
            {uncounted.length > 5 ? ` and ${uncounted.length - 5} more` : ""}
            {" "}— these products will not be adjusted.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>Back</Button>
          <Button onClick={onConfirm} disabled={isSubmitting || counted.length === 0}>
            <SendHorizonal className="w-4 h-4" />
            {isSubmitting ? "Applying…" : "Apply Stock Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Stock Take Count View ──────────────────────────────────────────────── */

function StockTakeView({
  take,
  onExit,
  onApplied,
}: {
  take: StockTake;
  onExit: () => void;
  onApplied: (applied: StockTake) => void;
}) {
  const queryClient = useQueryClient();
  const [catFilter, setCatFilter]   = useState<string>("all");
  const [search, setSearch]         = useState("");
  const [counts, setCounts]         = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    for (const l of take.lines) {
      if (l.countedQty !== null) initial[l.productId] = String(l.countedQty);
    }
    return initial;
  });
  const [showReview, setShowReview] = useState(false);
  const [discardDlg, setDiscardDlg] = useState(false);
  const saveMutation    = useSaveStockTakeProgress();
  const submitMutation  = useSubmitStockTake();
  const discardMutation = useDeleteStockTake();

  const categories = [...new Set(take.lines.map(l => l.categoryName ?? "Uncategorised"))].sort();

  const filtered = take.lines.filter(l => {
    if (catFilter !== "all" && (l.categoryName ?? "Uncategorised") !== catFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!l.productName.toLowerCase().includes(q) && !(l.sku ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const countedTotal = Object.values(counts).filter(v => v !== "").length;

  const handleSave = () => {
    const lines = take.lines.map(l => ({
      productId: l.productId,
      countedQty: counts[l.productId] !== undefined && counts[l.productId] !== ""
        ? parseInt(counts[l.productId])
        : null,
    }));
    saveMutation.mutate({ id: take.id, data: { lines } }, {
      onSuccess: () => {
        toast.success("Progress saved");
        queryClient.invalidateQueries({ queryKey: ["stock-takes"] });
      },
      onError: () => toast.error("Failed to save progress"),
    });
  };

  const handleSubmit = () => {
    // First save current counts, then submit
    const lines = take.lines.map(l => ({
      productId: l.productId,
      countedQty: counts[l.productId] !== undefined && counts[l.productId] !== ""
        ? parseInt(counts[l.productId])
        : null,
    }));
    saveMutation.mutate({ id: take.id, data: { lines } }, {
      onSuccess: () => {
        submitMutation.mutate({ id: take.id }, {
          onSuccess: (applied) => {
            toast.success("Stock take applied — inventory updated");
            queryClient.invalidateQueries({ queryKey: ["inventory"] });
            queryClient.invalidateQueries({ queryKey: ["inventory-low-stock"] });
            queryClient.invalidateQueries({ queryKey: ["stock-takes"] });
            onApplied(applied as StockTake);
          },
          onError: () => toast.error("Failed to apply stock take"),
        });
      },
      onError: () => toast.error("Failed to save progress"),
    });
    setShowReview(false);
  };

  function handleDiscard() {
    discardMutation.mutate(
      { id: take.id },
      {
        onSuccess: () => {
          toast.success("Stock take discarded");
          queryClient.invalidateQueries({ queryKey: ["stock-takes"] });
          onExit();
        },
        onError: () => toast.error("Failed to discard stock take"),
        onSettled: () => setDiscardDlg(false),
      }
    );
  }

  const isBusy = saveMutation.isPending || submitMutation.isPending;

  return (
    <div className="flex flex-col gap-0 min-h-0">
      {/* ── Header bar ── */}
      <div className="bg-background border-b px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Button variant="ghost" size="icon" onClick={onExit} className="shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary shrink-0" />
              <h2 className="font-semibold truncate">Stock Take in Progress</h2>
              <Badge variant="secondary" className="shrink-0 text-xs">
                {countedTotal} / {take.lines.length} counted
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Enter the quantity you physically count for each product. System quantities are hidden to avoid anchoring bias.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setDiscardDlg(true)} disabled={isBusy}
            className="gap-1.5 text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60">
            <Trash2 className="w-3.5 h-3.5" /> Discard
          </Button>
          <Button variant="outline" size="sm" onClick={handleSave} disabled={isBusy} className="gap-1.5">
            <Save className="w-3.5 h-3.5" />
            {saveMutation.isPending ? "Saving…" : "Save Progress"}
          </Button>
          <Button size="sm" onClick={() => setShowReview(true)} disabled={isBusy || countedTotal === 0} className="gap-1.5">
            <SendHorizonal className="w-3.5 h-3.5" /> Review &amp; Submit
          </Button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="px-6 py-3 border-b bg-muted/20 flex flex-col sm:flex-row gap-3">
        {/* Category pills */}
        {categories.length > 1 && (
          <div className="flex gap-1.5 flex-wrap flex-1">
            {["all", ...categories].map(c => (
              <button key={c} onClick={() => setCatFilter(c)}
                className={cn("px-2.5 py-1 rounded-full text-xs font-medium transition-colors border",
                  catFilter === c
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-muted hover:border-foreground/30")}>
                {c === "all" ? "All categories" : c}
              </button>
            ))}
          </div>
        )}
        {/* Search */}
        <div className="relative w-full sm:w-64 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 pr-9 h-8 text-sm" />
          {search && (
            <button type="button" onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Product count table ── */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <Search className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-muted-foreground">No products match your filter.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b sticky top-0 z-10">
              <tr>
                <th className="p-3 text-left font-medium">Product</th>
                <th className="p-3 text-left font-medium hidden sm:table-cell">Category</th>
                <th className="p-3 text-right font-medium w-40">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(line => {
                const val = counts[line.productId] ?? "";
                const isCounted = val !== "";
                return (
                  <CountRow
                    key={line.productId}
                    line={line}
                    value={val}
                    isCounted={isCounted}
                    onChange={(v) => setCounts(prev => ({ ...prev, [line.productId]: v }))}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Dialogs ── */}
      {showReview && (
        <VarianceReviewDialog
          take={take}
          counts={counts}
          onConfirm={handleSubmit}
          onCancel={() => setShowReview(false)}
          isSubmitting={isBusy}
        />
      )}

      <Dialog open={discardDlg} onOpenChange={setDiscardDlg}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Discard Stock Take?</DialogTitle>
            <DialogDescription>
              All counted quantities will be lost and inventory will not be updated. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardDlg(false)}>Keep counting</Button>
            <Button variant="destructive" onClick={handleDiscard}>Discard</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Count Row (memoised for performance) ───────────────────────────────── */

function CountRow({
  line, value, isCounted, onChange,
}: {
  line: StockTakeLine;
  value: string;
  isCounted: boolean;
  onChange: (v: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <tr className={cn("bg-background transition-colors", isCounted && "bg-emerald-50/40")}>
      <td className="p-3">
        <p className="font-medium">{line.productName}</p>
        {line.sku && <p className="text-xs text-muted-foreground font-mono">{line.sku}</p>}
        <p className="text-xs text-muted-foreground sm:hidden">{line.categoryName ?? "Uncategorised"}</p>
      </td>
      <td className="p-3 hidden sm:table-cell text-muted-foreground text-sm">
        {line.categoryName ?? <span className="italic text-muted-foreground/50">—</span>}
      </td>
      <td className="p-3">
        <div className="flex items-center justify-end gap-1">
          {isCounted && (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          )}
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
              onClick={() => {
                const cur = parseInt(value) || 0;
                onChange(String(Math.max(0, cur - 1)));
              }}>
              <Minus className="w-3 h-3" />
            </Button>
            <Input
              ref={inputRef}
              type="number"
              min="0"
              value={value}
              onChange={e => onChange(e.target.value)}
              onFocus={e => e.target.select()}
              placeholder="—"
              className="w-20 h-8 text-center text-sm font-semibold p-1"
            />
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
              onClick={() => {
                const cur = parseInt(value) || 0;
                onChange(String(cur + 1));
              }}>
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </td>
    </tr>
  );
}

/* ─── Stock Take History View ────────────────────────────────────────────── */

function HistoryView({ onBack }: { onBack: () => void }) {
  const { data, isLoading } = useListStockTakes({ query: { queryKey: ["stock-takes"] } });
  const [detailTake, setDetailTake] = useState<StockTake | null>(null);

  const takes = ((data as { items?: StockTake[] })?.items ?? []).slice().reverse();

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Stock Take History</h1>
          <p className="text-sm text-muted-foreground">Past stock counts and inventory adjustments.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading history…</div>
      ) : takes.length === 0 ? (
        <div className="rounded-lg border">
          <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <History className="w-16 h-16 text-muted-foreground/30" />
            <div>
              <p className="font-medium text-lg">No stock takes yet</p>
              <p className="text-muted-foreground text-sm">Once you complete a stock take, it will appear here.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="p-3 text-left font-medium">Date</th>
                <th className="p-3 text-left font-medium hidden sm:table-cell">Status</th>
                <th className="p-3 text-right font-medium">Products</th>
                <th className="p-3 text-right font-medium hidden md:table-cell">Counted</th>
                <th className="p-3 text-right font-medium hidden md:table-cell">Adjustments</th>
                <th className="p-3 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {takes.map(take => {
                const adjustments = take.lines.filter(l => l.variance !== null && l.variance !== 0).length;
                return (
                  <tr key={take.id}
                    className="bg-background hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setDetailTake(take)}>
                    <td className="p-3">
                      <p className="font-medium">{format(new Date(take.startedAt), "d MMM yyyy")}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(take.startedAt), "h:mm a")}</p>
                    </td>
                    <td className="p-3 hidden sm:table-cell">
                      {take.status === "applied"
                        ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200"><CheckCircle2 className="w-3 h-3 mr-1" />Applied</Badge>
                        : <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50">Open</Badge>}
                    </td>
                    <td className="p-3 text-right text-muted-foreground">{take.totalLines}</td>
                    <td className="p-3 text-right hidden md:table-cell">{take.countedLines}</td>
                    <td className="p-3 text-right hidden md:table-cell">
                      {adjustments > 0
                        ? <span className="text-amber-700 font-medium">{adjustments}</span>
                        : <span className="text-muted-foreground">0</span>}
                    </td>
                    <td className="p-3 text-right">
                      <ChevronRightIcon className="w-4 h-4 text-muted-foreground" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detailTake && <HistoryDetailDialog take={detailTake} onClose={() => setDetailTake(null)} />}
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const [view, setView]                 = useState<PageView>("inventory");
  const [activeTake, setActiveTake]     = useState<StockTake | null>(null);
  const [startDlg, setStartDlg]         = useState(false);
  const [startNotes, setStartNotes]     = useState("");
  const [showLowStock, setShowLowStock] = useState(false);
  const [search, setSearch]             = useState("");
  const [page, setPage]                 = useState(1);
  const [editingItem, setEditingItem]   = useState<InventoryItem | null>(null);
  const [editForm, setEditForm]         = useState({ stockQuantity: "", lowStockThreshold: "" });
  const [formTouched, setFormTouched]   = useState(false);
  const [sortKey, setSortKey]           = useState<SortKey>("name");
  const [sortDir, setSortDir]           = useState<SortDir>("asc");
  const [checked, setChecked]           = useState<Set<number>>(new Set());

  /* ── Reorder dialog state ── */
  const [reorderDlg, setReorderDlg]     = useState(false);
  const [reorderLines, setReorderLines] = useState<ReorderLines>({});
  const [reorderSupplier, setReorderSupplier] = useState("");
  const [reorderNotes, setReorderNotes] = useState("");
  const [poSaving, setPoSaving]         = useState(false);

  /* Reset to page 1 when filter/search changes */
  useEffect(() => { setPage(1); }, [showLowStock, search]);

  /* ── Main paginated list for the table ── */
  const { data: inventoryData, isLoading } = useListInventory(
    { lowStock: showLowStock || undefined, search: search || undefined, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
    { query: { queryKey: ["inventory", showLowStock, search, page] } }
  );

  /* ── Always-fetched low-stock list for count badge + reorder dialog ── */
  const { data: lowStockData } = useListInventory(
    { lowStock: true, limit: 500 },
    { query: { queryKey: ["inventory-low-stock"] } }
  );

  /* ── Check for an open stock take on load ── */
  const { data: stockTakesData } = useListStockTakes({ query: { queryKey: ["stock-takes"] } });

  const openTake = ((stockTakesData as { items?: StockTake[] })?.items ?? []).find(t => t.status === "open") ?? null;

  const updateMutation = useUpdateInventory();
  const createStockTakeMutation = useCreateStockTake();

  const { data: suppliersData } = useListSuppliers(
    {},
    { query: { queryKey: ["suppliers-reorder"] } }
  );
  const suppliers = (suppliersData as { items?: { id: number; name: string }[] })?.items ?? [];

  const items = ((inventoryData as { items?: InventoryItem[] })?.items ?? []) as InventoryItem[];
  const total = (inventoryData as { total?: number })?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const lowStockItems = ((lowStockData as { items?: InventoryItem[] })?.items ?? []) as InventoryItem[];
  const lowStockCount = (lowStockData as { total?: number })?.total ?? 0;

  const openEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setEditForm({
      stockQuantity: item.stockQuantity.toString(),
      lowStockThreshold: item.lowStockThreshold?.toString() || "5",
    });
  };

  const handleSave = () => {
    if (!editingItem) return;
    updateMutation.mutate(
      {
        productId: editingItem.productId,
        data: {
          stockQuantity: parseInt(editForm.stockQuantity) || 0,
          lowStockThreshold: parseInt(editForm.lowStockThreshold) || 5,
        },
      },
      {
        onSuccess: () => {
          toast.success("Inventory updated");
          setEditingItem(null);
          setFormTouched(false);
          queryClient.invalidateQueries({ queryKey: ["inventory"] });
          queryClient.invalidateQueries({ queryKey: ["inventory-low-stock"] });
        },
        onError: () => toast.error("Failed to update inventory"),
      }
    );
  };

  /* Sort within the current page */
  const sorted = [...items].sort((a, b) => {
    let av: string | number = "", bv: string | number = "";
    switch (sortKey) {
      case "name":      av = a.productName.toLowerCase(); bv = b.productName.toLowerCase(); break;
      case "stock":     av = a.stockQuantity;             bv = b.stockQuantity;             break;
      case "threshold": av = a.lowStockThreshold ?? 0;   bv = b.lowStockThreshold ?? 0;   break;
      case "status":    av = a.isLowStock ? 0 : 1;       bv = b.isLowStock ? 0 : 1;       break;
    }
    const r = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? r : -r;
  });

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => { if (prev === key) { setSortDir((d) => d === "asc" ? "desc" : "asc"); return prev; } setSortDir("asc"); return key; });
  }, []);

  const allChecked = sorted.length > 0 && sorted.every((i) => checked.has(i.productId));
  const toggleAll  = () => setChecked(allChecked ? new Set() : new Set(sorted.map((i) => i.productId)));
  const toggleOne  = (id: number) => setChecked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const sh = (label: string, key: SortKey, className?: string, align?: "left" | "right") => ({
    label, sortKey: key, active: sortKey, dir: sortDir, onSort: handleSort, className, align,
  });

  /* ── Open reorder dialog ── */
  function openReorderDialog() {
    const initial: ReorderLines = {};
    lowStockItems.forEach(i => {
      const suggestedQty = Math.max(1, (i.lowStockThreshold ?? 5) * 3 - i.stockQuantity);
      initial[i.productId] = { qty: suggestedQty, unitCost: "0.00", selected: true };
    });
    setReorderLines(initial);
    setReorderSupplier("");
    setReorderNotes("");
    setFormTouched(false);
    setReorderDlg(true);
  }

  function setLineQty(productId: number, qty: number) {
    setFormTouched(true);
    setReorderLines(prev => ({ ...prev, [productId]: { ...prev[productId], qty: Math.max(1, qty) } }));
  }

  function toggleLine(productId: number) {
    setFormTouched(true);
    setReorderLines(prev => ({ ...prev, [productId]: { ...prev[productId], selected: !prev[productId].selected } }));
  }

  const selectedLines = Object.entries(reorderLines)
    .filter(([, v]) => v.selected)
    .map(([k, v]) => ({ productId: Number(k), quantity: v.qty, unitCost: parseFloat(v.unitCost) || 0 }));

  const { ConfirmDialog: InventoryFormGuard } = useUnsavedChangesGuard(formTouched, {
    title: "Close form?",
    description: "You have unsaved changes in an open form. If you leave now, your changes will be lost.",
  });

  const createPOMutation = useCreatePurchaseOrder();

  function handleCreatePO() {
    if (selectedLines.length === 0) {
      toast.error("Select at least one product");
      return;
    }
    setPoSaving(true);
    createPOMutation.mutate(
      { data: { supplierId: reorderSupplier ? parseInt(reorderSupplier) : undefined, status: "draft", orderDate: new Date().toISOString().slice(0, 10), notes: reorderNotes || `Auto-reorder: ${selectedLines.length} low-stock item(s)`, items: selectedLines } },
      {
        onSuccess: () => {
          toast.success("Draft purchase order created — visit Purchase Orders to review");
          setReorderDlg(false);
          setFormTouched(false);
        },
        onError: () => toast.error("Failed to create purchase order"),
        onSettled: () => setPoSaving(false),
      }
    );
  }

  /* ── Start stock take ── */
  function handleStartStockTake() {
    createStockTakeMutation.mutate(
      { data: { notes: startNotes.trim() || undefined } },
      {
        onSuccess: (take) => {
          toast.success("Stock take started");
          setActiveTake(take as StockTake);
          setView("stocktake");
          setStartDlg(false);
          setStartNotes("");
          setFormTouched(false);
          queryClient.invalidateQueries({ queryKey: ["stock-takes"] });
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
          toast.error(msg ?? "Failed to start stock take");
        },
      }
    );
  }

  /* ── Resume existing open stock take ── */
  function resumeStockTake() {
    if (openTake) {
      setActiveTake(openTake);
      setView("stocktake");
    }
  }

  const pageStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd   = Math.min(page * PAGE_SIZE, total);

  /* ─── History view ─── */
  if (view === "history") {
    return (
      <AppLayout>
        <HistoryView onBack={() => setView("inventory")} />
      </AppLayout>
    );
  }

  /* ─── Stock take counting view ─── */
  if (view === "stocktake" && activeTake) {
    return (
      <AppLayout>
        <StockTakeView
          take={activeTake}
          onExit={() => { setView("inventory"); setActiveTake(null); }}
          onApplied={(applied) => {
            setActiveTake(applied);
            setView("history");
          }}
        />
      </AppLayout>
    );
  }

  /* ─── Normal inventory view ─── */
  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Inventory</h1>
            <p className="text-sm text-muted-foreground">Track stock levels, manage replenishment, and monitor low-stock items.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* History button */}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setView("history")}>
              <History className="w-3.5 h-3.5" /> History
            </Button>

            {/* Resume open take OR start new one */}
            {openTake ? (
              <Button size="sm" className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white" onClick={resumeStockTake}>
                <ClipboardList className="w-3.5 h-3.5" />
                Resume Stock Take
              </Button>
            ) : (
              <Button size="sm" className="gap-1.5" onClick={() => setStartDlg(true)}>
                <ClipboardList className="w-3.5 h-3.5" />
                Start Stock Take
              </Button>
            )}

            {lowStockCount > 0 && (
              <Button variant="outline" size="sm"
                className="gap-1.5 border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100"
                onClick={openReorderDialog}>
                <ShoppingCart className="w-3.5 h-3.5" />
                Reorder {lowStockCount} low-stock item{lowStockCount !== 1 ? "s" : ""}
              </Button>
            )}
            {lowStockCount > 0 && !showLowStock && (
              <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700 bg-amber-50">
                <AlertTriangle className="w-3 h-3" /> {lowStockCount} low stock
              </Badge>
            )}
            <div className="flex items-center gap-2">
              <Switch checked={showLowStock} onCheckedChange={setShowLowStock} />
              <Label>Low stock only</Label>
            </div>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-9"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading inventory...</div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border">
            <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <Boxes className="w-16 h-16 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-lg">
                  {search ? "No products match your search" : showLowStock ? "No low stock items" : "No inventory tracked"}
                </p>
                <p className="text-muted-foreground text-sm">
                  {search
                    ? `No products found for "${search}".`
                    : showLowStock
                    ? "All products are sufficiently stocked."
                    : "Enable inventory tracking on your products to manage stock here."}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="p-3 w-10">
                    <input type="checkbox" checked={allChecked} onChange={toggleAll}
                      className="rounded border-muted-foreground/40 accent-primary" />
                  </th>
                  <SortTh {...sh("Product", "name")} />
                  <th className="p-3 text-left font-medium whitespace-nowrap hidden md:table-cell">SKU</th>
                  <SortTh {...sh("In Stock", "stock", undefined, "right")} />
                  <SortTh {...sh("Alert At", "threshold", "hidden sm:table-cell", "right")} />
                  <SortTh {...sh("Status", "status", "hidden lg:table-cell")} />
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.map((item) => {
                  const isChecked = checked.has(item.productId);
                  return (
                    <tr
                      key={item.productId}
                      className={cn(
                        "bg-background hover:bg-muted/30 transition-colors cursor-pointer",
                        isChecked && "bg-primary/5",
                        item.isLowStock && "bg-amber-50/50",
                      )}
                      onClick={() => openEdit(item)}
                    >
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={isChecked} onChange={() => toggleOne(item.productId)}
                          className="rounded border-muted-foreground/40 accent-primary" />
                      </td>
                      <td className="p-3">
                        <p className="font-medium">{item.productName}</p>
                      </td>
                      <td className="p-3 hidden md:table-cell text-muted-foreground font-mono text-xs">
                        {item.sku || "—"}
                      </td>
                      <td className={cn("p-3 text-right font-bold", item.isLowStock && "text-amber-600")}>
                        {item.trackInventory
                          ? item.stockQuantity
                          : <span className="text-muted-foreground font-normal">∞</span>}
                      </td>
                      <td className="p-3 text-right hidden sm:table-cell text-muted-foreground">
                        {item.lowStockThreshold ?? 5}
                      </td>
                      <td className="p-3 hidden lg:table-cell">
                        {item.isLowStock ? (
                          <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700 bg-amber-50">
                            <AlertTriangle className="w-3 h-3" /> Low Stock
                          </Badge>
                        ) : (
                          <Badge variant="secondary">OK</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* ── Pagination footer ── */}
            {total > PAGE_SIZE && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20 text-sm">
                <span className="text-muted-foreground">
                  {pageStart}–{pageEnd} of {total} items
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline" size="icon" className="h-8 w-8"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                    const p = start + i;
                    return p <= totalPages ? (
                      <Button
                        key={p} size="icon" className="h-8 w-8"
                        variant={p === page ? "default" : "outline"}
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </Button>
                    ) : null;
                  })}
                  <Button
                    variant="outline" size="icon" className="h-8 w-8"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Edit stock dialog ── */}
      <Dialog open={!!editingItem} onOpenChange={(open) => { if (!open) { setEditingItem(null); setFormTouched(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Boxes className="w-4 h-4 text-primary" />
              Update Stock: {editingItem?.productName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Stock Quantity</Label>
              <Input
                type="number"
                value={editForm.stockQuantity}
                onChange={(e) => { setFormTouched(true); setEditForm({ ...editForm, stockQuantity: e.target.value }); }}
                min={0}
              />
            </div>
            <div>
              <Label>Low Stock Alert Threshold</Label>
              <Input
                type="number"
                value={editForm.lowStockThreshold}
                onChange={(e) => { setFormTouched(true); setEditForm({ ...editForm, lowStockThreshold: e.target.value }); }}
                min={0}
              />
              <p className="text-xs text-muted-foreground mt-1">Alert when stock falls to or below this number.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingItem(null); setFormTouched(false); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reorder PO dialog ── */}
      <Dialog open={reorderDlg} onOpenChange={(open) => { if (!open) setFormTouched(false); setReorderDlg(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-primary" /> Create Reorder Purchase Order
            </DialogTitle>
            <DialogDescription>
              A draft PO will be created for the selected low-stock items. Review and confirm it on the Purchase Orders page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Supplier */}
            <div>
              <Label>Supplier (optional)</Label>
              <Select value={reorderSupplier} onValueChange={(v) => { setFormTouched(true); setReorderSupplier(v); }}>
                <SelectTrigger>
                  <SelectValue placeholder="No supplier selected" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No supplier</SelectItem>
                  {suppliers.map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Lines */}
            <div>
              <Label className="mb-2 block">Items to reorder</Label>
              <div className="rounded-lg border overflow-hidden divide-y max-h-64 overflow-y-auto">
                {lowStockItems.map(item => {
                  const line = reorderLines[item.productId];
                  if (!line) return null;
                  return (
                    <div key={item.productId}
                      className={cn("flex items-center gap-3 p-3 text-sm", !line.selected && "opacity-50")}>
                      <input type="checkbox" checked={line.selected}
                        onChange={() => toggleLine(item.productId)}
                        className="rounded border-muted-foreground/40 accent-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.productName}</p>
                        <p className="text-xs text-amber-600">In stock: {item.stockQuantity}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-6 w-6"
                          onClick={() => setLineQty(item.productId, line.qty - 1)}
                          disabled={!line.selected}>
                          <Minus className="w-3 h-3" />
                        </Button>
                        <Input
                          type="number" min="1"
                          className="w-16 h-7 text-center text-sm p-1"
                          value={line.qty}
                          disabled={!line.selected}
                          onChange={e => setLineQty(item.productId, parseInt(e.target.value) || 1)} />
                        <Button variant="ghost" size="icon" className="h-6 w-6"
                          onClick={() => setLineQty(item.productId, line.qty + 1)}
                          disabled={!line.selected}>
                          <Plus className="w-3 h-3" />
                        </Button>
                        <span className="text-xs text-muted-foreground w-6">units</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedLines.length} of {lowStockItems.length} item{lowStockItems.length !== 1 ? "s" : ""} selected
              </p>
            </div>

            {/* Notes */}
            <div>
              <Label>Notes (optional)</Label>
              <Textarea rows={2} placeholder="Any notes for the supplier…"
                value={reorderNotes} onChange={e => { setFormTouched(true); setReorderNotes(e.target.value); }} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReorderDlg(false); setFormTouched(false); }}>Cancel</Button>
            <Button onClick={handleCreatePO} disabled={poSaving || selectedLines.length === 0}>
              <ShoppingCart className="w-4 h-4" />
              Create Draft PO
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Start stock take dialog ── */}
      <Dialog open={startDlg} onOpenChange={(open) => { if (!open) setFormTouched(false); setStartDlg(open); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary" /> Start Stock Take
            </DialogTitle>
            <DialogDescription>
              A snapshot of all tracked product quantities will be taken. You&apos;ll then count each product physically and submit the variances.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                rows={2}
                placeholder="e.g. End of month count, post-stockroom tidy…"
                value={startNotes}
                onChange={e => { setFormTouched(true); setStartNotes(e.target.value); }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setStartDlg(false); setFormTouched(false); }}>Cancel</Button>
            <Button onClick={handleStartStockTake} disabled={createStockTakeMutation.isPending}>
              <ClipboardList className="w-4 h-4" />
              {createStockTakeMutation.isPending ? "Starting…" : "Start Stock Take"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InventoryFormGuard />
    </AppLayout>
  );
}
