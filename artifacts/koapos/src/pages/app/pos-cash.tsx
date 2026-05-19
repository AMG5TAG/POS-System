import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListCashDrawerEntries,
  useCreateCashDrawerEntry,
  useDeleteCashDrawerEntry,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import {
  Coins, TrendingUp, TrendingDown, Trash2, Printer,
  ChevronDown, ChevronUp, Calculator,
} from "lucide-react";
import { toast } from "sonner";

type EntryType = "opening_float" | "cash_in" | "cash_out" | "closing_count";
type Tab = "movements" | "reconcile";

const TYPE_LABELS: Record<EntryType, string> = {
  opening_float: "Opening Float",
  cash_in:       "Cash In",
  cash_out:      "Cash Out",
  closing_count: "Closing Count",
};

const TYPE_COLORS: Record<EntryType, string> = {
  opening_float: "text-blue-600",
  cash_in:       "text-green-600",
  cash_out:      "text-red-500",
  closing_count: "text-purple-600",
};

const DENOMINATIONS = [
  { label: "$100", value: 100 }, { label: "$50", value: 50 }, { label: "$20", value: 20 },
  { label: "$10", value: 10 },  { label: "$5",  value: 5  }, { label: "$2",  value: 2  },
  { label: "$1",  value: 1  },  { label: "50¢", value: 0.5 }, { label: "20¢", value: 0.2 },
  { label: "10¢", value: 0.1 }, { label: "5¢",  value: 0.05 },
];

