import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Gift, Plus, Search, Settings2, Loader2, ChevronDown,
  PauseCircle, Trash2, RefreshCw, CircleDollarSign,
  History, X, AlertTriangle, CheckCircle2, Clock,
  SlidersHorizontal, CreditCard, ArrowUpDown,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import {
  useListGiftCards,
  useCreateGiftCard,
  useUpdateGiftCard,
  useDeleteGiftCard,
  useListGiftCardLedger,
  useGetGiftCardSettings,
  useUpdateGiftCardSettings,
  type GiftCard,
  type GiftCardLedgerEntry,
} from "@workspace/api-client-react";

/* ─── Constants ───────────────────────────────────────────────────────────── */

const STATUS_COLOURS: Record<string, string> = {
  active:    "bg-green-100  text-green-700  dark:bg-green-900/30  dark:text-green-400",
  on_hold:   "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  exhausted: "bg-zinc-100   text-zinc-500   dark:bg-zinc-800      dark:text-zinc-400",
  expired:   "bg-red-100    text-red-700    dark:bg-red-900/30    dark:text-red-400",
};

const STATUS_LABELS: Record<string, string> = {
  active:    "Active",
  on_hold:   "On Hold",
  exhausted: "Exhausted",
  expired:   "Expired",
};

const LEDGER_TYPE_LABELS: Record<string, string> = {
  issue:      "Issued",
  redemption: "Redeemed",
  adjustment: "Adjusted",
  void:       "Voided",
  refund:     "Refunded",
  topup:      "Topped Up",
};

type Tab = "cards" | "settings";

/* ─── Issue Gift Card Dialog ──────────────────────────────────────────────── */

