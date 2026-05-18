import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListCashDrawerEntries,
  useCreateCashDrawerEntry,
  useDeleteCashDrawerEntry,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Coins, Plus, TrendingUp, TrendingDown, Lock, Unlock, Trash2, CalendarDays } from "lucide-react";
import { toast } from "sonner";

type EntryType = "opening_float" | "cash_in" | "cash_out" | "closing_count";

const TYPE_LABELS: Record<EntryType, string> = {
  opening_float: "Opening Float",
  cash_in: "Cash In",
  cash_out: "Cash Out",
  closing_count: "Closing Count",
};
const TYPE_COLORS: Record<EntryType, string> = {
  opening_float: "text-blue-600",
  cash_in: "text-green-600",
  cash_out: "text-red-600",
  closing_count: "text-purple-600",
};
const TYPE_SIGNS: Record<EntryType, number> = {
  opening_float: 1, cash_in: 1, cash_out: -1, closing_count: 0,
};

const DENOMINATIONS = [
  { label: "$100", value: 100 }, { label: "$50", value: 50 }, { label: "$20", value: 20 },
  { label: "$10", value: 10 }, { label: "$5", value: 5 }, { label: "$2", value: 2 },
  { label: "$1", value: 1 }, { label: "50¢", value: 0.5 }, { label: "20¢", value: 0.2 },
  { label: "10¢", value: 0.1 }, { label: "5¢", value: 0.05 },
];

