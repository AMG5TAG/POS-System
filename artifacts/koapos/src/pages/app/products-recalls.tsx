import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListProducts } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";
import { Plus, AlertTriangle, Search, Pencil } from "lucide-react";
import { toast } from "sonner";

type Severity = "Low" | "Medium" | "High" | "Critical";
type RecallStatus = "Active" | "Resolved" | "Monitoring";
type Recall = { id: number; recallId: string; productName: string; reason: string; severity: Severity; status: RecallStatus; affectedBatch: string; notes: string; createdAt: string };

let nextId = 1;
const SEV_COLORS: Record<Severity, string> = { Low: "secondary", Medium: "outline", High: "outline", Critical: "destructive" };
const SEV_TEXT: Record<Severity, string> = { Low: "text-green-600", Medium: "text-amber-600", High: "text-orange-600", Critical: "text-red-600" };

export default function ProductsRecallsPage() {
  const [recalls, setRecalls] = useState<Recall[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ productId: "", customProductName: "", reason: "", severity: "Medium" as Severity, status: "Active" as RecallStatus, affectedBatch: "", notes: "" });

  const { data: productsData } = useListProducts({ limit: 500 });
  const products = productsData?.items ?? [];

  const filtered = recalls.filter((r) =>
    r.recallId.toLowerCase().includes(search.toLowerCase()) ||
    r.productName.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = () => {
    const product = products.find((p) => String(p.id) === form.productId);
    const productName = product?.name ?? form.customProductName;
    if (!productName) { toast.error("Product is required"); return; }
    if (!form.reason) { toast.error("Reason is required"); return; }
    const recall: Recall = {
      id: nextId,
      recallId: `RC-${String(nextId++).padStart(4, "0")}`,
      productName,
      reason: form.reason,
      severity: form.severity,
      status: form.status,
      affectedBatch: form.affectedBatch,
      notes: form.notes,
      createdAt: new Date().toISOString(),
    };
    setRecalls((prev) => [recall, ...prev]);
    toast.success(`${recall.recallId} recorded`);
    setDialogOpen(false);
    setForm({ productId: "", customProductName: "", reason: "", severity: "Medium", status: "Active", affectedBatch: "", notes: "" });
  };

  const activeCount = recalls.filter((r) => r.status === "Active").length;

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Product Recalls</h1>
              {activeCount > 0 && <p className="text-sm text-amber-600 font-medium">{activeCount} active recall{activeCount !== 1 ? "s" : ""}</p>}
            </div>
          </div>
          <Button onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-2" /> Log Recall</Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search recalls..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {filtered.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <AlertTriangle className="w-16 h-16 text-muted-foreground/30" />
            <div><p className="font-medium text-lg">No recalls recorded</p><p className="text-muted-foreground text-sm">Log product recalls or safety alerts here.</p></div>
            <Button onClick={() => setDialogOpen(true)}><Plus className="w-4 h-4 mr-2" /> Log Recall</Button>
          </CardContent></Card>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium">Reference</th>
                  <th className="text-left p-3 font-medium">Product</th>
                  <th className="text-left p-3 font-medium hidden sm:table-cell">Reason</th>
                  <th className="text-left p-3 font-medium hidden md:table-cell">Severity</th>
                  <th className="text-left p-3 font-medium hidden lg:table-cell">Batch</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium hidden lg:table-cell">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((r) => (
                  <tr key={r.id} className="bg-background hover:bg-muted/20">
                    <td className="p-3 font-mono font-medium text-xs">{r.recallId}</td>
                    <td className="p-3 font-medium">{r.productName}</td>
                    <td className="p-3 hidden sm:table-cell text-muted-foreground max-w-[200px] truncate">{r.reason}</td>
                    <td className="p-3 hidden md:table-cell">
                      <span className={`font-medium text-xs ${SEV_TEXT[r.severity]}`}>{r.severity}</span>
                    </td>
                    <td className="p-3 hidden lg:table-cell text-muted-foreground">{r.affectedBatch || "—"}</td>
                    <td className="p-3"><Badge variant={SEV_COLORS[r.severity] as "default"|"secondary"|"outline"|"destructive"}>{r.status}</Badge></td>
                    <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">{formatDate(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Log Product Recall</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Product</Label>
              <Select value={form.productId} onValueChange={(v) => setForm({ ...form, productId: v })}>
                <SelectTrigger><SelectValue placeholder="Select a product" /></SelectTrigger>
                <SelectContent>{products.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {!form.productId && (
              <div className="space-y-1.5">
                <Label>Or enter product name manually</Label>
                <Input value={form.customProductName} onChange={(e) => setForm({ ...form, customProductName: e.target.value })} placeholder="Product name" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Reason for Recall *</Label>
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Safety hazard, contamination..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v as Severity })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["Low","Medium","High","Critical"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as RecallStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["Active","Monitoring","Resolved"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Affected Batch / Lot</Label>
              <Input value={form.affectedBatch} onChange={(e) => setForm({ ...form, affectedBatch: e.target.value })} placeholder="e.g. LOT2024-01" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave}>Log Recall</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