export default function POSCashPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate] = useState(today);
  const [tab, setTab] = useState<Tab>("movements");
  const [movType, setMovType] = useState<"opening_float" | "cash_in" | "cash_out">("opening_float");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [showDenom, setShowDenom] = useState(false);
  const [denomCounts, setDenomCounts] = useState<Record<number, string>>({});

  const { data: entries = [], isLoading } = useListCashDrawerEntries({ date: selectedDate });
  const createEntry = useCreateCashDrawerEntry();
  const deleteEntry = useDeleteCashDrawerEntry();

  /* ── Derived totals ─────────────────────────────────────────────────── */
  const openingFloat = entries
    .filter((e) => e.type === "opening_float")
    .reduce((s, e) => s + (e.amount ?? 0), 0);

  const cashIn = entries
    .filter((e) => e.type === "cash_in")
    .reduce((s, e) => s + (e.amount ?? 0), 0);

  const cashOut = entries
    .filter((e) => e.type === "cash_out")
    .reduce((s, e) => s + (e.amount ?? 0), 0);

  const tillBalance = openingFloat + cashIn - cashOut;

  const lastCount = [...entries].reverse().find((e) => e.type === "closing_count");
  const variance = lastCount ? (lastCount.amount ?? 0) - tillBalance : null;

  const countedTotal = DENOMINATIONS.reduce(
    (s, d) => s + d.value * (parseFloat(denomCounts[d.value] || "0") || 0), 0,
  );

  /* ── Actions ────────────────────────────────────────────────────────── */
  const handleAdd = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error("Enter a valid amount"); return; }
    createEntry.mutate(
      { data: { type: movType, amount: amt, note: note || undefined, shiftDate: selectedDate } },
      {
        onSuccess: () => {
          toast.success(`${TYPE_LABELS[movType]} recorded`);
          setAmount("");
          setNote("");
        },
        onError: () => toast.error("Failed to save entry"),
      },
    );
  };

  const handleSaveCount = () => {
    createEntry.mutate(
      { data: { type: "closing_count", amount: countedTotal, note: "Physical count", shiftDate: selectedDate } },
      {
        onSuccess: () => {
          toast.success(`Closing count saved: ${formatCurrency(countedTotal)}`);
          setDenomCounts({});
          setShowDenom(false);
        },
        onError: () => toast.error("Failed to save count"),
      },
    );
  };

  const handleDelete = (id: number) => {
    deleteEntry.mutate({ id }, {
      onSuccess: () => toast.success("Entry removed"),
      onError:  () => toast.error("Failed to delete"),
    });
  };

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4">

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <div className="flex gap-2">
          <button
            onClick={() => setTab("movements")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-colors",
              tab === "movements"
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            <Coins className="w-4 h-4" />
            Movements
          </button>
          <button
            onClick={() => setTab("reconcile")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-colors",
              tab === "reconcile"
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            <Calculator className="w-4 h-4" />
            Reconcile
          </button>
        </div>

        {/* ── Summary cards ────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Opening Float</p>
              <p className="text-xl font-bold text-blue-600">{formatCurrency(openingFloat)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Cash In</p>
              <p className="text-xl font-bold text-green-600">{formatCurrency(cashIn)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Cash Out</p>
              <p className="text-xl font-bold text-red-500">{formatCurrency(cashOut)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Till Balance</p>
              <p className="text-xl font-bold text-primary">{formatCurrency(tillBalance)}</p>
            </CardContent>
          </Card>
        </div>

        {/* ── Movements tab ────────────────────────────────────────────── */}
        {tab === "movements" && (
          <>
            {/* Record movement card */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <p className="flex items-center gap-2 font-semibold text-sm">
                  <Coins className="w-4 h-4 text-primary" />
                  Record Cash Movement
                </p>

                {/* Type selector */}
                <div className="flex gap-2">
                  {(["opening_float", "cash_in", "cash_out"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setMovType(t)}
                      className={cn(
                        "flex-1 py-2 rounded-xl border text-xs font-semibold transition-colors",
                        movType === t
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50",
                      )}
                    >
                      {t === "opening_float" && "🏦 Opening Float"}
                      {t === "cash_in"       && "↑ Cash In"}
                      {t === "cash_out"      && "↓ Cash Out"}
                    </button>
                  ))}
                </div>

                {/* Inline input row */}
                <div className="flex gap-2">
                  <div className="relative w-44 shrink-0">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">$</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                      placeholder="0.00"
                      className="pl-7"
                    />
                  </div>
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                    placeholder="Note (optional)"
                    className="flex-1"
                  />
                  <Button onClick={handleAdd} disabled={createEntry.isPending} className="shrink-0 px-5">
                    Add
                  </Button>
                </div>

                {/* Denomination counter toggle */}
                <button
                  onClick={() => setShowDenom((v) => !v)}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                >
                  <Calculator className="w-3.5 h-3.5" />
                  {showDenom ? "Hide" : "Show"} Denomination Counter
                  {showDenom ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {/* Denomination counter panel */}
                {showDenom && (
                  <div className="space-y-3 pt-1 border-t">
                    <div className="rounded-lg border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 border-b">
                          <tr>
                            <th className="text-left p-2.5 font-medium">Denomination</th>
                            <th className="text-center p-2.5 font-medium w-28">Count</th>
                            <th className="text-right p-2.5 font-medium w-28">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {DENOMINATIONS.map((d) => {
                            const count = parseFloat(denomCounts[d.value] || "0") || 0;
                            return (
                              <tr key={d.value} className="hover:bg-muted/20">
                                <td className="p-2.5 font-medium">{d.label}</td>
                                <td className="p-2">
                                  <Input
                                    type="number" min={0}
                                    value={denomCounts[d.value] ?? ""}
                                    onChange={(e) => setDenomCounts((p) => ({ ...p, [d.value]: e.target.value }))}
                                    className="h-7 text-center"
                                    placeholder="0"
                                  />
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
                    <div className="flex items-center justify-between px-1">
                      <div>
                        <p className="text-xs text-muted-foreground">Counted total</p>
                        <p className="text-lg font-bold">{formatCurrency(countedTotal)}</p>
                      </div>
                      <Button onClick={handleSaveCount} disabled={createEntry.isPending || countedTotal === 0}>
                        Save Closing Count
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Transaction Log */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-sm">Transaction Log</h2>
                  <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
                    <Printer className="w-3.5 h-3.5" />
                    Z-Read
                  </Button>
                </div>

                {isLoading ? (
                  <div className="space-y-2">
                    {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
                  </div>
                ) : entries.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    No cash movements recorded yet.
                  </p>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 border-b">
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
                          <tr key={e.id} className="hover:bg-muted/20">
                            <td className="p-3">
                              <span className={cn("font-medium text-xs", TYPE_COLORS[e.type as EntryType] ?? "text-muted-foreground")}>
                                {TYPE_LABELS[e.type as EntryType] ?? e.type}
                              </span>
                            </td>
                            <td className="p-3 hidden sm:table-cell text-muted-foreground text-xs">{e.note || "—"}</td>
                            <td className="p-3 hidden md:table-cell text-muted-foreground text-xs">{formatDate(e.createdAt)}</td>
                            <td className="p-3 text-right font-medium">
                              {e.type === "cash_out" ? (
                                <span className="text-red-500 flex items-center justify-end gap-1">
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
              </CardContent>
            </Card>
          </>
        )}

        {/* ── Reconcile tab ─────────────────────────────────────────────── */}
        {tab === "reconcile" && (
          <Card>
            <CardContent className="p-4 space-y-4">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <Calculator className="w-4 h-4 text-primary" />
                End-of-Day Reconciliation
              </h2>

              {/* Count drawer */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Physical Count</p>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 border-b">
                      <tr>
                        <th className="text-left p-2.5 font-medium">Denomination</th>
                        <th className="text-center p-2.5 font-medium w-28">Count</th>
                        <th className="text-right p-2.5 font-medium w-28">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {DENOMINATIONS.map((d) => {
                        const count = parseFloat(denomCounts[d.value] || "0") || 0;
                        return (
                          <tr key={d.value} className="hover:bg-muted/20">
                            <td className="p-2.5 font-medium">{d.label}</td>
                            <td className="p-2">
                              <Input
                                type="number" min={0}
                                value={denomCounts[d.value] ?? ""}
                                onChange={(e) => setDenomCounts((p) => ({ ...p, [d.value]: e.target.value }))}
                                className="h-7 text-center"
                                placeholder="0"
                              />
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
              </div>

              {/* Variance summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Expected</p>
                  <p className="font-bold text-lg">{formatCurrency(tillBalance)}</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Counted</p>
                  <p className="font-bold text-lg">{formatCurrency(countedTotal)}</p>
                </div>
                <div className={cn(
                  "rounded-lg border p-3 text-center",
                  countedTotal > 0 && Math.abs(countedTotal - tillBalance) > 0.01
                    ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20"
                    : "",
                )}>
                  <p className="text-xs text-muted-foreground mb-1">Variance</p>
                  <p className={cn(
                    "font-bold text-lg",
                    countedTotal === 0 ? "text-muted-foreground" :
                    countedTotal - tillBalance >= 0 ? "text-green-600" : "text-red-500",
                  )}>
                    {countedTotal === 0 ? "—" : (
                      `${countedTotal - tillBalance >= 0 ? "+" : ""}${formatCurrency(countedTotal - tillBalance)}`
                    )}
                  </p>
                </div>
              </div>

              {lastCount && (
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <span className="text-muted-foreground">Last closing count: </span>
                  <span className="font-semibold">{formatCurrency(lastCount.amount ?? 0)}</span>
                  <span className="text-muted-foreground"> · {formatDate(lastCount.createdAt)}</span>
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={handleSaveCount} disabled={createEntry.isPending || countedTotal === 0}>
                  Save Closing Count
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </AppLayout>
  );
}
