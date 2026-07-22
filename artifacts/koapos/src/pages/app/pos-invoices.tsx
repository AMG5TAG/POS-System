import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";

import { AppLayout } from "@/components/layout/app-layout";
import {
  useListProducts, useGetMerchant, useGetLoyaltySettings, LoyaltySettings,
  useListInvoices, useCreateInvoice, useUpdateInvoice, useDeleteInvoice,
  useAddInvoiceEvent, useSendInvoiceEmail, useGetInvoice, getGetInvoiceQueryKey,
  useRecordInvoicePayment, useReverseInvoicePayment,
  ListInvoicesStatus, getListInvoicesQueryKey, useGetRegionalExtSettings,
  getInvoicePdf, type Transaction,
  useListServiceJobs, useListAppointments,
  useGetInvoiceSettings, useGetPosSettings,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useBusinessProfile } from "@/lib/business-profile";
import { useStaffSession } from "@/lib/staff-day-session";
import { invalidateSalesKpiQueries } from "@/lib/kpi-invalidate";
import { setPendingInvoicePayment } from "@/lib/pending-invoice-payment";
import { CustomerSearchInput } from "@/components/customers/CustomerSearchInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatDate, formatDateOnly } from "@/lib/utils";
import { useSalesTemplate } from "@/lib/use-sales-template";
import { useDocumentTemplate } from "@/lib/use-document-template";
import {
  Plus, FileText, Search, Trash2, CheckCircle2, Send, RefreshCw, Package,
  Eye, EyeOff, Mail, MessageSquare, Printer, X, ExternalLink, Clock, Download, Pencil,
  Banknote, Tag, CalendarClock, AlertCircle, ListChecks, History, ClipboardList,
  Copy, GripVertical, Loader2, Link2, CalendarDays, Wrench,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { SendDialog, type SendMethodKey } from "@/components/send/send-dialog";
import {
  getEnabledPaymentMethods, getEnabledIntegrationPayments, parseCustomPaymentMethods,
  INTEGRATION_PAYMENT_LABELS, ASYNC_PAYMENT_PROVIDERS,
} from "@/lib/pos-local-settings";
import { ALL_PAYMENT_METHODS } from "@/pages/app/management-registers";

/* ── PDF image compression helper ───────────────────────────────────────── */

/**
 * Downscale + JPEG-compress any image data URL before embedding in a PDF.
 * Logo at 22mm print size needs at most ~260 px at 300 DPI — raw user uploads
 * are often 1000–4000 px PNGs which balloon the file to 100 MB+.
 * This reduces a typical logo from ~3 MB of base64 PNG to ~20 KB JPEG.
 */
async function compressForPdf(
  src: string,
  maxPx = 260,
  quality = 0.78,
): Promise<{ dataUrl: string; format: "JPEG" }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width || 1, img.height || 1));
      const w = Math.max(1, Math.round(img.width  * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("no 2d ctx")); return; }
      ctx.fillStyle = "#ffffff";  // white background so transparency becomes white, not black
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve({ dataUrl: canvas.toDataURL("image/jpeg", quality), format: "JPEG" });
    };
    img.onerror = reject;
    img.src = src;
  });
}

/* ── Types ───────────────────────────────────────────────────────────────── */

type InvStatus = "draft" | "sent" | "paid" | "partial" | "overdue" | "cancelled";
type LineItem = { description: string; quantity: number; unitPrice: number; taxRate: number; productId?: number | null; costPrice?: number | null };
type InvoiceEvent = { id?: string | null; type: string; timestamp: string; detail?: string; method?: string; amount?: number | null; reverses?: string | null };
type Instalment = { label?: string | null; amount: number; dueDate?: string | null };
type DiscountType = "fixed" | "percent";
type Invoice = {
  id: number;
  invoiceNumber: string;
  customerId: number | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  customerCompany: string | null;
  status: InvStatus;
  subtotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  discountType:  DiscountType | null;
  discountValue: number | null;
  discountTotal: number | null;
  items: LineItem[];
  events: InvoiceEvent[];
  paymentSchedule: Instalment[] | null;
  dueDate: string | null;
  paidAt: string | null;
  viewedAt: string | null;
  notes: string | null;
  isRecurring: boolean;
  recurringFrequency: string | null;
  recurringOccurrences: number | null;
  recurringStartDate: string | null;
  nextSendDate: string | null;
  parentInvoiceId: number | null;
  serviceJobId: number | null;
  appointmentId: number | null;
  createdAt: string;
};

/* ── Constants ───────────────────────────────────────────────────────────── */

const STATUS_COLORS: Record<InvStatus, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary", sent: "outline", paid: "default", partial: "outline", overdue: "destructive", cancelled: "secondary",
};

const STATUS_LABELS: Record<InvStatus, string> = {
  draft: "Draft", sent: "Sent", paid: "Paid", partial: "Partially Paid", overdue: "Overdue", cancelled: "Cancelled",
};

/* Today's local calendar date as YYYY-MM-DD (en-CA yields ISO ordering), for
   seeding / bounding the native date input without a UTC off-by-one. */
const todayLocalISODate = () => new Date().toLocaleDateString("en-CA");
/* An ISO timestamp collapsed to a local YYYY-MM-DD (matches the date input). */
const localISODate = (iso: string) => new Date(iso).toLocaleDateString("en-CA");

/* Derive each instalment's coverage from the invoice's single amountPaid total,
   filling instalments in order (FIFO). Avoids tracking per-instalment payments —
   amountPaid stays the one source of truth. */
type InstalmentCoverage = Instalment & { covered: number; status: "paid" | "partial" | "due" };
function instalmentCoverage(schedule: Instalment[], amountPaid: number): InstalmentCoverage[] {
  let remaining = Math.max(0, amountPaid);
  return schedule.map((inst) => {
    const covered = Math.min(remaining, inst.amount);
    remaining = Math.max(0, remaining - inst.amount);
    const status = covered >= inst.amount - 0.005 ? "paid" : covered > 0 ? "partial" : "due";
    return { ...inst, covered, status };
  });
}

/* Editor for an invoice's planned instalment schedule. Used in both the create
   and edit forms. The schedule is purely a plan — payments are still recorded
   against the single amountPaid total. */
function ScheduleEditor({ schedule, setSchedule, total }: {
  schedule: Instalment[];
  setSchedule: (s: Instalment[]) => void;
  total: number;
}) {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const sum = round2(schedule.reduce((s, i) => s + (Number(i.amount) || 0), 0));
  const diff = round2(total - sum);

  const splitEqually = (n: number) => {
    if (n < 1 || total <= 0) { setSchedule([]); return; }
    const each = Math.floor((total / n) * 100) / 100;
    const rows: Instalment[] = [];
    let acc = 0;
    for (let k = 0; k < n; k++) {
      const amount = k === n - 1 ? round2(total - acc) : each;
      acc = round2(acc + amount);
      rows.push({ label: `Instalment ${k + 1}`, amount, dueDate: null });
    }
    setSchedule(rows);
  };

  const updateRow = (i: number, patch: Partial<Instalment>) =>
    setSchedule(schedule.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label className="text-sm">Payment schedule</Label>
          <p className="text-xs text-muted-foreground">Plan instalments (e.g. deposit + balance). Optional.</p>
        </div>
        <Switch
          checked={schedule.length > 0}
          onCheckedChange={(v) => (v ? splitEqually(2) : setSchedule([]))}
        />
      </div>

      {schedule.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {[2, 3, 4].map((n) => (
              <Button key={n} type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => splitEqually(n)}>
                Split in {n}
              </Button>
            ))}
          </div>
          {schedule.map((inst, i) => (
            <div key={i} className="flex gap-2 items-center">
              <Input
                className="flex-1 h-8"
                placeholder={`Instalment ${i + 1}`}
                value={inst.label ?? ""}
                onChange={(e) => updateRow(i, { label: e.target.value })}
              />
              <Input
                className="w-24 h-8"
                type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00"
                value={String(inst.amount)}
                onChange={(e) => updateRow(i, { amount: parseFloat(e.target.value) || 0 })}
              />
              <Input
                className="w-36 h-8"
                type="date"
                value={inst.dueDate ? inst.dueDate.slice(0, 10) : ""}
                onChange={(e) => updateRow(i, { dueDate: e.target.value || null })}
              />
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground"
                onClick={() => setSchedule(schedule.filter((_, idx) => idx !== i))}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1"
            onClick={() => setSchedule([...schedule, { label: "", amount: Math.max(0, diff), dueDate: null }])}>
            <Plus className="w-3 h-3" /> Add instalment
          </Button>
          <p className={`text-xs ${Math.abs(diff) < 0.005 ? "text-muted-foreground" : "text-amber-600"}`}>
            Scheduled {formatCurrency(sum)} of {formatCurrency(total)}
            {Math.abs(diff) < 0.005 ? " · matches total"
              : diff > 0 ? ` · ${formatCurrency(diff)} unscheduled`
              : ` · ${formatCurrency(-diff)} over total`}
          </p>
        </div>
      )}
    </div>
  );
}

/* The Record Payment dialog mirrors the tenders the current POS register offers
   (built-in + integration + custom methods), built per-render from the same
   settings the POS checkout reads — see `payMethods` in the page component. */

const FREQ_LABELS = { weekly: "Weekly", fortnightly: "Fortnightly", monthly: "Monthly", quarterly: "Quarterly", annually: "Annually" };

/* ── Recurring helpers ───────────────────────────────────────────────────── */

function scheduleTag(inv: Invoice): string {
  const freq = FREQ_LABELS[(inv.recurringFrequency ?? "monthly") as keyof typeof FREQ_LABELS] ?? "Recurring";
  const desc = inv.items?.[0]?.description?.trim();
  return desc ? `${freq} · ${desc}` : `${freq} Schedule`;
}



/* ── Prefix settings ──────────────────────────────────────────────────── */

function getInvoicePrefix(): { invoicePrefix: string; invoiceDigits: number } {
  return { invoicePrefix: "KI", invoiceDigits: 5 };
}

/** ISO yyyy-mm-dd for `days` from today — used to default an invoice's due date
 *  from the merchant's "default due date" setting. */
function dueDateFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + Math.max(0, Math.round(days)));
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/* ── Main page ───────────────────────────────────────────────────────────── */

