import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListCustomers } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, FileText, Search, Pencil, Trash2, CheckCircle2, Send } from "lucide-react";
import { toast } from "sonner";

type InvStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";
type LineItem = { description: string; quantity: number; unitPrice: number; taxRate: number };
type Invoice = { id: number; invoiceNumber: string; customerId: number | null; customerName: string; status: InvStatus; subtotal: number; taxTotal: number; total: number; dueDate: string | null; notes: string | null; createdAt: string };

const STATUS_COLORS: Record<InvStatus, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary", sent: "outline", paid: "default", overdue: "destructive", cancelled: "secondary",
};

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

  const { data: customersData } = useListCustomers({ limit: 500 });
  const customers = customersData?.items ?? [];

  const load = async () => {
    setLoading(true);
    const res = await fetch(`${API}${statusFilter ? `?status=${statusFilter}` : ""}`, { credentials: "include" });
    if (res.ok) setInvoices((await res.json()).items);
    setLoading(false);
  };

  useEffect(() => { load(); }, [statusFilter]);

  const addLine = () => setLines((p) => [...p, { description: "", quantity: 1, unitPrice: 0, taxRate: 10 }]);
  const updateLine = (i: number, field: keyof LineItem, val: string | number) =>
    setLines((p) => p.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  const removeLine = (i: number) => setLines((p) => p.filter((_, idx) => idx !== i));

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const taxTotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice * (l.taxRate / 100), 0);

  const handleSave = async () => {
    const validLines = lines.filter((l) => l.description);
    if (!validLines.length) { toast.error("Add at least one line item"); return; }
    setSaving(true);
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ customerId: form.customerId ? parseInt(form.customerId) : null, dueDate: form.dueDate || null, notes: form.notes || null, items: validLines }),
    });
    setSaving(false);
    if (!res.ok) { toast.error("Failed to create invoice"); return; }
    toast.success("Invoice created");
    setDialogOpen(false);
    setForm({ customerId: "", dueDate: "", notes: "" });
    setLines([{ description: "", quantity: 1, unitPrice: 0, taxRate: 10 }]);
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
              {["draft","sent","paid","overdue","cancelled"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Invoice</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Customer (optional)</Label>
                <Select value={form.customerId} onValueChange={(v) => setForm({ ...form, customerId: v })}>
                  <SelectTrigger><SelectValue placeholder="Walk-in customer" /></SelectTrigger>
                  <SelectContent>{customers.map((c) => <SelectItem key={c.id} value={String(c.id)}>{`${c.firstName ?? ""} ${c.lastName ?? ""}`.trim()}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Line Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLine}><Plus className="w-3.5 h-3.5 mr-1" /> Add Line</Button>
              </div>
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b">
                    <tr>
                      <th className="text-left p-2 font-medium">Description</th>
                      <th className="text-center p-2 font-medium w-16">Qty</th>
                      <th className="text-right p-2 font-medium w-24">Price</th>
                      <th className="text-right p-2 font-medium w-16">Tax%</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {lines.map((line, i) => (
                      <tr key={i}>
                        <td className="p-1.5"><Input value={line.description} onChange={(e) => updateLine(i, "description", e.target.value)} placeholder="Item description" className="h-8" /></td>
                        <td className="p-1.5"><Input type="number" min={1} value={line.quantity} onChange={(e) => updateLine(i, "quantity", parseFloat(e.target.value) || 1)} className="h-8 text-center" /></td>
                        <td className="p-1.5"><Input type="number" step="0.01" value={line.unitPrice || ""} onChange={(e) => updateLine(i, "unitPrice", parseFloat(e.target.value) || 0)} placeholder="0.00" className="h-8 text-right" /></td>
                        <td className="p-1.5"><Input type="number" min={0} max={100} value={line.taxRate} onChange={(e) => updateLine(i, "taxRate", parseFloat(e.target.value) || 0)} className="h-8 text-right" /></td>
                        <td className="p-1.5"><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removeLine(i)}><span className="text-xs">✕</span></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end">
              <div className="w-48 space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>GST</span><span>{formatCurrency(taxTotal)}</span></div>
                <div className="flex justify-between font-semibold border-t pt-1"><span>Total</span><span>{formatCurrency(subtotal + taxTotal)}</span></div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Payment terms, notes for customer..." />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>Create Invoice</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
