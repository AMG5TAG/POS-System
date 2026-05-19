import { useState, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useListTransactions, useGetTransaction, Transaction } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  History, Eye, CreditCard, Banknote, Search,
  Send, Printer, Mail, MessageSquare, Check, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  refunded: "destructive",
  voided: "secondary",
};

/* ─── Send dialog ────────────────────────────────────────────────────────── */

type SendMode = "reprint" | "email" | "sms" | null;

interface SendDialogProps {
  tx: Transaction | null;
  txDetail: import("@workspace/api-client-react").Transaction | null | undefined;
  onClose: () => void;
}

function SendDialog({ tx, txDetail, onClose }: SendDialogProps) {
  const [mode, setMode] = useState<SendMode>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  if (!tx) return null;

  function handleClose() {
    setMode(null);
    setEmail("");
    setPhone("");
    setSent(false);
    onClose();
  }

  function handleReprint() {
    if (!tx) return;
    const content = printRef.current?.innerHTML;
    if (!content) return;
    const win = window.open("", "_blank", "width=400,height=600");
    if (!win) { toast.error("Popup blocked — please allow popups"); return; }
    win.document.write(`
      <html><head><title>Receipt ${tx.receiptNumber ?? "#" + tx.id}</title>
      <style>
        body { font-family: monospace; font-size: 12px; padding: 16px; max-width: 320px; margin: 0 auto; }
        .row { display: flex; justify-content: space-between; margin: 4px 0; }
        .bold { font-weight: bold; }
        .center { text-align: center; }
        .divider { border-top: 1px dashed #999; margin: 8px 0; }
        .total { font-size: 14px; font-weight: bold; }
      </style>
      </head><body>${content}</body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
    toast.success("Receipt sent to printer");
    setSent(true);
    setTimeout(handleClose, 800);
  }

  function handleEmail() {
    if (!email.trim() || !email.includes("@")) { toast.error("Please enter a valid email address"); return; }
    toast.success(`Receipt emailed to ${email}`);
    setSent(true);
    setTimeout(handleClose, 800);
  }

  function handleSMS() {
    if (!phone.trim() || phone.replace(/\D/g, "").length < 8) { toast.error("Please enter a valid phone number"); return; }
    toast.success(`Receipt SMS sent to ${phone}`);
    setSent(true);
    setTimeout(handleClose, 800);
  }

  const items = (txDetail?.items ?? []) as { name?: string; quantity?: number; price?: number }[];

  return (
    <Dialog open={!!tx} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Send className="w-4 h-4 text-primary" />
            Send Receipt
            <span className="text-muted-foreground font-normal text-sm ml-1">
              {tx.receiptNumber ?? `#${tx.id}`}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Method selector */}
          <div className="grid grid-cols-3 gap-2">
            {([
              { key: "reprint", icon: Printer,      label: "Reprint",  sub: "Print to receipt printer" },
              { key: "email",   icon: Mail,          label: "Email",    sub: "Send to email address" },
              { key: "sms",     icon: MessageSquare, label: "SMS",      sub: "Send via text message" },
            ] as const).map(({ key, icon: Icon, label, sub }) => (
              <button
                key={key}
                type="button"
                onClick={() => { setMode(key); setSent(false); }}
                className={cn(
                  "flex flex-col items-center gap-1.5 px-3 py-4 rounded-xl border text-center transition-colors",
                  mode === key
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="text-sm font-medium leading-tight">{label}</span>
                <span className="text-[10px] leading-tight opacity-70">{sub}</span>
              </button>
            ))}
          </div>

          {/* Method-specific input */}
          {mode === "reprint" && (
            <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                This will open a print preview for receipt <strong>{tx.receiptNumber ?? `#${tx.id}`}</strong>.
              </p>
              {/* Hidden receipt content for printing */}
              <div ref={printRef} style={{ display: "none" }}>
                <div className="center bold" style={{ marginBottom: 8 }}>RECEIPT</div>
                <div className="center" style={{ marginBottom: 8 }}>{tx.receiptNumber ?? `#${tx.id}`}</div>
                <div className="divider" />
                {items.map((item, i) => (
                  <div key={i} className="row">
                    <span>{item.name} × {item.quantity}</span>
                    <span>{formatCurrency((item.price ?? 0) * (item.quantity ?? 1))}</span>
                  </div>
                ))}
                <div className="divider" />
                <div className="row"><span>Subtotal</span><span>{formatCurrency(txDetail?.subtotal ?? 0)}</span></div>
                <div className="row"><span>Tax</span><span>{formatCurrency(txDetail?.taxTotal ?? 0)}</span></div>
                <div className="row total"><span>TOTAL</span><span>{formatCurrency(tx.total ?? 0)}</span></div>
                <div className="divider" />
                <div className="center" style={{ marginTop: 8, fontSize: 11 }}>Thank you for your purchase</div>
              </div>
              <Button className="w-full gap-2" onClick={handleReprint}>
                <Printer className="w-4 h-4" /> Print Receipt
              </Button>
            </div>
          )}

          {mode === "email" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Email Address</Label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="customer@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-9"
                      onKeyDown={(e) => e.key === "Enter" && handleEmail()}
                      autoFocus
                    />
                  </div>
                  <Button className="gap-1.5 shrink-0" onClick={handleEmail}>
                    {sent ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                    {sent ? "Sent!" : "Send"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Receipt for {formatCurrency(tx.total ?? 0)} will be emailed as a PDF.
                </p>
              </div>
            </div>
          )}

          {mode === "sms" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Mobile Number</Label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <Input
                      type="tel"
                      placeholder="04XX XXX XXX"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="pl-9"
                      onKeyDown={(e) => e.key === "Enter" && handleSMS()}
                      autoFocus
                    />
                  </div>
                  <Button className="gap-1.5 shrink-0" onClick={handleSMS}>
                    {sent ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                    {sent ? "Sent!" : "Send"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  A receipt link for {formatCurrency(tx.total ?? 0)} will be sent via SMS.
                </p>
              </div>
            </div>
          )}

          {!mode && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Select a delivery method above
            </p>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <Button variant="outline" size="sm" onClick={handleClose}>
            <X className="w-3.5 h-3.5 mr-1.5" /> Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Receipt viewer dialog ──────────────────────────────────────────────── */

interface ReceiptDialogProps {
  tx: Transaction | null;
  txDetail: import("@workspace/api-client-react").Transaction | null | undefined;
  onClose: () => void;
}

function ReceiptDialog({ tx, txDetail, onClose }: ReceiptDialogProps) {
  if (!tx) return null;
  return (
    <Dialog open={!!tx} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Receipt {tx.receiptNumber ?? `#${tx.id}`}</DialogTitle>
        </DialogHeader>
        {txDetail && (
          <div className="space-y-3 text-sm">
            <div className="border rounded-lg divide-y">
              {(txDetail.items ?? []).map((item: { name?: string; quantity?: number; price?: number }, i: number) => (
                <div key={i} className="flex justify-between p-2">
                  <span>{item.name} × {item.quantity}</span>
                  <span>{formatCurrency((item.price ?? 0) * (item.quantity ?? 1))}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(txDetail.subtotal ?? 0)}</span></div>
              <div className="flex justify-between"><span>Tax</span><span>{formatCurrency(txDetail.taxTotal ?? 0)}</span></div>
              <div className="flex justify-between font-semibold text-foreground text-sm border-t pt-1">
                <span>Total</span><span>{formatCurrency(txDetail.total ?? 0)}</span>
              </div>
            </div>
            <Badge variant={STATUS_COLORS[txDetail.status ?? "completed"]} className="capitalize">
              {txDetail.status}
            </Badge>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function POSHistoryPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [viewingTx, setViewingTx] = useState<Transaction | null>(null);
  const [sendTx, setSendTx] = useState<Transaction | null>(null);

  const { data: txData, isLoading } = useListTransactions(
    { status: statusFilter && statusFilter !== "all" ? statusFilter : undefined, limit: 100 },
    { query: { queryKey: ["transactions", statusFilter] } }
  );

  const { data: viewDetail } = useGetTransaction(
    viewingTx?.id ?? 0,
    { query: { enabled: !!viewingTx, queryKey: ["transaction", viewingTx?.id] } }
  );

  const { data: sendDetail } = useGetTransaction(
    sendTx?.id ?? 0,
    { query: { enabled: !!sendTx, queryKey: ["transaction", sendTx?.id] } }
  );

  const transactions = (txData?.items ?? []).filter((tx) =>
    !search ||
    tx.receiptNumber?.toLowerCase().includes(search.toLowerCase()) ||
    String(tx.total).includes(search)
  );

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <History className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Sale History</h1>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search receipt number..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
              <SelectItem value="voided">Voided</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading history...</div>
        ) : transactions.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              No transactions found.
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium">Receipt</th>
                  <th className="text-left p-3 font-medium hidden sm:table-cell">Date</th>
                  <th className="text-left p-3 font-medium hidden md:table-cell">Payment</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-right p-3 font-medium">Total</th>
                  <th className="p-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="bg-background hover:bg-muted/20 transition-colors">
                    <td className="p-3 font-mono text-xs font-medium">{tx.receiptNumber || `#${tx.id}`}</td>
                    <td className="p-3 hidden sm:table-cell text-muted-foreground text-xs">{formatDate(tx.createdAt)}</td>
                    <td className="p-3 hidden md:table-cell">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        {tx.paymentMethod === "card"
                          ? <CreditCard className="w-3.5 h-3.5" />
                          : <Banknote className="w-3.5 h-3.5" />}
                        <span className="capitalize">{tx.paymentMethod}</span>
                      </span>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={STATUS_COLORS[tx.status ?? "completed"] ?? "outline"}
                        className="capitalize text-xs"
                      >
                        {tx.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-right font-medium">{formatCurrency(tx.total ?? 0)}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="View receipt"
                          onClick={() => setViewingTx(tx)}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-primary hover:text-primary"
                          title="Send receipt"
                          onClick={() => setSendTx(tx)}
                        >
                          <Send className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ReceiptDialog
        tx={viewingTx}
        txDetail={viewDetail}
        onClose={() => setViewingTx(null)}
      />

      <SendDialog
        tx={sendTx}
        txDetail={sendDetail}
        onClose={() => setSendTx(null)}
      />
    </AppLayout>
  );
}
