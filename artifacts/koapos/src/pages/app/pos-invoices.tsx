import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListProducts } from "@workspace/api-client-react";
import { CustomerSearchInput } from "@/components/customers/CustomerSearchInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, FileText, Search, Trash2, CheckCircle2, Send, RefreshCw, Package } from "lucide-react";
import { toast } from "sonner";

type InvStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";
type LineItem = { description: string; quantity: number; unitPrice: number; taxRate: number };
type Invoice = { id: number; invoiceNumber: string; customerId: number | null; customerName: string; status: InvStatus; subtotal: number; taxTotal: number; total: number; dueDate: string | null; notes: string | null; createdAt: string };

const STATUS_COLORS: Record<InvStatus, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary", sent: "outline", paid: "default", overdue: "destructive", cancelled: "secondary",
};

const FREQ_LABELS = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };

const API = "/api/invoices";

export default function POSInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({ customerId: "", dueDate: "", notes: "" });
  const [lines, setLines] = useState<LineItem[]>([{ description: "", quantity: 1, unitPrice: 0, taxRate: 10 }]);
  const [saving, setSaving] = useState(false);

  /* product search per line */
  const [lineSearch, setLineSearch] = useState<string[]>([""]);
  const [lineDropOpen, setLineDropOpen] = useState<boolean[]>([false]);
  const lineDropRefs = useRef<(HTMLDivElement | null)[]>([]);

  /* recurring */
  const [recurring, setRecurring] = useState({
    enabled: false,
    frequency: "monthly" as "daily" | "weekly" | "monthly" | "yearly",
    startDate: "",
    occurrences: 1,
  });

  const { data: productsData } = useListProducts({ limit: 500 });
  const allProducts = productsData?.items ?? [];

  const load = async () => {
    setLoading(true);
    const q = statusFilter !== "all" ? `?status=${statusFilter}` : "";
    const res = await fetch(`${API}${q}`, { credentials: "include" });
    if (res.ok) setInvoices((await res.json()).items);
    setLoading(false);
  };

  useEffect(() => { load(); }, [statusFilter]);

  /* close product dropdowns on outside click */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      lineDropRefs.current.forEach((ref, i) => {
        if (ref && !ref.contains(e.target as Node)) {
          setLineDropOpen((p) => { const n = [...p]; n[i] = false; return n; });
        }
      });
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* ── Line item helpers ── */
  const addLine = () => {
    setLines((p) => [...p, { description: "", quantity: 1, unitPrice: 0, taxRate: 10 }]);
    setLineSearch((p) => [...p, ""]);
    setLineDropOpen((p) => [...p, false]);
  };

  const updateLine = (i: number, field: keyof LineItem, val: string | number) =>
    setLines((p) => p.map((l, idx) => idx === i ? { ...l, [field]: val } : l));

  const removeLine = (i: number) => {
    setLines((p) => p.filter((_, idx) => idx !== i));
    setLineSearch((p) => p.filter((_, idx) => idx !== i));
    setLineDropOpen((p) => p.filter((_, idx) => idx !== i));
  };

  const selectProduct = (i: number, product: { name: string; price?: number | null }) => {
    setLines((p) => p.map((l, idx) =>
      idx === i ? { ...l, description: product.name, unitPrice: product.price ?? 0, taxRate: 10 } : l
    ));
    setLineSearch((p) => { const n = [...p]; n[i] = ""; return n; });
    setLineDropOpen((p) => { const n = [...p]; n[i] = false; return n; });
  };

  const filteredProducts = (q: string) =>
    !q.trim() ? allProducts.slice(0, 8) : allProducts.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8);

  /* ── Totals ── */
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const taxTotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice * (l.taxRate / 100), 0);

  /* ── Save ── */
  const resetDialog = () => {
    setForm({ customerId: "", dueDate: "", notes: "" });
    setLines([{ description: "", quantity: 1, unitPrice: 0, taxRate: 10 }]);
    setLineSearch([""]);
    setLineDropOpen([false]);
    setRecurring({ enabled: false, frequency: "monthly", startDate: "", occurrences: 1 });
  };

  const handleSave = async () => {
    const validLines = lines.filter((l) => l.description.trim());
    if (!validLines.length) { toast.error("Add at least one line item"); return; }
    setSaving(true);
    const body = {
      customerId: form.customerId ? parseInt(form.customerId) : null,
      dueDate: form.dueDate || null,
      notes: form.notes || null,
      items: validLines,
      ...(recurring.enabled && {
        recurring: {
          frequency: recurring.frequency,
          startDate: recurring.startDate || null,
          occurrences: recurring.occurrences,
        },
      }),
    };
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) { toast.error("Failed to create invoice"); return; }
    toast.success(recurring.enabled ? "Recurring invoice created" : "Invoice created");
    setDialogOpen(false);
    resetDialog();
    load();
  };

  const updateStatus = async (id: number, status: string) => {
    await fetch(`${API}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ status }) });
    toast.success(`Invoice marked as ${status}`);
    load();
  };

  const deleteInvoice = async (id: number) => {
    await fetch(`${API}/${id}`, { method: "DELETE", credentials: "include" });
    toast.success("Invoice deleted");
    load();
  };

  const filtered = invoices.filter((inv) =>
    !search || inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) || inv.customerName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
          </div>
          <Button onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-2" /> New Invoice</Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search invoices..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {["draft","sent","paid","overdue","cancelled"].map((s) => (
                <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="text-center py-16 text-muted-foreground">Loading invoices...</div>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <FileText className="w-16 h-16 text-muted-foreground/30" />
            <div><p className="font-medium text-lg">No invoices yet</p><p className="text-muted-foreground text-sm">Create invoices to send to customers.</p></div>
            <Button onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-2" /> New Invoice</Button>
          </CardContent></Card>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium">Invoice</th>
                  <th className="text-left p-3 font-medium hidden sm:table-cell">Customer</th>
                  <th className="text-left p-3 font-medium hidden md:table-cell">Due Date</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-right p-3 font-medium">Total</th>
                  <th className="p-3 w-28" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((inv) => (
                  <tr key={inv.id} className="bg-background hover:bg-muted/20">
                    <td className="p-3 font-mono font-medium text-xs">{inv.invoiceNumber}</td>
                    <td className="p-3 hidden sm:table-cell text-muted-foreground">{inv.customerName || "—"}</td>
                    <td className="p-3 hidden md:table-cell text-muted-foreground text-xs">{inv.dueDate ? formatDate(inv.dueDate) : "—"}</td>
                    <td className="p-3"><Badge variant={STATUS_COLORS[inv.status]} className="capitalize text-xs">{inv.status}</Badge></td>
                    <td className="p-3 text-right font-medium">{formatCurrency(inv.total)}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        {inv.status === "draft" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Mark as sent" onClick={() => updateStatus(inv.id, "sent")}><Send className="w-3.5 h-3.5" /></Button>
                        )}
                        {inv.status === "sent" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" title="Mark as paid" onClick={() => updateStatus(inv.id, "paid")}><CheckCircle2 className="w-3.5 h-3.5" /></Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteInvoice(inv.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── New Invoice Dialog ─── */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) resetDialog(); setDialogOpen(o); }}>
        <DialogContent className="max-w-2xl flex flex-col p-0 gap-0 max-h-[90vh]">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle>New Invoice</DialogTitle>
          </DialogHeader>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

            {/* Customer + Due Date */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Customer (optional)</Label>
                <CustomerSearchInput
                  value={form.customerId}
                  onChange={(id) => setForm({ ...form, customerId: id })}
                  allowNone
                  placeholder="Walk-in customer"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Line Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Line
                </Button>
              </div>

              {/* Header row */}
              <div className="grid grid-cols-[1fr_56px_88px_60px_32px] gap-1.5 px-1 text-xs font-medium text-muted-foreground">
                <span>Description</span>
                <span className="text-center">Qty</span>
                <span className="text-right">Price</span>
                <span className="text-right">Tax%</span>
                <span />
              </div>

              {/* Lines */}
              <div className="space-y-1.5">
                {lines.map((line, i) => (
                  <div key={i} className="grid grid-cols-[1fr_56px_88px_60px_32px] gap-1.5 items-start">

                    {/* Description + product search dropdown */}
                    <div
                      className="relative"
                      ref={(el) => { lineDropRefs.current[i] = el; }}
                    >
                      <div className="relative">
                        <Package className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                        <Input
                          value={lineSearch[i] !== undefined ? lineSearch[i] : line.description}
                          placeholder="Search or type description..."
                          className="h-8 text-sm pl-6"
                          onFocus={() => setLineDropOpen((p) => { const n = [...p]; n[i] = true; return n; })}
                          onChange={(e) => {
                            const v = e.target.value;
                            setLineSearch((p) => { const n = [...p]; n[i] = v; return n; });
                            updateLine(i, "description", v);
                            setLineDropOpen((p) => { const n = [...p]; n[i] = true; return n; });
                          }}
                        />
                      </div>
                      {lineDropOpen[i] && (
                        <div className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-popover border rounded-lg shadow-lg max-h-[min(220px,50dvh)] overflow-y-auto">
                          <div>
                            {filteredProducts(lineSearch[i] ?? "").length === 0 ? (
                              <p className="px-3 py-3 text-xs text-muted-foreground text-center">No products found</p>
                            ) : (
                              filteredProducts(lineSearch[i] ?? "").map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onMouseDown={(e) => { e.preventDefault(); selectProduct(i, p); }}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between gap-2"
                                >
                                  <span className="truncate">{p.name}</span>
                                  <span className="text-xs text-muted-foreground shrink-0">{formatCurrency(p.price ?? 0)}</span>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <Input
                      type="number" min={1}
                      value={line.quantity}
                      onChange={(e) => updateLine(i, "quantity", parseFloat(e.target.value) || 1)}
                      className="h-8 text-sm text-center"
                    />
                    <Input
                      type="number" step="0.01"
                      value={line.unitPrice || ""}
                      onChange={(e) => updateLine(i, "unitPrice", parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="h-8 text-sm text-right"
                    />
                    <Input
                      type="number" min={0} max={100}
                      value={line.taxRate}
                      onChange={(e) => updateLine(i, "taxRate", parseFloat(e.target.value) || 0)}
                      className="h-8 text-sm text-right"
                    />
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                      onClick={() => removeLine(i)}
                      disabled={lines.length === 1}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-48 space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>GST</span><span>{formatCurrency(taxTotal)}</span></div>
                <div className="flex justify-between font-semibold border-t pt-1"><span>Total</span><span>{formatCurrency(subtotal + taxTotal)}</span></div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                placeholder="Payment terms, notes for customer..."
              />
            </div>

            {/* Recurring */}
            <div className="rounded-xl border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Recurring Invoice</p>
                    <p className="text-xs text-muted-foreground">Automatically repeat this invoice on a schedule</p>
                  </div>
                </div>
                <Switch
                  checked={recurring.enabled}
                  onCheckedChange={(v) => setRecurring((r) => ({ ...r, enabled: v }))}
                />
              </div>

              {recurring.enabled && (
                <div className="grid grid-cols-3 gap-3 pt-1 border-t">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Frequency</Label>
                    <Select
                      value={recurring.frequency}
                      onValueChange={(v) => setRecurring((r) => ({ ...r, frequency: v as typeof r.frequency }))}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.entries(FREQ_LABELS) as [string, string][]).map(([val, label]) => (
                          <SelectItem key={val} value={val}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Start Date</Label>
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      value={recurring.startDate}
                      onChange={(e) => setRecurring((r) => ({ ...r, startDate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Occurrences</Label>
                    <Input
                      type="number" min={1} max={999}
                      className="h-8 text-xs"
                      value={recurring.occurrences}
                      onChange={(e) => setRecurring((r) => ({ ...r, occurrences: parseInt(e.target.value) || 1 }))}
                    />
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t shrink-0 flex justify-end gap-2 bg-background">
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetDialog(); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Creating…" : recurring.enabled ? "Create Recurring Invoice" : "Create Invoice"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