function IssueCardDialog({ open, onClose, prefix }: { open: boolean; onClose: () => void; prefix: string }) {
  const createCard = useCreateGiftCard();
  const { data: settings } = useGetGiftCardSettings();

  const [cardNumber, setCardNumber]   = useState("");
  const [initialValue, setInitialValue] = useState("");
  const [issuedTo, setIssuedTo]       = useState("");
  const [note, setNote]               = useState("");
  const [hasExpiry, setHasExpiry]     = useState(false);
  const [expiryDate, setExpiryDate]   = useState("");
  const [autoNumber, setAutoNumber]   = useState(true);

  /* Auto-generate card number */
  useEffect(() => {
    if (!open) return;
    if (autoNumber) {
      const ts  = Date.now().toString(36).toUpperCase();
      const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
      setCardNumber(`${prefix}-${ts}-${rnd}`);
    }
    /* Pre-fill expiry from settings */
    if (settings?.expiryMonths && !hasExpiry) {
      setHasExpiry(true);
      const d = new Date();
      d.setMonth(d.getMonth() + settings.expiryMonths);
      setExpiryDate(d.toISOString().split("T")[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefix, autoNumber]);

  const handleSubmit = async () => {
    const val = parseFloat(initialValue);
    if (!cardNumber.trim()) { toast.error("Card number is required"); return; }
    if (isNaN(val) || val <= 0) { toast.error("Initial value must be greater than zero"); return; }
    try {
      await createCard.mutateAsync({
        data: {
          cardNumber: cardNumber.trim(),
          initialValue: val,
          issuedTo:    issuedTo || null,
          note:        note || null,
          expiryDate:  hasExpiry && expiryDate ? new Date(expiryDate).toISOString() : null,
        },
      });
      toast.success("Gift card issued", { description: `${cardNumber.trim()} — $${val.toFixed(2)}` });
      onClose();
      setCardNumber(""); setInitialValue(""); setIssuedTo(""); setNote("");
      setHasExpiry(false); setExpiryDate(""); setAutoNumber(true);
    } catch {
      toast.error("Failed to issue gift card");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="w-4 h-4 text-primary" /> Issue New Gift Card
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Card Number</Label>
              <button
                onClick={() => setAutoNumber((v) => !v)}
                className="text-xs text-primary underline underline-offset-2"
              >
                {autoNumber ? "Enter manually" : "Auto-generate"}
              </button>
            </div>
            <Input
              value={cardNumber}
              onChange={(e) => { setAutoNumber(false); setCardNumber(e.target.value.toUpperCase()); }}
              placeholder={`${prefix}-XXXXXXXX`}
              className="font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Initial Value ($)</Label>
            <Input
              type="number" min="0.01" step="0.01"
              value={initialValue}
              onChange={(e) => setInitialValue(e.target.value)}
              placeholder="50.00"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Issued To <span className="text-muted-foreground">(optional)</span></Label>
            <Input value={issuedTo} onChange={(e) => setIssuedTo(e.target.value)} placeholder="Customer name or email" />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Expiry Date</Label>
              <Switch checked={hasExpiry} onCheckedChange={setHasExpiry} />
            </div>
            {hasExpiry && (
              <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Internal Note <span className="text-muted-foreground">(optional)</span></Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Christmas gift, staff purchase, etc." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createCard.isPending}>
            {createCard.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Issue Card
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Adjust Balance Dialog ───────────────────────────────────────────────── */

function AdjustBalanceDialog({
  card,
  onClose,
}: {
  card: GiftCard | null;
  onClose: () => void;
}) {
  const updateCard = useUpdateGiftCard();
  const [newBalance, setNewBalance] = useState("");
  const [adjustNote, setAdjustNote] = useState("");

  useEffect(() => {
    if (card) setNewBalance(String(card.currentBalance.toFixed(2)));
  }, [card]);

  const handleSubmit = async () => {
    if (!card) return;
    const val = parseFloat(newBalance);
    if (isNaN(val) || val < 0) { toast.error("Balance must be 0 or greater"); return; }
    try {
      await updateCard.mutateAsync({
        id: card.id,
        data: { currentBalance: val, adjustmentNote: adjustNote || undefined },
      });
      toast.success("Balance updated");
      onClose();
    } catch {
      toast.error("Failed to update balance");
    }
  };

  return (
    <Dialog open={!!card} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CircleDollarSign className="w-4 h-4 text-primary" /> Adjust Balance
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="p-3 rounded-lg bg-muted/50 text-sm">
            <p className="font-mono font-semibold">{card?.cardNumber}</p>
            <p className="text-muted-foreground text-xs mt-0.5">
              Current balance: {formatCurrency(card?.currentBalance ?? 0)}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>New Balance ($)</Label>
            <Input
              type="number" min="0" step="0.01"
              value={newBalance}
              onChange={(e) => setNewBalance(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Reason <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
              placeholder="e.g. Customer complaint, data correction"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={updateCard.isPending}>
            {updateCard.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Ledger Drawer ───────────────────────────────────────────────────────── */

function LedgerDrawer({ card, onClose }: { card: GiftCard | null; onClose: () => void }) {
  const { data: entries = [], isLoading } = useListGiftCardLedger(
    card?.id ?? 0,
    { query: { queryKey: ["gift-card-ledger", card?.id], enabled: !!card } }
  );

  return (
    <Dialog open={!!card} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-4 h-4 text-primary" /> Transaction History
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          <p className="font-mono text-sm font-semibold">{card?.cardNumber}</p>
          <p className="text-xs text-muted-foreground">
            Balance: {formatCurrency(card?.currentBalance ?? 0)} of {formatCurrency(card?.initialValue ?? 0)}
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No ledger entries yet.
          </div>
        ) : (
          <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
            {entries.map((entry: GiftCardLedgerEntry) => (
              <div key={entry.id} className="flex items-start justify-between p-3 rounded-lg border text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{LEDGER_TYPE_LABELS[entry.type] ?? entry.type}</p>
                  {entry.note && <p className="text-xs text-muted-foreground truncate">{entry.note}</p>}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {format(new Date(entry.createdAt), "dd/MM/yyyy HH:mm")}
                  </p>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className={cn("font-semibold tabular-nums", entry.amount >= 0 ? "text-green-600" : "text-red-600")}>
                    {entry.amount >= 0 ? "+" : ""}{formatCurrency(entry.amount)}
                  </p>
                  <p className="text-xs text-muted-foreground">bal: {formatCurrency(entry.balanceAfter)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Confirm Delete Dialog ───────────────────────────────────────────────── */

function ConfirmDeleteDialog({ card, onClose }: { card: GiftCard | null; onClose: () => void }) {
  const deleteCard = useDeleteGiftCard();

  const handleDelete = async () => {
    if (!card) return;
    try {
      await deleteCard.mutateAsync({ id: card.id });
      toast.success("Gift card deleted");
      onClose();
    } catch {
      toast.error("Failed to delete gift card");
    }
  };

  return (
    <Dialog open={!!card} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-4 h-4" /> Delete Gift Card
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This will permanently delete gift card <span className="font-mono font-semibold text-foreground">{card?.cardNumber}</span> and all its transaction history. This cannot be undone.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleteCard.isPending}>
            {deleteCard.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Cards Tab ───────────────────────────────────────────────────────────── */

function CardsTab({ prefix }: { prefix: string }) {
  const updateCard = useUpdateGiftCard();

  const [search, setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [issueOpen, setIssueOpen] = useState(false);
  const [ledgerCard, setLedgerCard]     = useState<GiftCard | null>(null);
  const [adjustCard, setAdjustCard]     = useState<GiftCard | null>(null);
  const [deleteCard, setDeleteCard]     = useState<GiftCard | null>(null);

  const { data, isLoading, refetch } = useListGiftCards(
    {
      search:  search  || undefined,
      status:  statusFilter !== "all" ? statusFilter : undefined,
      limit:   200,
    },
    { query: { queryKey: ["gift-cards", search, statusFilter] } }
  );

  const cards = data?.items ?? [];
  const total = data?.total ?? 0;

  const setStatus = async (card: GiftCard, status: string) => {
    try {
      await updateCard.mutateAsync({ id: card.id, data: { status } });
      toast.success(`Card ${STATUS_LABELS[status] ?? status}`);
    } catch {
      toast.error("Failed to update status");
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex flex-1 gap-2 max-w-lg">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search card number or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="on_hold">On Hold</SelectItem>
              <SelectItem value="exhausted">Exhausted</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setIssueOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Issue Card
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(["active", "on_hold", "exhausted", "expired"] as const).map((s) => {
          const count = cards.filter((c) => c.status === s).length;
          const value = cards.filter((c) => c.status === s).reduce((sum, c) => sum + c.currentBalance, 0);
          return (
            <div key={s} className="rounded-xl border bg-card p-4 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground capitalize">{STATUS_LABELS[s]}</p>
                <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", STATUS_COLOURS[s])}>
                  {count}
                </span>
              </div>
              <p className="text-lg font-bold tabular-nums">{formatCurrency(value)}</p>
              <p className="text-xs text-muted-foreground">outstanding balance</p>
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <p className="text-sm font-medium flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-muted-foreground" />
            {total} card{total !== 1 ? "s" : ""}
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : cards.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground space-y-2">
            <Gift className="w-10 h-10 mx-auto opacity-25" />
            <p className="text-sm font-medium">No gift cards found</p>
            <p className="text-xs">{search || statusFilter !== "all" ? "Try adjusting your search or filters." : "Issue your first gift card to get started."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Card Number</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Issued To</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Initial</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Balance</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Expiry</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Issued</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {cards.map((card) => {
                  const pct = card.initialValue > 0
                    ? Math.round((card.currentBalance / card.initialValue) * 100)
                    : 0;
                  const isExpired = card.expiryDate && new Date(card.expiryDate) < new Date();
                  return (
                    <tr key={card.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-mono font-medium text-xs">{card.cardNumber}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs max-w-[120px] truncate">
                        {card.issuedTo ?? <span className="italic">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-xs">
                        {formatCurrency(card.initialValue)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className={cn("font-semibold tabular-nums text-xs", card.currentBalance <= 0 ? "text-muted-foreground" : "text-foreground")}>
                            {formatCurrency(card.currentBalance)}
                          </span>
                          {card.initialValue > 0 && (
                            <div className="h-1 w-16 rounded-full bg-muted overflow-hidden">
                              <div
                                className={cn("h-full rounded-full transition-all", pct > 50 ? "bg-green-500" : pct > 20 ? "bg-yellow-500" : "bg-red-500")}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", STATUS_COLOURS[card.status] ?? "bg-muted text-muted-foreground")}>
                          {STATUS_LABELS[card.status] ?? card.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {card.expiryDate ? (
                          <span className={cn(isExpired && "text-red-600 dark:text-red-400 font-medium")}>
                            {format(new Date(card.expiryDate), "dd/MM/yyyy")}
                            {isExpired && " (exp)"}
                          </span>
                        ) : (
                          <span className="italic">No expiry</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(card.createdAt), "dd/MM/yyyy")}
                      </td>
                      <td className="px-4 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 px-2">
                              <ChevronDown className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setLedgerCard(card)}>
                              <History className="w-4 h-4 mr-2" /> View History
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setAdjustCard(card)}>
                              <ArrowUpDown className="w-4 h-4 mr-2" /> Adjust Balance
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {card.status === "active" && (
                              <DropdownMenuItem onClick={() => setStatus(card, "on_hold")}>
                                <PauseCircle className="w-4 h-4 mr-2 text-yellow-600" /> Put On Hold
                              </DropdownMenuItem>
                            )}
                            {card.status === "on_hold" && (
                              <DropdownMenuItem onClick={() => setStatus(card, "active")}>
                                <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" /> Re-activate
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDeleteCard(card)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <IssueCardDialog open={issueOpen} onClose={() => setIssueOpen(false)} prefix={prefix} />
      <LedgerDrawer card={ledgerCard} onClose={() => setLedgerCard(null)} />
      <AdjustBalanceDialog card={adjustCard} onClose={() => setAdjustCard(null)} />
      <ConfirmDeleteDialog card={deleteCard} onClose={() => setDeleteCard(null)} />
    </div>
  );
}

/* ─── Settings Tab ────────────────────────────────────────────────────────── */

function SettingsTab() {
  const { data: settings, isLoading } = useGetGiftCardSettings();
  const updateSettings = useUpdateGiftCardSettings();

  const [expiryMode, setExpiryMode]   = useState<"none" | "months">("none");
  const [expiryMonths, setExpiryMonths] = useState("12");
  const [allowPartial, setAllowPartial] = useState(true);
  const [prefix, setPrefix]           = useState("GC");
  const [saving, setSaving]           = useState(false);

  useEffect(() => {
    if (!settings) return;
    setExpiryMode(settings.expiryMonths ? "months" : "none");
    setExpiryMonths(String(settings.expiryMonths ?? 12));
    setAllowPartial(settings.allowPartialRedemptions !== "false");
    setPrefix(settings.prefix ?? "GC");
  }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSettings.mutateAsync({
        data: {
          expiryMonths:            expiryMode === "months" ? parseInt(expiryMonths, 10) : null,
          allowPartialRedemptions: allowPartial ? "true" : "false",
          prefix:                  prefix.trim().toUpperCase() || "GC",
        },
      });
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <div className="rounded-xl border bg-card p-6 space-y-6">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Settings2 className="w-4 h-4" /> Global System Options
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            These settings apply to all newly issued gift cards.
          </p>
        </div>

        {/* Card Number Prefix */}
        <div className="space-y-1.5">
          <Label>Card Number Prefix</Label>
          <div className="flex gap-2 items-center">
            <Input
              className="w-28 font-mono"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
              placeholder="GC"
            />
            <span className="text-muted-foreground text-sm">e.g. <span className="font-mono">{prefix || "GC"}-XXXXXXXX-XXXX</span></span>
          </div>
          <p className="text-xs text-muted-foreground">Prepended to auto-generated card numbers.</p>
        </div>

        {/* Expiry */}
        <div className="space-y-3">
          <Label>Default Expiry Period</Label>
          <div className="flex gap-3">
            <button
              onClick={() => setExpiryMode("none")}
              className={cn(
                "flex-1 rounded-lg border p-3 text-sm text-center transition-colors",
                expiryMode === "none" ? "border-primary bg-primary/5 text-primary font-medium" : "hover:border-muted-foreground/30"
              )}
            >
              No Expiry
            </button>
            <button
              onClick={() => setExpiryMode("months")}
              className={cn(
                "flex-1 rounded-lg border p-3 text-sm text-center transition-colors",
                expiryMode === "months" ? "border-primary bg-primary/5 text-primary font-medium" : "hover:border-muted-foreground/30"
              )}
            >
              Set Expiry
            </button>
          </div>
          {expiryMode === "months" && (
            <div className="flex items-center gap-3">
              <Input
                type="number" min="1" max="120"
                value={expiryMonths}
                onChange={(e) => setExpiryMonths(e.target.value)}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">months from issue date</span>
            </div>
          )}
        </div>

        {/* Partial Redemptions */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Allow Partial Redemptions</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              When enabled, a gift card can be used for part of a sale (remaining balance stays on the card).
              When disabled, the card balance must cover the entire sale total.
            </p>
          </div>
          <Switch checked={allowPartial} onCheckedChange={setAllowPartial} />
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Save Settings
        </Button>
      </div>

      {/* Info card */}
      <div className="rounded-xl border bg-card p-6 space-y-5">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Gift className="w-4 h-4" /> How Gift Cards Work
          </h3>
        </div>
        <div className="space-y-4 text-sm text-muted-foreground">
          <div className="flex gap-3 p-3 rounded-lg border">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-xs font-bold text-primary">1</span>
            </div>
            <div>
              <p className="font-medium text-foreground">Issue a Card</p>
              <p className="text-xs mt-0.5">Create a gift card with an initial dollar value. The card number is unique per merchant account.</p>
            </div>
          </div>
          <div className="flex gap-3 p-3 rounded-lg border">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-xs font-bold text-primary">2</span>
            </div>
            <div>
              <p className="font-medium text-foreground">Validate at POS</p>
              <p className="text-xs mt-0.5">Use <span className="font-mono bg-muted px-1 rounded">POST /api/gift-cards/validate</span> to verify a card number and get the applicable discount amount before completing a sale.</p>
            </div>
          </div>
          <div className="flex gap-3 p-3 rounded-lg border">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-xs font-bold text-primary">3</span>
            </div>
            <div>
              <p className="font-medium text-foreground">Balance Tracking</p>
              <p className="text-xs mt-0.5">Every redemption, adjustment and refund is recorded in the ledger. Cards automatically become Exhausted when their balance hits $0.00.</p>
            </div>
          </div>
          <div className="flex gap-3 p-3 rounded-lg bg-muted/50">
            <Clock className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground text-xs">Expiry Enforcement</p>
              <p className="text-xs mt-0.5">The validate endpoint automatically rejects expired cards. You can also set individual expiry dates per card when issuing.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ───────────────────────────────────────────────────────────── */

export default function ManagementGiftCardsPage() {
  const [tab, setTab] = useState<Tab>("cards");
  const { data: settings } = useGetGiftCardSettings();
  const prefix = settings?.prefix ?? "GC";

  return (
    <AppLayout>
      <div className="w-full px-4 lg:px-6 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Gift className="w-6 h-6 text-primary" />
            Gift Cards
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Issue and manage closed-loop gift cards, track balances, and configure redemption rules.
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b flex gap-0">
          {([
            { id: "cards"    as Tab, label: "Active Cards",   icon: CreditCard   },
            { id: "settings" as Tab, label: "System Settings", icon: Settings2   },
          ]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                tab === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
              )}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {tab === "cards"    && <CardsTab prefix={prefix} />}
        {tab === "settings" && <SettingsTab />}
      </div>
    </AppLayout>
  );
}
