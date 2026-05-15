import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListTransactions, useGetTransaction, useRefundTransaction, Transaction } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Receipt, Eye, RotateCcw, CreditCard, Banknote } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const paymentMethodIcons: Record<string, React.ReactNode> = {
  card: <CreditCard className="w-4 h-4" />,
  cash: <Banknote className="w-4 h-4" />,
};

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  refunded: "destructive",
  voided: "secondary",
};

export default function TransactionsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [refundingTx, setRefundingTx] = useState<Transaction | null>(null);

  const { data: txData, isLoading } = useListTransactions(
    { status: statusFilter === "all" ? undefined : statusFilter || undefined, limit: 100 },
    { query: { queryKey: ["transactions", statusFilter] } }
  );

  const refundMutation = useRefundTransaction();

  const transactions = txData?.items || [];

  const handleRefund = () => {
    if (!refundingTx) return;
    refundMutation.mutate(
      { id: refundingTx.id, data: { reason: refundReason || "Customer requested refund" } },
      {
        onSuccess: () => {
          toast.success("Transaction refunded");
          setRefundDialogOpen(false);
          setRefundReason("");
          queryClient.invalidateQueries({ queryKey: ["transactions"] });
          if (selectedTx?.id === refundingTx.id) setSelectedTx(null);
        },
        onError: () => toast.error("Failed to process refund"),
      }
    );
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Transactions</h1>
          <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All transactions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Transactions</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading transactions...</div>
        ) : transactions.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <Receipt className="w-16 h-16 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-lg">No transactions yet</p>
                <p className="text-muted-foreground text-sm">Transactions will appear here after your first sale.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-4 font-medium">Receipt</th>
                  <th className="text-left p-4 font-medium hidden md:table-cell">Date</th>
                  <th className="text-left p-4 font-medium hidden sm:table-cell">Payment</th>
                  <th className="text-center p-4 font-medium hidden lg:table-cell">Status</th>
                  <th className="text-right p-4 font-medium">Total</th>
                  <th className="p-4" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="bg-background hover:bg-muted/30 transition-colors">
                    <td className="p-4">
                      <p className="font-mono text-xs font-medium">{tx.receiptNumber}</p>
                      {tx.items && Array.isArray(tx.items) && (
                        <p className="text-xs text-muted-foreground">{(tx.items as any[]).length} item{(tx.items as any[]).length !== 1 ? "s" : ""}</p>
                      )}
                    </td>
                    <td className="p-4 hidden md:table-cell text-muted-foreground text-xs">{formatDate(tx.createdAt)}</td>
                    <td className="p-4 hidden sm:table-cell">
                      <span className="flex items-center gap-1.5 capitalize text-muted-foreground">
                        {paymentMethodIcons[tx.paymentMethod] ?? <CreditCard className="w-4 h-4" />}
                        {tx.paymentMethod}
                      </span>
                    </td>
                    <td className="p-4 text-center hidden lg:table-cell">
                      <Badge variant={statusColors[tx.status] ?? "secondary"} className="capitalize">
                        {tx.status}
                      </Badge>
                    </td>
                    <td className="p-4 text-right font-bold">{formatCurrency(tx.total)}</td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => setSelectedTx(tx)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        {tx.status === "completed" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => { setRefundingTx(tx); setRefundDialogOpen(true); }}
                          >
                            <RotateCcw className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!selectedTx} onOpenChange={(open) => !open && setSelectedTx(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Receipt #{selectedTx?.receiptNumber}</DialogTitle>
          </DialogHeader>
          {selectedTx && (
            <div className="space-y-4 py-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Date</span>
                <span>{formatDate(selectedTx.createdAt)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Payment</span>
                <span className="capitalize">{selectedTx.paymentMethod}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={statusColors[selectedTx.status] ?? "secondary"} className="capitalize">
                  {selectedTx.status}
                </Badge>
              </div>
              <div className="border rounded-lg divide-y">
                {(selectedTx.items as any[]).map((item: any, i: number) => (
                  <div key={i} className="flex justify-between p-3 text-sm">
                    <div>
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(item.unitPrice)} × {item.quantity}
                      </p>
                    </div>
                    <span className="font-medium">{formatCurrency(item.totalPrice)}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1 text-sm border-t pt-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(selectedTx.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GST (10%)</span>
                  <span>{formatCurrency(selectedTx.taxTotal)}</span>
                </div>
                {selectedTx.discountTotal > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>-{formatCurrency(selectedTx.discountTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-base pt-1 border-t">
                  <span>Total</span>
                  <span>{formatCurrency(selectedTx.total)}</span>
                </div>
              </div>
              {selectedTx.notes && (
                <p className="text-xs text-muted-foreground italic">{selectedTx.notes}</p>
              )}
            </div>
          )}
          <DialogFooter>
            {selectedTx?.status === "completed" && (
              <Button
                variant="destructive"
                onClick={() => { setRefundingTx(selectedTx); setSelectedTx(null); setRefundDialogOpen(true); }}
              >
                <RotateCcw className="w-4 h-4 mr-2" /> Refund
              </Button>
            )}
            <Button variant="outline" onClick={() => setSelectedTx(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refund Transaction</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground text-sm">
            Refund <strong>{formatCurrency(refundingTx?.total || 0)}</strong> for receipt{" "}
            <strong>{refundingTx?.receiptNumber}</strong>?
          </p>
          <div>
            <Label>Reason (optional)</Label>
            <Input
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="Customer requested refund"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRefund} disabled={refundMutation.isPending}>
              Process Refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
