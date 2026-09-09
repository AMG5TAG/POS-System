import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetMerchant } from "@workspace/api-client-react";
import { useBusinessProfile } from "@/lib/business-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCurrency, cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  CalendarRange, ChevronLeft, ChevronRight, RefreshCw, Download, Printer,
  Banknote, CreditCard, Landmark, Gift, Coins, Wallet, Lock, LockOpen,
  Plus, Trash2, TrendingUp, Receipt, Users, Wrench, RotateCcw, FileText,
  Package, AlertTriangle, Trophy, Save,
} from "lucide-react";

/* ─── Types (mirrors GET /api/end-of-week) ───────────────────────────────── */

type MethodTotal = { method: string; count: number; total: number };

interface CashPurchase {
  id: string;
  description: string;
  amount: number;
  date?: string;
  source: "manual" | "drawer";
}

interface StaffCostRow {
  staffId: number | null;
  name: string;
  role: string;
  hours: number;
  wages: number;
  tax: number;
  superannuation: number;
  bonus: number;
  extras: number;
  kpi: number;
  edited: boolean;
  total: number;
}

interface HistoryWeek {
  id: number;
  startDate: string;
  endDate: string;
  status: "draft" | "finalised";
  floatRetained: number;
  cashCounted: number | null;
  bankedAmount: number | null;
  finalisedAt: string | null;
  finalisedByName: string | null;
  grossRevenue: number | null;
  netProfit: number | null;
  cashToBank: number | null;
}

interface EndOfWeekData {
  startDate: string;
  endDate: string;
  days: number;
  reportId: number | null;
  status: "draft" | "finalised";
  finalisedAt: string | null;
  finalisedByName: string | null;
  notes: string;
  sales: {
    grossRevenue: number; discountTotal: number; refundTotal: number; refundCount: number;
    netSales: number; exGstRevenue: number; taxCollected: number; totalCogs: number;
    grossProfit: number; netProfit: number; surchargeCost: number; transactionCount: number;
    avgSale: number; grossMarginPct: number;
    dailyBreakdown: Array<{
      date: string; transactionCount: number; grossRevenue: number; exGstRevenue: number;
      taxCollected: number; discountTotal: number; totalCogs: number; netProfit: number;
      refundTotal: number; surchargeCost: number;
    }>;
  };
  refunds: { total: number; count: number; cash: number; byMethod: Array<{ method: string; count: number; amount: number; tax: number }> };
  invoices: {
    issuedCount: number; issuedTotal: number; paidCount: number; paidTotal: number;
    outstandingCount: number; outstandingTotal: number; overdueCount: number; overdueTotal: number;
  };
  services: {
    bookedIn: number; completed: number; openNow: number;
    revenue: number; cost: number; profit: number; partsValue: number; labourValue: number;
  };
  laybys: { completedCount: number; completedTotal: number; taxCollected: number };
  customers: { newCustomers: number; totalCustomers: number };
  topProducts: Array<{ name: string; sku: string; quantity: number; revenue: number; profit: number }>;
  kpiAwards: Array<{ name: string; amount: number; staffIds: number[] }>;
  banking: {
    byMethod: MethodTotal[];
    cashTakings: number; eftposTakings: number; directDepositTakings: number;
    nonBankingTakings: number; otherTakings: number;
    cashRefunds: number; drawerCashIn: number;
    drawerCashOuts: Array<{ id: number; amount: number; note: string | null; shiftDate: string }>;
    tillFloats: Array<{ registerId: string; openingFloat: number }>;
    tillFloatTotal: number;
    floatRetained: number;
    cashPurchases: CashPurchase[];
    cashPurchasesTotal: number;
    cashCounted: number | null;
    bankedAmount: number | null;
    expectedCash: number;
    expectedInTill: number;
    countVariance: number | null;
    cashToBank: number;
    fromCount: boolean;
    bankingShortfall: number | null;
  };
  staffCosts: {
    rows: StaffCostRow[];
    totals: { hours: number; wages: number; tax: number; superannuation: number; bonus: number; extras: number; kpi: number; total: number };
    includeTax: boolean;
  };
  profitAfterStaff: number;
}

/* ─── Week maths (mirrors src/lib/end-of-week.ts on the server) ──────────── */

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const toYmd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fromYmd = (s: string) => new Date(`${s}T00:00:00Z`);

/** The last complete Friday → Thursday week. Today's own trading is not over,
 *  so a week ending today is not yet the week to bank. */
function defaultWeek(today = new Date()) {
  const anchor = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const back = ((anchor.getUTCDay() - 4 + 7) % 7) || 7; // 4 = Thursday
  const end = new Date(anchor.getTime() - back * DAY_MS);
  return { startDate: toYmd(new Date(end.getTime() - 6 * DAY_MS)), endDate: toYmd(end) };
}

function shiftRange(startDate: string, endDate: string, steps: number) {
  const s = fromYmd(startDate), e = fromYmd(endDate);
  const span = Math.floor((e.getTime() - s.getTime()) / DAY_MS) + 1;
  const delta = steps * span * DAY_MS;
  return { startDate: toYmd(new Date(s.getTime() + delta)), endDate: toYmd(new Date(e.getTime() + delta)) };
}

const dayLabel = (ymd: string) =>
  fromYmd(ymd).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

