import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListLaybys,
  useCreateLayby,
  useAddLaybyPayment,
  useCancelLayby,
  useCompleteLayby,
  useListProducts,
  Layby,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CustomerSearchInput } from "@/components/customers/CustomerSearchInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Plus,
  Package2,
  Search,
  Trash2,
  CheckCircle2,
  CreditCard,
  XCircle,
  CalendarDays,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";

type LaybyItem = { productId: number; productName: string; quantity: number; price: number };
type StatusFilter = "all" | "active" | "completed" | "cancelled";

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active:    { label: "Active",    variant: "outline" },
  completed: { label: "Collected", variant: "default" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

export default function POSLaybuysPage() {
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useListLaybys(
    statusFilter !== "all" ? { status: statusFilter } : {}
  );
  const laybys = data?.items ?? [];
  const filtered = search
    ? laybys.filter(
        (l) =>
          l.reference.toLowerCase().includes(search.toLowerCase()) ||
          (l.customerName ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : laybys;

  const createMutation = useCreateLayby();
  const paymentMutation = useAddLaybyPayment();
  const cancelMutation = useCancelLayby();
  const completeMutation = useCompleteLayby();

  const [createOpen, setCreateOpen] = useState(false);
  const [paymentLayby, setPaymentLayby] = useState<Layby | null>(null);
  const [cancelLayby, setCancelLayby] = useState<Layby | null>(null);
  const [detailLayby, setDetailLayby] = useState<Layby | null>(null);

  const [form, setForm] = useState({
    customerId: "",
    customerName: "",
    depositAmount: "",
    dueDate: "",
    notes: "",
    paymentMethod: "cash",
  });
  const [productSearch, setProductSearch] = useState("");
  const [selectedItems, setSelectedItems] = useState<LaybyItem[]>([]);

  const [paymentForm, setPaymentForm] = useState({ amount: "", paymentMethod: "cash", note: "" });
  const [cancelReason, setCancelReason] = useState("");

  const { data: productsData } = useListProducts({ limit: 500 });
  const allProducts = productsData?.items ?? [];
  const filteredProducts = allProducts.filter(
    (p) =>
      p.name?.toLowerCase().includes(productSearch.toLowerCase()) &&
      !selectedItems.find((i) => i.productId === p.id)
  );

  const total = selectedItems.reduce((s, i) => s + i.price * i.quantity, 0);

  function addProduct(p: { id: number; name?: string | null; price?: number | null }) {
    setSelectedItems((prev) => [
      ...prev,
      { productId: p.id, productName: p.name ?? "", quantity: 1, price: p.price ?? 0 },
    ]);
  }
  function updateQty(productId: number, qty: number) {
    setSelectedItems((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, quantity: Math.max(1, qty) } : i))
    );
  }
  function removeItem(productId: number) {
    setSelectedItems((prev) => prev.filter((i) => i.productId !== productId));
  }

  function resetCreateForm() {
    setForm({ customerId: "", customerName: "", depositAmount: "", dueDate: "", notes: "", paymentMethod: "cash" });
    setSelectedItems([]);
    setProductSearch("");
  }

  async function handleCreate() {
    if (!selectedItems.length) { toast.error("Add at least one product"); return; }
    const deposit = parseFloat(form.depositAmount) || 0;
    if (deposit < 0) { toast.error("Deposit cannot be negative"); return; }

    try {
      await createMutation.mutateAsync({
        data: {
          customerId: form.customerId ? parseInt(form.customerId) : undefined,
          items: selectedItems,
          totalAmount: total,
          depositAmount: deposit,
          dueDate: form.dueDate || undefined,
          notes: form.notes || undefined,
          paymentMethod: form.paymentMethod,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/laybys"] });
      toast.success("Layby created");
      setCreateOpen(false);
      resetCreateForm();
    } catch {
      toast.error("Failed to create layby");
    }
  }

  async function handlePayment() {
    if (!paymentLayby) return;
    const amount = parseFloat(paymentForm.amount);
    if (!amount || amount <= 0) { toast.error("Enter a valid amount"); return; }
    const balance = paymentLayby.balance ?? 0;
    if (amount > balance + 0.01) { toast.error(`Amount exceeds remaining balance of ${formatCurrency(balance)}`); return; }

    try {
      await paymentMutation.mutateAsync({
        id: paymentLayby.id,
        data: {
          amount,
          paymentMethod: paymentForm.paymentMethod,
          note: paymentForm.note || undefined,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/laybys"] });
      toast.success("Payment recorded");
      setPaymentLayby(null);
      setPaymentForm({ amount: "", paymentMethod: "cash", note: "" });
    } catch {
      toast.error("Failed to record payment");
    }
  }

  async function handleCancel() {
    if (!cancelLayby) return;
    try {
      await cancelMutation.mutateAsync({
        id: cancelLayby.id,
        data: { reason: cancelReason || undefined },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/laybys"] });
      toast.success("Layby cancelled");
      setCancelLayby(null);
      setCancelReason("");
    } catch {
      toast.error("Failed to cancel layby");
    }
  }

  async function handleComplete(layby: Layby) {
    try {
      await completeMutation.mutateAsync({ id: layby.id });
      queryClient.invalidateQueries({ queryKey: ["/api/laybys"] });
      toast.success(`${layby.reference} marked as collected`);
    } catch {
      toast.error("Failed to complete layby");
    }
  }

  const counts = {
    all: data?.total ?? 0,
    active: laybys.filter((l) => l.status === "active").length,
    completed: laybys.filter((l) => l.status === "completed").length,
    cancelled: laybys.filter((l) => l.status === "cancelled").length,
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Package2 className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Laybys</h1>
              <p className="text-sm text-muted-foreground">Manage customer layby agreements and instalment payments.</p>
            </div>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" /> New Layby
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)} className="flex-1">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="all">All ({data?.total ?? 0})</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="completed">Collected</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search reference or customer..."
              className="pl-9 w-full sm:w-64"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <Package2 className="w-16 h-16 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-lg">No laybys found</p>
                <p className="text-muted-foreground text-sm">
                  {statusFilter === "all"
                    ? "Start by creating a layby for a customer."
                    : `No ${statusFilter} laybys.`}
                </p>
              </div>
              {statusFilter === "all" && (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" /> New Layby
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((l) => {
              const sb = STATUS_BADGE[l.status] ?? { label: l.status, variant: "secondary" as const };
              const pct = l.totalAmount > 0 ? Math.min(100, Math.round((l.amountPaid / l.totalAmount) * 100)) : 0;
              return (
                <Card key={l.id} className={l.status !== "active" ? "opacity-60" : ""}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-xs text-muted-foreground">{l.reference}</p>
                        <p className="font-semibold">{l.customerName ?? <span className="text-muted-foreground italic">No customer</span>}</p>
                      </div>
                      <Badge variant={sb.variant}>{sb.label}</Badge>
                    </div>

                    <div className="space-y-0.5 text-sm text-muted-foreground">
                      {(l.items as LaybyItem[]).slice(0, 3).map((i, idx) => (
                        <p key={idx}>× {i.quantity} {i.productName}</p>
                      ))}
                      {(l.items as LaybyItem[]).length > 3 && (
                        <p>+{(l.items as LaybyItem[]).length - 3} more</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{pct}% paid</span>
                        <span>{formatCurrency(l.amountPaid)} / {formatCurrency(l.totalAmount)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm border-t pt-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Balance</p>
                        <p className="font-semibold text-primary">{formatCurrency(l.balance ?? 0)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Due date</p>
                        <p className="font-medium text-xs">
                          {l.dueDate ? formatDate(l.dueDate) : <span className="text-muted-foreground/60">—</span>}
                        </p>
                      </div>
                    </div>

                    {l.status === "active" && (
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => { setPaymentLayby(l); setPaymentForm({ amount: "", paymentMethod: "cash", note: "" }); }}
                        >
                          <CreditCard className="w-3.5 h-3.5 mr-1" /> Pay
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => handleComplete(l)}
                          disabled={completeMutation.isPending}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Collect
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => { setCancelLayby(l); setCancelReason(""); }}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}

                    {l.cancelReason && (
                      <p className="text-xs text-muted-foreground border-t pt-2">
                        Reason: {l.cancelReason}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Layby Dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreateForm(); }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Layby</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Customer <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <CustomerSearchInput
                value={form.customerId}
                onChange={(id, c) =>
                  setForm({
                    ...form,
                    customerId: id,
                    customerName: c ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() : "",
                  })
                }
                placeholder="Select customer"
                allowNone
              />
            </div>

            <div className="border rounded-lg p-3 space-y-2">
              <Label>Products</Label>
              <Input
                placeholder="Search products..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
              {filteredProducts.length > 0 && (
                <div className="max-h-36 overflow-y-auto space-y-1 border rounded-md p-1 bg-muted/30">
                  {filteredProducts.slice(0, 20).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => addProduct(p)}
                      className="w-full text-left px-3 py-1.5 rounded hover:bg-background text-sm flex justify-between"
                    >
                      <span>{p.name}</span>
                      <span className="text-muted-foreground">{formatCurrency(p.price ?? 0)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedItems.length > 0 && (
              <div className="border rounded-lg divide-y text-sm">
                {selectedItems.map((i) => (
                  <div key={i.productId} className="flex items-center gap-3 px-3 py-2">
                    <span className="flex-1">{i.productName}</span>
                    <Input
                      type="number"
                      min={1}
                      value={i.quantity}
                      onChange={(e) => updateQty(i.productId, parseInt(e.target.value) || 1)}
                      className="w-16 h-7 text-center"
                    />
                    <span className="w-20 text-right">{formatCurrency(i.price * i.quantity)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={() => removeItem(i.productId)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex justify-between px-3 py-2 font-semibold bg-muted/30">
                  <span>Total</span>
                  <span>{formatCurrency(total)}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Deposit Amount ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.depositAmount}
                  onChange={(e) => setForm({ ...form, depositAmount: e.target.value })}
                  placeholder="0.00"
                />
                {total > 0 && form.depositAmount && (
                  <p className="text-xs text-muted-foreground">
                    Balance: {formatCurrency(Math.max(0, total - parseFloat(form.depositAmount || "0")))}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Payment Method</Label>
                <Select value={form.paymentMethod} onValueChange={(v) => setForm({ ...form, paymentMethod: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="eftpos">EFTPOS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Due Date <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <div className="relative">
                  <CalendarDays className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    type="date"
                    className="pl-8"
                    value={form.dueDate}
                    onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Any additional notes..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending || !selectedItems.length}>
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Layby
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Payment Dialog */}
      <Dialog open={!!paymentLayby} onOpenChange={(open) => { if (!open) setPaymentLayby(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {paymentLayby?.reference} · Balance {formatCurrency(paymentLayby?.balance ?? 0)}
            </p>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Amount ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={paymentLayby?.balance ?? undefined}
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                placeholder="0.00"
                autoFocus
              />
              {paymentLayby && paymentForm.amount && (
                <p className="text-xs text-muted-foreground">
                  Remaining after payment:{" "}
                  {formatCurrency(Math.max(0, (paymentLayby.balance ?? 0) - parseFloat(paymentForm.amount || "0")))}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Payment Method</Label>
              <Select
                value={paymentForm.paymentMethod}
                onValueChange={(v) => setPaymentForm({ ...paymentForm, paymentMethod: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="eftpos">EFTPOS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Note <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input
                value={paymentForm.note}
                onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })}
                placeholder="e.g. Fortnightly payment"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentLayby(null)}>Cancel</Button>
            <Button onClick={handlePayment} disabled={paymentMutation.isPending || !paymentForm.amount}>
              {paymentMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Layby Dialog */}
      <AlertDialog open={!!cancelLayby} onOpenChange={(open) => { if (!open) setCancelLayby(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {cancelLayby?.reference}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel the layby. The customer has paid {formatCurrency(cancelLayby?.amountPaid ?? 0)} so far.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-0 space-y-1.5">
            <Label>Cancellation reason <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea
              rows={2}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Customer requested cancellation"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Layby</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Cancel Layby
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
