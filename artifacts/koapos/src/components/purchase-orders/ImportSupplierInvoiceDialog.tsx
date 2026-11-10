import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  useMatchSupplierInvoice, useImportSupplierInvoice, useReceivePurchaseOrderItems,
  type PurchaseOrder, type SupplierInvoiceImportResult,
} from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle, Check, FileUp, Link2, Loader2, PackagePlus, Search, Truck, Undo2, Ban,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { uploadFile } from "@/lib/upload";
import {
  extractPdfText, parseSupplierInvoice, InvoiceParseError, type ParsedInvoice,
} from "@/lib/supplier-invoice-parse";

/* Purchase Orders › Import supplier invoice. Reads the supplier's PDF in the
   browser (lib/supplier-invoice-parse.ts), asks the server what it matches
   (POST /purchase-orders/import/match), lets staff check it, then creates the
   PO — plus any new supplier and basic products — in one call, and receives
   it through the ordinary receive endpoint so stock, serials, pre-orders and
   the sale-ticket prompt work exactly as for any PO. */

export interface ImportProductOption { id: number; name: string; sku?: string | null; price?: number | null; tracksSerial?: boolean }
export interface ImportSupplierOption { id: number; name: string }

type LineMode = "existing" | "new" | "none";
interface LineState {
  mode: LineMode;
  productId: number | null;
  matchedBy: string | null;
  name: string;
  sellPrice: string;
  stockCode: string;
  manufCode: string;
  qty: number;
  unitEx: number;
  totalInc: number | null;
  serials: string[];
}

export interface ImportDone {
  po: PurchaseOrder;
  received: boolean;
  newProducts: SupplierInvoiceImportResult["newProducts"];
  supplierCreated: boolean;
}

const MATCHED_BY: Record<string, string> = { sku: "SKU", supplierCode: "supplier code", manufCode: "manufacturer code", manual: "chosen" };

