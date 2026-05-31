import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListPosRegisterSessions,
  useListPosRegisters,
  useListCashDrawerEntries,
  useCreateCashDrawerEntry,
  useCreatePosRegisterSession,
  useUpdatePosRegisterSession,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Monitor, DollarSign, ArrowDownLeft, ArrowUpRight,
  Lock, LockOpen, Plus, Minus, TrendingUp, Printer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

const toISO = (d: Date) => d.toISOString().split("T")[0];
const TODAY = toISO(new Date());
const fmt   = (n: number) => `$${n.toFixed(2)}`;

type Session = {
  id: number;
  registerId: string;
  openedAt: string;
  openedBy: string;
  openingFloat: string;
  openingNotes: string;
  txCount: number;
  closedAt: string | null;
  cashCounted: string | null;
  eftposDeclared: string | null;
  closingNotes: string | null;
};

type Entry = {
  id: number;
  type: string;
  amount: number;
  note: string | null;
  shiftDate: string;
  createdAt: string;
};

export default function PosEodPage() {
  const qc = useQueryClient();
  const [registerId, setRegisterId] = useState("default");
  const createSession = useCreatePosRegisterSession();
  const updateSession = useUpdatePosRegisterSession();

  const { data: regsData }     = useListPosRegisters({});
  const registers: { registerId: string; name: string }[] =
    (regsData as { items?: { registerId: string; name: string }[] })?.items ?? [];

  const { data: sessData, isLoading: sessLoading } = useListPosRegisterSessions(
    { registerId },
    { query: { queryKey: ["pos-register-sessions", registerId] } }
  );
  const sessions: Session[] = (sessData as { items?: Session[] })?.items ?? [];

  const { data: rawEntries = [], isLoading: entriesLoading } = useListCashDrawerEntries(
    { date: TODAY },
    { query: { queryKey: ["cash-drawer", TODAY] } }
  );
  const entries = rawEntries as Entry[];

  const createEntry = useCreateCashDrawerEntry();

  const openSession  = sessions.find(s => !s.closedAt);
  const closedToday  = sessions.filter(s => s.closedAt && s.closedAt.startsWith(TODAY));

  /* ── open dialog ── */
  const [openDlg, setOpenDlg]   = useState(false);
  const [openForm, setOpenForm] = useState({ openingFloat: "200.00", openedBy: "", openingNotes: "" });
  const [saving, setSaving]     = useState(false);

  function handleOpen() {
    setSaving(true);
    createSession.mutate(
      { data: { registerId, openedBy: openForm.openedBy, openingFloat: openForm.openingFloat, openingNotes: openForm.openingNotes } },
      {
        onSuccess: () => {
          toast.success("Register opened");
          setOpenDlg(false);
          setOpenForm({ openingFloat: "200.00", openedBy: "", openingNotes: "" });
          qc.invalidateQueries({ queryKey: ["pos-register-sessions"] });
        },
        onError: () => toast.error("Failed to open register"),
        onSettled: () => setSaving(false),
      }
    );
  }

  /* ── close dialog ── */
  const [closeDlg, setCloseDlg]   = useState(false);
  const [closeForm, setCloseForm] = useState({ cashCounted: "", eftposDeclared: "0.00", closingNotes: "" });

  const openingFloat  = parseFloat(openSession?.openingFloat ?? "0");
  const cashIn        = entries.filter(e => e.type === "cash_in").reduce((s, e) => s + e.amount, 0);
  const cashOut       = entries.filter(e => e.type === "cash_out").reduce((s, e) => s + e.amount, 0);
  const expectedCash  = openingFloat + cashIn - cashOut;
  const cashVariance  = closeForm.cashCounted !== "" ? parseFloat(closeForm.cashCounted) - expectedCash : null;

  function handleClose() {
    if (!openSession) return;
    setSaving(true);
    updateSession.mutate(
      { id: openSession.id, data: { closedAt: new Date().toISOString(), cashCounted: closeForm.cashCounted || "0", eftposDeclared: closeForm.eftposDeclared || "0", closingNotes: closeForm.closingNotes } },
      {
        onSuccess: () => {
          toast.success("Register closed — Z-Read recorded");
          setCloseDlg(false);
          setCloseForm({ cashCounted: "", eftposDeclared: "0.00", closingNotes: "" });
          qc.invalidateQueries({ queryKey: ["pos-register-sessions"] });
        },
        onError: () => toast.error("Failed to close register"),
        onSettled: () => setSaving(false),
      }
    );
  }

  /* ── cash movement dialog ── */
  const [moveDlg, setMoveDlg]   = useState(false);
  const [moveForm, setMoveForm] = useState({ type: "cash_in" as "cash_in" | "cash_out", amount: "", note: "" });

  function handleAddEntry() {
    if (!moveForm.amount) return;
    createEntry.mutate(
      { data: { type: moveForm.type, amount: parseFloat(moveForm.amount) || 0, note: moveForm.note || undefined, shiftDate: TODAY } },
      {
        onSuccess: () => {
          toast.success(moveForm.type === "cash_in" ? "Cash In recorded" : "Cash Out recorded");
          setMoveDlg(false);
          setMoveForm({ type: "cash_in", amount: "", note: "" });
          qc.invalidateQueries({ queryKey: ["cash-drawer"] });
        },
        onError: () => toast.error("Failed to record movement"),
      }
    );
  }

  const registerOptions = registers.length
    ? registers.map(r => ({ value: r.registerId, label: r.name }))
    : [{ value: "default", label: "Default Register" }];

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Monitor className="w-6 h-6 text-primary" /> End of Day
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Open and close register sessions, track float movements, and record your Z-read.
            </p>
          </div>
          <Select value={registerId} onValueChange={setRegisterId}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {registerOptions.map(r => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* ── Session banner ── */}
        <div className={cn(
          "rounded-lg border p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4",
          openSession ? "border-green-300 bg-green-50 dark:bg-green-950/20" : "border-muted bg-muted/20"
        )}>
          <div className="flex items-center gap-3">
            {openSession
              ? <LockOpen className="w-5 h-5 text-green-600 shrink-0" />
              : <Lock className="w-5 h-5 text-muted-foreground shrink-0" />}
            <div>
              <p className={cn("font-semibold", openSession ? "text-green-800 dark:text-green-300" : "text-foreground")}>
                {sessLoading ? "Loading…" : openSession ? "Register is open" : "Register is closed"}
              </p>
              {openSession && (
                <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                  Opened{openSession.openedBy ? ` by ${openSession.openedBy}` : ""} at{" "}
                  {format(new Date(openSession.openedAt), "h:mm a")}
                  {" · "}Float: {fmt(parseFloat(openSession.openingFloat))}
                </p>
              )}
              {!openSession && closedToday.length > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Closed today at {format(new Date(closedToday[0].closedAt!), "h:mm a")}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!openSession && !sessLoading && (
              <Button onClick={() => setOpenDlg(true)}>
                <LockOpen className="w-4 h-4" /> Open Register
              </Button>
            )}
            {openSession && (
              <>
                <Button variant="outline" size="sm" onClick={() => { setMoveForm({ type: "cash_in", amount: "", note: "" }); setMoveDlg(true); }}>
                  <Plus className="w-3.5 h-3.5" /> Cash In
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setMoveForm({ type: "cash_out", amount: "", note: "" }); setMoveDlg(true); }}>
                  <Minus className="w-3.5 h-3.5" /> Cash Out
                </Button>
                <Button variant="destructive" size="sm" onClick={() => { setCloseForm({ cashCounted: expectedCash.toFixed(2), eftposDeclared: "0.00", closingNotes: "" }); setCloseDlg(true); }}>
                  <Lock className="w-3.5 h-3.5" /> Close & Z-Read
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="w-4 h-4" /> Float Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Opening Float</span>
                <span className="font-medium">{fmt(openingFloat)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <ArrowDownLeft className="w-3.5 h-3.5 text-green-600" /> Cash In
                </span>
                <span className="text-green-600 font-medium">+{fmt(cashIn)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <ArrowUpRight className="w-3.5 h-3.5 text-red-500" /> Cash Out
                </span>
                <span className="text-red-500 font-medium">−{fmt(cashOut)}</span>
              </div>
              <div className="border-t pt-3 flex justify-between">
                <span className="font-semibold">Expected in Drawer</span>
                <span className="font-bold text-lg">{fmt(expectedCash)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Today's Cash Movements
              </CardTitle>
            </CardHeader>
            <CardContent>
              {entriesLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : entries.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No movements recorded today.</p>
              ) : (
                <div className="space-y-2">
                  {entries.map(e => (
                    <div key={e.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        {e.type === "cash_in"
                          ? <ArrowDownLeft className="w-3.5 h-3.5 text-green-600 shrink-0" />
                          : e.type === "cash_out"
                          ? <ArrowUpRight className="w-3.5 h-3.5 text-red-500 shrink-0" />
                          : <DollarSign className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                        <span className="text-muted-foreground capitalize">{e.type.replace(/_/g, " ")}</span>
                        {e.note && <span className="text-xs text-muted-foreground truncate">— {e.note}</span>}
                      </div>
                      <span className={cn("font-medium shrink-0 ml-2",
                        e.type === "cash_in" ? "text-green-600"
                        : e.type === "cash_out" ? "text-red-500" : ""
                      )}>
                        {e.type === "cash_out" ? "−" : "+"}{fmt(e.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Past closures ── */}
        {sessions.filter(s => s.closedAt).length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Recent Z-Reads
            </h2>
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="p-3 text-left font-medium">Opened</th>
                    <th className="p-3 text-left font-medium">Closed</th>
                    <th className="p-3 text-left font-medium hidden sm:table-cell">By</th>
                    <th className="p-3 text-right font-medium">Float</th>
                    <th className="p-3 text-right font-medium">Cash Counted</th>
                    <th className="p-3 text-right font-medium hidden md:table-cell">EFTPOS</th>
                    <th className="p-3 text-right font-medium">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sessions.filter(s => s.closedAt).slice(0, 15).map(s => {
                    const f  = parseFloat(s.openingFloat);
                    const c  = parseFloat(s.cashCounted ?? "0");
                    const ep = parseFloat(s.eftposDeclared ?? "0");
                    const v  = c - f;
                    return (
                      <tr key={s.id} className="hover:bg-muted/30">
                        <td className="p-3">{format(new Date(s.openedAt), "d MMM, h:mm a")}</td>
                        <td className="p-3">{format(new Date(s.closedAt!), "d MMM, h:mm a")}</td>
                        <td className="p-3 text-muted-foreground hidden sm:table-cell">{s.openedBy || "—"}</td>
                        <td className="p-3 text-right">{fmt(f)}</td>
                        <td className="p-3 text-right">{fmt(c)}</td>
                        <td className="p-3 text-right hidden md:table-cell">{fmt(ep)}</td>
                        <td className={cn("p-3 text-right font-semibold",
                          v < -0.005 ? "text-red-500"
                          : v > 0.005 ? "text-amber-600"
                          : "text-green-600"
                        )}>
                          {v >= 0 ? "+" : ""}{fmt(v)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Open Register Dialog ── */}
      <Dialog open={openDlg} onOpenChange={setOpenDlg}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LockOpen className="w-4 h-4 text-primary" /> Open Register
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Opened By</Label>
              <Input placeholder="Staff name" value={openForm.openedBy}
                onChange={e => setOpenForm(f => ({ ...f, openedBy: e.target.value }))} />
            </div>
            <div>
              <Label>Opening Float ($)</Label>
              <Input type="number" min="0" step="0.01" value={openForm.openingFloat}
                onChange={e => setOpenForm(f => ({ ...f, openingFloat: e.target.value }))} />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea rows={2} placeholder="Any handover notes…" value={openForm.openingNotes}
                onChange={e => setOpenForm(f => ({ ...f, openingNotes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDlg(false)}>Cancel</Button>
            <Button onClick={handleOpen} disabled={saving}>Open Register</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Close Register / Z-Read Dialog ── */}
      <Dialog open={closeDlg} onOpenChange={setCloseDlg}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-4 h-4 text-primary" /> Close Register — Z-Read
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Opening Float</span>
                <span>{fmt(openingFloat)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">+ Cash In</span>
                <span className="text-green-600">+{fmt(cashIn)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">− Cash Out</span>
                <span className="text-red-500">−{fmt(cashOut)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t pt-1.5 mt-0.5">
                <span>Expected in Drawer</span>
                <span>{fmt(expectedCash)}</span>
              </div>
            </div>
            <div>
              <Label>Cash Counted ($)</Label>
              <Input type="number" min="0" step="0.01"
                value={closeForm.cashCounted}
                onChange={e => setCloseForm(f => ({ ...f, cashCounted: e.target.value }))} />
              {cashVariance !== null && (
                <p className={cn("text-xs mt-1 font-medium",
                  cashVariance < -0.005 ? "text-red-500"
                  : cashVariance > 0.005 ? "text-amber-600"
                  : "text-green-600"
                )}>
                  Variance: {cashVariance >= 0 ? "+" : ""}{fmt(cashVariance)}
                  {Math.abs(cashVariance) < 0.01 && " ✓ Balanced"}
                </p>
              )}
            </div>
            <div>
              <Label>EFTPOS Declared ($)</Label>
              <Input type="number" min="0" step="0.01"
                value={closeForm.eftposDeclared}
                onChange={e => setCloseForm(f => ({ ...f, eftposDeclared: e.target.value }))} />
            </div>
            <div>
              <Label>Closing Notes (optional)</Label>
              <Textarea rows={2} value={closeForm.closingNotes}
                onChange={e => setCloseForm(f => ({ ...f, closingNotes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDlg(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleClose} disabled={saving}>
              <Lock className="w-4 h-4" /> Close Register
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cash Movement Dialog ── */}
      <Dialog open={moveDlg} onOpenChange={setMoveDlg}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cash Movement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Type</Label>
              <Select value={moveForm.type} onValueChange={v => setMoveForm(f => ({ ...f, type: v as "cash_in" | "cash_out" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash_in">Cash In</SelectItem>
                  <SelectItem value="cash_out">Cash Out</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount ($)</Label>
              <Input type="number" min="0.01" step="0.01" placeholder="0.00"
                value={moveForm.amount}
                onChange={e => setMoveForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Input placeholder="e.g. Change float, petty cash…"
                value={moveForm.note}
                onChange={e => setMoveForm(f => ({ ...f, note: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDlg(false)}>Cancel</Button>
            <Button onClick={handleAddEntry} disabled={!moveForm.amount || createEntry.isPending}>
              Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