export default function POSCashPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(today);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [countOpen, setCountOpen] = useState(false);
  const [form, setForm] = useState({ type: "cash_in" as EntryType, amount: "", note: "" });
  const [denomCounts, setDenomCounts] = useState<Record<number, string>>({});

  const { data: entries = [], isLoading } = useListCashDrawerEntries({ date: selectedDate });
  const createEntry = useCreateCashDrawerEntry();
  const deleteEntry = useDeleteCashDrawerEntry();

  const addEntry = () => {
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { toast.error("Enter a valid amount"); return; }
    createEntry.mutate(
      { data: { type: form.type, amount, note: form.note || undefined, shiftDate: selectedDate } },
      {
        onSuccess: () => {
          toast.success(`${TYPE_LABELS[form.type]} recorded`);
          setDialogOpen(false);
          setForm({ type: "cash_in", amount: "", note: "" });
        },
        onError: () => toast.error("Failed to save entry"),
      }
    );
  };

  const saveCount = () => {
    const total = DENOMINATIONS.reduce(
      (s, d) => s + d.value * (parseFloat(denomCounts[d.value] || "0") || 0), 0
    );
    createEntry.mutate(
      { data: { type: "closing_count", amount: total, note: "Physical count", shiftDate: selectedDate } },
      {
        onSuccess: () => {
          toast.success(`Closing count: ${formatCurrency(total)}`);
          setCountOpen(false);
          setDenomCounts({});
        },
        onError: () => toast.error("Failed to save count"),
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteEntry.mutate({ id }, {
      onSuccess: () => toast.success("Entry removed"),
      onError: () => toast.error("Failed to delete"),
    });
  };

  const cashBalance = entries
    .filter((e) => e.type !== "closing_count")
    .reduce((s, e) => s + (e.amount ?? 0) * (TYPE_SIGNS[e.type as EntryType] ?? 0), 0);
  const lastCount = [...entries].reverse().find((e) => e.type === "closing_count");
  const variance = lastCount ? (lastCount.amount ?? 0) - cashBalance : null;
  const hasFloat = entries.some((e) => e.type === "opening_float");
  const countedTotal = DENOMINATIONS.reduce(
    (s, d) => s + d.value * (parseFloat(denomCounts[d.value] || "0") || 0), 0
  );

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Coins className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Cash Management</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2 border rounded-lg px-3 py-1.5 bg-background text-sm">
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-sm outline-none"
              />
            </div>
            <Button variant="outline" onClick={() => setCountOpen(true)}>
              <Lock className="w-4 h-4 mr-2" /> Count Drawer
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Add Entry
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{formatCurrency(cashBalance)}</p>
              <p className="text-xs text-muted-foreground mt-1">Expected in Drawer</p>
            </CardContent>
          </Card>
          {lastCount && (
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{formatCurrency(lastCount.amount ?? 0)}</p>
                <p className="text-xs text-muted-foreground mt-1">Last Count</p>
              </CardContent>
            </Card>
          )}
          {variance !== null && (
            <Card className={Math.abs(variance) < 0.01 ? "" : "border-amber-200 bg-amber-50"}>
              <CardContent className="p-4 text-center">
                <p className={`text-2xl font-bold ${variance >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {variance >= 0 ? "+" : ""}{formatCurrency(variance)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Variance</p>
              </CardContent>
            </Card>
          )}
        </div>

        {!hasFloat && !isLoading && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Unlock className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <p className="font-medium text-sm">No opening float set for {selectedDate}</p>
                  <p className="text-xs text-muted-foreground">Record your starting cash to begin tracking</p>
                </div>
              </div>
              <Button size="sm" onClick={() => {
                setForm({ type: "opening_float", amount: "", note: "Opening float" });
                setDialogOpen(true);
              }}>
                Set Float
              </Button>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : entries.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No cash entries for {selectedDate}. Start by setting your opening float.
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium">Type</th>
                  <th className="text-left p-3 font-medium hidden sm:table-cell">Note</th>
                  <th className="text-left p-3 font-medium hidden md:table-cell">Time</th>
                  <th className="text-right p-3 font-medium">Amount</th>
                  <th className="p-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {[...entries].reverse().map((e) => (
                  <tr key={e.id} className="bg-background hover:bg-muted/20">
                    <td className="p-3">
                      <span className={`font-medium text-xs ${TYPE_COLORS[e.type as EntryType] ?? "text-muted-foreground"}`}>
                        {TYPE_LABELS[e.type as EntryType] ?? e.type}
                      </span>
                    </td>
                    <td className="p-3 hidden sm:table-cell text-muted-foreground">{e.note || "—"}</td>
                    <td className="p-3 hidden md:table-cell text-muted-foreground text-xs">{formatDate(e.createdAt)}</td>
                    <td className="p-3 text-right font-medium">
                      {e.type === "cash_out" ? (
                        <span className="text-red-600 flex items-center justify-end gap-1">
                          <TrendingDown className="w-3 h-3" />−{formatCurrency(e.amount ?? 0)}
                        </span>
                      ) : (
                        <span className="text-green-600 flex items-center justify-end gap-1">
                          <TrendingUp className="w-3 h-3" />+{formatCurrency(e.amount ?? 0)}
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(e.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add entry dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Cash Entry</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as EntryType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Amount ($)</Label>
              <Input type="number" step="0.01" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Reason..." />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={addEntry} disabled={createEntry.isPending}>Save Entry</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Denomination count dialog */}
      <Dialog open={countOpen} onOpenChange={setCountOpen}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Count Cash Drawer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b">
                  <tr>
                    <th className="text-left p-2.5 font-medium">Denomination</th>
                    <th className="text-center p-2.5 font-medium w-24">Count</th>
                    <th className="text-right p-2.5 font-medium w-24">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {DENOMINATIONS.map((d) => {
                    const count = parseFloat(denomCounts[d.value] || "0") || 0;
                    return (
                      <tr key={d.value} className="hover:bg-muted/20">
                        <td className="p-2.5 font-medium">{d.label}</td>
                        <td className="p-2">
                          <Input type="number" min={0} value={denomCounts[d.value] ?? ""}
                            onChange={(e) => setDenomCounts((p) => ({ ...p, [d.value]: e.target.value }))}
                            className="h-7 text-center" placeholder="0" />
                        </td>
                        <td className="p-2.5 text-right text-muted-foreground">
                          {count > 0 ? formatCurrency(count * d.value) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between items-center font-semibold p-2 border rounded-lg bg-muted/30">
              <span>Total Count</span>
              <span className="text-lg">{formatCurrency(countedTotal)}</span>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCountOpen(false)}>Cancel</Button>
              <Button onClick={saveCount} disabled={createEntry.isPending}>
                <Lock className="w-4 h-4 mr-2" /> Save Count
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