export default function POSInvoicesPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [detailInvoiceId, setDetailInvoiceId] = useState<number | null>(null);
  const [detailInvoiceSeed, setDetailInvoiceSeed] = useState<Invoice | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({ customerId: "", dueDate: "", notes: "" });
  const [lines, setLines] = useState<LineItem[]>([{ description: "", quantity: 1, unitPrice: 0, taxRate: 10 }]);
  const [saving, setSaving] = useState(false);
  const [sendTarget, setSendTarget] = useState<Invoice | null>(null);
  const [sendInitialMethod, setSendInitialMethod] = useState<SendMethodKey | null>(null);
  const [emailSubject, setEmailSubject] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  /* Record-payment dialog — partial or full payment against one invoice. */
  const [payTarget, setPayTarget] = useState<Invoice | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payNote, setPayNote] = useState("");
  /* Accounting date paid — surfaced for direct deposit (bank transfers often land
     on an earlier day). Defaults to today; drives the invoice's paidAt / reported
     sale date on full settlement. Held as YYYY-MM-DD for the native date input. */
  const [payDate, setPayDate] = useState("");
  const [paySaving, setPaySaving] = useState(false);
  /* Reverse-payment confirmation — the payment event being un-applied. */
  const [reverseTarget, setReverseTarget] = useState<{ invoiceId: number; event: InvoiceEvent } | null>(null);
  const [reverseSaving, setReverseSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [editForm, setEditForm] = useState({ customerId: "", dueDate: "", notes: "" });
  const [editLines, setEditLines] = useState<LineItem[]>([{ description: "", quantity: 1, unitPrice: 0, taxRate: 10 }]);
  const [editLineSearch, setEditLineSearch] = useState<string[]>([""]);
  const [editLineDropOpen, setEditLineDropOpen] = useState<boolean[]>([false]);
  const [createDragFrom, setCreateDragFrom] = useState<number | null>(null);
  const [createDragOver, setCreateDragOver] = useState<number | null>(null);
  const [editDragFrom, setEditDragFrom] = useState<number | null>(null);
  const [editDragOver, setEditDragOver] = useState<number | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  /* Sell-price prompt — opened when a selected product has a $0 sell price so the
     user can set a one-off sell price (required) and optional cost price for that
     line without leaving the invoice. `flow` picks which line list to write back to. */
  const [pricePrompt, setPricePrompt] = useState<{
    flow: "create" | "edit";
    index: number;
    name: string;
    sellPrice: string;
    costPrice: string;
  } | null>(null);
  const [editRecurring, setEditRecurring] = useState({
    enabled: false,
    frequency: "monthly" as "weekly" | "fortnightly" | "monthly" | "quarterly" | "annually",
    startDate: "",
    occurrences: 1,
  });

  const lineDropRefs = useRef<(HTMLDivElement | null)[]>([]);
  const editLineDropRefs = useRef<(HTMLDivElement | null)[]>([]);
  const editInitialRef = useRef<{
    form: typeof editForm;
    lines: LineItem[];
    discount: typeof editDiscount;
    recurring: typeof editRecurring;
    schedule: Instalment[];
  } | null>(null);

  const [discardConfirmTarget, setDiscardConfirmTarget] = useState<"create" | "edit" | null>(null);
  const [lineSearch, setLineSearch] = useState<string[]>([""]);
  const [lineDropOpen, setLineDropOpen] = useState<boolean[]>([false]);

  const [recurring, setRecurring] = useState({
    enabled: false,
    frequency: "monthly" as "weekly" | "fortnightly" | "monthly" | "quarterly" | "annually",
    startDate: "",
    occurrences: 1,
  });
  const [schedule, setSchedule] = useState<Instalment[]>([]);
  const [editSchedule, setEditSchedule] = useState<Instalment[]>([]);
  const [pdfGeneratingId, setPdfGeneratingId] = useState<number | null>(null);
  const [sendNowInvoice, setSendNowInvoice] = useState<Invoice | null>(null);

  /* ── Link service/appointment ── */
  const [linkDialogFor, setLinkDialogFor] = useState<"create" | "edit" | null>(null);
  const [linkSearch, setLinkSearch] = useState("");
  const [createLinkedServiceJob, setCreateLinkedServiceJob] = useState<{ id: number; jobNumber: string; label: string } | null>(null);
  const [createLinkedAppointment, setCreateLinkedAppointment] = useState<{ id: number; title: string; label: string } | null>(null);
  const [editLinkedServiceJob, setEditLinkedServiceJob] = useState<{ id: number; jobNumber: string; label: string } | null>(null);
  const [editLinkedAppointment, setEditLinkedAppointment] = useState<{ id: number; title: string; label: string } | null>(null);
  const { data: linkServiceJobsData } = useListServiceJobs({ query: { queryKey: ["service-jobs-invoice-link"], enabled: !!linkDialogFor } });
  const { data: linkAppointmentsData } = useListAppointments(undefined, { query: { queryKey: ["appointments-invoice-link"], enabled: !!linkDialogFor } });
  // Both endpoints return a plain array; tolerate an { items } envelope just in case.
  type LinkServiceJob = { id: number; jobNumber: string; deviceType?: string | null; deviceDescription?: string | null; status?: string | null; customerName?: string | null };
  type LinkAppointment = { id: number; title: string; scheduledAt?: string | null; status?: string | null; customerName?: string | null };
  const asArray = <T,>(d: unknown): T[] =>
    Array.isArray(d) ? (d as T[]) : ((d as { items?: T[] } | undefined)?.items ?? []);
  const linkServiceJobs = asArray<LinkServiceJob>(linkServiceJobsData);
  const linkAppointments = asArray<LinkAppointment>(linkAppointmentsData);

  // "Unfinished" jobs/appointments sort to the top of the picker; finished ones
  // (completed/cancelled/no-show) remain selectable below.
  const isServiceJobDone = (s?: string | null) => ["completed", "cancelled"].includes((s ?? "").toLowerCase());
  const isAppointmentDone = (s?: string | null) => ["completed", "cancelled", "no-show"].includes((s ?? "").toLowerCase());
  const byIdDesc = <T extends { id: number }>(a: T, b: T) => b.id - a.id;
  // Free-text filter across both open and closed jobs/appointments.
  const linkQ = linkSearch.trim().toLowerCase();
  const matchSj = (j: LinkServiceJob) =>
    !linkQ || [`#${j.jobNumber}`, j.jobNumber, j.deviceType, j.deviceDescription, j.customerName, j.status]
      .some((v) => (v ?? "").toString().toLowerCase().includes(linkQ));
  const matchApt = (a: LinkAppointment) =>
    !linkQ || [`#${a.id}`, a.title, a.customerName, a.status]
      .some((v) => (v ?? "").toString().toLowerCase().includes(linkQ));
  const sjUnfinished = linkServiceJobs.filter((j) => !isServiceJobDone(j.status) && matchSj(j)).sort(byIdDesc);
  const sjDone       = linkServiceJobs.filter((j) =>  isServiceJobDone(j.status) && matchSj(j)).sort(byIdDesc);
  const aptUnfinished = linkAppointments.filter((a) => !isAppointmentDone(a.status) && matchApt(a)).sort(byIdDesc);
  const aptDone       = linkAppointments.filter((a) =>  isAppointmentDone(a.status) && matchApt(a)).sort(byIdDesc);

  const renderLinkServiceJobRow = (sj: LinkServiceJob) => {
    const isSelected = linkDialogFor === "create" ? createLinkedServiceJob?.id === sj.id : editLinkedServiceJob?.id === sj.id;
    return (
      <button key={sj.id} onClick={() => {
        const entry = { id: sj.id, jobNumber: sj.jobNumber, label: `#${sj.jobNumber} · ${sj.deviceType || sj.deviceDescription || "Service"}` };
        if (linkDialogFor === "create") { setCreateLinkedServiceJob(entry); setCreateLinkedAppointment(null); }
        else { setEditLinkedServiceJob(entry); setEditLinkedAppointment(null); }
        setLinkDialogFor(null);
      }} className={`w-full text-left px-3 py-2.5 hover:bg-muted text-sm flex items-center gap-2 transition-colors ${isSelected ? "bg-primary/10 text-primary" : ""}`}>
        <Wrench className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">#{sj.jobNumber} · {sj.deviceType || sj.deviceDescription || "Service"}</p>
          <p className="text-xs text-muted-foreground truncate">{sj.customerName || "No customer"}</p>
        </div>
        <Badge variant="outline" className="capitalize text-[10px] shrink-0">{(sj.status ?? "").replace(/-/g, " ") || "—"}</Badge>
      </button>
    );
  };

  const renderLinkAppointmentRow = (apt: LinkAppointment) => {
    const isSelected = linkDialogFor === "create" ? createLinkedAppointment?.id === apt.id : editLinkedAppointment?.id === apt.id;
    return (
      <button key={apt.id} onClick={() => {
        const entry = { id: apt.id, title: apt.title, label: apt.title };
        if (linkDialogFor === "create") { setCreateLinkedAppointment(entry); setCreateLinkedServiceJob(null); }
        else { setEditLinkedAppointment(entry); setEditLinkedServiceJob(null); }
        setLinkDialogFor(null);
      }} className={`w-full text-left px-3 py-2.5 hover:bg-muted text-sm flex items-center gap-2 transition-colors ${isSelected ? "bg-primary/10 text-primary" : ""}`}>
        <CalendarDays className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">#{apt.id} · {apt.title}</p>
          <p className="text-xs text-muted-foreground truncate">{apt.scheduledAt ? new Date(apt.scheduledAt).toLocaleString("en-AU") : "—"} · {apt.customerName || "No customer"}</p>
        </div>
        <Badge variant="outline" className="capitalize text-[10px] shrink-0">{(apt.status ?? "").replace(/-/g, " ") || "—"}</Badge>
      </button>
    );
  };

  const linkGroupHeader = (label: string) => (
    <div className="px-3 py-1 bg-muted/50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
  );

  const [discount, setDiscount] = useState<{ enabled: boolean; type: DiscountType; value: string }>({
    enabled: false, type: "percent", value: "",
  });
  const [editDiscount, setEditDiscount] = useState<{ enabled: boolean; type: DiscountType; value: string }>({
    enabled: false, type: "percent", value: "",
  });

  const [activeTab, setActiveTab] = useState<"standard" | "recurring" | "history">("standard");

  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  /* ── Invoice query hooks ── */
  const { data: invoicesData, isLoading: loading } = useListInvoices(
    statusFilter !== "all" ? { status: statusFilter as ListInvoicesStatus } : undefined,
  );
  const invoices = (invoicesData?.items ?? []) as unknown as Invoice[];

  const historyParams = { status: "paid" as ListInvoicesStatus, limit: 500 };
  const { data: historyData, isPending: historyPending, refetch: refetchHistory } = useListInvoices(
    historyParams,
    { query: { enabled: activeTab === "history", queryKey: getListInvoicesQueryKey(historyParams) } },
  );
  const cancelledHistoryParams = { status: "cancelled" as ListInvoicesStatus, limit: 500 };
  const { data: cancelledHistoryData, isPending: cancelledHistoryPending, refetch: refetchCancelledHistory } = useListInvoices(
    cancelledHistoryParams,
    { query: { enabled: activeTab === "history", queryKey: getListInvoicesQueryKey(cancelledHistoryParams) } },
  );
  // Gate on isPending (not isLoading): a lazily-`enabled` query has a render
  // window where enabled just flipped true but the fetch hasn't started, so
  // isLoading (= isPending && isFetching) is briefly false with data still
  // undefined — which would fall through to the empty state and stick there
  // until a re-render (e.g. switching tabs). isPending stays true until the
  // data (or an error) actually arrives. Scope to the history tab so the flag
  // reflects the live fetch (the queries are disabled off-tab).
  const historyActuallyLoading = activeTab === "history" && (historyPending || cancelledHistoryPending);
  const refetchAllHistory = () => { void refetchHistory(); void refetchCancelledHistory(); };

  const historyInvoices = useMemo(() => {
    const paid = (historyData?.items ?? []) as unknown as Invoice[];
    const cancelled = (cancelledHistoryData?.items ?? []) as unknown as Invoice[];
    return [...paid, ...cancelled].sort((a, b) => {
      const ta = a.paidAt ? new Date(a.paidAt).getTime() : new Date(a.createdAt).getTime();
      const tb = b.paidAt ? new Date(b.paidAt).getTime() : new Date(b.createdAt).getTime();
      return tb - ta;
    });
  }, [historyData, cancelledHistoryData]);

  /* History honours the same search box and status filter as the other tabs. */
  const historyFiltered = useMemo(() => historyInvoices.filter((inv) =>
    (statusFilter === "all" || inv.status === statusFilter) &&
    (!search ||
      inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      (inv.customerName ?? "").toLowerCase().includes(search.toLowerCase()))
  ), [historyInvoices, statusFilter, search]);

  /* Staff member signed in for the day — credited with invoices they create so
     invoice revenue attributes in staff leaderboards + KPIs (mirrors the POS). */
  const { dayStaff } = useStaffSession();

  /* ── Invoice mutation hooks ── */
  const createInvoiceMutation = useCreateInvoice();
  const updateInvoiceMutation = useUpdateInvoice();
  const deleteInvoiceMutation = useDeleteInvoice();
  const addEventMutation = useAddInvoiceEvent();
  const sendEmailMutation = useSendInvoiceEmail();
  const recordPaymentMutation = useRecordInvoicePayment();
  const reversePaymentMutation = useReverseInvoicePayment();

  /* Tenders offered in the Record Payment dialog, mirroring the POS register
     this terminal is signed in to: the enabled built-in methods (localStorage,
     same as POS checkout) + enabled integration providers + merchant-defined
     custom methods (server pos_settings). "split" is omitted — it's a composite
     of other tenders, not a single payment. */
  const { data: posSettingsData } = useGetPosSettings({ query: { queryKey: ["pos-settings"] } });
  const payMethods = useMemo<{ value: string; label: string }[]>(() => {
    const enabledIds = getEnabledPaymentMethods();
    const builtIn = ALL_PAYMENT_METHODS
      .filter((m) => enabledIds.includes(m.id) && m.id !== "split")
      .map((m) => ({ value: m.id, label: m.label }));
    const integrations = getEnabledIntegrationPayments()
      .map((key) => ({ value: `__intg__${key}`, label: INTEGRATION_PAYMENT_LABELS[key] ?? key }));
    const custom = parseCustomPaymentMethods(posSettingsData?.customPaymentMethods)
      .filter((m) => m.enabled)
      .map((m) => ({ value: `__custom__${m.id}`, label: m.label }));
    const all = [...builtIn, ...integrations, ...custom];
    return all.length ? all : [{ value: "cash", label: "Cash" }];
  }, [posSettingsData]);

  const { data: detailInvoiceRaw } = useGetInvoice(
    detailInvoiceId ?? 0,
    { query: { enabled: !!detailInvoiceId, queryKey: getGetInvoiceQueryKey(detailInvoiceId ?? 0) } },
  );
  const detailInvoice = (detailInvoiceRaw as unknown as Invoice | undefined) ?? detailInvoiceSeed;

  const invalidateInvoices = () => queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });

  // Refresh the list when fresh detail data shows a viewedAt the cached list doesn't know about.
  useEffect(() => {
    if (!detailInvoiceRaw || !detailInvoiceSeed) return;
    const freshViewed = (detailInvoiceRaw as unknown as Invoice).viewedAt;
    if (freshViewed !== detailInvoiceSeed.viewedAt) {
      invalidateInvoices();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailInvoiceRaw]);

  const { data: productsData } = useListProducts({ limit: 500 });
  const allProducts = productsData?.items ?? [];
  const { data: extSettings } = useGetRegionalExtSettings();
  const _parsedDefaultTaxRate = parseFloat((extSettings as any)?.defaultTaxRate ?? "10");
  const defaultTaxRate = Number.isFinite(_parsedDefaultTaxRate) && _parsedDefaultTaxRate >= 0 && _parsedDefaultTaxRate <= 100
    ? _parsedDefaultTaxRate
    : 10;
  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const { profile } = useBusinessProfile();
  const { data: loyaltySettings } = useGetLoyaltySettings();
  // Merchant invoicing defaults (Management → Invoices & Services → Invoices).
  const { data: invoiceSettings } = useGetInvoiceSettings();
  // invoiceOpts still drives the email composer defaults below. The printed /
  // downloaded invoice + quote now render through the centralized document
  // template controller (shared buildInvoiceHtml layout + backend PDF).
  const { opts: invoiceOpts } = useSalesTemplate("Invoice");
  const { printInvoice: printInvoiceTpl } = useDocumentTemplate();

  /* ── Sync initial line state when default tax rate loads ── */
  useEffect(() => {
    setLines(p => p.map(l =>
      l.description === "" && l.quantity === 1 && l.unitPrice === 0
        ? { ...l, taxRate: defaultTaxRate }
        : l,
    ));
    setEditLines(p => p.map(l =>
      l.description === "" && l.quantity === 1 && l.unitPrice === 0
        ? { ...l, taxRate: defaultTaxRate }
        : l,
    ));
  }, [defaultTaxRate]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Close product dropdowns on outside click ── */
  useEffect(() => {
    const h = (e: MouseEvent) => {
      lineDropRefs.current.forEach((ref, i) => {
        if (ref && !ref.contains(e.target as Node))
          setLineDropOpen((p) => { const n = [...p]; n[i] = false; return n; });
      });
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      editLineDropRefs.current.forEach((ref, i) => {
        if (ref && !ref.contains(e.target as Node))
          setEditLineDropOpen((p) => { const n = [...p]; n[i] = false; return n; });
      });
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  /* ── Line helpers ── */
  const addLine = () => {
    setLines((p) => [...p, { description: "", quantity: 1, unitPrice: 0, taxRate: defaultTaxRate }]);
    setLineSearch((p) => [...p, ""]);
    setLineDropOpen((p) => [...p, false]);
  };
  const updateLine = (i: number, field: keyof LineItem, val: string | number | null) =>
    setLines((p) => p.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  // Turn a line into a custom one-off item: keep the typed text as the description,
  // clear any product link, and reveal the cost-price input (backend keeps a
  // client-supplied cost for lines with no productId).
  const addCustomLine = (i: number, text: string) => {
    const name = text.trim();
    if (!name) return;
    setLines((p) => p.map((l, idx) => idx === i ? { ...l, description: name, productId: null } : l));
    setLineSearch((p) => { const n = [...p]; n[i] = ""; return n; });
    setLineDropOpen((p) => { const n = [...p]; n[i] = false; return n; });
  };
  const removeLine = (i: number) => {
    setLines((p) => p.filter((_, idx) => idx !== i));
    setLineSearch((p) => p.filter((_, idx) => idx !== i));
    setLineDropOpen((p) => p.filter((_, idx) => idx !== i));
  };
  const duplicateLine = (i: number) => {
    setLines((p) => { const n = [...p]; n.splice(i + 1, 0, { ...p[i] }); return n; });
    setLineSearch((p) => { const n = [...p]; n.splice(i + 1, 0, ""); return n; });
    setLineDropOpen((p) => { const n = [...p]; n.splice(i + 1, 0, false); return n; });
  };
  const selectProduct = (i: number, product: { id?: number; name: string; price?: number | null; costPrice?: number | null }) => {
    setLines((p) => p.map((l, idx) => idx === i ? { ...l, description: product.name, unitPrice: product.price ?? 0, taxRate: defaultTaxRate, productId: product.id ?? null, costPrice: product.costPrice ?? null } : l));
    setLineSearch((p) => { const n = [...p]; n[i] = ""; return n; });
    setLineDropOpen((p) => { const n = [...p]; n[i] = false; return n; });
    // Product has no sell price on file — prompt for a one-off sell price (and
    // optional cost price) for this line rather than silently invoicing $0.
    if ((product.price ?? 0) <= 0)
      setPricePrompt({ flow: "create", index: i, name: product.name, sellPrice: "", costPrice: product.costPrice != null ? String(product.costPrice) : "" });
  };
  const moveLineUp = (i: number) => {
    if (i === 0) return;
    setLines((p) => { const n = [...p]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; });
    setLineSearch((p) => { const n = [...p]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; });
    setLineDropOpen((p) => { const n = [...p]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; });
  };
  const moveLineDown = (i: number) => {
    setLines((p) => { if (i >= p.length - 1) return p; const n = [...p]; [n[i], n[i + 1]] = [n[i + 1], n[i]]; return n; });
    setLineSearch((p) => { if (i >= p.length - 1) return p; const n = [...p]; [n[i], n[i + 1]] = [n[i + 1], n[i]]; return n; });
    setLineDropOpen((p) => { if (i >= p.length - 1) return p; const n = [...p]; [n[i], n[i + 1]] = [n[i + 1], n[i]]; return n; });
  };
  const reorderLines = (from: number, to: number) => {
    if (from === to) return;
    const move = <T,>(arr: T[]): T[] => { const n = [...arr]; const [item] = n.splice(from, 1); n.splice(to, 0, item); return n; };
    setLines(move); setLineSearch(move); setLineDropOpen(move);
  };
  const reorderEditLines = (from: number, to: number) => {
    if (from === to) return;
    const move = <T,>(arr: T[]): T[] => { const n = [...arr]; const [item] = n.splice(from, 1); n.splice(to, 0, item); return n; };
    setEditLines(move); setEditLineSearch(move); setEditLineDropOpen(move);
  };
  const filteredProducts = (q: string) =>
    !q.trim() ? allProducts.slice(0, 8) : allProducts.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8);

  // Prices are GST-inclusive (Australian standard): extract tax from the total
  const linesGross  = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const rawTaxTotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice * (l.taxRate / (100 + l.taxRate)), 0);
  const discountAmt = (() => {
    if (!discount.enabled || !discount.value) return 0;
    const v = parseFloat(discount.value);
    if (isNaN(v) || v <= 0) return 0;
    if (discount.type === "fixed")   return Math.min(v, linesGross);
    return Math.min(v, 100) / 100 * linesGross;
  })();
  const invTotal  = Math.max(0, linesGross - discountAmt);
  const taxTotal  = linesGross > 0 ? rawTaxTotal * (invTotal / linesGross) : 0;
  const subtotal  = invTotal - taxTotal;

  const lineErrors = lines.map((l) => ({
    description: l.description.trim() === "" ? "Required" : "",
    quantity:  l.quantity < 0.0001 ? "Must be > 0" : "",
    unitPrice: l.unitPrice < 0     ? "Cannot be negative" : "",
    taxRate:   l.taxRate < 0 || l.taxRate > 100 ? "Must be 0–100" : "",
  }));
  const hasLineErrors = lineErrors.some((e) => e.description || e.quantity || e.unitPrice || e.taxRate);

  /* ── Edit line helpers ── */
  const addEditLine = () => {
    setEditLines((p) => [...p, { description: "", quantity: 1, unitPrice: 0, taxRate: defaultTaxRate }]);
    setEditLineSearch((p) => [...p, ""]);
    setEditLineDropOpen((p) => [...p, false]);
  };
  const updateEditLine = (i: number, field: keyof LineItem, val: string | number | null) =>
    setEditLines((p) => p.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  const addCustomEditLine = (i: number, text: string) => {
    const name = text.trim();
    if (!name) return;
    setEditLines((p) => p.map((l, idx) => idx === i ? { ...l, description: name, productId: null } : l));
    setEditLineSearch((p) => { const n = [...p]; n[i] = ""; return n; });
    setEditLineDropOpen((p) => { const n = [...p]; n[i] = false; return n; });
  };
  const removeEditLine = (i: number) => {
    setEditLines((p) => p.filter((_, idx) => idx !== i));
    setEditLineSearch((p) => p.filter((_, idx) => idx !== i));
    setEditLineDropOpen((p) => p.filter((_, idx) => idx !== i));
  };
  const duplicateEditLine = (i: number) => {
    setEditLines((p) => { const n = [...p]; n.splice(i + 1, 0, { ...p[i] }); return n; });
    setEditLineSearch((p) => { const n = [...p]; n.splice(i + 1, 0, ""); return n; });
    setEditLineDropOpen((p) => { const n = [...p]; n.splice(i + 1, 0, false); return n; });
  };
  const selectEditProduct = (i: number, product: { id?: number; name: string; price?: number | null; costPrice?: number | null }) => {
    setEditLines((p) => p.map((l, idx) => idx === i ? { ...l, description: product.name, unitPrice: product.price ?? 0, taxRate: defaultTaxRate, productId: product.id ?? null, costPrice: product.costPrice ?? null } : l));
    setEditLineSearch((p) => { const n = [...p]; n[i] = ""; return n; });
    setEditLineDropOpen((p) => { const n = [...p]; n[i] = false; return n; });
    // See selectProduct — same $0 sell-price prompt for the edit-invoice flow.
    if ((product.price ?? 0) <= 0)
      setPricePrompt({ flow: "edit", index: i, name: product.name, sellPrice: "", costPrice: product.costPrice != null ? String(product.costPrice) : "" });
  };
  /* Apply the sell-price prompt back to the originating line. Sell price is
     required (> 0); cost price is optional and left untouched when blank. */
  const pricePromptSell = pricePrompt ? parseFloat(pricePrompt.sellPrice) : NaN;
  const pricePromptValid = !isNaN(pricePromptSell) && pricePromptSell > 0;
  const confirmPricePrompt = () => {
    if (!pricePrompt || !pricePromptValid) return;
    const cost = pricePrompt.costPrice.trim() === "" ? null : (parseFloat(pricePrompt.costPrice) || 0);
    const apply = pricePrompt.flow === "create" ? updateLine : updateEditLine;
    apply(pricePrompt.index, "unitPrice", pricePromptSell);
    apply(pricePrompt.index, "costPrice", cost);
    setPricePrompt(null);
  };
  const moveEditLineUp = (i: number) => {
    if (i === 0) return;
    setEditLines((p) => { const n = [...p]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; });
    setEditLineSearch((p) => { const n = [...p]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; });
    setEditLineDropOpen((p) => { const n = [...p]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; });
  };
  const moveEditLineDown = (i: number) => {
    setEditLines((p) => { if (i >= p.length - 1) return p; const n = [...p]; [n[i], n[i + 1]] = [n[i + 1], n[i]]; return n; });
    setEditLineSearch((p) => { if (i >= p.length - 1) return p; const n = [...p]; [n[i], n[i + 1]] = [n[i + 1], n[i]]; return n; });
    setEditLineDropOpen((p) => { if (i >= p.length - 1) return p; const n = [...p]; [n[i], n[i + 1]] = [n[i + 1], n[i]]; return n; });
  };

  const editLinesGross  = editLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const editRawTaxTotal = editLines.reduce((s, l) => s + l.quantity * l.unitPrice * (l.taxRate / (100 + l.taxRate)), 0);
  const editDiscountAmt = (() => {
    if (!editDiscount.enabled || !editDiscount.value) return 0;
    const v = parseFloat(editDiscount.value);
    if (isNaN(v) || v <= 0) return 0;
    if (editDiscount.type === "fixed") return Math.min(v, editLinesGross);
    return Math.min(v, 100) / 100 * editLinesGross;
  })();
  const editInvTotal  = Math.max(0, editLinesGross - editDiscountAmt);
  const editTaxTotal  = editLinesGross > 0 ? editRawTaxTotal * (editInvTotal / editLinesGross) : 0;
  const editSubtotal  = editInvTotal - editTaxTotal;

  const editLineErrors = editLines.map((l) => ({
    description: l.description.trim() === "" ? "Required" : "",
    quantity:  l.quantity < 0.0001 ? "Must be > 0" : "",
    unitPrice: l.unitPrice < 0     ? "Cannot be negative" : "",
    taxRate:   l.taxRate < 0 || l.taxRate > 100 ? "Must be 0–100" : "",
  }));
  const hasEditLineErrors = editLineErrors.some((e) => e.description || e.quantity || e.unitPrice || e.taxRate);

  /* ── Dirty detection ── */
  const CREATE_PRISTINE_FORM = { customerId: "", dueDate: "", notes: "" };
  const CREATE_PRISTINE_LINES: LineItem[] = [{ description: "", quantity: 1, unitPrice: 0, taxRate: defaultTaxRate }];
  const CREATE_PRISTINE_DISCOUNT = { enabled: false, type: "percent" as DiscountType, value: "" };
  const CREATE_PRISTINE_RECURRING = { enabled: false, frequency: "monthly" as "weekly" | "fortnightly" | "monthly" | "quarterly" | "annually", startDate: "", occurrences: 1 };

  const isCreateDirty = createOpen && (
    JSON.stringify(form) !== JSON.stringify(CREATE_PRISTINE_FORM) ||
    JSON.stringify(lines) !== JSON.stringify(CREATE_PRISTINE_LINES) ||
    JSON.stringify(discount) !== JSON.stringify(CREATE_PRISTINE_DISCOUNT) ||
    JSON.stringify(recurring) !== JSON.stringify(CREATE_PRISTINE_RECURRING) ||
    schedule.length > 0
  );

  const isEditDirty = editOpen && editInitialRef.current !== null && (
    JSON.stringify(editForm) !== JSON.stringify(editInitialRef.current.form) ||
    JSON.stringify(editLines) !== JSON.stringify(editInitialRef.current.lines) ||
    JSON.stringify(editDiscount) !== JSON.stringify(editInitialRef.current.discount) ||
    JSON.stringify(editRecurring) !== JSON.stringify(editInitialRef.current.recurring) ||
    JSON.stringify(editSchedule) !== JSON.stringify(editInitialRef.current.schedule)
  );

  /* ── Open edit dialog ── */
  const openEdit = (inv: Invoice) => {
    setEditLinkedServiceJob(inv.serviceJobId ? { id: inv.serviceJobId, jobNumber: "", label: `Service Job #${inv.serviceJobId}` } : null);
    setEditLinkedAppointment(inv.appointmentId ? { id: inv.appointmentId, title: "", label: `Appointment #${inv.appointmentId}` } : null);
    const newForm = {
      customerId: String(inv.customerId ?? ""),
      dueDate: inv.dueDate ? inv.dueDate.slice(0, 10) : "",
      notes: inv.notes ?? "",
    };
    const newRecurring = {
      enabled: inv.isRecurring ?? false,
      frequency: (inv.recurringFrequency === "yearly" ? "annually" : inv.recurringFrequency === "daily" ? "weekly" : (inv.recurringFrequency ?? "monthly")) as "weekly" | "fortnightly" | "monthly" | "quarterly" | "annually",
      startDate: inv.recurringStartDate ? inv.recurringStartDate.slice(0, 10) : "",
      occurrences: inv.recurringOccurrences ?? 1,
    };
    const items = inv.items?.length ? inv.items : [{ description: "", quantity: 1, unitPrice: 0, taxRate: defaultTaxRate }];
    const newDiscount = inv.discountType && inv.discountValue
      ? { enabled: true, type: inv.discountType as DiscountType, value: String(inv.discountValue) }
      : { enabled: false, type: "percent" as DiscountType, value: "" };
    const newSchedule: Instalment[] = (inv.paymentSchedule ?? []).map((s) => ({ ...s }));
    setEditingInvoice(inv);
    setEditForm(newForm);
    setEditRecurring(newRecurring);
    setEditSchedule(newSchedule);
    setEditLines(items);
    setEditLineSearch(items.map(() => ""));
    setEditLineDropOpen(items.map(() => false));
    setEditDiscount(newDiscount);
    editInitialRef.current = { form: newForm, lines: items, discount: newDiscount, recurring: newRecurring, schedule: newSchedule };
    setEditOpen(true);
  };

  /* ── Save edits ── */
  const handleUpdate = async () => {
    if (!editingInvoice) return;
    if (!editForm.customerId) { toast.error("Please select a customer"); return; }
    const validLines = editLines.filter((l) => l.description.trim());
    if (!validLines.length) { toast.error("Add at least one line item"); return; }
    setEditSaving(true);
    try {
      const updated = await updateInvoiceMutation.mutateAsync({
        id: editingInvoice.id,
        data: {
          customerId: editForm.customerId ? parseInt(editForm.customerId) : undefined,
          dueDate: editForm.dueDate || null,
          notes: editForm.notes || null,
          items: validLines,
          serviceJobId: editLinkedServiceJob?.id ?? null,
          appointmentId: editLinkedAppointment?.id ?? null,
          discount: editDiscount.enabled && editDiscount.value
            ? { type: editDiscount.type, value: parseFloat(editDiscount.value) }
            : undefined,
          recurring: {
            enabled: editRecurring.enabled,
            frequency: editRecurring.frequency,
            startDate: editRecurring.startDate || null,
            occurrences: editRecurring.occurrences,
          },
          paymentSchedule: editSchedule
            .filter((s) => (Number(s.amount) || 0) > 0)
            .map((s) => ({ label: s.label?.trim() || null, amount: Number(s.amount) || 0, dueDate: s.dueDate || null })),
        } as Parameters<typeof updateInvoiceMutation.mutateAsync>[0]["data"],
      }) as unknown as Invoice;
      queryClient.invalidateQueries({ queryKey: getGetInvoiceQueryKey(updated.id) });
      toast.success("Invoice updated");
      setEditOpen(false);
      invalidateInvoices();
    } catch {
      toast.error("Failed to update invoice");
    } finally {
      setEditSaving(false);
    }
  };

  /* ── Reset create dialog ── */
  const resetCreate = () => {
    setForm({ customerId: "", dueDate: "", notes: "" });
    setLines([{ description: "", quantity: 1, unitPrice: 0, taxRate: defaultTaxRate }]);
    setLineSearch([""]);
    setLineDropOpen([false]);
    setRecurring({ enabled: false, frequency: "monthly", startDate: "", occurrences: 1 });
    setSchedule([]);
    setDiscount({ enabled: false, type: "percent", value: "" });
    setCreateLinkedServiceJob(null);
    setCreateLinkedAppointment(null);
  };

  /* ── Create invoice ── */
  const handleSave = async () => {
    if (!form.customerId) { toast.error("Please select a customer"); return; }
    const validLines = lines.filter((l) => l.description.trim());
    if (!validLines.length) { toast.error("Add at least one line item"); return; }
    setSaving(true);
    try {
      const prefixSettings = getInvoicePrefix();
      // Fall back to the merchant's invoicing defaults when the cashier leaves
      // the due date / notes blank on the create form.
      const defaultedDueDate = form.dueDate
        || (invoiceSettings ? dueDateFromToday(invoiceSettings.defaultDueDays) : undefined);
      const defaultedNotes = form.notes || invoiceSettings?.defaultNotes || undefined;
      const body = {
        customerId: form.customerId ? parseInt(form.customerId) : undefined,
        staffId: dayStaff?.staffId ?? null,
        dueDate: defaultedDueDate || undefined,
        notes: defaultedNotes,
        items: validLines,
        invoicePrefix: prefixSettings.invoicePrefix,
        invoiceDigits: prefixSettings.invoiceDigits,
        serviceJobId: createLinkedServiceJob?.id ?? null,
        appointmentId: createLinkedAppointment?.id ?? null,
        discount: discount.enabled && discount.value
          ? { type: discount.type, value: parseFloat(discount.value) }
          : undefined,
        ...(recurring.enabled && {
          recurring: {
            frequency: recurring.frequency,
            startDate: recurring.startDate || null,
            occurrences: recurring.occurrences,
          },
        }),
        ...(schedule.length > 0 && {
          paymentSchedule: schedule
            .filter((s) => (Number(s.amount) || 0) > 0)
            .map((s) => ({ label: s.label?.trim() || null, amount: Number(s.amount) || 0, dueDate: s.dueDate || null })),
        }),
      };
      const created = await createInvoiceMutation.mutateAsync({ data: body as Parameters<typeof createInvoiceMutation.mutateAsync>[0]["data"] }) as unknown as Invoice;
      setCreateOpen(false);
      resetCreate();
      invalidateInvoices();
      if (recurring.enabled) {
        setSendNowInvoice(created);
      } else {
        toast.success("Invoice created");
      }
    } catch {
      toast.error("Failed to create invoice");
    } finally {
      setSaving(false);
    }
  };

  /* ── Record a client-side event (download, print) ── */
  const recordEvent = async (invoiceId: number, type: string, detail?: string) => {
    try {
      await addEventMutation.mutateAsync({
        id: invoiceId,
        data: { type, detail } as Parameters<typeof addEventMutation.mutateAsync>[0]["data"],
      });
      queryClient.invalidateQueries({ queryKey: getGetInvoiceQueryKey(invoiceId) });
      invalidateInvoices();
    } catch {
      // Silent failure for event recording
    }
  };

  /* ── Row click: open detail ── */
  const openDetail = (inv: Invoice) => {
    setDetailInvoiceId(inv.id);
    setDetailInvoiceSeed(inv);
  };

  /* ── Status update ── */
  const updateStatus = async (id: number, status: string) => {
    try {
      await updateInvoiceMutation.mutateAsync({
        id,
        data: { status } as Parameters<typeof updateInvoiceMutation.mutateAsync>[0]["data"],
      });
      queryClient.invalidateQueries({ queryKey: getGetInvoiceQueryKey(id) });
      toast.success(status === "paid" ? "Marked as paid — moved to Invoice History" : `Marked as ${status}`);
      invalidateInvoices();
      /* Status changes to or away from "paid" move the revenue KPIs — the
         previous status isn't known here, so always refresh (it's cheap). */
      invalidateSalesKpiQueries(queryClient);
    } catch {
      toast.error("Failed to update invoice status");
    }
  };

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const balanceDue = (inv: Invoice) => Math.max(0, round2(inv.total - (inv.amountPaid ?? 0)));

  /* ── Record a payment at the POS terminal ──
     Hands a charge amount (defaulting to the full remaining balance, for a
     partial payment the amount entered in the Record Payment dialog) + linked
     customer to the POS terminal, which enters "Invoice Payment Mode" and
     processes it via any payment method. */
  const payAtTerminal = (inv: Invoice, chargeAmount?: number) => {
    const balance = balanceDue(inv);
    if (balance <= 0) {
      toast.error("This invoice is already paid in full");
      return;
    }
    const amount = chargeAmount != null ? Math.min(round2(chargeAmount), balance) : balance;
    if (!(amount > 0)) { toast.error("Enter an amount greater than zero"); return; }
    setPendingInvoicePayment({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      balance,
      amount,
      customerId: inv.customerId ?? null,
      customerName: inv.customerName,
      customerEmail: inv.customerEmail ?? null,
      customerPhone: inv.customerPhone ?? null,
    });
    navigate("/pos/sell");
  };

  /* ── Record Payment dialog ── */
  const openPayDialog = (inv: Invoice) => {
    const balance = balanceDue(inv);
    if (balance <= 0) { toast.error("This invoice is already paid in full"); return; }
    setPayTarget(inv);
    setPayAmount(balance.toFixed(2));
    setPayMethod(payMethods[0]?.value ?? "cash");
    setPayNote("");
    // Direct deposits default to the day of the sale (the invoice's createdAt),
    // not today — the money is booked to when the sale happened for accounting.
    // If the sale was made today the sale date already is today. Clamp to today
    // so a future-dated createdAt can never exceed the input's max.
    const saleDate = localISODate(inv.createdAt);
    const today = todayLocalISODate();
    setPayDate(saleDate > today ? today : saleDate);
  };

  /* Record a (partial or full) payment directly via the API — used for manual
     methods (cash, bank transfer, cheque…). Card processing goes via the
     terminal instead (see "Charge at terminal" in the dialog). */
  const recordPayment = async () => {
    if (!payTarget) return;
    const balance = balanceDue(payTarget);
    const amount = round2(parseFloat(payAmount) || 0);
    if (!(amount > 0)) { toast.error("Enter an amount greater than zero"); return; }
    if (amount > balance + 0.005) { toast.error(`Amount can't exceed the ${formatCurrency(balance)} balance due`); return; }
    setPaySaving(true);
    try {
      // Map the chosen tender to a stored method, mirroring the POS checkout so
      // the payment-method breakdown reports invoice legs alongside POS sales.
      // Built-in tenders store their id; async BNPL integrations store their
      // provider key; other integrations and custom tenders record as a generic
      // "other" leg with the label captured in an audit note.
      const selected = payMethods.find((m) => m.value === payMethod);
      const isIntg = payMethod.startsWith("__intg__");
      const isCustom = payMethod.startsWith("__custom__");
      const intgKey = isIntg ? payMethod.slice("__intg__".length) : "";
      const isAsyncIntg = isIntg && ASYNC_PAYMENT_PROVIDERS.has(intgKey);
      const apiMethod = isAsyncIntg ? intgKey : (isIntg || isCustom) ? "other" : payMethod;
      const labelNote = (isCustom || (isIntg && !isAsyncIntg))
        ? `[Payment via ${selected?.label ?? "Other"}]`
        : "";
      const note = [payNote.trim(), labelNote].filter(Boolean).join(" ") || undefined;
      // Direct deposits frequently clear on an earlier day than they're recorded;
      // pass the chosen date so the sale is booked to that day for accounting.
      const paidAt = payMethod === "direct_deposit" && payDate ? payDate : undefined;
      await recordPaymentMutation.mutateAsync({
        id: payTarget.id,
        data: {
          amount,
          method: apiMethod,
          note,
          idempotencyKey: crypto.randomUUID(),
          ...(paidAt ? { paidAt } : {}),
        } as Parameters<typeof recordPaymentMutation.mutateAsync>[0]["data"],
      });
      const fully = amount >= balance - 0.005;
      toast.success(fully ? "Payment recorded — invoice paid in full" : `Payment of ${formatCurrency(amount)} recorded`);
      setPayTarget(null);
      queryClient.invalidateQueries({ queryKey: getGetInvoiceQueryKey(payTarget.id) });
      invalidateInvoices();
      invalidateSalesKpiQueries(queryClient);
    } catch {
      toast.error("Failed to record payment");
    } finally {
      setPaySaving(false);
    }
  };

  /* Reverse / correct a recorded payment leg. */
  const reversePayment = async () => {
    if (!reverseTarget) return;
    const { invoiceId, event } = reverseTarget;
    const amount = round2(Math.abs(event.amount ?? 0));
    if (!(amount > 0)) { toast.error("This payment has no amount to reverse"); return; }
    setReverseSaving(true);
    try {
      await reversePaymentMutation.mutateAsync({
        id: invoiceId,
        data: { amount, eventId: event.id ?? undefined } as Parameters<typeof reversePaymentMutation.mutateAsync>[0]["data"],
      });
      toast.success(`Payment of ${formatCurrency(amount)} reversed`);
      setReverseTarget(null);
      queryClient.invalidateQueries({ queryKey: getGetInvoiceQueryKey(invoiceId) });
      invalidateInvoices();
      invalidateSalesKpiQueries(queryClient);
    } catch {
      toast.error("Failed to reverse payment");
    } finally {
      setReverseSaving(false);
    }
  };

  /* ── Delete ── */
  const deleteInvoice = async (id: number) => {
    try {
      await deleteInvoiceMutation.mutateAsync({ id });
      if (detailInvoiceId === id) { setDetailInvoiceId(null); setDetailInvoiceSeed(null); }
      toast.success("Invoice deleted");
      invalidateInvoices();
    } catch {
      toast.error("Failed to delete invoice");
    }
  };

  /* ── Send email ── */
  const getEmailTemplatePayload = () => {
    return {
      templateId: "e-pro",
      subjectLine:        emailSubject.trim() || invoiceOpts.subjectLine,
      customGreeting:     invoiceOpts.customGreeting,
      customMessage:      invoiceOpts.customMessage,
      customSignOff:      invoiceOpts.customSignOff,
      footerText:         invoiceOpts.footerText,
      thankYouMsg:        invoiceOpts.thankYouMsg,
      showGstBreakdown:   invoiceOpts.showGstBreakdown,
      showWebsite:        invoiceOpts.showWebsite,
      showSocialLinks:    invoiceOpts.showSocialLinks,
      showLogo:           invoiceOpts.showLogo,
      brandColor:         profile.brandColors?.[0] ?? "#4f46e5",
      logo:               profile.logo ?? "",
      website:            profile.website ?? "",
      contactEmail:       profile.contactEmail ?? "",
      tagline:            profile.tagline ?? "",
      socialLinks:        profile.socialLinks ?? {},
    };
  };

  /* Open the unified Send dialog for an invoice, optionally pre-selecting a
   * delivery method. Seeds the email subject from the invoice + business name. */
  const openSend = (inv: Invoice, method: SendMethodKey | null = null) => {
    const bizName = merchant?.businessName ?? "Your Business";
    setEmailSubject(`Invoice ${inv.invoiceNumber} from ${bizName}`);
    setSendInitialMethod(method);
    setSendTarget(inv);
  };

  const sendInvoiceEmail = async (email: string) => {
    if (!sendTarget) return;
    const invId = sendTarget.id;
    try {
      await sendEmailMutation.mutateAsync({
        id: invId,
        data: { email, template: getEmailTemplatePayload() } as Parameters<typeof sendEmailMutation.mutateAsync>[0]["data"],
      });
    } catch {
      throw new Error("Failed to send email");
    }
    toast.success("Invoice emailed");
    invalidateInvoices();
    queryClient.invalidateQueries({ queryKey: getGetInvoiceQueryKey(invId) });
  };

  /* ── Print / PDF ───────────────────────────────────────────────────────
   * Print and PDF both flow through the centralized document-template system
   * so the customer-facing invoice/quote matches Management > Templates and the
   * server-rendered PDF. `invoiceToTransaction` adapts this page's Invoice shape
   * to the shared `Transaction` the print helpers expect. */
  const invoiceToTransaction = (inv: Invoice): Transaction => ({
    id: inv.id,
    merchantId: 0,
    customerId: inv.customerId,
    customer: (inv.customerName || inv.customerEmail)
      ? ({
          firstName: inv.customerName ?? "",
          lastName: "",
          email: inv.customerEmail ?? "",
          phone: inv.customerPhone ?? "",
        } as unknown as Transaction["customer"])
      : undefined,
    receiptNumber: inv.invoiceNumber,
    status: inv.status as unknown as Transaction["status"],
    // buildInvoiceHtml derives the displayed ex-GST subtotal as (subtotal -
    // taxTotal). Invoice.subtotal is already GST-exclusive, so pass a
    // GST-inclusive subtotal here to round-trip to the correct figure.
    subtotal: inv.subtotal + inv.taxTotal,
    taxTotal: inv.taxTotal,
    discountTotal: inv.discountTotal ?? 0,
    total: inv.total,
    // Invoices have no single payment method; an empty label suppresses the
    // "Paid — <method>" badge while the Status block still shows the state.
    paymentMethod: "" as unknown as Transaction["paymentMethod"],
    items: (inv.items ?? []).map((l) => ({
      productId: 0,
      productName: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      totalPrice: l.quantity * l.unitPrice,
    })),
    createdAt: inv.createdAt,
    // Extras consumed by the print path (not part of the base Transaction type):
    amountPaid: inv.amountPaid,
    invoiceNumber: inv.invoiceNumber,
    discountLabel: inv.discountTotal
      ? `Discount${inv.discountType === "percent" && inv.discountValue ? ` (${inv.discountValue}%)` : ""}`
      : undefined,
  } as Transaction);

  const printInvoice = (inv: Invoice) => printInvoiceTpl(invoiceToTransaction(inv));

  /* PDF download streams the branded, templated A4 PDF from the server (same
   * buildInvoiceHtml layout used by Print Preview and the emailed PDF). */
  const downloadInvoicePDF = async (inv: Invoice) => {
    if (pdfGeneratingId !== null) return;
    setPdfGeneratingId(inv.id);
    try {
      const blob = await getInvoicePdf(inv.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${inv.invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to generate PDF");
    } finally {
      setPdfGeneratingId(null);
    }
  };

  /* ── Derived lists & KPIs ── */
  const filtered = useMemo(() => invoices.filter((inv) =>
    !search ||
    inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
    (inv.customerName ?? "").toLowerCase().includes(search.toLowerCase())
  ), [invoices, search]);

  /* Paid invoices live in the Invoice History tab (alongside cancelled), so the
     Standard tab only shows invoices still in play. Partially paid invoices
     stay here until the balance is settled. */
  const standardFiltered  = useMemo(() => filtered.filter((inv) => !inv.isRecurring && inv.status !== "cancelled" && inv.status !== "paid").sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),  [filtered]);
  // Templates only: isRecurring=true and not a child instance generated by the scheduler
  const recurringFiltered = useMemo(() => filtered.filter((inv) => inv.isRecurring && !inv.parentInvoiceId && inv.status !== "cancelled"), [filtered]);

  const kpiOutstanding = useMemo(() => invoices.filter((i) => !i.isRecurring && (i.status === "sent" || i.status === "overdue" || i.status === "partial")).reduce((s, i) => s + (i.total - (i.amountPaid ?? 0)), 0), [invoices]);
  const kpiOverdue     = useMemo(() => invoices.filter((i) => i.status === "overdue"),                                                         [invoices]);

  /* ── Shared row actions ── */
  const InvoiceRowActions = ({ inv }: { inv: Invoice }) => (
    <div className="flex items-center justify-end gap-1">
      {inv.status === "draft" && (
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Mark as sent"
          onClick={(e) => { e.stopPropagation(); updateStatus(inv.id, "sent"); }}>
          <Send className="w-3.5 h-3.5" />
        </Button>
      )}
      {(inv.status === "sent" || inv.status === "overdue" || inv.status === "partial") && (
        <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" title="Record payment"
          onClick={(e) => { e.stopPropagation(); payAtTerminal(inv); }}>
          <Banknote className="w-4 h-4" />
        </Button>
      )}
      <Button variant="ghost" size="icon" className="h-7 w-7" title="Download PDF"
        disabled={pdfGeneratingId !== null}
        onClick={(e) => { e.stopPropagation(); void downloadInvoicePDF(inv); void recordEvent(inv.id, "download"); }}>
        {pdfGeneratingId === inv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" title="Send invoice"
        onClick={(e) => { e.stopPropagation(); openSend(inv, "email"); }}>
        <Send className="w-3.5 h-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
        onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(inv.id); }}>
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );

  /* ── Render ── */
  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Invoices</h1>
              <p className="text-sm text-muted-foreground">Create and manage customer invoices.</p>
            </div>
          </div>
          <Button onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-2" /> New Invoice</Button>
        </div>

        {/* ── KPI Summary Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Invoices</p>
                  <p className="text-2xl font-bold mt-1">{invoices.length}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{standardFiltered.length} standard · {recurringFiltered.length} recurring</p>
                </div>
                <ListChecks className="w-8 h-8 text-primary/20 shrink-0" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Overdue</p>
                  <p className={`text-2xl font-bold mt-1 ${kpiOverdue.length > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    {kpiOverdue.length} invoice{kpiOverdue.length !== 1 ? "s" : ""} overdue
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(kpiOverdue.reduce((s, i) => s + i.total, 0))} outstanding</p>
                </div>
                <AlertCircle className={`w-8 h-8 shrink-0 ${kpiOverdue.length > 0 ? "text-destructive/20" : "text-muted-foreground/10"}`} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Outstanding</p>
                  <p className="text-2xl font-bold mt-1 text-amber-600">{formatCurrency(kpiOutstanding)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{invoices.filter((i) => !i.isRecurring && (i.status === "sent" || i.status === "overdue" || i.status === "partial")).length} awaiting payment</p>
                </div>
                <Clock className="w-8 h-8 text-amber-500/20 shrink-0" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Tabbed workspace ── */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v as "standard" | "recurring" | "history");
            /* Status options differ per tab — drop any selection that can't match. */
            setStatusFilter("all");
          }}
          className="space-y-4"
        >

          {/* Tab bar + search/filter on same row */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="standard" className="gap-1.5">
                <ListChecks className="w-3.5 h-3.5" />
                Standard Invoices
                <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{standardFiltered.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="recurring" className="gap-1.5">
                <CalendarClock className="w-3.5 h-3.5" />
                Recurring Invoices
                <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{recurringFiltered.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-1.5">
                <History className="w-3.5 h-3.5" />
                Invoice History
                <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{historyInvoices.length}</Badge>
              </TabsTrigger>
            </TabsList>

            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by number or customer…" className="pl-9 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-full sm:w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {/* Paid + cancelled invoices live in the History tab, so those
                      filters only make sense there. */}
                  {(activeTab === "history"
                    ? (["paid","cancelled"] as InvStatus[])
                    : (["draft","sent","overdue"] as InvStatus[])
                  ).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Tab 1: Standard Invoices ── */}
          <TabsContent value="standard" className="mt-0">
            {loading ? (
              <div className="text-center py-16 text-muted-foreground">Loading invoices…</div>
            ) : standardFiltered.length === 0 ? (
              <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
                <FileText className="w-16 h-16 text-muted-foreground/30" />
                <div><p className="font-medium text-lg">No standard invoices</p><p className="text-muted-foreground text-sm">Create a one-off invoice to send to a customer.</p></div>
                <Button onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-2" /> New Invoice</Button>
              </CardContent></Card>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left p-3 font-medium">Invoice</th>
                      <th className="text-left p-3 font-medium hidden sm:table-cell">Customer</th>
                      <th className="text-left p-3 font-medium hidden md:table-cell">Due Date</th>
                      <th className="text-left p-3 font-medium">Status</th>
                      <th className="text-left p-3 font-medium hidden lg:table-cell">Viewed</th>
                      <th className="text-right p-3 font-medium">Total</th>
                      <th className="p-3 w-24" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {standardFiltered.map((inv) => (
                      <tr key={inv.id} className="bg-background hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => openDetail(inv)}>
                        <td className="p-3">
                          <span className="font-mono font-medium text-xs">{inv.invoiceNumber}</span>
                        </td>
                        <td className="p-3 hidden sm:table-cell">{inv.customerName ?? <span className="text-muted-foreground">—</span>}</td>
                        <td className="p-3 hidden md:table-cell text-muted-foreground text-xs">
                          {inv.dueDate ? formatDateOnly(inv.dueDate) : <span>—</span>}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant={STATUS_COLORS[inv.status]} className="capitalize text-xs">{STATUS_LABELS[inv.status]}</Badge>
                            {inv.serviceJobId && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border border-cyan-200 bg-cyan-50 text-cyan-700">
                                <Wrench className="w-2.5 h-2.5" />SVC
                              </span>
                            )}
                            {inv.appointmentId && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full border border-violet-200 bg-violet-50 text-violet-700">
                                <CalendarDays className="w-2.5 h-2.5" />Appt
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 hidden lg:table-cell">
                          {inv.status === "draft" ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : inv.viewedAt ? (
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Eye className="w-3.5 h-3.5 text-green-500" />{formatDate(inv.viewedAt)}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <EyeOff className="w-3.5 h-3.5" />Not viewed
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right font-medium">{formatCurrency(inv.total)}</td>
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          <InvoiceRowActions inv={inv} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* ── Tab 2: Recurring Invoices — schedule templates ── */}
          <TabsContent value="recurring" className="mt-0">
            {loading ? (
              <div className="text-center py-16 text-muted-foreground">Loading invoices…</div>
            ) : recurringFiltered.length === 0 ? (
              <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
                <CalendarClock className="w-16 h-16 text-muted-foreground/30" />
                <div>
                  <p className="font-medium text-lg">No recurring invoices</p>
                  <p className="text-muted-foreground text-sm">Enable the recurring option when creating an invoice to auto-send on a schedule.</p>
                </div>
                <Button onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-2" /> New Invoice</Button>
              </CardContent></Card>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left p-3 font-medium">Invoice #</th>
                      <th className="text-left p-3 font-medium hidden sm:table-cell">Customer &amp; Schedule</th>
                      <th className="text-left p-3 font-medium hidden md:table-cell">Next Send Date</th>
                      <th className="text-left p-3 font-medium hidden lg:table-cell">Remaining</th>
                      <th className="text-left p-3 font-medium w-32">Status</th>
                      <th className="text-right p-3 font-medium">Amount</th>
                      <th className="p-3 w-28" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {recurringFiltered.map((inv) => (
                      <tr
                        key={inv.id}
                        className="bg-background hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => openDetail(inv)}
                      >
                        {/* Col 1 — Invoice # */}
                        <td className="p-3">
                          <span className="font-mono font-medium text-xs">{inv.invoiceNumber}</span>
                          <div className="flex items-center gap-1 mt-0.5">
                            <RefreshCw className="w-2.5 h-2.5 text-blue-400 shrink-0" />
                            <span className="text-[11px] text-muted-foreground">Recurring template</span>
                          </div>
                        </td>

                        {/* Col 2 — Customer + schedule */}
                        <td className="p-3 hidden sm:table-cell">
                          <span className="font-medium text-sm">
                            {inv.customerName ?? <span className="text-muted-foreground italic">No customer</span>}
                          </span>
                          <div className="flex items-center gap-1 mt-0.5">
                            <CalendarClock className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                            <span className="text-[11px] text-muted-foreground">{scheduleTag(inv)}</span>
                          </div>
                        </td>

                        {/* Col 3 — Next send date */}
                        <td className="p-3 hidden md:table-cell text-muted-foreground text-xs">
                          {inv.nextSendDate
                            ? new Date(inv.nextSendDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
                            : inv.recurringStartDate
                              ? new Date(inv.recurringStartDate).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
                              : <span>—</span>}
                        </td>

                        {/* Col 4 — Occurrences remaining */}
                        <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">
                          {inv.recurringOccurrences != null ? `${inv.recurringOccurrences} left` : "Ongoing"}
                        </td>

                        {/* Col 5 — Status badge */}
                        <td className="p-3">
                          <Badge variant={STATUS_COLORS[inv.status as InvStatus] ?? "secondary"} className="capitalize text-xs">
                            {STATUS_LABELS[inv.status as InvStatus] ?? inv.status}
                          </Badge>
                        </td>

                        {/* Col 6 — Amount */}
                        <td className="p-3 text-right font-semibold tabular-nums">
                          {formatCurrency(inv.total)}
                        </td>

                        {/* Col 7 — Actions */}
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {inv.status !== "paid" && inv.status !== "cancelled" && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px] font-medium text-green-700 border-green-200 hover:bg-green-50 hover:text-green-800"
                                title="Record a payment"
                                onClick={() => payAtTerminal(inv)}
                              >
                                <Banknote className="w-3 h-3 mr-1" />
                                Pay
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              title="View invoice"
                              onClick={() => openDetail(inv)}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="border-t bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
                  {recurringFiltered.length} recurring template{recurringFiltered.length !== 1 ? "s" : ""} · each occurrence is committed as a separate invoice with a unique sequential number
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── Tab 3: Invoice History (fully paid, newest first) ── */}
          <TabsContent value="history" className="mt-0">
            {historyActuallyLoading ? (
              <div className="text-center py-16 text-muted-foreground">Loading history…</div>
            ) : historyInvoices.length === 0 ? (
              <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
                <History className="w-16 h-16 text-muted-foreground/30" />
                <div>
                  <p className="font-medium text-lg">No invoice history yet</p>
                  <p className="text-muted-foreground text-sm">Invoices move here when they are marked as paid (or cancelled).</p>
                </div>
              </CardContent></Card>
            ) : historyFiltered.length === 0 ? (
              <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">
                No invoices in history match the current search or filter.
              </CardContent></Card>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left p-3 font-medium">Invoice #</th>
                      <th className="text-left p-3 font-medium hidden sm:table-cell">Customer</th>
                      <th className="text-left p-3 font-medium hidden md:table-cell">Date</th>
                      <th className="text-left p-3 font-medium">Status</th>
                      <th className="text-left p-3 font-medium hidden lg:table-cell">Payment Method</th>
                      <th className="text-right p-3 font-medium">Total</th>
                      <th className="p-3 w-40 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {historyInvoices.map((inv) => {
                      const lastPaymentEvent = [...(inv.events ?? [])]
                        .reverse()
                        .find((e) => e.type === "payment");
                      const rawMethod = lastPaymentEvent?.method ?? "";
                      const METHOD_LABELS: Record<string, string> = {
                        cash: "Cash", eftpos: "EFTPOS", card: "Card",
                        split: "Split", gift_card: "Gift Card", loyalty: "Loyalty",
                        account: "Account", bank_transfer: "Bank Transfer",
                      };
                      const methodLabel = rawMethod
                        ? (METHOD_LABELS[rawMethod] ?? rawMethod.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
                        : "—";
                      return (
                        <tr
                          key={inv.id}
                          className="bg-background hover:bg-muted/30 transition-colors cursor-pointer"
                          onClick={() => openDetail(inv)}
                          title="View invoice details"
                        >
                          <td className="p-3">
                            <span className="font-mono font-medium text-xs">{inv.invoiceNumber}</span>
                          </td>
                          <td className="p-3 hidden sm:table-cell">
                            {inv.customerName ?? <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="p-3 hidden md:table-cell text-muted-foreground text-xs">
                            {inv.paidAt
                              ? new Date(inv.paidAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                              : new Date(inv.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                          </td>
                          <td className="p-3">
                            <Badge variant={STATUS_COLORS[inv.status]} className="capitalize text-xs">{STATUS_LABELS[inv.status]}</Badge>
                          </td>
                          <td className="p-3 hidden lg:table-cell">
                            {rawMethod ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
                                <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                                {methodLabel}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </td>
                          <td className="p-3 text-right font-semibold tabular-nums">
                            {formatCurrency(inv.total)}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px] font-medium gap-1"
                                title="Download PDF"
                                disabled={pdfGeneratingId !== null}
                                onClick={(e) => { e.stopPropagation(); void downloadInvoicePDF(inv); void recordEvent(inv.id, "download"); }}
                              >
                                {pdfGeneratingId === inv.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                                <span className="hidden sm:inline">PDF</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[11px] font-medium gap-1"
                                title="View audit log"
                                onClick={(e) => { e.stopPropagation(); openDetail(inv); }}
                              >
                                <ClipboardList className="w-3 h-3" />
                                <span className="hidden sm:inline">Audit Log</span>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="border-t bg-muted/30 px-4 py-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <History className="w-3 h-3" />
                    {historyInvoices.length} invoice{historyInvoices.length !== 1 ? "s" : ""} · paid &amp; cancelled · sorted by date, newest first
                  </span>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] gap-1" onClick={refetchAllHistory}>
                    <RefreshCw className="w-2.5 h-2.5" />
                    Refresh
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

        </Tabs>
      </div>

      {/* ─── Invoice Detail Dialog ─── */}
      <Dialog open={!!detailInvoiceId} onOpenChange={(o) => { if (!o) { setDetailInvoiceId(null); setDetailInvoiceSeed(null); } }}>
        <DialogContent className="max-w-2xl flex flex-col p-0 gap-0 max-h-[90vh]">
          {detailInvoice && (
            <>
              <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <DialogTitle className="text-lg font-bold font-mono">{detailInvoice.invoiceNumber}</DialogTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant={STATUS_COLORS[detailInvoice.status]} className="capitalize text-xs">
                        {STATUS_LABELS[detailInvoice.status]}
                      </Badge>
                      {detailInvoice.viewedAt && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Eye className="w-3 h-3 text-green-500" /> Viewed {formatDate(detailInvoice.viewedAt)}
                        </span>
                      )}
                      {detailInvoice.isRecurring && detailInvoice.nextSendDate && (
                        <span className="flex items-center gap-1 text-xs text-blue-600 font-medium">
                          <RefreshCw className="w-3 h-3" /> Next auto-send {formatDateOnly(detailInvoice.nextSendDate)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap justify-end">
                    <Button variant="outline" size="sm" className="h-8 gap-1.5"
                      onClick={() => openEdit(detailInvoice)}>
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5"
                      onClick={() => openSend(detailInvoice)}>
                      <Send className="w-3.5 h-3.5" /> Send
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5"
                      title="SMS delivery requires an SMS integration"
                      onClick={() => toast.info("SMS receipts require an SMS integration — configure it in Management → Marketing and Reports → SMS")}>
                      <MessageSquare className="w-3.5 h-3.5" /> SMS
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5"
                      disabled={pdfGeneratingId !== null}
                      onClick={() => { void downloadInvoicePDF(detailInvoice); void recordEvent(detailInvoice.id, "download"); }}>
                      {pdfGeneratingId === detailInvoice.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} PDF
                    </Button>
                  </div>
                </div>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

                {/* Meta grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Customer</p>
                    <p className="font-medium mt-0.5">{detailInvoice.customerName ?? "Walk-in"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Created</p>
                    <p className="font-medium mt-0.5">{formatDate(detailInvoice.createdAt)}</p>
                  </div>
                  {detailInvoice.dueDate && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Due Date</p>
                      <p className="font-medium mt-0.5">{formatDateOnly(detailInvoice.dueDate)}</p>
                    </div>
                  )}
                  {detailInvoice.paidAt && (
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Paid At</p>
                      <p className="font-medium mt-0.5 text-green-600">{formatDate(detailInvoice.paidAt)}</p>
                    </div>
                  )}
                </div>

                {(detailInvoice.serviceJobId || detailInvoice.appointmentId) && (
                  <div className="rounded-lg border bg-muted/20 px-4 py-3 flex flex-wrap gap-3 text-sm">
                    {detailInvoice.serviceJobId && (
                      <span className="flex items-center gap-1.5 text-cyan-700">
                        <Wrench className="w-3.5 h-3.5 shrink-0" />
                        <span className="font-medium">Linked Service Job</span>
                        <span className="text-muted-foreground">#{detailInvoice.serviceJobId}</span>
                      </span>
                    )}
                    {detailInvoice.appointmentId && (
                      <span className="flex items-center gap-1.5 text-violet-700">
                        <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                        <span className="font-medium">Linked Appointment</span>
                        <span className="text-muted-foreground">#{detailInvoice.appointmentId}</span>
                      </span>
                    )}
                  </div>
                )}

                <Separator />

                {/* Line items */}
                {detailInvoice.items && detailInvoice.items.length > 0 ? (
                  <div>
                    <p className="text-sm font-medium mb-2">Line Items</p>
                    <table className="w-full text-sm border rounded-lg overflow-hidden">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="text-left p-2.5 font-medium text-xs">Description</th>
                          <th className="text-center p-2.5 font-medium text-xs w-14">Qty</th>
                          <th className="text-right p-2.5 font-medium text-xs w-24">Unit Price</th>
                          <th className="text-right p-2.5 font-medium text-xs w-16">Tax%</th>
                          <th className="text-right p-2.5 font-medium text-xs w-24">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {detailInvoice.items.map((l, i) => (
                          <tr key={i}>
                            <td className="p-2.5">{l.description}</td>
                            <td className="p-2.5 text-center text-muted-foreground">{l.quantity}</td>
                            <td className="p-2.5 text-right text-muted-foreground">{formatCurrency(l.unitPrice)}</td>
                            <td className="p-2.5 text-right text-muted-foreground">{l.taxRate}%</td>
                            <td className="p-2.5 text-right font-medium">{formatCurrency(l.quantity * l.unitPrice)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No line items recorded.</p>
                )}

                {/* Totals */}
                <div className="flex justify-end">
                  <div className="w-52 space-y-1.5 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal</span><span>{formatCurrency(detailInvoice.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Tax</span><span>{formatCurrency(detailInvoice.taxTotal)}</span>
                    </div>
                    {detailInvoice.discountTotal ? (
                      <div className="flex justify-between text-amber-700">
                        <span className="flex items-center gap-1">
                          <Tag className="w-3 h-3" />
                          Discount{detailInvoice.discountType === "percent" && detailInvoice.discountValue
                            ? ` (${detailInvoice.discountValue}%)`
                            : ""}
                        </span>
                        <span>−{formatCurrency(detailInvoice.discountTotal)}</span>
                      </div>
                    ) : null}
                    <div className="flex justify-between font-semibold border-t pt-1.5 text-base">
                      <span>Total</span><span>{formatCurrency(detailInvoice.total)}</span>
                    </div>
                    {(detailInvoice.amountPaid ?? 0) > 0 && (
                      <>
                        <div className="flex justify-between text-green-700">
                          <span>Amount Paid</span><span>−{formatCurrency(detailInvoice.amountPaid)}</span>
                        </div>
                        <div className="flex justify-between font-semibold border-t pt-1.5 text-base text-amber-700">
                          <span>Balance Due</span><span>{formatCurrency(Math.max(0, detailInvoice.total - (detailInvoice.amountPaid ?? 0)))}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Payment schedule (instalments) — coverage derived from amountPaid */}
                {detailInvoice.paymentSchedule && detailInvoice.paymentSchedule.length > 0 && (() => {
                  const rows = instalmentCoverage(detailInvoice.paymentSchedule, detailInvoice.amountPaid ?? 0);
                  return (
                    <div className="space-y-2 text-sm">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1.5">
                        <ListChecks className="w-3.5 h-3.5" /> Payment Schedule
                      </p>
                      <div className="space-y-1.5">
                        {rows.map((inst, i) => (
                          <div key={i} className="flex items-center gap-2 rounded-md border px-3 py-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{inst.label || `Instalment ${i + 1}`}</span>
                                <Badge
                                  variant="outline"
                                  className={`h-4 px-1.5 text-[10px] ${
                                    inst.status === "paid" ? "text-green-700 border-green-300"
                                      : inst.status === "partial" ? "text-amber-700 border-amber-300"
                                      : "text-muted-foreground"
                                  }`}>
                                  {inst.status === "paid" ? "Paid" : inst.status === "partial" ? `Part-paid ${formatCurrency(inst.covered)}` : "Due"}
                                </Badge>
                              </div>
                              {inst.dueDate && (
                                <p className="text-[11px] text-muted-foreground/80">Due {formatDateOnly(inst.dueDate)}</p>
                              )}
                            </div>
                            <span className="font-medium shrink-0">{formatCurrency(inst.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {detailInvoice.notes && (
                  <div className="rounded-lg bg-muted/40 border px-4 py-3 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground mb-1 text-xs uppercase tracking-wide">Notes</p>
                    <p className="whitespace-pre-line">{detailInvoice.notes}</p>
                  </div>
                )}

                {/* Payments — recorded legs + reversals, each reversible */}
                {(() => {
                  const payEvents = (detailInvoice.events ?? []).filter((e) => e.type === "payment" || e.type === "payment-reversal");
                  if (payEvents.length === 0) return null;
                  const reversedIds = new Set(
                    (detailInvoice.events ?? [])
                      .filter((e) => e.type === "payment-reversal" && e.reverses)
                      .map((e) => e.reverses as string),
                  );
                  const canReverse = detailInvoice.status !== "cancelled";
                  return (
                    <div className="space-y-2 text-sm">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Payments</p>
                      <div className="space-y-1.5">
                        {[...payEvents].reverse().map((ev, i) => {
                          const isReversal = ev.type === "payment-reversal";
                          const amt = Math.abs(ev.amount ?? 0);
                          const alreadyReversed = !!ev.id && reversedIds.has(ev.id);
                          return (
                            <div key={ev.id ?? i} className="flex items-center gap-2 rounded-md border px-3 py-2">
                              <span className={`shrink-0 ${isReversal ? "text-destructive" : "text-green-600"}`}>
                                {isReversal ? <RefreshCw className="w-3.5 h-3.5" /> : <Banknote className="w-3.5 h-3.5" />}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`font-medium ${isReversal ? "text-destructive" : "text-foreground"}`}>
                                    {isReversal ? "−" : "+"}{formatCurrency(amt)}
                                  </span>
                                  {ev.method && <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{ev.method}</Badge>}
                                  {alreadyReversed && <Badge variant="outline" className="h-4 px-1.5 text-[10px] text-destructive border-destructive/30">Reversed</Badge>}
                                </div>
                                <p className="text-[11px] text-muted-foreground/80 truncate">{formatDate(ev.timestamp)}{ev.detail ? ` · ${ev.detail}` : ""}</p>
                              </div>
                              {!isReversal && !alreadyReversed && canReverse && (
                                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive shrink-0"
                                  onClick={() => setReverseTarget({ invoiceId: detailInvoice.id, event: ev })}>
                                  Reverse
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Activity history (non-payment events) */}
                {detailInvoice.events && detailInvoice.events.some((e) => e.type !== "payment" && e.type !== "payment-reversal") && (
                  <div className="space-y-2 text-sm">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Activity</p>
                    <div className="space-y-1.5">
                      {[...detailInvoice.events].filter((e) => e.type !== "payment" && e.type !== "payment-reversal").reverse().map((ev, i) => (
                        <div key={i} className="flex items-start gap-2 text-muted-foreground text-xs">
                          <span className="mt-0.5 shrink-0">
                            {ev.type === "email" && <Mail className="w-3.5 h-3.5" />}
                            {ev.type === "viewed" && <Eye className="w-3.5 h-3.5" />}
                            {ev.type === "download" && <Download className="w-3.5 h-3.5" />}
                            {ev.type === "print" && <Printer className="w-3.5 h-3.5" />}
                            {ev.type === "sms" && <MessageSquare className="w-3.5 h-3.5" />}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="text-foreground font-medium">
                              {ev.type === "email" ? "Emailed"
                                : ev.type === "viewed" ? "Viewed"
                                : ev.type === "download" ? "Downloaded PDF"
                                : ev.type === "print" ? "Printed"
                                : ev.type === "sms" ? "SMS sent"
                                : ev.type}
                            </span>
                            {ev.detail && <span className="ml-1">→ {ev.detail}</span>}
                            <span className="ml-2 text-muted-foreground/70">{formatDate(ev.timestamp)}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Status actions */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {detailInvoice.status === "draft" && (
                    <Button size="sm" variant="outline" className="gap-1.5"
                      onClick={() => updateStatus(detailInvoice.id, "sent")}>
                      <Send className="w-3.5 h-3.5" /> Mark as Sent
                    </Button>
                  )}
                  {(detailInvoice.status === "draft" || detailInvoice.status === "sent" || detailInvoice.status === "overdue" || detailInvoice.status === "partial") && (
                    <Button size="sm" variant="outline" className="gap-1.5 text-green-600 border-green-200 hover:bg-green-50"
                      onClick={() => openPayDialog(detailInvoice)}>
                      <Banknote className="w-4 h-4" /> Record Payment
                    </Button>
                  )}
                  {detailInvoice.status === "paid" && (
                    <Button size="sm" variant="outline" className="gap-1.5 text-orange-600 border-orange-200 hover:bg-orange-50"
                      onClick={() => updateStatus(detailInvoice.id, "sent")}>
                      <RefreshCw className="w-3.5 h-3.5" /> Mark Unpaid
                    </Button>
                  )}
                  {detailInvoice.status !== "cancelled" && detailInvoice.status !== "paid" && (
                    <Button size="sm" variant="outline" className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5"
                      onClick={() => updateStatus(detailInvoice.id, "cancelled")}>
                      <X className="w-3.5 h-3.5" /> Cancel Invoice
                    </Button>
                  )}
                </div>
              </div>

              <div className="px-6 py-3 border-t shrink-0 flex justify-between items-center bg-background">
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive gap-1.5"
                  onClick={() => setDeleteConfirmId(detailInvoice.id)}>
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setDetailInvoiceId(null); setDetailInvoiceSeed(null); }}>Close</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Record Payment dialog (partial or full) ─── */}
      <Dialog open={!!payTarget} onOpenChange={(o) => { if (!o && !paySaving) setPayTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="w-4 h-4 text-green-600" /> Record Payment
            </DialogTitle>
          </DialogHeader>
          {payTarget && (() => {
            const balance = balanceDue(payTarget);
            const entered = round2(parseFloat(payAmount) || 0);
            const overpay = entered > balance + 0.005;
            const settles = entered > 0 && !overpay && entered >= balance - 0.005;
            return (
              <div className="space-y-4">
                <div className="rounded-lg bg-muted/40 border px-3 py-2.5 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Invoice</span><span className="font-medium">{payTarget.invoiceNumber}</span></div>
                  {(payTarget.amountPaid ?? 0) > 0 && (
                    <div className="flex justify-between text-green-700"><span>Already paid</span><span>{formatCurrency(payTarget.amountPaid)}</span></div>
                  )}
                  <div className="flex justify-between font-semibold text-amber-700"><span>Balance due</span><span>{formatCurrency(balance)}</span></div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Amount</Label>
                  <Input
                    type="number" inputMode="decimal" min="0" step="0.01"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className={overpay ? "border-destructive" : ""}
                  />
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs"
                      onClick={() => setPayAmount(round2(balance * 0.25).toFixed(2))}>25%</Button>
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs"
                      onClick={() => setPayAmount(round2(balance * 0.5).toFixed(2))}>50%</Button>
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs"
                      onClick={() => setPayAmount(balance.toFixed(2))}>Balance</Button>
                  </div>
                  {overpay && <p className="text-xs text-destructive">Amount exceeds the balance due.</p>}
                  {!overpay && entered > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {settles ? "Settles the invoice in full." : `Leaves ${formatCurrency(round2(balance - entered))} outstanding.`}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Method</Label>
                  <Select value={payMethod} onValueChange={setPayMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {payMethods.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {payMethod === "direct_deposit" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Date paid</Label>
                    <Input
                      type="date"
                      value={payDate}
                      max={todayLocalISODate()}
                      onChange={(e) => setPayDate(e.target.value)}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Books this sale to the day the deposit landed — for accurate daily
                      sales &amp; reporting.
                    </p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs">Note <span className="text-muted-foreground">(optional)</span></Label>
                  <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="e.g. deposit, cheque #123" />
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  <Button className="w-full gap-1.5" disabled={paySaving || overpay || !(entered > 0)} onClick={recordPayment}>
                    {paySaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Record {entered > 0 && !overpay ? formatCurrency(entered) : "payment"}
                  </Button>
                  <Button variant="outline" className="w-full gap-1.5" disabled={paySaving || overpay || !(entered > 0)}
                    onClick={() => { const inv = payTarget; const amt = entered; setPayTarget(null); if (inv) payAtTerminal(inv, amt); }}>
                    <ExternalLink className="w-4 h-4" /> Charge at terminal instead
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground text-center">
                  Use the terminal for card payments so surcharges and receipts apply.
                </p>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ─── Reverse payment confirmation ─── */}
      <AlertDialog open={!!reverseTarget} onOpenChange={(o) => { if (!o && !reverseSaving) setReverseTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverse this payment?</AlertDialogTitle>
            <AlertDialogDescription>
              {reverseTarget && (
                <>This removes <strong>{formatCurrency(Math.abs(reverseTarget.event.amount ?? 0))}</strong> from the amount paid and
                {" "}re-opens the balance. If the invoice was fully paid, stock, customer spend and loyalty are restored. This is logged in the activity trail.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reverseSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={reverseSaving}
              onClick={(e) => { e.preventDefault(); void reversePayment(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {reverseSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Reverse payment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Send dialog (email / print / print-as-quote) ─── */}
      <SendDialog
        open={!!sendTarget}
        onOpenChange={(o) => { if (!o) setSendTarget(null); }}
        title="Send Invoice"
        documentLabel={sendTarget?.invoiceNumber}
        initialMethod={sendInitialMethod}
        reprintLabel="Print"
        reprintSub="Print to printer"
        reprintButtonLabel="Print Invoice"
        reprintHint={sendTarget ? <>This will open a print preview for invoice <strong>{sendTarget.invoiceNumber}</strong>.</> : null}
        onReprint={() => { if (sendTarget) { void printInvoice(sendTarget); void recordEvent(sendTarget.id, "print"); } }}
        defaultEmail={sendTarget?.customerEmail ?? ""}
        emailHint="A PDF copy of the invoice will be attached."
        emailExtra={
          <div className="space-y-1.5">
            <Label className="text-xs">Subject</Label>
            <Input
              type="text"
              placeholder="Invoice subject…"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
            />
          </div>
        }
        onEmail={sendInvoiceEmail}
      />

      {/* ─── Delete Confirm ─── */}
      <AlertDialog open={deleteConfirmId !== null} onOpenChange={(o) => { if (!o) setDeleteConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the invoice and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteConfirmId !== null) { void deleteInvoice(deleteConfirmId); setDeleteConfirmId(null); } }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Create Invoice Dialog ─── */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) { if (isCreateDirty) { setDiscardConfirmTarget("create"); return; } resetCreate(); setCreateOpen(false); } else { setCreateOpen(true); } }}>
        <DialogContent className="max-w-2xl flex flex-col p-0 gap-0 max-h-[90vh]">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle>New Invoice</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

            {/* Customer + Due Date */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Customer <span className="text-destructive">*</span></Label>
                <CustomerSearchInput
                  value={form.customerId}
                  onChange={(id) => setForm({ ...form, customerId: id })}
                  placeholder="Search customer..."
                  invalid={!form.customerId}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Line Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Line
                </Button>
              </div>
              <div className="grid grid-cols-[20px_1fr_56px_88px_60px_72px_32px_32px] gap-1.5 px-1 text-xs font-medium text-muted-foreground">
                <span />
                <span>Description</span>
                <span className="text-center">Qty</span>
                <span className="text-right">Price</span>
                <span className="text-right">Tax%</span>
                <span className="text-right">Total</span>
                <span />
                <span />
              </div>
              <div className="space-y-1.5">
                {lines.map((line, i) => (
                  <div key={i} className="space-y-1">
                  <div
                    className={`grid grid-cols-[20px_1fr_56px_88px_60px_72px_32px_32px] gap-1.5 items-start rounded transition-opacity ${createDragFrom === i ? "opacity-40" : ""} ${createDragFrom !== null && createDragOver === i && createDragFrom !== i ? "outline outline-2 outline-primary outline-offset-1" : ""}`}
                    onDragOver={(e) => { e.preventDefault(); setCreateDragOver(i); }}
                    onDrop={(e) => { e.preventDefault(); if (createDragFrom !== null) reorderLines(createDragFrom, i); setCreateDragFrom(null); setCreateDragOver(null); }}
                  >
                    <div
                      draggable
                      onDragStart={() => setCreateDragFrom(i)}
                      onDragEnd={() => { setCreateDragFrom(null); setCreateDragOver(null); }}
                      className="flex items-center justify-center h-8 w-5 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
                    >
                      <GripVertical className="w-3.5 h-3.5" />
                    </div>
                    <div className="relative" ref={(el) => { lineDropRefs.current[i] = el; }}>
                      <div className="relative">
                        <Package className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                        <Input
                          value={(lineSearch[i] ?? "") !== "" ? lineSearch[i] : line.description}
                          placeholder="Search or type description..."
                          className={`h-8 text-sm pl-6${lineErrors[i]?.description ? " border-destructive focus-visible:ring-destructive" : ""}`}
                          onFocus={() => setLineDropOpen((p) => { const n = [...p]; n[i] = true; return n; })}
                          onChange={(e) => {
                            const v = e.target.value;
                            setLineSearch((p) => { const n = [...p]; n[i] = v; return n; });
                            updateLine(i, "description", v);
                            setLineDropOpen((p) => { const n = [...p]; n[i] = true; return n; });
                          }}
                        />
                      </div>
                      {lineDropOpen[i] && (
                        <div className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-popover border rounded-lg shadow-lg max-h-[min(220px,50dvh)] overflow-y-auto">
                          {filteredProducts(lineSearch[i] ?? "").map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onMouseDown={(e) => { e.preventDefault(); selectProduct(i, p); }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between gap-2"
                            >
                              <span className="truncate">{p.name}</span>
                              <span className="text-xs text-muted-foreground shrink-0">{formatCurrency(p.price ?? 0)}</span>
                            </button>
                          ))}
                          {(lineSearch[i] ?? "").trim() ? (
                            <button
                              type="button"
                              onMouseDown={(e) => { e.preventDefault(); addCustomLine(i, lineSearch[i] ?? ""); }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 border-t flex items-center gap-2 text-primary"
                            >
                              <Plus className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">Add “{lineSearch[i]}” as custom item</span>
                            </button>
                          ) : filteredProducts(lineSearch[i] ?? "").length === 0 && (
                            <p className="px-3 py-3 text-xs text-muted-foreground text-center">No products found</p>
                          )}
                        </div>
                      )}
                      {lineErrors[i]?.description && <p className="text-[10px] text-destructive mt-0.5 leading-tight">{lineErrors[i].description}</p>}
                    </div>
                    <div>
                      <Input type="number" value={line.quantity}
                        onChange={(e) => updateLine(i, "quantity", parseFloat(e.target.value) || 0)}
                        className={`h-8 text-sm text-center${lineErrors[i]?.quantity ? " border-destructive focus-visible:ring-destructive" : ""}`} />
                      {lineErrors[i]?.quantity && <p className="text-[10px] text-destructive mt-0.5 leading-tight">{lineErrors[i].quantity}</p>}
                    </div>
                    <div>
                      <Input type="number" step="0.01" value={line.unitPrice || ""}
                        onChange={(e) => updateLine(i, "unitPrice", parseFloat(e.target.value) || 0)}
                        placeholder="0.00" className={`h-8 text-sm text-right${lineErrors[i]?.unitPrice ? " border-destructive focus-visible:ring-destructive" : ""}`} />
                      {lineErrors[i]?.unitPrice && <p className="text-[10px] text-destructive mt-0.5 leading-tight">{lineErrors[i].unitPrice}</p>}
                    </div>
                    <div>
                      <Input type="number" min={0} max={100} value={line.taxRate}
                        onChange={(e) => updateLine(i, "taxRate", parseFloat(e.target.value) || 0)}
                        className={`h-8 text-sm text-right${lineErrors[i]?.taxRate ? " border-destructive focus-visible:ring-destructive" : ""}`} />
                      {lineErrors[i]?.taxRate && <p className="text-[10px] text-destructive mt-0.5 leading-tight">{lineErrors[i].taxRate}</p>}
                    </div>
                    <div className="flex items-center justify-end h-8">
                      <span className="text-sm font-medium tabular-nums">{formatCurrency(line.quantity * line.unitPrice)}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                      onClick={() => duplicateLine(i)} title="Duplicate line">
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                      onClick={() => removeLine(i)} disabled={lines.length === 1}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {line.description.trim() !== "" && line.productId == null && (
                    <div className="flex items-center gap-2 pl-[26px]">
                      <Badge variant="outline" className="text-[10px] shrink-0 gap-1"><Package className="w-2.5 h-2.5" /> Custom item</Badge>
                      <span className="text-[11px] text-muted-foreground shrink-0">Cost price (ex GST)</span>
                      <div className="relative w-28">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs pointer-events-none">$</span>
                        <Input
                          type="number" step="0.01" min={0}
                          value={line.costPrice ?? ""}
                          placeholder="0.00"
                          onChange={(e) => updateLine(i, "costPrice", e.target.value === "" ? null : (parseFloat(e.target.value) || 0))}
                          className="h-7 text-xs pl-5"
                        />
                      </div>
                    </div>
                  )}
                  </div>
                ))}
              </div>
            </div>

            {/* Discount */}
            <div className="rounded-xl border p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Discount</span>
                </div>
                <Switch checked={discount.enabled} onCheckedChange={(v) => setDiscount((d) => ({ ...d, enabled: v }))} />
              </div>
              {discount.enabled && (
                <div className="flex items-center gap-2 pt-1 border-t">
                  <div className="flex rounded-md border overflow-hidden text-sm shrink-0">
                    <button
                      type="button"
                      onClick={() => setDiscount((d) => ({ ...d, type: "fixed" }))}
                      className={`px-2.5 py-1.5 flex items-center justify-center transition-colors ${discount.type === "fixed" ? "bg-primary text-primary-foreground" : "pill-selector hover:bg-muted"}`}
                    >
                      $
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscount((d) => ({ ...d, type: "percent" }))}
                      className={`px-2.5 py-1.5 flex items-center justify-center transition-colors ${discount.type === "percent" ? "bg-primary text-primary-foreground" : "pill-selector hover:bg-muted"}`}
                    >
                      %
                    </button>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={discount.type === "percent" ? 100 : undefined}
                    step="0.01"
                    placeholder={discount.type === "percent" ? "e.g. 10" : "e.g. 5.00"}
                    value={discount.value}
                    onChange={(e) => setDiscount((d) => ({ ...d, value: e.target.value }))}
                    className="h-8 text-sm"
                  />
                  {discountAmt > 0 && (
                    <span className="text-xs text-amber-700 font-medium shrink-0">−{formatCurrency(discountAmt)}</span>
                  )}
                </div>
              )}
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-52 space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal (ex-GST)</span><span>{formatCurrency(subtotal)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>GST included</span><span>{formatCurrency(taxTotal)}</span></div>
                {discountAmt > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <span className="flex items-center gap-1"><Tag className="w-3 h-3" />Discount</span>
                    <span>−{formatCurrency(discountAmt)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t pt-1"><span>Total (inc-GST)</span><span>{formatCurrency(invTotal)}</span></div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2} placeholder="Payment terms, notes for customer..." />
            </div>

            {/* Link to service / appointment */}
            <div className="flex flex-col gap-1.5 min-w-0">
              <Label>Linked To</Label>
              {(createLinkedServiceJob || createLinkedAppointment) ? (
                <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30 text-sm min-w-0">
                  {createLinkedServiceJob && <><Wrench className="w-3.5 h-3.5 text-cyan-600 shrink-0" /><span className="flex-1 truncate text-cyan-700 font-medium">Service Job #{createLinkedServiceJob.jobNumber || createLinkedServiceJob.id}</span></>}
                  {createLinkedAppointment && <><CalendarDays className="w-3.5 h-3.5 text-violet-600 shrink-0" /><span className="flex-1 truncate text-violet-700 font-medium">{createLinkedAppointment.title || `Appointment #${createLinkedAppointment.id}`}</span></>}
                  <button onClick={() => { setCreateLinkedServiceJob(null); setCreateLinkedAppointment(null); }} className="text-muted-foreground hover:text-destructive transition-colors shrink-0"><X className="w-3.5 h-3.5" /></button>
                </div>
              ) : (
                <Button type="button" variant="outline" size="sm" className="gap-1.5 h-8 px-2.5 text-xs w-fit max-w-full" onClick={() => setLinkDialogFor("create")}>
                  <Link2 className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">Link to Service or Appointment</span>
                </Button>
              )}
            </div>

            {/* Recurring */}
            <div className="rounded-xl border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Recurring Invoice</p>
                    <p className="text-xs text-muted-foreground">Automatically repeat this invoice on a schedule</p>
                  </div>
                </div>
                <Switch checked={recurring.enabled} onCheckedChange={(v) => setRecurring((r) => ({ ...r, enabled: v }))} />
              </div>
              {recurring.enabled && (
                <div className="grid grid-cols-3 gap-3 pt-1 border-t">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Frequency</Label>
                    <Select value={recurring.frequency} onValueChange={(v) => setRecurring((r) => ({ ...r, frequency: v as typeof r.frequency }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.entries(FREQ_LABELS) as [string, string][]).map(([val, label]) => (
                          <SelectItem key={val} value={val}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Start Date</Label>
                    <Input type="date" className="h-8 text-xs" value={recurring.startDate}
                      onChange={(e) => setRecurring((r) => ({ ...r, startDate: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Occurrences</Label>
                    <Input type="number" min={1} max={999} className="h-8 text-xs" value={recurring.occurrences}
                      onChange={(e) => setRecurring((r) => ({ ...r, occurrences: parseInt(e.target.value) || 1 }))} />
                  </div>
                </div>
              )}
            </div>

            {/* Payment schedule (instalments) */}
            <ScheduleEditor schedule={schedule} setSchedule={setSchedule} total={invTotal} />

            {/* Invoice number preview */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              Invoice number will follow your Document Code Prefix settings
              (currently: <span className="font-mono font-medium text-foreground">
                {(() => { const p = getInvoicePrefix(); return `${p.invoicePrefix}${"0".repeat(p.invoiceDigits - 1)}1`; })()}
              </span>)
            </div>

          </div>

          <div className="px-6 py-4 border-t shrink-0 flex justify-end gap-2 bg-background">
            <Button variant="outline" onClick={() => { if (isCreateDirty) { setDiscardConfirmTarget("create"); return; } setCreateOpen(false); resetCreate(); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || hasLineErrors}>
              {saving ? "Creating…" : recurring.enabled ? "Create Recurring Invoice" : "Create Invoice"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Invoice Dialog ─── */}
      <Dialog open={editOpen} onOpenChange={(o) => { if (!o) { if (isEditDirty) { setDiscardConfirmTarget("edit"); return; } setEditOpen(false); } }}>
        <DialogContent className="max-w-2xl flex flex-col p-0 gap-0 max-h-[90vh]">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle>Edit Invoice {editingInvoice?.invoiceNumber}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

            {/* Customer + Due Date */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Customer <span className="text-destructive">*</span></Label>
                <CustomerSearchInput
                  value={editForm.customerId}
                  onChange={(id) => setEditForm({ ...editForm, customerId: id })}
                  placeholder="Search customer..."
                  invalid={!editForm.customerId}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input type="date" value={editForm.dueDate} onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })} />
              </div>
            </div>

            {/* Line Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Line Items</Label>
                <Button type="button" variant="outline" size="sm" onClick={addEditLine}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Line
                </Button>
              </div>
              <div className="grid grid-cols-[20px_1fr_56px_88px_60px_72px_32px_32px] gap-1.5 px-1 text-xs font-medium text-muted-foreground">
                <span />
                <span>Description</span>
                <span className="text-center">Qty</span>
                <span className="text-right">Price</span>
                <span className="text-right">Tax%</span>
                <span className="text-right">Total</span>
                <span />
                <span />
              </div>
              <div className="space-y-1.5">
                {editLines.map((line, i) => (
                  <div key={i} className="space-y-1">
                  <div
                    className={`grid grid-cols-[20px_1fr_56px_88px_60px_72px_32px_32px] gap-1.5 items-start rounded transition-opacity ${editDragFrom === i ? "opacity-40" : ""} ${editDragFrom !== null && editDragOver === i && editDragFrom !== i ? "outline outline-2 outline-primary outline-offset-1" : ""}`}
                    onDragOver={(e) => { e.preventDefault(); setEditDragOver(i); }}
                    onDrop={(e) => { e.preventDefault(); if (editDragFrom !== null) reorderEditLines(editDragFrom, i); setEditDragFrom(null); setEditDragOver(null); }}
                  >
                    <div
                      draggable
                      onDragStart={() => setEditDragFrom(i)}
                      onDragEnd={() => { setEditDragFrom(null); setEditDragOver(null); }}
                      className="flex items-center justify-center h-8 w-5 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
                    >
                      <GripVertical className="w-3.5 h-3.5" />
                    </div>
                    <div className="relative" ref={(el) => { editLineDropRefs.current[i] = el; }}>
                      <div className="relative">
                        <Package className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                        <Input
                          value={editLineSearch[i] !== undefined && editLineSearch[i] !== "" ? editLineSearch[i] : line.description}
                          placeholder="Search or type description..."
                          className={`h-8 text-sm pl-6${editLineErrors[i]?.description ? " border-destructive focus-visible:ring-destructive" : ""}`}
                          onFocus={() => setEditLineDropOpen((p) => { const n = [...p]; n[i] = true; return n; })}
                          onChange={(e) => {
                            const v = e.target.value;
                            setEditLineSearch((p) => { const n = [...p]; n[i] = v; return n; });
                            updateEditLine(i, "description", v);
                            setEditLineDropOpen((p) => { const n = [...p]; n[i] = true; return n; });
                          }}
                          onBlur={() => {
                            if (!editLineSearch[i]) return;
                            setEditLineSearch((p) => { const n = [...p]; n[i] = ""; return n; });
                          }}
                        />
                      </div>
                      {editLineDropOpen[i] && (
                        <div className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-popover border rounded-lg shadow-lg max-h-[min(220px,50dvh)] overflow-y-auto">
                          {filteredProducts(editLineSearch[i] ?? "").map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onMouseDown={(e) => { e.preventDefault(); selectEditProduct(i, p); }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between gap-2"
                            >
                              <span className="truncate">{p.name}</span>
                              <span className="text-xs text-muted-foreground shrink-0">{formatCurrency(p.price ?? 0)}</span>
                            </button>
                          ))}
                          {(editLineSearch[i] ?? "").trim() ? (
                            <button
                              type="button"
                              onMouseDown={(e) => { e.preventDefault(); addCustomEditLine(i, editLineSearch[i] ?? ""); }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/50 border-t flex items-center gap-2 text-primary"
                            >
                              <Plus className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">Add “{editLineSearch[i]}” as custom item</span>
                            </button>
                          ) : filteredProducts(editLineSearch[i] ?? "").length === 0 && (
                            <p className="px-3 py-3 text-xs text-muted-foreground text-center">No products found</p>
                          )}
                        </div>
                      )}
                      {editLineErrors[i]?.description && <p className="text-[10px] text-destructive mt-0.5 leading-tight">{editLineErrors[i].description}</p>}
                    </div>
                    <div>
                      <Input type="number" value={line.quantity}
                        onChange={(e) => updateEditLine(i, "quantity", parseFloat(e.target.value) || 0)}
                        className={`h-8 text-sm text-center${editLineErrors[i]?.quantity ? " border-destructive focus-visible:ring-destructive" : ""}`} />
                      {editLineErrors[i]?.quantity && <p className="text-[10px] text-destructive mt-0.5 leading-tight">{editLineErrors[i].quantity}</p>}
                    </div>
                    <div>
                      <Input type="number" step="0.01" value={line.unitPrice || ""}
                        onChange={(e) => updateEditLine(i, "unitPrice", parseFloat(e.target.value) || 0)}
                        placeholder="0.00" className={`h-8 text-sm text-right${editLineErrors[i]?.unitPrice ? " border-destructive focus-visible:ring-destructive" : ""}`} />
                      {editLineErrors[i]?.unitPrice && <p className="text-[10px] text-destructive mt-0.5 leading-tight">{editLineErrors[i].unitPrice}</p>}
                    </div>
                    <div>
                      <Input type="number" min={0} max={100} value={line.taxRate}
                        onChange={(e) => updateEditLine(i, "taxRate", parseFloat(e.target.value) || 0)}
                        className={`h-8 text-sm text-right${editLineErrors[i]?.taxRate ? " border-destructive focus-visible:ring-destructive" : ""}`} />
                      {editLineErrors[i]?.taxRate && <p className="text-[10px] text-destructive mt-0.5 leading-tight">{editLineErrors[i].taxRate}</p>}
                    </div>
                    <div className="flex items-center justify-end h-8">
                      <span className="text-sm font-medium tabular-nums">{formatCurrency(line.quantity * line.unitPrice)}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                      onClick={() => duplicateEditLine(i)} title="Duplicate line">
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                      onClick={() => removeEditLine(i)} disabled={editLines.length === 1}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {line.description.trim() !== "" && line.productId == null && (
                    <div className="flex items-center gap-2 pl-[26px]">
                      <Badge variant="outline" className="text-[10px] shrink-0 gap-1"><Package className="w-2.5 h-2.5" /> Custom item</Badge>
                      <span className="text-[11px] text-muted-foreground shrink-0">Cost price (ex GST)</span>
                      <div className="relative w-28">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs pointer-events-none">$</span>
                        <Input
                          type="number" step="0.01" min={0}
                          value={line.costPrice ?? ""}
                          placeholder="0.00"
                          onChange={(e) => updateEditLine(i, "costPrice", e.target.value === "" ? null : (parseFloat(e.target.value) || 0))}
                          className="h-7 text-xs pl-5"
                        />
                      </div>
                    </div>
                  )}
                  </div>
                ))}
              </div>
            </div>

            {/* Discount */}
            <div className="rounded-xl border p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Discount</span>
                </div>
                <Switch checked={editDiscount.enabled} onCheckedChange={(v) => setEditDiscount((d) => ({ ...d, enabled: v }))} />
              </div>
              {editDiscount.enabled && (
                <div className="flex items-center gap-2 pt-1 border-t">
                  <div className="flex rounded-md border overflow-hidden text-sm shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditDiscount((d) => ({ ...d, type: "fixed" }))}
                      className={`px-2.5 py-1.5 flex items-center justify-center transition-colors ${editDiscount.type === "fixed" ? "bg-primary text-primary-foreground" : "pill-selector hover:bg-muted"}`}
                    >
                      $
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditDiscount((d) => ({ ...d, type: "percent" }))}
                      className={`px-2.5 py-1.5 flex items-center justify-center transition-colors ${editDiscount.type === "percent" ? "bg-primary text-primary-foreground" : "pill-selector hover:bg-muted"}`}
                    >
                      %
                    </button>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={editDiscount.type === "percent" ? 100 : undefined}
                    step="0.01"
                    placeholder={editDiscount.type === "percent" ? "e.g. 10" : "e.g. 5.00"}
                    value={editDiscount.value}
                    onChange={(e) => setEditDiscount((d) => ({ ...d, value: e.target.value }))}
                    className="h-8 text-sm"
                  />
                  {editDiscountAmt > 0 && (
                    <span className="text-xs text-amber-700 font-medium shrink-0">−{formatCurrency(editDiscountAmt)}</span>
                  )}
                </div>
              )}
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-52 space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal (ex-GST)</span><span>{formatCurrency(editSubtotal)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>GST included</span><span>{formatCurrency(editTaxTotal)}</span></div>
                {editDiscountAmt > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <span className="flex items-center gap-1"><Tag className="w-3 h-3" />Discount</span>
                    <span>−{formatCurrency(editDiscountAmt)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t pt-1"><span>Total (inc-GST)</span><span>{formatCurrency(editInvTotal)}</span></div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                rows={2} placeholder="Payment terms, notes for customer..." />
            </div>

            {/* Link to service / appointment */}
            <div className="flex flex-col gap-1.5 min-w-0">
              <Label>Linked To</Label>
              {(editLinkedServiceJob || editLinkedAppointment) ? (
                <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30 text-sm min-w-0">
                  {editLinkedServiceJob && <><Wrench className="w-3.5 h-3.5 text-cyan-600 shrink-0" /><span className="flex-1 truncate text-cyan-700 font-medium">Service Job #{editLinkedServiceJob.jobNumber || editLinkedServiceJob.id}</span></>}
                  {editLinkedAppointment && <><CalendarDays className="w-3.5 h-3.5 text-violet-600 shrink-0" /><span className="flex-1 truncate text-violet-700 font-medium">{editLinkedAppointment.title || `Appointment #${editLinkedAppointment.id}`}</span></>}
                  <button onClick={() => { setEditLinkedServiceJob(null); setEditLinkedAppointment(null); }} className="text-muted-foreground hover:text-destructive transition-colors shrink-0"><X className="w-3.5 h-3.5" /></button>
                </div>
              ) : (
                <Button type="button" variant="outline" size="sm" className="gap-1.5 h-8 px-2.5 text-xs w-fit max-w-full" onClick={() => setLinkDialogFor("edit")}>
                  <Link2 className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">Link to Service or Appointment</span>
                </Button>
              )}
            </div>

            {/* Recurring */}
            <div className="rounded-xl border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Recurring Invoice</p>
                    <p className="text-xs text-muted-foreground">Automatically repeat this invoice on a schedule</p>
                  </div>
                </div>
                <Switch checked={editRecurring.enabled} onCheckedChange={(v) => setEditRecurring((r) => ({ ...r, enabled: v }))} />
              </div>
              {editRecurring.enabled && (
                <div className="grid grid-cols-3 gap-3 pt-1 border-t">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Frequency</Label>
                    <Select value={editRecurring.frequency} onValueChange={(v) => setEditRecurring((r) => ({ ...r, frequency: v as typeof r.frequency }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.entries(FREQ_LABELS) as [string, string][]).map(([val, label]) => (
                          <SelectItem key={val} value={val}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Start Date</Label>
                    <Input type="date" className="h-8 text-xs" value={editRecurring.startDate}
                      onChange={(e) => setEditRecurring((r) => ({ ...r, startDate: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Occurrences</Label>
                    <Input type="number" min={1} max={999} className="h-8 text-xs" value={editRecurring.occurrences}
                      onChange={(e) => setEditRecurring((r) => ({ ...r, occurrences: parseInt(e.target.value) || 1 }))} />
                  </div>
                </div>
              )}
            </div>

            {/* Payment schedule (instalments) */}
            <ScheduleEditor schedule={editSchedule} setSchedule={setEditSchedule} total={editInvTotal} />

          </div>

          <div className="px-6 py-4 border-t shrink-0 flex justify-end gap-2 bg-background">
            <Button variant="outline" onClick={() => { if (isEditDirty) { setDiscardConfirmTarget("edit"); return; } setEditOpen(false); }}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={editSaving || hasEditLineErrors}>
              {editSaving ? "Saving…" : editRecurring.enabled ? "Save Recurring Invoice" : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Send First Recurring Invoice Prompt ─── */}
      <AlertDialog open={!!sendNowInvoice} onOpenChange={(o) => { if (!o) { toast.success("Recurring invoice created"); setSendNowInvoice(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-blue-500" />
              Recurring invoice created
            </AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-mono font-medium">{sendNowInvoice?.invoiceNumber}</span> has been set up on a{" "}
              <span className="font-medium">{FREQ_LABELS[(sendNowInvoice?.recurringFrequency ?? "monthly") as keyof typeof FREQ_LABELS]?.toLowerCase()}</span> schedule.
              Would you like to send the first invoice to the customer now?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { toast.success("Recurring invoice created"); setSendNowInvoice(null); }}>
              Not Now
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const inv = sendNowInvoice!;
                setSendNowInvoice(null);
                toast.success("Recurring invoice created");
                openSend(inv, "email");
              }}
            >
              <Mail className="w-3.5 h-3.5 mr-1.5" /> Send Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Link to Service / Appointment ─── */}
      <Dialog open={!!linkDialogFor} onOpenChange={(o) => { if (!o) { setLinkDialogFor(null); setLinkSearch(""); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-4 h-4" /> Link to Service or Appointment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input
                autoFocus
                value={linkSearch}
                onChange={(e) => setLinkSearch(e.target.value)}
                placeholder="Search all jobs & appointments (open or closed)…"
                className="pl-9"
              />
            </div>
            <p className="text-xs text-muted-foreground -mb-1">Unfinished jobs and appointments are listed first; completed ones appear below.</p>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Service Jobs</p>
              <ScrollArea className="max-h-56 border rounded-lg">
                {sjUnfinished.length + sjDone.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">{linkQ ? "No matching service jobs." : "No service jobs found."}</div>
                ) : (
                  <div>
                    {sjUnfinished.length > 0 && (
                      <>
                        {linkGroupHeader("Unfinished")}
                        <div className="divide-y">{sjUnfinished.slice(0, 30).map(renderLinkServiceJobRow)}</div>
                      </>
                    )}
                    {sjDone.length > 0 && (
                      <>
                        {linkGroupHeader("Completed")}
                        <div className="divide-y">{sjDone.slice(0, 30).map(renderLinkServiceJobRow)}</div>
                      </>
                    )}
                  </div>
                )}
              </ScrollArea>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Appointments</p>
              <ScrollArea className="max-h-56 border rounded-lg">
                {aptUnfinished.length + aptDone.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">{linkQ ? "No matching appointments." : "No appointments found."}</div>
                ) : (
                  <div>
                    {aptUnfinished.length > 0 && (
                      <>
                        {linkGroupHeader("Unfinished")}
                        <div className="divide-y">{aptUnfinished.slice(0, 30).map(renderLinkAppointmentRow)}</div>
                      </>
                    )}
                    {aptDone.length > 0 && (
                      <>
                        {linkGroupHeader("Completed")}
                        <div className="divide-y">{aptDone.slice(0, 30).map(renderLinkAppointmentRow)}</div>
                      </>
                    )}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Discard Changes Confirmation ─── */}
      <AlertDialog open={discardConfirmTarget !== null} onOpenChange={(o) => { if (!o) setDiscardConfirmTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Closing now will lose them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (discardConfirmTarget === "create") { setCreateOpen(false); resetCreate(); }
              if (discardConfirmTarget === "edit") { setEditOpen(false); }
              setDiscardConfirmTarget(null);
            }}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sell-price prompt for products with no ($0) sell price on file */}
      <Dialog open={!!pricePrompt} onOpenChange={(o) => { if (!o) setPricePrompt(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set sell price</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{pricePrompt?.name}</span> has no sell price set.
              Enter a price for this invoice line.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="prompt-sell-price">Sell price (inc GST)</Label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">$</span>
                <Input
                  id="prompt-sell-price"
                  type="number" step="0.01" min={0} autoFocus
                  value={pricePrompt?.sellPrice ?? ""}
                  placeholder="0.00"
                  onChange={(e) => setPricePrompt((p) => p ? { ...p, sellPrice: e.target.value } : p)}
                  onKeyDown={(e) => { if (e.key === "Enter" && pricePromptValid) confirmPricePrompt(); }}
                  className="pl-6"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prompt-cost-price">Cost price (ex GST) <span className="text-muted-foreground font-normal">— optional</span></Label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">$</span>
                <Input
                  id="prompt-cost-price"
                  type="number" step="0.01" min={0}
                  value={pricePrompt?.costPrice ?? ""}
                  placeholder="0.00"
                  onChange={(e) => setPricePrompt((p) => p ? { ...p, costPrice: e.target.value } : p)}
                  onKeyDown={(e) => { if (e.key === "Enter" && pricePromptValid) confirmPricePrompt(); }}
                  className="pl-6"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setPricePrompt(null)}>Cancel</Button>
              <Button onClick={confirmPricePrompt} disabled={!pricePromptValid}>Apply price</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </AppLayout>
  );
}