export function ImportSupplierInvoiceDialog({ open, onOpenChange, products, suppliers, onDone }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  products: ImportProductOption[];
  suppliers: ImportSupplierOption[];
  onDone: (r: ImportDone) => void;
}) {
  const matchMutation = useMatchSupplierInvoice();
  const importMutation = useImportSupplierInvoice();
  const receiveMutation = useReceivePurchaseOrderItems();
  const fileInput = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [parsed, setParsed] = useState<ParsedInvoice | null>(null);
  const [lines, setLines] = useState<LineState[]>([]);
  const [supplierMode, setSupplierMode] = useState<"existing" | "new">("new");
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [supplierMatchedBy, setSupplierMatchedBy] = useState<string | null>(null);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [poTaken, setPoTaken] = useState<string | null>(null);
  const [orderDate, setOrderDate] = useState("");
  const [receiveNow, setReceiveNow] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const reset = () => {
    setFile(null); setParsed(null); setLines([]); setError(null); setPoTaken(null);
    setSupplierId(null); setSupplierMatchedBy(null); setReceiveNow(true); setBusy(null);
    if (fileInput.current) fileInput.current.value = "";
  };
  const close = (o: boolean) => { if (!o && busy) return; if (!o) reset(); onOpenChange(o); };

  const read = async (f: File | undefined) => {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") { setError("Choose the supplier's PDF invoice."); return; }
    setError(null); setReading(true); setFile(f);
    try {
      const inv = parseSupplierInvoice(await extractPdfText(f));
      const match = await matchMutation.mutateAsync({ data: {
        supplierName: inv.supplier.name || "Unknown supplier",
        supplierAbn: inv.supplier.abn || undefined,
        accountCode: inv.accountCode || undefined,
        poNumber: inv.invoiceNumber || undefined,
        lines: inv.lines.map((l) => ({ stockCode: l.stockCode, manufCode: l.manufCode || undefined })),
      } });
      setParsed(inv);
      setPoNumber(inv.invoiceNumber);
      setPoTaken(match.poNumberTaken?.poNumber ?? null);
      setOrderDate(inv.date || new Date().toISOString().slice(0, 10));
      if (match.supplier) {
        setSupplierMode("existing"); setSupplierId(match.supplier.id); setSupplierMatchedBy(match.supplier.matchedBy);
      } else {
        setSupplierMode("new"); setSupplierId(null); setSupplierMatchedBy(null);
      }
      setNewSupplierName(titleCase(inv.supplier.name));
      setLines(inv.lines.map((l, i) => {
        const m = match.lines[i];
        return {
          mode: m ? "existing" : "new",
          productId: m?.productId ?? null,
          matchedBy: m?.matchedBy ?? null,
          name: l.description,
          sellPrice: "",
          stockCode: l.stockCode,
          manufCode: l.manufCode,
          qty: Math.max(1, Math.round(l.qty)),
          unitEx: l.unitEx,
          totalInc: l.totalInc,
          serials: l.serials,
        };
      }));
    } catch (e) {
      setFile(null);
      setError(e instanceof InvoiceParseError ? e.message : e instanceof Error ? `Couldn't read that PDF: ${e.message}` : "Couldn't read that PDF.");
    } finally {
      setReading(false);
    }
  };

  const setLine = (i: number, patch: Partial<LineState>) =>
    setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  const newCount = lines.filter((l) => l.mode === "new").length;
  const unpricedNew = lines.filter((l) => l.mode === "new" && !(parseFloat(l.sellPrice) > 0)).length;
  const sumInc = lines.reduce((s, l) => s + (l.totalInc ?? l.qty * l.unitEx * 1.1), 0);

  const submit = async () => {
    if (!parsed) return;
    setError(null);
    if (!poNumber.trim()) { setError("Enter the PO number (the invoice number)."); return; }
    if (supplierMode === "existing" && !supplierId) { setError("Choose the supplier."); return; }
    if (supplierMode === "new" && !newSupplierName.trim()) { setError("Enter the new supplier's name."); return; }
    if (lines.some((l) => l.mode === "new" && !l.name.trim())) { setError("Every new product needs a name."); return; }
    if (lines.some((l) => l.mode === "existing" && !l.productId)) { setError("Choose a product for every linked line, or create a new one."); return; }

    try {
      // Keep the supplier's PDF on the PO. Not fatal if it fails.
      let invoiceUrls: string[] = [];
      if (file) {
        setBusy("Attaching the invoice…");
        try { invoiceUrls = [(await uploadFile(file)).url]; }
        catch { toast.warning("Couldn't attach the PDF to the PO — continuing without it."); }
      }

      setBusy("Creating the purchase order…");
      const result = await importMutation.mutateAsync({ data: {
        ...(supplierMode === "existing"
          ? { supplierId: supplierId!, accountCode: parsed.accountCode || undefined }
          : { newSupplier: {
              name: newSupplierName.trim(),
              accountNumber: parsed.accountCode || undefined,
              website: parsed.supplier.website || undefined,
              notes: parsed.supplier.abn ? `ABN ${parsed.supplier.abn.replace(/(\d{2})(\d{3})(\d{3})(\d{3})/, "$1 $2 $3 $4")}` : undefined,
            } }),
        poNumber: poNumber.trim(),
        orderNumber: parsed.orderNumber || undefined,
        orderDate,
        notes: `Imported from ${parsed.supplier.name || "supplier"} invoice ${parsed.invoiceNumber}`.slice(0, 2000),
        invoiceUrls,
        lines: lines.map((l) => ({
          ...(l.mode === "existing" && l.productId ? { productId: l.productId } : {}),
          ...(l.mode === "new" ? { newProduct: {
            name: l.name.trim(),
            sku: l.stockCode || undefined,
            manufCode: l.manufCode || undefined,
            ...(parseFloat(l.sellPrice) > 0 ? { sellPrice: Math.round(parseFloat(l.sellPrice) * 100) / 100 } : {}),
          } } : {}),
          productName: l.mode === "existing" && l.productId ? (productById.get(l.productId)?.name ?? l.name) : l.name,
          stockCode: l.stockCode || undefined,
          quantity: l.qty,
          unitCost: l.unitEx,
          serials: l.serials,
        })),
      } });

      let po = result.purchaseOrder;
      let received = false;
      if (receiveNow) {
        setBusy("Receiving into stock…");
        // Items come back in the order they were written; ids rise with it.
        const items = [...(po.items ?? [])].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
        const receiveItems = items.map((it, i) => {
          const tracks = it.productId != null && (productById.get(it.productId)?.tracksSerial ?? false);
          const serials = lines[i]?.serials ?? [];
          return {
            poItemId: it.id!,
            quantityReceiving: it.quantity ?? 0,
            ...(tracks && serials.length ? { serialNumbers: serials.slice(0, it.quantity ?? 0) } : {}),
          };
        }).filter((r) => r.quantityReceiving > 0);
        try {
          po = await receiveMutation.mutateAsync({ id: po.id!, data: { items: receiveItems } as never }) as PurchaseOrder;
          received = true;
        } catch (e) {
          toast.error(`${po.poNumber} was created but couldn't be received${e instanceof Error ? `: ${e.message}` : ""}. Open it and use Receive Inventory.`);
        }
      }

      toast.success(`${po.poNumber} created from the invoice${received ? " and received into stock" : ""}`);
      onDone({ po, received, newProducts: result.newProducts, supplierCreated: result.supplierCreated });
      reset();
      onOpenChange(false);
    } catch (e) {
      const msg = (e as { data?: { error?: string } })?.data?.error ?? (e instanceof Error ? e.message : "Import failed");
      setError(msg);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0">
          <DialogTitle>Import supplier invoice</DialogTitle>
          <DialogDescription>Upload the supplier's PDF tax invoice. Lines are matched to your products by SKU (the invoice's stock code); anything new is created for you.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-5">
          {!parsed && (
            <div
              className="rounded-xl border-2 border-dashed p-10 text-center bg-muted/20"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); void read(e.dataTransfer.files?.[0]); }}
            >
              {reading ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin" />Reading the invoice…</div>
              ) : (
                <>
                  <FileUp className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="font-medium">Drop the invoice PDF here</p>
                  <p className="text-sm text-muted-foreground mb-4">Built for Leader Computers invoices; other suppliers with a similar item table usually work too.</p>
                  <Button onClick={() => fileInput.current?.click()}><FileUp className="w-4 h-4 mr-2" />Choose PDF</Button>
                </>
              )}
              <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => void read(e.target.files?.[0])} />
            </div>
          )}

          {parsed && (
            <>
              {/* Supplier */}
              <section className={cn("rounded-xl border p-4 space-y-3", supplierMode === "new" && !supplierMatchedBy && "border-amber-400 bg-amber-50/60 dark:bg-amber-950/20")}>
                <div className="flex flex-wrap items-center gap-2">
                  <Truck className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">Supplier</span>
                  <span className="text-sm text-muted-foreground">on the invoice: {parsed.supplier.name || "not found"}{parsed.accountCode ? ` · your account ${parsed.accountCode}` : ""}</span>
                  {supplierMatchedBy
                    ? <Badge variant="secondary" className="ml-auto">Matched by {supplierMatchedBy === "account" ? "account code" : "name"}</Badge>
                    : supplierMode === "new" && <Badge className="ml-auto bg-amber-500 hover:bg-amber-500">New supplier detected</Badge>}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3 items-center">
                  <Select value={supplierMode} onValueChange={(v) => setSupplierMode(v as "existing" | "new")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="existing">Existing supplier</SelectItem>
                      <SelectItem value="new">Create new supplier</SelectItem>
                    </SelectContent>
                  </Select>
                  {supplierMode === "existing" ? (
                    <Select value={supplierId ? String(supplierId) : ""} onValueChange={(v) => { setSupplierId(Number(v)); setSupplierMatchedBy(null); }}>
                      <SelectTrigger><SelectValue placeholder="Choose a supplier…" /></SelectTrigger>
                      <SelectContent>
                        {suppliers.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} placeholder="Supplier name" />
                  )}
                </div>
                {supplierMode === "existing" && parsed.accountCode && !supplierMatchedBy && (
                  <p className="text-xs text-muted-foreground">If this supplier has no account number yet, {parsed.accountCode} is saved on it so the next invoice is recognised automatically.</p>
                )}
              </section>

              {/* Invoice */}
              <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">PO number (invoice number)</Label>
                  <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
                  {poTaken && poTaken === poNumber.trim() && (
                    <p className="text-xs text-destructive">{poTaken} already exists — this invoice may already have been imported.</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Invoice date</Label>
                  <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Supplier's order ref</Label>
                  <Input value={parsed.orderNumber} disabled />
                </div>
              </section>

              {/* Lines */}
              <section className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold">{lines.length} lines</h3>
                  {newCount > 0 && <Badge className="bg-sky-600 hover:bg-sky-600">{newCount} new product{newCount === 1 ? "" : "s"}</Badge>}
                  {unpricedNew > 0 && <span className="text-xs text-muted-foreground">New products without a sell price are created hidden from the till until you price them.</span>}
                </div>
                <div className="rounded-xl border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Stock code</th>
                        <th className="text-left px-3 py-2 font-medium min-w-[260px]">Product</th>
                        <th className="text-right px-3 py-2 font-medium">Qty</th>
                        <th className="text-right px-3 py-2 font-medium">Unit ex</th>
                        <th className="text-right px-3 py-2 font-medium">Total inc</th>
                        <th className="text-right px-3 py-2 font-medium min-w-[120px]">Sell price inc</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {lines.map((l, i) => {
                        const linked = l.productId ? productById.get(l.productId) : undefined;
                        return (
                          <tr key={i} className={cn(l.mode === "new" && "bg-sky-50/60 dark:bg-sky-950/20", l.mode === "none" && "opacity-60")}>
                            <td className="px-3 py-2 align-top">
                              <div className="font-mono text-xs">{l.stockCode || "—"}</div>
                              {l.manufCode && <div className="font-mono text-[11px] text-muted-foreground">{l.manufCode}</div>}
                              {l.serials.length > 0 && <div className="text-[11px] text-muted-foreground mt-1" title={l.serials.join(", ")}>{l.serials.length} serial{l.serials.length === 1 ? "" : "s"}</div>}
                            </td>
                            <td className="px-3 py-2 align-top">
                              {l.mode === "existing" && (
                                <div className="space-y-1">
                                  <div className="flex items-start gap-2">
                                    <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                                    <div className="min-w-0">
                                      <div className="font-medium truncate">{linked?.name ?? "Choose a product"}</div>
                                      <div className="text-[11px] text-muted-foreground">Existing product{l.matchedBy ? ` · matched by ${MATCHED_BY[l.matchedBy] ?? l.matchedBy}` : ""}</div>
                                    </div>
                                  </div>
                                  <div className="text-[11px] text-muted-foreground">Invoice: {l.name}</div>
                                </div>
                              )}
                              {l.mode === "new" && (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300"><PackagePlus className="w-3.5 h-3.5" />New product</div>
                                  <Input value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} className="h-8" />
                                </div>
                              )}
                              {l.mode === "none" && <div className="text-muted-foreground"><span className="line-through">{l.name}</span><div className="text-[11px] no-underline">Not stocked (e.g. freight) — on the PO only</div></div>}
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                <ProductPicker products={products} onPick={(id) => setLine(i, { mode: "existing", productId: id, matchedBy: "manual" })} />
                                {l.mode !== "new" && <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setLine(i, { mode: "new" })}><PackagePlus className="w-3 h-3 mr-1" />Create new</Button>}
                                {l.mode !== "none" && <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setLine(i, { mode: "none" })}><Ban className="w-3 h-3 mr-1" />Don't stock</Button>}
                                {l.mode === "none" && <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => setLine(i, { mode: l.productId ? "existing" : "new" })}><Undo2 className="w-3 h-3 mr-1" />Stock it</Button>}
                              </div>
                            </td>
                            <td className="px-3 py-2 align-top text-right tabular-nums">{l.qty}</td>
                            <td className="px-3 py-2 align-top text-right tabular-nums">{formatCurrency(l.unitEx)}</td>
                            <td className="px-3 py-2 align-top text-right tabular-nums">{l.totalInc != null ? formatCurrency(l.totalInc) : "—"}</td>
                            <td className="px-3 py-2 align-top text-right">
                              {l.mode === "new" ? (
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                                  <Input type="number" min="0" step="0.01" value={l.sellPrice} placeholder="—" onChange={(e) => setLine(i, { sellPrice: e.target.value })} className="h-8 pl-5 text-right" />
                                </div>
                              ) : l.mode === "existing" && linked?.price != null ? (
                                <span className="text-muted-foreground tabular-nums">{formatCurrency(Number(linked.price))}</span>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 text-sm">
                  <span>Lines total <strong className="tabular-nums">{formatCurrency(sumInc)}</strong></span>
                  {parsed.totals.total != null && (
                    <span className={cn("flex items-center gap-1", Math.abs(sumInc - parsed.totals.total) > 0.05 ? "text-destructive" : "text-emerald-600")}>
                      Invoice total <strong className="tabular-nums">{formatCurrency(parsed.totals.total)}</strong>
                      {Math.abs(sumInc - parsed.totals.total) > 0.05 ? <AlertTriangle className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                    </span>
                  )}
                </div>
                {parsed.warnings.length > 0 && (
                  <div className="rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm space-y-1">
                    {parsed.warnings.map((w, i) => <p key={i} className="flex gap-2"><AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />{w}</p>)}
                  </div>
                )}
              </section>

              <label className="flex items-start gap-3 rounded-xl border p-4 cursor-pointer">
                <Switch checked={receiveNow} onCheckedChange={setReceiveNow} />
                <span>
                  <span className="text-sm font-medium block">The goods have arrived — receive into stock now</span>
                  <span className="text-xs text-muted-foreground">Adds every line's quantity to stock and marks the PO Fully Received. Turn off to create it as Ordered and receive later.</span>
                </span>
              </label>
            </>
          )}

          {error && <p className="text-sm text-destructive flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{error}</p>}
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0 gap-2">
          {parsed && <Button variant="ghost" onClick={reset} disabled={!!busy}>Choose a different PDF</Button>}
          <Button variant="outline" onClick={() => close(false)} disabled={!!busy}>Cancel</Button>
          {parsed && (
            <Button onClick={() => void submit()} disabled={!!busy || !lines.length}>
              {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{busy}</> : <>Create purchase order{receiveNow ? " & receive" : ""}</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Link a line to any product, searching name and SKU. */
function ProductPicker({ products, onPick }: { products: ImportProductOption[]; onPick: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return products.filter((p) => p.name.toLowerCase().includes(t) || (p.sku ?? "").toLowerCase().includes(t)).slice(0, 40);
  }, [products, q]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px]"><Link2 className="w-3 h-3 mr-1" />Link to a product</Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <div className="relative mb-2">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or SKU…" className="h-8 pl-7" />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {q.trim() && !hits.length && <p className="text-xs text-muted-foreground p-2">No products match.</p>}
          {hits.map((p) => (
            <button key={p.id} type="button" onClick={() => { onPick(p.id); setOpen(false); setQ(""); }}
              className="w-full text-left rounded px-2 py-1.5 hover:bg-muted text-sm">
              <div className="truncate">{p.name}</div>
              <div className="text-[11px] text-muted-foreground">{p.sku || "no SKU"}{p.price != null ? ` · ${formatCurrency(Number(p.price))}` : ""}</div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** "LEADER COMPUTERS PTY LTD" → "Leader Computers Pty Ltd". */
function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bPty\b/g, "Pty").replace(/\bLtd\b/g, "Ltd");
}
