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
  Calculator,
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

const NOTES = [
  { label: "$100", value: 100 },
  { label: "$50",  value: 50  },
  { label: "$20",  value: 20  },
  { label: "$10",  value: 10  },
  { label: "$5",   value: 5   },
];

const COINS = [
  { label: "$2",  value: 2    },
  { label: "$1",  value: 1    },
  { label: "50¢", value: 0.5  },
  { label: "20¢", value: 0.2  },
  { label: "10¢", value: 0.1  },
  { label: "5¢",  value: 0.05 },
];

const DENOMINATIONS = [...NOTES, ...COINS];

function denomTotal(counts: Record<number, string>): number {
  return DENOMINATIONS.reduce(
    (s, d) => s + d.value * (parseFloat(counts[d.value] || "0") || 0),
    0,
  );
}

function DenomTable({
  counts,
  onChange,
}: {
  counts: Record<number, string>;
  onChange: (counts: Record<number, string>) => void;
}) {
  const update = (value: number, raw: string) =>
    onChange({ ...counts, [value]: raw });

  return (
    <div className="space-y-3">
      {[
        { heading: "Notes", items: NOTES },
        { heading: "Coins", items: COINS },
      ].map(({ heading, items }) => (
        <div key={heading}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 px-0.5">
            {heading}
          </p>
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
                {items.map((d) => {
                  const count = parseFloat(counts[d.value] || "0") || 0;
                  return (
                    <tr key={d.value} className="hover:bg-muted/20">
                      <td className="p-2.5 font-medium">{d.label}</td>
                      <td className="p-2">
                        <Input
                          type="number"
                          min={0}
                          value={counts[d.value] ?? ""}
                          onChange={(e) => update(d.value, e.target.value)}
                          className="h-8 text-center"
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
      ))}
    </div>
  );
}

export default function POSCashPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate] = useState(today);
  const [tab, setTab] = useState<Tab>("movements");
  const [movType, setMovType] = useState<"opening_float" | "cash_in" | "cash_out">("opening_float");

  // Opening float — denomination counts
  const [openingCounts, setOpeningCounts] = useState<Record<number, string>>({});
  const [openingNote, setOpeningNote] = useState("");

  // Cash in / Cash out — simple amount
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  // Reconcile / closing count — denomination counts
  const [closingCounts, setClosingCounts] = useState<Record<number, string>>({});

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

  const openingTotal  = denomTotal(openingCounts);
  const closingTotal  = denomTotal(closingCounts);

  /* ── Actions ────────────────────────────────────────────────────────── */
  const handleAddOpening = () => {
    if (openingTotal <= 0) { toast.error("Count at least one denomination"); return; }
    createEntry.mutate(
      { data: { type: "opening_float", amount: openingTotal, note: openingNote || "Opening float count", shiftDate: selectedDate } },
      {
        onSuccess: () => {
          toast.success(`Opening float saved: ${formatCurrency(openingTotal)}`);
          setOpeningCounts({});
          setOpeningNote("");
        },
        onError: () => toast.error("Failed to save opening float"),
      },
    );
  };

  const handleAddMovement = () => {
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

  const handleSaveClosingCount = () => {
    if (closingTotal <= 0) { toast.error("Count at least one denomination"); return; }
    createEntry.mutate(
      { data: { type: "closing_count", amount: closingTotal, note: "Physical count", shiftDate: selectedDate } },
      {
        onSuccess: () => {
          toast.success(`Closing count saved: ${formatCurrency(closingTotal)}`);
          setClosingCounts({});
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
        <div className="flex items-center gap-3">
          <Coins className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Cash</h1>
            <p className="text-sm text-muted-foreground">Track cash float, movements, and perform end-of-day till reconciliation.</p>
          </div>
        </div>

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
              <CardContent className="p-4 space-y-4">
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

                {/* Opening Float — denomination counter */}
                {movType === "opening_float" && (
                  <div className="space-y-4">
                    <p className="text-xs text-muted-foreground">
                      Count the notes and coins in the till to set today's opening float.
                    </p>

                    <DenomTable counts={openingCounts} onChange={setOpeningCounts} />

                    <div className="flex items-end gap-3 pt-1">
                      <div className="flex-1">
                        <Input
                          value={openingNote}
                          onChange={(e) => setOpeningNote(e.target.value)}
                          placeholder="Note (optional)"
                        />
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground mb-0.5">Total</p>
                        <p className="text-xl font-bold text-blue-600">{formatCurrency(openingTotal)}</p>
                      </div>
                      <Button
                        onClick={handleAddOpening}
                        disabled={createEntry.isPending || openingTotal <= 0}
                        className="shrink-0"
                      >
                        Save Opening Float
                      </Button>
                    </div>
                  </div>
                )}

                {/* Cash In / Cash Out — simple amount input */}
                {movType !== "opening_float" && (
                  <div className="flex gap-2">
                    <div className="relative w-44 shrink-0">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleAddMovement()}
                        placeholder="0.00"
                        className="pl-7"
                      />
                    </div>
                    <Input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddMovement()}
                      placeholder="Note (optional)"
                      className="flex-1"
                    />
                    <Button onClick={handleAddMovement} disabled={createEntry.isPending} className="shrink-0 px-5">
                      Add
                    </Button>
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

              <p className="text-xs text-muted-foreground">
                Count the notes and coins in the till and enter the quantities below.
              </p>

              <DenomTable counts={closingCounts} onChange={setClosingCounts} />

              {/* Variance summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Expected</p>
                  <p className="font-bold text-lg">{formatCurrency(tillBalance)}</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Counted</p>
                  <p className="font-bold text-lg">{formatCurrency(closingTotal)}</p>
                </div>
                <div className={cn(
                  "rounded-lg border p-3 text-center",
                  closingTotal > 0 && Math.abs(closingTotal - tillBalance) > 0.01
                    ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20"
                    : "",
                )}>
                  <p className="text-xs text-muted-foreground mb-1">Variance</p>
                  <p className={cn(
                    "font-bold text-lg",
                    closingTotal === 0 ? "text-muted-foreground" :
                    closingTotal - tillBalance >= 0 ? "text-green-600" : "text-red-500",
                  )}>
                    {closingTotal === 0 ? "—" : (
                      `${closingTotal - tillBalance >= 0 ? "+" : ""}${formatCurrency(closingTotal - tillBalance)}`
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
                <Button onClick={handleSaveClosingCount} disabled={createEntry.isPending || closingTotal <= 0}>
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