const rangeLabel = (a: string, b: string) =>
  `${fromYmd(a).toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "UTC" })} – ${fromYmd(b).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash", eftpos: "EFTPOS", card: "Credit / Debit Card", direct_deposit: "Direct Deposit",
  bank_transfer: "Bank Transfer", invoice: "Invoice", gift_card: "Gift Card", voucher: "Voucher",
  store_credit: "Store Credit", loyalty: "Loyalty Dollars", laybuy: "Layby", other: "Other",
};
const methodLabel = (m: string) => METHOD_LABELS[m] ?? m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (v: number | null | undefined) => formatCurrency(Number(v ?? 0));

/* ─── Small building blocks ──────────────────────────────────────────────── */

/**
 * A headline money panel — the page's only summary tile, and deliberately loud.
 *
 * Employee costs, total GST collected and cost of goods sold are the three
 * figures a merchant actually acts on at end of week: one is a bill to pay, one
 * is set aside for the BAS, one is what the week's stock cost. A row of small
 * KPI tiles gave them the same weight as the average sale, so they get a panel
 * each instead — the number in display type, and the short sum that produced it
 * underneath, so nobody has to reconcile it against the Trading Summary.
 */
function HeadlineFigure({ label, value, caption, icon: Icon, accent, rows, foot, loading }: {
  label: string; value: string; caption: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: "staff" | "gst" | "cogs";
  rows: { label: string; value: number; sign?: "minus"; strong?: boolean }[];
  foot?: React.ReactNode;
  loading?: boolean;
}) {
  const a = {
    staff: { card: "border-pink-300/70 dark:border-pink-800/70 bg-pink-50/60 dark:bg-pink-950/25",
             chip: "bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300",
             value: "text-pink-700 dark:text-pink-300" },
    gst:  { card: "border-amber-300/70 dark:border-amber-800/70 bg-amber-50/60 dark:bg-amber-950/25",
            chip: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
            value: "text-amber-700 dark:text-amber-300" },
    cogs: { card: "border-indigo-300/70 dark:border-indigo-800/70 bg-indigo-50/60 dark:bg-indigo-950/25",
            chip: "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300",
            value: "text-indigo-700 dark:text-indigo-300" },
  }[accent];
  return (
    <Card className={cn("border-2 h-full flex flex-col", a.card)}>
      <CardContent className="pt-5 pb-4 flex-1 flex flex-col">
        <div className="flex items-start gap-3">
          <div className={cn("p-2 rounded-lg shrink-0", a.chip)}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            {loading
              ? <Skeleton className="h-9 w-40 mt-1" />
              : <p className={cn("text-3xl sm:text-4xl font-bold tracking-tight tabular-nums mt-0.5", a.value)}>{value}</p>}
            <p className="text-xs text-muted-foreground mt-1 leading-snug">{caption}</p>
          </div>
        </div>
        <div className="mt-4 flex-1" />
        <div className="pt-3 border-t border-current/10 space-y-1">
          {rows.map((r) => (
            <div key={r.label} className="flex items-baseline justify-between gap-4">
              <span className={cn("text-sm", r.strong ? "font-semibold" : "text-muted-foreground")}>
                {r.sign === "minus" && <span className="mr-1">−</span>}{r.label}
              </span>
              <span className={cn("text-sm tabular-nums", r.strong ? "font-bold" : "text-muted-foreground")}>
                {money(r.value)}
              </span>
            </div>
          ))}
        </div>
        {foot && <p className="text-[11px] text-muted-foreground mt-3">{foot}</p>}
      </CardContent>
    </Card>
  );
}

/** A labelled money row in the deposit calculation. */
function CalcRow({ label, value, hint, sign, strong, muted, accent }: {
  label: string; value: number; hint?: string;
  sign?: "plus" | "minus"; strong?: boolean; muted?: boolean;
  /** Tints the row so GST and COGS stand out of the running total they sit in. */
  accent?: "gst" | "cogs";
}) {
  const accentClass = accent === "gst"
    ? "text-amber-700 dark:text-amber-300"
    : accent === "cogs" ? "text-indigo-700 dark:text-indigo-300" : "";
  return (
    <div className={cn(
      "flex items-baseline justify-between gap-4 py-1.5",
      strong && "border-t pt-2.5 mt-1",
      accent && "-mx-2 px-2 rounded",
      accent === "gst" && "bg-amber-50/70 dark:bg-amber-950/25",
      accent === "cogs" && "bg-indigo-50/70 dark:bg-indigo-950/25",
    )}>
      <div className="min-w-0">
        <span className={cn(
          "text-sm",
          strong ? "font-semibold" : muted ? "text-muted-foreground" : "",
          accent && cn("font-semibold", accentClass),
        )}>
          {sign === "minus" && <span className={cn("mr-1", !accent && "text-muted-foreground")}>−</span>}
          {sign === "plus" && <span className={cn("mr-1", !accent && "text-muted-foreground")}>+</span>}
          {label}
        </span>
        {hint && <p className="text-[11px] text-muted-foreground leading-tight">{hint}</p>}
      </div>
      <span className={cn(
        "tabular-nums whitespace-nowrap",
        strong ? "text-lg font-bold" : "text-sm font-medium",
        accent && cn("font-bold", accentClass),
      )}>
        {money(value)}
      </span>
    </div>
  );
}

/** A money field that keeps its own text while focused, so typing "12.5" does
 *  not fight the parent re-rendering it as "12.50". */
function MoneyInput({ value, onCommit, disabled, placeholder = "0.00", className }: {
  value: number | null; onCommit: (v: number | null) => void;
  disabled?: boolean; placeholder?: string; className?: string;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(value === null ? "" : String(value)); }, [value, focused]);
  return (
    <Input
      type="number" step="0.01" inputMode="decimal" placeholder={placeholder}
      disabled={disabled} value={text} noPhoneFormat
      className={cn("h-9 text-right tabular-nums", className)}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false);
        const trimmed = text.trim();
        if (trimmed === "") { onCommit(null); return; }
        const n = Number(trimmed);
        onCommit(Number.isFinite(n) ? r2(n) : null);
      }}
    />
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ManagementEndOfWeekPage() {
  const qc = useQueryClient();
  const initial = useMemo(() => defaultWeek(), []);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [confirmFinalise, setConfirmFinalise] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant-eow"] } });
  const { profile } = useBusinessProfile();

  const queryKey = ["end-of-week", startDate, endDate] as const;
  const { data, isLoading, isFetching, refetch, error } = useQuery<EndOfWeekData>({
    queryKey,
    queryFn: async () => {
      const r = await fetch(`/api/end-of-week?startDate=${startDate}&endDate=${endDate}`, { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Failed to load the End of Week report");
      return r.json();
    },
  });

  /* Weeks already saved — the banking history, and the way back to one. */
  const { data: history } = useQuery<{ items: HistoryWeek[] }>({
    queryKey: ["end-of-week-history"],
    queryFn: async () => {
      const r = await fetch("/api/end-of-week/history", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load saved weeks");
      return r.json();
    },
  });

  const locked = data?.status === "finalised";

  /* ── Saving ───────────────────────────────────────────────────────────── */
  // The server returns the whole recomputed report from PUT, so a save and a
  // refresh are the same round trip — the cache is replaced with its answer
  // rather than invalidated and re-fetched.
  const save = useCallback(async (patch: Record<string, unknown>, { quiet = true } = {}) => {
    setSaving(true);
    try {
      const r = await fetch("/api/end-of-week", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, ...patch }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Save failed");
      qc.setQueryData(queryKey, await r.json());
      void qc.invalidateQueries({ queryKey: ["end-of-week-history"] });
      if (!quiet) toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [startDate, endDate, qc, queryKey]);

  /* Notes are typed continuously, so they save on a debounce rather than per
     keystroke. Everything else commits on blur and saves immediately. */
  const [notes, setNotes] = useState("");
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setNotes(data?.notes ?? ""); }, [data?.notes]);
  useEffect(() => () => { if (notesTimer.current) clearTimeout(notesTimer.current); }, []);

  const onNotesChange = (v: string) => {
    setNotes(v);
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => { void save({ notes: v }); }, 900);
  };

  /* ── Cash purchases ───────────────────────────────────────────────────── */
  const purchases = data?.banking.cashPurchases ?? [];

  const savePurchases = (next: CashPurchase[]) => void save({ cashPurchases: next });

  const addPurchase = () =>
    savePurchases([...purchases, {
      id: `m${Date.now()}`, description: "", amount: 0,
      date: endDate, source: "manual",
    }]);

  const updatePurchase = (id: string, patch: Partial<CashPurchase>) =>
    savePurchases(purchases.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const removePurchase = (id: string) => savePurchases(purchases.filter((p) => p.id !== id));

  /* ── Employee costs ───────────────────────────────────────────────────── */
  const staffRows = data?.staffCosts.rows ?? [];

  const updateStaffCost = (staffId: number | null, name: string, patch: Partial<StaffCostRow>) => {
    const next = staffRows.map((r) =>
      (r.staffId === staffId && r.name === name) ? { ...r, ...patch } : r,
    ).map(({ staffId: id, name: n, role, hours, wages, tax, superannuation, bonus, extras, kpi }) =>
      ({ staffId: id, name: n, role, hours, wages, tax, superannuation, bonus, extras, kpi }));
    void save({ staffCosts: next });
  };

  /* ── PAYG in the cost total ───────────────────────────────────────────── */
  // An accounting convention, so it is a merchant setting rather than a field on
  // the week — weeks that disagree cannot be compared. Weeks already finalised
  // keep the totals frozen in their snapshot, so flipping it restates nothing
  // that has been banked.
  const includeTax = data?.staffCosts.includeTax ?? false;
  const toggleIncludeTax = async (next: boolean) => {
    setSaving(true);
    try {
      const r = await fetch("/api/sales-settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eowIncludeTaxInStaffCost: next ? "true" : "false" }),
      });
      if (!r.ok) throw new Error("Could not change the setting");
      await qc.invalidateQueries({ queryKey: ["end-of-week"] });
      void qc.invalidateQueries({ queryKey: ["end-of-week-history"] });
      toast.success(next ? "PAYG now counts toward employee costs" : "PAYG no longer counts toward employee costs");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change the setting");
    } finally {
      setSaving(false);
    }
  };

  /* ── Finalise / reopen ────────────────────────────────────────────────── */
  const runAction = async (path: "finalise" | "reopen") => {
    setSaving(true);
    try {
      const r = await fetch(`/api/end-of-week/${path}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Action failed");
      qc.setQueryData(queryKey, await r.json());
      void qc.invalidateQueries({ queryKey: ["end-of-week-history"] });
      toast.success(path === "finalise" ? "Week finalised" : "Week reopened");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setSaving(false);
      setConfirmFinalise(false);
    }
  };

  /* ── Week navigation ──────────────────────────────────────────────────── */
  const step = (n: number) => {
    const next = shiftRange(startDate, endDate, n);
    setStartDate(next.startDate);
    setEndDate(next.endDate);
  };
  const jumpToLatest = () => {
    const w = defaultWeek();
    setStartDate(w.startDate);
    setEndDate(w.endDate);
  };

  /* GST charged on the week's sales excludes refunds — `tax_collected` in
   * `view_daily_sales_summary` counts completed sales only — so the figure to
   * set aside is that less the GST handed back on the week's refunds, which the
   * refund breakdown carries per method. */
  const gstRefunded = r2((data?.refunds.byMethod ?? []).reduce((t, m) => t + (Number(m.tax) || 0), 0));
  const netGst = r2((data?.sales.taxCollected ?? 0) - gstRefunded);

  /* ── CSV export ───────────────────────────────────────────────────────── */
  const exportCsv = () => {
    if (!data) return;
    const b = data.banking;
    const rows: (string | number)[][] = [
      ["Business", merchant?.businessName ?? ""],
      ["ABN", profile?.abn ?? ""],
      ["End of Week", `${data.startDate} to ${data.endDate}`],
      ["Status", data.status === "finalised" ? `Finalised ${data.finalisedAt ?? ""} by ${data.finalisedByName ?? ""}` : "Draft"],
      [],
      ["TRADING"],
      ["Total Sold (gross, inc GST)", data.sales.grossRevenue],
      ["Discounts", data.sales.discountTotal],
      ["Refunds", data.sales.refundTotal],
      ["Net Sales", data.sales.netSales],
      ["Sales ex GST", data.sales.exGstRevenue],
      ["TOTAL GST COLLECTED", data.sales.taxCollected],
      ["Less GST refunded", -gstRefunded],
      ["Net GST to set aside", netGst],
      ["COST OF GOODS SOLD", data.sales.totalCogs],
      ["Gross Profit", data.sales.grossProfit],
      ["Gross Margin %", data.sales.grossMarginPct],
      ["Payment surcharges absorbed", data.sales.surchargeCost],
      ["Net Profit", data.sales.netProfit],
      ["Transactions", data.sales.transactionCount],
      ["Average Sale", data.sales.avgSale],
      [],
      ["BANKING — TAKINGS BY METHOD"],
      ["Method", "Count", "Total"],
      ...data.banking.byMethod.map((m) => [methodLabel(m.method), m.count, m.total]),
      [],
      ["Cash Taken", b.cashTakings],
      ["EFTPOS / Card", b.eftposTakings],
      ["Direct Deposit", b.directDepositTakings],
      ["Gift cards / credit redeemed (not banked)", b.nonBankingTakings],
      ["Other", b.otherTakings],
      [],
      ["BANK DEPOSIT"],
      ["Cash taken", b.cashTakings],
      ["Less cash refunds", -b.cashRefunds],
      ["Plus cash added to till", b.drawerCashIn],
      ["Less purchases paid from till", -b.cashPurchasesTotal],
      ["Expected cash from trading", b.expectedCash],
      ["Till float retained", b.floatRetained],
      ["Expected in tills (float + trading)", b.expectedInTill],
      ["Cash counted", b.cashCounted ?? ""],
      ["Count variance", b.countVariance ?? ""],
      ["CASH TO BANK", b.cashToBank],
      ["Banked", b.bankedAmount ?? ""],
      ["Still to bank", b.bankingShortfall ?? ""],
      [],
      ["PURCHASES PAID FROM TILL"],
      ["Description", "Date", "Amount", "Source"],
      ...purchases.map((p) => [p.description || "—", p.date ?? "", p.amount, p.source]),
      ["Total", "", b.cashPurchasesTotal, ""],
      [],
      ["EMPLOYEE COSTS", data.staffCosts.includeTax ? "Cost to business INCLUDES PAYG" : "Cost to business EXCLUDES PAYG (withheld from wages)"],
      ["Employee", "Role", "Hours", "Wages", "Tax (PAYG)", "Super", "Bonus", "Extras", "KPI", "Cost to business"],
      ...staffRows.map((s) => [s.name, s.role, s.hours, s.wages, s.tax, s.superannuation, s.bonus, s.extras, s.kpi, s.total]),
      ["TOTAL", "", data.staffCosts.totals.hours, data.staffCosts.totals.wages, data.staffCosts.totals.tax,
        data.staffCosts.totals.superannuation, data.staffCosts.totals.bonus, data.staffCosts.totals.extras,
        data.staffCosts.totals.kpi, data.staffCosts.totals.total],
      [],
      ["Net profit after employee costs", data.profitAfterStaff],
      [],
      ["WEEK IN REVIEW"],
      ["New customers", data.customers.newCustomers],
      ["Invoices issued", data.invoices.issuedCount, data.invoices.issuedTotal],
      ["Invoices paid", data.invoices.paidCount, data.invoices.paidTotal],
      ["Invoices outstanding", data.invoices.outstandingCount, data.invoices.outstandingTotal],
      ["Invoices overdue", data.invoices.overdueCount, data.invoices.overdueTotal],
      ["Service jobs booked in", data.services.bookedIn],
      ["Service jobs completed", data.services.completed, data.services.revenue],
      ["Service jobs open", data.services.openNow],
      ["Laybys completed", data.laybys.completedCount, data.laybys.completedTotal],
      ["Refunds", data.sales.refundCount, data.sales.refundTotal],
      [],
      ["DAILY BREAKDOWN"],
      ["Date", "Sales", "Ex GST", "GST", "Discounts", "COGS", "Refunds", "Net Profit", "Transactions"],
      ...data.sales.dailyBreakdown.map((d) => [
        d.date, d.grossRevenue, d.exGstRevenue, d.taxCollected, d.discountTotal,
        d.totalCogs, d.refundTotal, d.netProfit, d.transactionCount,
      ]),
      [],
      ["Notes", data.notes],
    ];
    const csv = rows.map((r) => r.map((v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `end-of-week-${data.startDate}_to_${data.endDate}.csv`;
    a.click();
    toast.success("End of Week exported");
  };

  /* ── Render ───────────────────────────────────────────────────────────── */
  const b = data?.banking;
  const s = data?.sales;
  const totals = data?.staffCosts.totals;

  return (
    <AppLayout>
      <div className="p-6 space-y-6 print:p-0">
        {/* Header */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <CalendarRange className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                End of Week
                {locked && (
                  <Badge variant="secondary" className="gap-1">
                    <Lock className="w-3 h-3" /> Finalised
                  </Badge>
                )}
              </h1>
              <p className="text-sm text-muted-foreground">
                {rangeLabel(startDate, endDate)} · banking, budgeting and the week in review
                {data && data.days !== 7 && <span className="ml-1">({data.days} days)</span>}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button variant="outline" size="icon" onClick={() => step(-1)} title="Previous week">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-[9.5rem]" />
            <span className="text-muted-foreground text-sm">to</span>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-[9.5rem]" />
            <Button variant="outline" size="icon" onClick={() => step(1)} title="Next week">
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={jumpToLatest}>Latest</Button>
            <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching} title="Refresh">
              <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
            </Button>
            <Button variant="outline" onClick={exportCsv} disabled={!data}>
              <Download className="w-4 h-4 mr-2" /> CSV
            </Button>
            <Button variant="outline" onClick={() => window.print()} disabled={!data}>
              <Printer className="w-4 h-4 mr-2" /> Print
            </Button>
            {locked
              ? <Button variant="outline" onClick={() => runAction("reopen")} disabled={saving}>
                  <LockOpen className="w-4 h-4 mr-2" /> Reopen
                </Button>
              : <Button onClick={() => setConfirmFinalise(true)} disabled={!data || saving}>
                  <Lock className="w-4 h-4 mr-2" /> Finalise Week
                </Button>}
          </div>
        </div>

        {error && (
          <Card className="border-destructive/40">
            <CardContent className="pt-6 flex items-center gap-3 text-sm text-destructive">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error instanceof Error ? error.message : "Failed to load the End of Week report"}
            </CardContent>
          </Card>
        )}

        {locked && (
          <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm flex items-start gap-2">
            <Lock className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
            <span>
              These figures were frozen when the week was finalised
              {data?.finalisedByName && <> by <span className="font-medium">{data.finalisedByName}</span></>}
              {data?.finalisedAt && <> on {new Date(data.finalisedAt).toLocaleString("en-AU")}</>}.
              A refund or backdated invoice recorded since will not change them. Reopen the week to work from live figures again.
            </span>
          </div>
        )}

        {/* The three figures the week is actually acted on: what the staff cost,
            what is owed to the ATO, and what the stock sold this week cost to
            buy. Everything else is a row further down the page. */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <HeadlineFigure
            label="Employee Costs"
            value={money(totals?.total)}
            caption={`What the week's staff cost the business — timesheet hours at each person's rate, ${includeTax ? "PAYG included" : "PAYG excluded, since it is withheld from the wage"}.`}
            icon={Users}
            accent="staff"
            loading={isLoading}
            rows={[
              { label: "Wages", value: totals?.wages ?? 0 },
              { label: "Super, bonuses & KPI", value: r2((totals?.superannuation ?? 0) + (totals?.bonus ?? 0) + (totals?.extras ?? 0) + (totals?.kpi ?? 0)) },
              { label: "Cost to business", value: totals?.total ?? 0, strong: true },
            ]}
            foot={`${(totals?.hours ?? 0).toFixed(1)} hrs · PAYG ${money(totals?.tax)} ${includeTax ? "included above" : "withheld, not added"} · profit after staff ${money(data?.profitAfterStaff)}`}
          />
          <HeadlineFigure
            label="Total GST Collected"
            value={money(s?.taxCollected)}
            caption="GST charged across POS sales, paid invoices and completed laybys this week. Set it aside for the BAS."
            icon={Receipt}
            accent="gst"
            loading={isLoading}
            rows={[
              { label: "GST on sales", value: s?.taxCollected ?? 0 },
              { label: "GST refunded", value: gstRefunded, sign: "minus" },
              { label: "Net GST to set aside", value: netGst, strong: true },
            ]}
            foot={`Sales ex GST ${money(s?.exGstRevenue)} of ${money(s?.grossRevenue)} taken`}
          />
          <HeadlineFigure
            label="Cost of Goods Sold"
            value={money(s?.totalCogs)}
            caption="What the stock sold this week cost to buy — the cost price on every POS, invoice and layby line."
            icon={Package}
            accent="cogs"
            loading={isLoading}
            rows={[
              { label: "Sales ex GST", value: s?.exGstRevenue ?? 0 },
              { label: "Cost of goods sold", value: s?.totalCogs ?? 0, sign: "minus" },
              { label: "Gross profit", value: s?.grossProfit ?? 0, strong: true },
            ]}
            foot={`Gross margin ${(s?.grossMarginPct ?? 0).toFixed(1)}% · before payment fees and employee costs`}
          />
        </div>

        {/* Banking */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Landmark className="w-4 h-4" /> Banking List
              </CardTitle>
              <CardDescription>Takings for the week, grouped by how the money arrives.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: "Cash Taken", value: b?.cashTakings ?? 0, icon: Banknote, tone: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300" },
                  { label: "EFTPOS / Card", value: b?.eftposTakings ?? 0, icon: CreditCard, tone: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300" },
                  { label: "Direct Deposit", value: b?.directDepositTakings ?? 0, icon: Landmark, tone: "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300" },
                ].map((t) => (
                  <div key={t.label} className={cn("rounded-lg p-3", t.tone)}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <t.icon className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">{t.label}</span>
                    </div>
                    <p className="text-xl font-bold tabular-nums">{money(t.value)}</p>
                  </div>
                ))}
              </div>

              {(b?.nonBankingTakings ?? 0) > 0 || (b?.otherTakings ?? 0) > 0 ? (
                <div className="flex flex-wrap gap-4 text-sm">
                  {(b?.nonBankingTakings ?? 0) > 0 && (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Gift className="w-3.5 h-3.5" />
                      Gift cards / credit redeemed <span className="font-medium text-foreground tabular-nums">{money(b?.nonBankingTakings)}</span>
                      <span className="text-xs">(not banked)</span>
                    </span>
                  )}
                  {(b?.otherTakings ?? 0) > 0 && (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Wallet className="w-3.5 h-3.5" />
                      Other <span className="font-medium text-foreground tabular-nums">{money(b?.otherTakings)}</span>
                    </span>
                  )}
                </div>
              ) : null}

              <Separator />

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment method</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow><TableCell colSpan={3}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                  )}
                  {!isLoading && (b?.byMethod.length ?? 0) === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">No takings in this week</TableCell></TableRow>
                  )}
                  {b?.byMethod.map((m) => (
                    <TableRow key={m.method}>
                      <TableCell className="font-medium">{methodLabel(m.method)}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.count}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{money(m.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Bank deposit */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Banknote className="w-4 h-4" /> Bank Deposit
              </CardTitle>
              <CardDescription>Cash out of the tills, less the float and anything bought with it.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              <CalcRow label="Cash taken" value={b?.cashTakings ?? 0} />
              {(b?.cashRefunds ?? 0) > 0 && <CalcRow label="Cash refunds paid out" value={b?.cashRefunds ?? 0} sign="minus" muted />}
              {(b?.drawerCashIn ?? 0) > 0 && <CalcRow label="Cash added to till" value={b?.drawerCashIn ?? 0} sign="plus" muted hint="Recorded at the till as cash in" />}
              <CalcRow label="Purchases paid from till" value={b?.cashPurchasesTotal ?? 0} sign="minus" muted hint={`${purchases.length} line${purchases.length === 1 ? "" : "s"} below`} />
              <CalcRow label="Expected cash from trading" value={b?.expectedCash ?? 0} />

              <Separator className="my-3" />

              <div className="grid grid-cols-2 gap-3 items-end">
                <div>
                  <Label className="text-xs">Till float retained</Label>
                  <p className="text-[11px] text-muted-foreground mb-1 leading-tight">
                    {b && b.tillFloats.length > 0
                      ? `Tills opened with ${money(b.tillFloatTotal)} across ${b.tillFloats.length} register${b.tillFloats.length === 1 ? "" : "s"}`
                      : "Cash kept back for next week"}
                  </p>
                  <MoneyInput
                    value={b?.floatRetained ?? 0}
                    disabled={locked}
                    onCommit={(v) => void save({ floatRetained: v ?? 0 })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Cash counted in tills</Label>
                  <p className="text-[11px] text-muted-foreground mb-1 leading-tight">Float included. Leave blank if not counted.</p>
                  <MoneyInput
                    value={b?.cashCounted ?? null}
                    disabled={locked}
                    placeholder="Not counted"
                    onCommit={(v) => void save({ cashCounted: v })}
                  />
                </div>
              </div>

              <CalcRow label="Expected in tills (float + trading)" value={b?.expectedInTill ?? 0} muted />
              {b?.countVariance !== null && b?.countVariance !== undefined && (
                <div className="flex items-center justify-between py-1.5">
                  <span className={cn("text-sm", Math.abs(b.countVariance) > 0.005 ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground")}>
                    Count variance
                  </span>
                  <span className={cn("text-sm font-semibold tabular-nums",
                    Math.abs(b.countVariance) <= 0.005 ? "text-emerald-600 dark:text-emerald-400"
                      : b.countVariance < 0 ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400")}>
                    {b.countVariance > 0 ? "+" : ""}{money(b.countVariance)}
                  </span>
                </div>
              )}

              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 mt-2">
                <div className="flex items-baseline justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Cash to bank</p>
                    <p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80">
                      {b?.fromCount ? "From the counted cash, less the float" : "From the ledger — no count entered"}
                    </p>
                  </div>
                  <span className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                    {money(b?.cashToBank)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 items-end pt-2">
                <div>
                  <Label className="text-xs">Actually banked</Label>
                  <MoneyInput
                    value={b?.bankedAmount ?? null}
                    disabled={locked}
                    placeholder="Not yet banked"
                    className="mt-1"
                    onCommit={(v) => void save({ bankedAmount: v })}
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Still to bank</p>
                  <p className={cn("text-lg font-bold tabular-nums mt-1",
                    b?.bankingShortfall === null || b?.bankingShortfall === undefined ? "text-muted-foreground"
                      : Math.abs(b.bankingShortfall) <= 0.005 ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-600 dark:text-amber-400")}>
                    {b?.bankingShortfall === null || b?.bankingShortfall === undefined ? "—" : money(b.bankingShortfall)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Cash purchases */}
        <Card>
          <CardHeader className="pb-3 flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="w-4 h-4" /> Purchases Paid From The Till
              </CardTitle>
              <CardDescription>
                Business buys paid for in cash out of the drawer. Each line comes off the deposit.
                Cash-outs recorded at the till are pulled in automatically the first time a week is opened.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={addPurchase} disabled={locked || saving} className="print:hidden shrink-0">
              <Plus className="w-4 h-4 mr-1.5" /> Add line
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-40">Date</TableHead>
                  <TableHead className="w-36 text-right">Amount</TableHead>
                  <TableHead className="w-24">Source</TableHead>
                  <TableHead className="w-12 print:hidden" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                      Nothing bought out of the till this week
                    </TableCell>
                  </TableRow>
                )}
                {purchases.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Input
                        className="h-9" placeholder="What was bought" disabled={locked}
                        defaultValue={p.description} noPhoneFormat
                        onBlur={(e) => {
                          if (e.target.value !== p.description) updatePurchase(p.id, { description: e.target.value });
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="date" className="h-9" disabled={locked}
                        defaultValue={p.date ?? ""}
                        onBlur={(e) => { if (e.target.value !== (p.date ?? "")) updatePurchase(p.id, { date: e.target.value }); }}
                      />
                    </TableCell>
                    <TableCell>
                      <MoneyInput
                        value={p.amount} disabled={locked}
                        onCommit={(v) => updatePurchase(p.id, { amount: v ?? 0 })}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.source === "drawer" ? "secondary" : "outline"} className="text-[11px]">
                        {p.source === "drawer" ? "Till" : "Manual"}
                      </Badge>
                    </TableCell>
                    <TableCell className="print:hidden">
                      <Button variant="ghost" size="icon" disabled={locked} onClick={() => removePurchase(p.id)} title="Remove line">
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40">
                  <TableCell colSpan={2} className="font-semibold">Total taken from the till</TableCell>
                  <TableCell className="text-right font-bold tabular-nums">{money(b?.cashPurchasesTotal)}</TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Employee costs */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4" /> Employee Costs
                </CardTitle>
                <CardDescription>
                  Wages and super are worked out from timesheet hours and each employee's pay rate; KPI money comes from
                  KPI periods that closed inside this week and were hit. Every figure is editable — what you type is kept.
                </CardDescription>
              </div>
              <div className="flex items-start gap-3 rounded-lg border px-3 py-2 shrink-0 print:hidden">
                <Switch
                  id="eow-include-tax"
                  checked={includeTax}
                  disabled={saving}
                  onCheckedChange={(v) => void toggleIncludeTax(v)}
                />
                <div className="max-w-[18rem]">
                  <Label htmlFor="eow-include-tax" className="text-sm cursor-pointer">Count PAYG in cost to business</Label>
                  <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                    {includeTax
                      ? "PAYG is being added to the cost total. Turn off if it is withheld out of the wages figure."
                      : "Off: PAYG is withheld out of wages, so adding it would count the same dollars twice."}
                    {" "}Applies to every week; finalised weeks keep their frozen totals.
                  </p>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[10rem]">Employee</TableHead>
                    <TableHead className="text-right w-20">Hours</TableHead>
                    <TableHead className="text-right w-32">Wages</TableHead>
                    <TableHead className="text-right w-32">
                      Tax (PAYG)
                      {!includeTax && <span className="block text-[10px] font-normal text-muted-foreground">not in total</span>}
                    </TableHead>
                    <TableHead className="text-right w-32">Super</TableHead>
                    <TableHead className="text-right w-32">Bonus</TableHead>
                    <TableHead className="text-right w-32">Extras</TableHead>
                    <TableHead className="text-right w-32">KPI money</TableHead>
                    <TableHead className="text-right w-36">
                      Cost to business
                      <span className="block text-[10px] font-normal text-muted-foreground">
                        {includeTax ? "incl. PAYG" : "excl. PAYG"}
                      </span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow><TableCell colSpan={9}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                  )}
                  {!isLoading && staffRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">
                        No active employees
                      </TableCell>
                    </TableRow>
                  )}
                  {staffRows.map((row) => {
                    const fields = [
                      ["wages", row.wages], ["tax", row.tax], ["superannuation", row.superannuation],
                      ["bonus", row.bonus], ["extras", row.extras], ["kpi", row.kpi],
                    ] as const;
                    return (
                      <TableRow key={`${row.staffId ?? "x"}-${row.name}`}>
                        <TableCell>
                          <div className="font-medium">{row.name}</div>
                          <div className="text-xs text-muted-foreground capitalize">{row.role || "—"}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{row.hours.toFixed(2)}</TableCell>
                        {fields.map(([key, value]) => (
                          <TableCell key={key}>
                            <MoneyInput
                              value={value} disabled={locked}
                              onCommit={(v) => updateStaffCost(row.staffId, row.name, { [key]: v ?? 0 } as Partial<StaffCostRow>)}
                            />
                          </TableCell>
                        ))}
                        <TableCell className="text-right font-semibold tabular-nums">{money(row.total)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {staffRows.length > 0 && totals && (
                    <TableRow className="bg-muted/40">
                      <TableCell className="font-semibold">Total</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{totals.hours.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{money(totals.wages)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{money(totals.tax)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{money(totals.superannuation)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{money(totals.bonus)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{money(totals.extras)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{money(totals.kpi)}</TableCell>
                      <TableCell className="text-right font-bold tabular-nums">{money(totals.total)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {(data?.kpiAwards.length ?? 0) > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {data?.kpiAwards.map((a, i) => (
                  <Badge key={`${a.name}-${i}`} variant="secondary" className="gap-1">
                    <Trophy className="w-3 h-3" /> {a.name} · {money(a.amount)}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Week in review */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4" /> Trading Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <CalcRow label="Total sold (inc GST)" value={s?.grossRevenue ?? 0} />
              <CalcRow label="Discounts given" value={s?.discountTotal ?? 0} sign="minus" muted />
              <CalcRow label="Refunds" value={s?.refundTotal ?? 0} sign="minus" muted hint={`${s?.refundCount ?? 0} refunded sale${s?.refundCount === 1 ? "" : "s"}`} />
              <CalcRow label="Net sales" value={s?.netSales ?? 0} />
              <CalcRow label="Total GST collected" value={s?.taxCollected ?? 0} sign="minus" accent="gst"
                       hint={gstRefunded > 0 ? `${money(netGst)} net of ${money(gstRefunded)} refunded` : undefined} />
              <CalcRow label="Sales ex GST" value={s?.exGstRevenue ?? 0} />
              <CalcRow label="Cost of goods sold" value={s?.totalCogs ?? 0} sign="minus" accent="cogs"
                       hint={`Gross margin ${(s?.grossMarginPct ?? 0).toFixed(1)}%`} />
              <CalcRow label="Gross profit" value={s?.grossProfit ?? 0} />
              {(s?.surchargeCost ?? 0) > 0 && (
                <CalcRow label="Payment fees absorbed" value={s?.surchargeCost ?? 0} sign="minus" muted />
              )}
              <CalcRow label="Net profit" value={s?.netProfit ?? 0} strong />
              <CalcRow label="Employee costs" value={totals?.total ?? 0} sign="minus" muted />
              <CalcRow label="Profit after employee costs" value={data?.profitAfterStaff ?? 0} strong />
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">The Week In Review</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                {[
                  { icon: Users, label: "New customers", value: String(data?.customers.newCustomers ?? 0), sub: `${data?.customers.totalCustomers ?? 0} on file` },
                  { icon: RotateCcw, label: "Refunds", value: money(data?.refunds.total), sub: `${data?.refunds.count ?? 0} sale(s) · ${money(data?.refunds.cash)} cash` },
                  { icon: FileText, label: "Invoices paid", value: money(data?.invoices.paidTotal), sub: `${data?.invoices.paidCount ?? 0} paid · ${data?.invoices.issuedCount ?? 0} raised` },
                  { icon: FileText, label: "Invoices owing", value: money(data?.invoices.outstandingTotal), sub: `${data?.invoices.overdueCount ?? 0} overdue · ${money(data?.invoices.overdueTotal)}` },
                  { icon: Wrench, label: "Jobs completed", value: String(data?.services.completed ?? 0), sub: `${money(data?.services.revenue)} · ${data?.services.bookedIn ?? 0} booked in` },
                  { icon: Wrench, label: "Jobs on the bench", value: String(data?.services.openNow ?? 0), sub: `Parts ${money(data?.services.partsValue)} · Labour ${money(data?.services.labourValue)}` },
                  { icon: Package, label: "Laybys completed", value: String(data?.laybys.completedCount ?? 0), sub: money(data?.laybys.completedTotal) },
                  { icon: Coins, label: "Avg sale", value: money(s?.avgSale), sub: `${s?.transactionCount ?? 0} transactions` },
                ].map((t) => (
                  <div key={t.label} className="rounded-lg border p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <t.icon className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{t.label}</span>
                    </div>
                    <p className="text-lg font-bold tabular-nums">{t.value}</p>
                    <p className="text-[11px] text-muted-foreground">{t.sub}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Notes</CardTitle>
                {saving && <span className="text-xs text-muted-foreground flex items-center gap-1"><Save className="w-3 h-3" /> Saving…</span>}
              </CardHeader>
              <CardContent>
                <Textarea
                  rows={5} disabled={locked}
                  placeholder="Anything worth remembering about this week — a short till, a supplier paid in cash, a big job that lands next week…"
                  value={notes}
                  onChange={(e) => onNotesChange(e.target.value)}
                />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Daily + top products */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Day By Day</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Day</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right text-amber-700 dark:text-amber-300">GST</TableHead>
                    <TableHead className="text-right text-indigo-700 dark:text-indigo-300">COGS</TableHead>
                    <TableHead className="text-right">Refunds</TableHead>
                    <TableHead className="text-right">Net profit</TableHead>
                    <TableHead className="text-right">Sales #</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(s?.dailyBreakdown.length ?? 0) === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">No trading in this week</TableCell></TableRow>
                  )}
                  {s?.dailyBreakdown.map((d) => (
                    <TableRow key={d.date}>
                      <TableCell className="font-medium whitespace-nowrap">{dayLabel(d.date)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(d.grossRevenue)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-amber-700 dark:text-amber-300">{money(d.taxCollected)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-indigo-700 dark:text-indigo-300">{money(d.totalCogs)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{d.refundTotal ? money(d.refundTotal) : "—"}</TableCell>
                      <TableCell className={cn("text-right tabular-nums font-medium", d.netProfit < 0 && "text-red-600 dark:text-red-400")}>{money(d.netProfit)}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.transactionCount}</TableCell>
                    </TableRow>
                  ))}
                  {(s?.dailyBreakdown.length ?? 0) > 0 && (
                    <TableRow className="border-t-2 bg-muted/40">
                      <TableCell className="font-semibold">Week</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{money(s?.grossRevenue)}</TableCell>
                      <TableCell className="text-right tabular-nums font-bold text-amber-700 dark:text-amber-300">{money(s?.taxCollected)}</TableCell>
                      <TableCell className="text-right tabular-nums font-bold text-indigo-700 dark:text-indigo-300">{money(s?.totalCogs)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{s?.refundTotal ? money(s?.refundTotal) : "—"}</TableCell>
                      <TableCell className={cn("text-right tabular-nums font-bold", (s?.netProfit ?? 0) < 0 && "text-red-600 dark:text-red-400")}>{money(s?.netProfit)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{s?.transactionCount ?? 0}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Top Sellers</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.topProducts.length ?? 0) === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">Nothing sold in this week</TableCell></TableRow>
                  )}
                  {data?.topProducts.map((p) => (
                    <TableRow key={`${p.sku}-${p.name}`}>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        {p.sku && <div className="text-xs text-muted-foreground">{p.sku}</div>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{p.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(p.revenue)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{money(p.profit)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
        {/* Saved weeks */}
        {(history?.items.length ?? 0) > 0 && (
          <Card className="print:hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarRange className="w-4 h-4" /> Saved Weeks
              </CardTitle>
              <CardDescription>Weeks with banking recorded. Figures shown are the finalised snapshot; a draft recomputes when you open it.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Week</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Net profit</TableHead>
                    <TableHead className="text-right">Cash to bank</TableHead>
                    <TableHead className="text-right">Banked</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history?.items.map((w) => {
                    const isCurrent = w.startDate === startDate && w.endDate === endDate;
                    return (
                      <TableRow key={w.id} className={cn(isCurrent && "bg-muted/40")}>
                        <TableCell className="font-medium whitespace-nowrap">{rangeLabel(w.startDate, w.endDate)}</TableCell>
                        <TableCell>
                          <Badge variant={w.status === "finalised" ? "secondary" : "outline"} className="gap-1 text-[11px]">
                            {w.status === "finalised" ? <Lock className="w-3 h-3" /> : null}
                            {w.status === "finalised" ? "Finalised" : "Draft"}
                          </Badge>
                          {w.finalisedByName && <div className="text-[11px] text-muted-foreground mt-0.5">{w.finalisedByName}</div>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{w.grossRevenue === null ? "—" : money(w.grossRevenue)}</TableCell>
                        <TableCell className="text-right tabular-nums">{w.netProfit === null ? "—" : money(w.netProfit)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{w.cashToBank === null ? "—" : money(w.cashToBank)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{w.bankedAmount === null ? "—" : money(w.bankedAmount)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost" size="sm" disabled={isCurrent}
                            onClick={() => { setStartDate(w.startDate); setEndDate(w.endDate); }}
                          >
                            {isCurrent ? "Open" : "View"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog open={confirmFinalise} onOpenChange={setConfirmFinalise}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalise {rangeLabel(startDate, endDate)}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  This freezes the week's figures as they stand right now and locks the inputs.
                  A refund, a backdated invoice or a late timesheet recorded after this will no longer
                  change the numbers you banked against.
                </p>
                <p className="font-medium text-foreground">
                  Cash to bank: {money(b?.cashToBank)} · Net profit: {money(s?.netProfit)} ·
                  Employee costs: {money(totals?.total)}
                </p>
                <p>Nothing is deleted — you can reopen the week at any time to go back to live figures.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => runAction("finalise")}>Finalise week</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
