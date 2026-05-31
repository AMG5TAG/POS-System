import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import jsPDF from "jspdf";
import QRCode from "qrcode";

import { AppLayout } from "@/components/layout/app-layout";
import {
  useListProducts, useGetMerchant, useGetLoyaltySettings, LoyaltySettings,
  useListInvoices, useCreateInvoice, useUpdateInvoice, useDeleteInvoice,
  useAddInvoiceEvent, useSendInvoiceEmail, useGetInvoice, getGetInvoiceQueryKey,
  ListInvoicesStatus, getListInvoicesQueryKey, useGetRegionalExtSettings,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useBusinessProfile } from "@/lib/business-profile";
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
import { resolveCode } from "@/pages/app/management-templates";
import { useSalesTemplate } from "@/lib/use-sales-template";
import {
  Plus, FileText, Search, Trash2, CheckCircle2, Send, RefreshCw, Package,
  Eye, EyeOff, Mail, MessageSquare, Printer, X, ExternalLink, Clock, Download, Pencil,
  Banknote, Tag, CalendarClock, AlertCircle, ListChecks, History, ClipboardList, Paperclip,
  Copy, GripVertical,
} from "lucide-react";
import { toast } from "sonner";

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
type LineItem = { description: string; quantity: number; unitPrice: number; taxRate: number };
type InvoiceEvent = { type: string; timestamp: string; detail?: string; method?: string };
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
  createdAt: string;
};

/* ── Constants ───────────────────────────────────────────────────────────── */

const STATUS_COLORS: Record<InvStatus, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary", sent: "outline", paid: "default", partial: "outline", overdue: "destructive", cancelled: "secondary",
};

const STATUS_LABELS: Record<InvStatus, string> = {
  draft: "Draft", sent: "Sent", paid: "Paid", partial: "Partially Paid", overdue: "Overdue", cancelled: "Cancelled",
};

const FREQ_LABELS = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };

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
  const [emailDialog, setEmailDialog] = useState<{ open: boolean; invoiceId: number | null }>({ open: false, invoiceId: null });
  const [emailAddr, setEmailAddr] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
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
  const [editRecurring, setEditRecurring] = useState({
    enabled: false,
    frequency: "monthly" as "daily" | "weekly" | "monthly" | "yearly",
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
  } | null>(null);

  const [discardConfirmTarget, setDiscardConfirmTarget] = useState<"create" | "edit" | null>(null);
  const [lineSearch, setLineSearch] = useState<string[]>([""]);
  const [lineDropOpen, setLineDropOpen] = useState<boolean[]>([false]);

  const [recurring, setRecurring] = useState({
    enabled: false,
    frequency: "monthly" as "daily" | "weekly" | "monthly" | "yearly",
    startDate: "",
    occurrences: 1,
  });
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
  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = useListInvoices(
    historyParams,
    { query: { enabled: activeTab === "history", queryKey: getListInvoicesQueryKey(historyParams) } },
  );
  const historyInvoices = useMemo(() =>
    [...((historyData?.items ?? []) as unknown as Invoice[])].sort((a, b) => {
      const ta = a.paidAt ? new Date(a.paidAt).getTime() : 0;
      const tb = b.paidAt ? new Date(b.paidAt).getTime() : 0;
      return tb - ta;
    }),
  [historyData]);

  /* ── Invoice mutation hooks ── */
  const createInvoiceMutation = useCreateInvoice();
  const updateInvoiceMutation = useUpdateInvoice();
  const deleteInvoiceMutation = useDeleteInvoice();
  const addEventMutation = useAddInvoiceEvent();
  const sendEmailMutation = useSendInvoiceEmail();

  const { data: detailInvoiceRaw } = useGetInvoice(
    detailInvoiceId ?? 0,
    { query: { enabled: !!detailInvoiceId, queryKey: getGetInvoiceQueryKey(detailInvoiceId ?? 0) } },
  );
  const detailInvoice = (detailInvoiceRaw as unknown as Invoice | undefined) ?? detailInvoiceSeed;

  const invalidateInvoices = () => queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });

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
  const { opts: invoiceOpts, fontCss: invoiceFontCss } = useSalesTemplate("Invoice");
  const { opts: quoteOpts, fontCss: quoteFontCss } = useSalesTemplate("Quote");

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
  const updateLine = (i: number, field: keyof LineItem, val: string | number) =>
    setLines((p) => p.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
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
  const selectProduct = (i: number, product: { name: string; price?: number | null }) => {
    setLines((p) => p.map((l, idx) => idx === i ? { ...l, description: product.name, unitPrice: product.price ?? 0, taxRate: defaultTaxRate } : l));
    setLineSearch((p) => { const n = [...p]; n[i] = ""; return n; });
    setLineDropOpen((p) => { const n = [...p]; n[i] = false; return n; });
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
  const updateEditLine = (i: number, field: keyof LineItem, val: string | number) =>
    setEditLines((p) => p.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
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
  const selectEditProduct = (i: number, product: { name: string; price?: number | null }) => {
    setEditLines((p) => p.map((l, idx) => idx === i ? { ...l, description: product.name, unitPrice: product.price ?? 0, taxRate: defaultTaxRate } : l));
    setEditLineSearch((p) => { const n = [...p]; n[i] = ""; return n; });
    setEditLineDropOpen((p) => { const n = [...p]; n[i] = false; return n; });
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
  const CREATE_PRISTINE_RECURRING = { enabled: false, frequency: "monthly" as "daily" | "weekly" | "monthly" | "yearly", startDate: "", occurrences: 1 };

  const isCreateDirty = createOpen && (
    JSON.stringify(form) !== JSON.stringify(CREATE_PRISTINE_FORM) ||
    JSON.stringify(lines) !== JSON.stringify(CREATE_PRISTINE_LINES) ||
    JSON.stringify(discount) !== JSON.stringify(CREATE_PRISTINE_DISCOUNT) ||
    JSON.stringify(recurring) !== JSON.stringify(CREATE_PRISTINE_RECURRING)
  );

  const isEditDirty = editOpen && editInitialRef.current !== null && (
    JSON.stringify(editForm) !== JSON.stringify(editInitialRef.current.form) ||
    JSON.stringify(editLines) !== JSON.stringify(editInitialRef.current.lines) ||
    JSON.stringify(editDiscount) !== JSON.stringify(editInitialRef.current.discount) ||
    JSON.stringify(editRecurring) !== JSON.stringify(editInitialRef.current.recurring)
  );

  /* ── Open edit dialog ── */
  const openEdit = (inv: Invoice) => {
    const newForm = {
      customerId: String(inv.customerId ?? ""),
      dueDate: inv.dueDate ? inv.dueDate.slice(0, 10) : "",
      notes: inv.notes ?? "",
    };
    const newRecurring = {
      enabled: inv.isRecurring ?? false,
      frequency: (inv.recurringFrequency as "daily" | "weekly" | "monthly" | "yearly") ?? "monthly",
      startDate: inv.recurringStartDate ? inv.recurringStartDate.slice(0, 10) : "",
      occurrences: inv.recurringOccurrences ?? 1,
    };
    const items = inv.items?.length ? inv.items : [{ description: "", quantity: 1, unitPrice: 0, taxRate: defaultTaxRate }];
    const newDiscount = inv.discountType && inv.discountValue
      ? { enabled: true, type: inv.discountType as DiscountType, value: String(inv.discountValue) }
      : { enabled: false, type: "percent" as DiscountType, value: "" };
    setEditingInvoice(inv);
    setEditForm(newForm);
    setEditRecurring(newRecurring);
    setEditLines(items);
    setEditLineSearch(items.map(() => ""));
    setEditLineDropOpen(items.map(() => false));
    setEditDiscount(newDiscount);
    editInitialRef.current = { form: newForm, lines: items, discount: newDiscount, recurring: newRecurring };
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
          customerId: editForm.customerId ? parseInt(editForm.customerId) : null,
          dueDate: editForm.dueDate || null,
          notes: editForm.notes || null,
          items: validLines,
          discount: editDiscount.enabled && editDiscount.value
            ? { type: editDiscount.type, value: parseFloat(editDiscount.value) }
            : null,
          recurring: {
            enabled: editRecurring.enabled,
            frequency: editRecurring.frequency,
            startDate: editRecurring.startDate || null,
            occurrences: editRecurring.occurrences,
          },
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
    setDiscount({ enabled: false, type: "percent", value: "" });
  };

  /* ── Create invoice ── */
  const handleSave = async () => {
    if (!form.customerId) { toast.error("Please select a customer"); return; }
    const validLines = lines.filter((l) => l.description.trim());
    if (!validLines.length) { toast.error("Add at least one line item"); return; }
    setSaving(true);
    try {
      const prefixSettings = getInvoicePrefix();
      const body = {
        customerId: form.customerId ? parseInt(form.customerId) : null,
        dueDate: form.dueDate || null,
        notes: form.notes || null,
        items: validLines,
        invoicePrefix: prefixSettings.invoicePrefix,
        invoiceDigits: prefixSettings.invoiceDigits,
        discount: discount.enabled && discount.value
          ? { type: discount.type, value: parseFloat(discount.value) }
          : null,
        ...(recurring.enabled && {
          recurring: {
            frequency: recurring.frequency,
            startDate: recurring.startDate || null,
            occurrences: recurring.occurrences,
          },
        }),
      };
      await createInvoiceMutation.mutateAsync({ data: body as Parameters<typeof createInvoiceMutation.mutateAsync>[0]["data"] });
      toast.success(recurring.enabled ? "Recurring invoice created" : "Invoice created");
      setCreateOpen(false);
      resetCreate();
      invalidateInvoices();
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
      toast.success(`Marked as ${status}`);
      invalidateInvoices();
    } catch {
      toast.error("Failed to update invoice status");
    }
  };

  /* ── Record a payment at the POS terminal ──
     Hands the invoice's remaining balance + linked customer to the POS terminal,
     which enters "Invoice Payment Mode" and processes via any payment method. */
  const payAtTerminal = (inv: Invoice) => {
    const balance = Math.max(0, inv.total - (inv.amountPaid ?? 0));
    if (balance <= 0) {
      toast.error("This invoice is already paid in full");
      return;
    }
    setPendingInvoicePayment({
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      balance,
      customerId: inv.customerId ?? null,
      customerName: inv.customerName,
    });
    navigate("/pos");
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

  const handleSendEmail = async () => {
    if (!emailDialog.invoiceId || !emailAddr.trim()) return;
    setSendingEmail(true);
    const invId = emailDialog.invoiceId;
    try {
      await sendEmailMutation.mutateAsync({
        id: invId,
        data: { email: emailAddr, template: getEmailTemplatePayload() } as Parameters<typeof sendEmailMutation.mutateAsync>[0]["data"],
      });
      toast.success("Invoice emailed");
      setEmailDialog({ open: false, invoiceId: null });
      setEmailAddr("");
      setEmailSubject("");
      invalidateInvoices();
      queryClient.invalidateQueries({ queryKey: getGetInvoiceQueryKey(invId) });
    } catch {
      toast.error("Failed to send email");
    } finally {
      setSendingEmail(false);
    }
  };

  /* ── Helpers ── */
  const resolveStr = (text: string, biz: string, abn: string, web: string, em: string) =>
    resolveCode(text || "", biz, abn, web, em);

  /* ── Print ── */
  const printInvoice = async (inv: Invoice) => {
    const opts        = invoiceOpts;
    const bizName     = merchant?.businessName ?? "Your Business";
    const abn         = profile.abn ?? "";
    const website     = profile.website ?? "";
    const address     = [
      (merchant as { address?: string } | undefined)?.address,
      (merchant as { city?: string } | undefined)?.city,
      profile.state, profile.postcode,
    ].filter(Boolean).join(", ");
    const email       = profile.contactEmail ?? "";
    const tagline     = profile.tagline ?? "";
    const brandColor  = profile.brandColors?.[0] ?? "#4f46e5";
    const logo        = profile.logo ?? "";
    const socials     = profile.socialLinks;
    const paymentTypes = profile.paymentTypes ?? ["Cash", "EFTPOS", "Mastercard", "Visa"];

    const termsText   = resolveStr(opts.paymentTerms, bizName, abn, website, email);
    const notesText   = resolveStr(opts.invoiceNotes, bizName, abn, website, email);
    const footerText  = resolveStr(opts.footerText, bizName, abn, website, email);
    const thankYouMsg = resolveStr(opts.thankYouMsg || "", bizName, abn, website, email);
    const customMsg   = resolveStr(opts.customMessage || "", bizName, abn, website, email);

    /* QR code data URL */
    let qrDataUrl = "";
    if (opts.showCustomerQr && inv.customerId) {
      try { qrDataUrl = await QRCode.toDataURL(`CUS-${inv.customerId}`, { width: 80, margin: 1 }); } catch { /* ignore */ }
    }

    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;

    const itemRows = (inv.items ?? []).map((l, idx) => `
      <tr style="${idx % 2 === 1 ? "background:#fafafa" : ""}">
        <td>${l.description}</td>
        <td style="text-align:center">${l.quantity}</td>
        <td style="text-align:right">$${l.unitPrice.toFixed(2)}</td>
        <td style="text-align:right">$${(l.quantity * l.unitPrice).toFixed(2)}</td>
      </tr>`).join("");

    /* Logo block */
    const logoHtml = opts.showLogo
      ? (logo
          ? `<img src="${logo}" alt="Logo" style="max-height:56px;max-width:140px;object-fit:contain;display:block;margin-bottom:8px">`
          : `<div style="width:44px;height:44px;border-radius:8px;background:${brandColor};margin-bottom:8px"></div>`)
      : "";

    /* Customer block */
    const hasCustomer = inv.customerName || inv.customerEmail;
    const customerBlock = hasCustomer ? (() => {
      const lines: string[] = [];
      if (inv.customerName)                              lines.push(`<p style="font-size:14px;font-weight:600;margin:0 0 2px">${inv.customerName}</p>`);
      if (inv.customerCompany)                           lines.push(`<p style="color:#555;margin:0 0 1px">${inv.customerCompany}</p>`);
      if (opts.showAllCustomerDetails && inv.customerEmail)   lines.push(`<p style="color:#666;margin:0 0 1px">${inv.customerEmail}</p>`);
      if (opts.showAllCustomerDetails && inv.customerPhone)   lines.push(`<p style="color:#666;margin:0 0 1px">${inv.customerPhone}</p>`);
      if (opts.showAllCustomerDetails && inv.customerAddress) lines.push(`<p style="color:#666;margin:0">${inv.customerAddress}</p>`);
      return `<div class="bill-to"><strong>${opts.showAllCustomerDetails ? "CUSTOMER" : "BILL TO"}</strong><div style="margin-top:6px">${lines.join("")}</div></div>`;
    })() : "";

    /* QR + barcode block (next to customer or after) */
    const qrBlock = qrDataUrl ? `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f7f7f7;border-radius:6px;padding:12px 16px;margin-left:16px;font-size:13px;text-align:center">
        <p style="font-size:9px;color:#999;margin:0 0 4px;text-transform:uppercase;letter-spacing:0.6px">Customer Profile</p>
        <img src="${qrDataUrl}" style="width:72px;height:72px">
      </div>` : "";

    const barcodeBlock = opts.showBarcode ? `
      <div style="margin:12px 0;text-align:center">
        <p style="font-family:monospace;font-size:11px;letter-spacing:4px;color:#888;border:1px solid #ddd;display:inline-block;padding:4px 12px;border-radius:4px">${inv.invoiceNumber}</p>
        <p style="font-size:9px;color:#aaa;margin:2px 0 0">INVOICE BARCODE</p>
      </div>` : "";

    /* Customer + QR combined row — both blocks share the same background
       and stretch to equal height via flex align-items:stretch */
    const customerQrRow = (hasCustomer || qrDataUrl) ? `
      <div style="display:flex;justify-content:space-between;margin-bottom:20px">
        ${customerBlock}
        ${qrDataUrl ? qrBlock : ""}
      </div>` : "";

    /* Payment block */
    const paymentBlock = (opts.showPaymentMethods || opts.bankDetails) ? `
      <div class="payment-block">
        ${opts.paymentSectionHeading ? `<div class="terms-title">${opts.paymentSectionHeading}</div>` : ""}
        ${opts.showPaymentMethods ? `<div class="payment-methods">${paymentTypes.map(m => `<span class="pm-badge">${m}</span>`).join("")}</div>` : ""}
        ${opts.bankDetails ? `<pre class="bank-details">${opts.bankDetails}</pre>` : ""}
      </div>` : "";

    /* Socials */
    const socialsBlock = opts.showSocialLinks && (socials?.facebook || socials?.instagram || socials?.twitter || socials?.linkedin) ? `
      <div class="socials">
        ${socials.facebook  ? `<span>fb/ ${socials.facebook}</span>` : ""}
        ${socials.instagram ? `<span>ig/ @${socials.instagram}</span>` : ""}
        ${socials.twitter   ? `<span>x/ @${socials.twitter}</span>` : ""}
        ${socials.linkedin  ? `<span>in/ ${socials.linkedin}</span>` : ""}
        ${socials.youtube   ? `<span>yt/ ${socials.youtube}</span>` : ""}
        ${socials.tiktok    ? `<span>tt/ @${socials.tiktok}</span>` : ""}
      </div>` : "";

    w.document.write(`<!DOCTYPE html><html><head>
      <title>Invoice ${inv.invoiceNumber}</title>
      <style>
        *{box-sizing:border-box}
        body{font-family:${invoiceFontCss};padding:40px;color:#222;max-width:760px;margin:0 auto}
        .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid ${brandColor};padding-bottom:16px;margin-bottom:24px}
        .biz-name{font-size:20px;font-weight:700;margin:0}
        .biz-meta{font-size:12px;color:#666;margin-top:4px;line-height:1.7}
        .inv-title{font-size:28px;font-weight:800;color:${brandColor};text-align:right;margin:0}
        .inv-meta{font-size:13px;color:#666;text-align:right;margin-top:4px;line-height:1.8}
        .bill-to{background:#f7f7f7;border-radius:6px;padding:12px 16px;font-size:13px;flex:1}
        .bill-to strong{display:block;margin-bottom:4px;font-size:10px;text-transform:uppercase;letter-spacing:0.8px;color:#999}
        table{width:100%;border-collapse:collapse;margin:0 0 16px}
        th{text-align:left;border-bottom:2px solid #ddd;padding:8px 6px;font-size:11px;color:#555;text-transform:uppercase;letter-spacing:.5px}
        td{padding:9px 6px;border-bottom:1px solid #eee;font-size:13px;vertical-align:top}
        .totals{margin-left:auto;width:270px;margin-top:8px}
        .totals .row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:13px;color:#555;border-bottom:1px solid #f0f0f0}
        .totals .grand{font-weight:700;border-top:2px solid #ddd;padding-top:10px;margin-top:4px;font-size:15px;color:#111;display:flex;justify-content:space-between;align-items:center}
        .terms{margin-top:20px;padding:14px 16px;background:#f9f9f9;border-left:3px solid ${brandColor};border-radius:0 6px 6px 0;font-size:12px;color:#555;white-space:pre-wrap;line-height:1.7}
        .terms-title{font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.6px;color:#aaa;margin-bottom:6px}
        .inv-notes{margin-top:12px;padding:12px 16px;background:#f9f9f9;border-radius:6px;font-size:12px;color:#555;white-space:pre-wrap;line-height:1.7}
        .footer{margin-top:28px;padding-top:12px;border-top:1px solid #eee;font-size:11px;color:#aaa;text-align:center}
        .payment-block{margin-top:20px;padding:14px 16px;background:#f9f9f9;border-radius:6px;font-size:12px;color:#555}
        .payment-methods{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
        .pm-badge{border:1px solid #ddd;border-radius:4px;padding:3px 9px;font-size:11px;color:#555;background:#fff;white-space:nowrap}
        .bank-details{margin-top:8px;font-family:monospace;font-size:11px;white-space:pre-wrap;color:#555;background:#fff;border:1px solid #eee;border-radius:4px;padding:8px 12px}
        .loyalty-block{display:flex;justify-content:space-between;padding:6px 12px;font-size:12px;color:#065f46;background:#ecfdf5;border-radius:6px;margin-top:8px;margin-bottom:8px}
        .socials{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px;font-size:11px;color:#aaa}
        .custom-msg{margin-top:16px;padding:10px 14px;background:#fafafa;border-radius:6px;font-size:12px;color:#555;line-height:1.6}
        .thank-you{margin-top:16px;text-align:center;font-size:13px;font-weight:600;color:${brandColor}}
        @media print{body{padding:20px}}
      </style>
    </head><body>
      <div class="header">
        <div>
          ${logoHtml}
          <p class="biz-name">${bizName}</p>
          ${opts.showTagline && tagline ? `<p style="font-size:12px;color:#888;font-style:italic;margin:2px 0 4px">${tagline}</p>` : ""}
          <div class="biz-meta">
            ${opts.showAbn && abn ? `ABN ${abn}<br>` : ""}
            ${address ? `${address}<br>` : ""}
            ${email ? `${email}<br>` : ""}
            ${opts.showWebsite && website ? `<a href="${website}" style="color:${brandColor}">${website}</a>` : ""}
          </div>
        </div>
        <div style="text-align:right">
          <p class="inv-title">INVOICE</p>
          <div class="inv-meta">
            <strong>${inv.invoiceNumber}</strong><br>
            Date: ${formatDate(inv.createdAt)}<br>
            ${inv.dueDate ? `Due: ${formatDateOnly(inv.dueDate)}<br>` : ""}
            Status: ${STATUS_LABELS[inv.status]}
          </div>
        </div>
      </div>
      ${customerQrRow}
      <table>
        <thead><tr>
          <th>Description</th>
          <th style="text-align:center">Qty</th>
          <th style="text-align:right">Unit Price</th>
          <th style="text-align:right">Total</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div class="totals">
        <div class="row"><span>Subtotal</span><span>$${inv.subtotal.toFixed(2)}</span></div>
        ${opts.showGstBreakdown ? `<div class="row"><span>GST (10%)</span><span>$${inv.taxTotal.toFixed(2)}</span></div>` : ""}
        ${inv.discountTotal ? `<div class="row" style="color:#b45309"><span>Discount</span><span>-$${inv.discountTotal.toFixed(2)}</span></div>` : ""}
        <div class="grand"><span>Total Due (AUD)</span><span>$${inv.total.toFixed(2)}</span></div>
        ${(inv.amountPaid ?? 0) > 0 ? `<div class="row" style="color:#047857"><span>Amount Paid</span><span>-$${(inv.amountPaid ?? 0).toFixed(2)}</span></div><div class="grand"><span>Balance Due (AUD)</span><span>$${Math.max(0, inv.total - (inv.amountPaid ?? 0)).toFixed(2)}</span></div>` : ""}
      </div>
      ${opts.showLoyaltyEarned ? (() => {
        const lType = loyaltySettings?.programType ?? "points";
        let lIcon: string, lLabel: string, lValue: string;
        if (lType === "cashback") {
          const rate = loyaltySettings?.cashbackRate ?? 0.01;
          const earned = Math.round(inv.total * rate * 100) / 100;
          lIcon = "$"; lLabel = "Cashback Earned"; lValue = `+ $${earned.toFixed(2)}`;
        } else {
          const ppd = loyaltySettings?.pointsPerDollar ?? 1;
          const pts = Math.floor(inv.total * ppd);
          lIcon = "&#9733;"; lLabel = "Loyalty Earned"; lValue = `+${pts} pts`;
        }
        return `<div class="loyalty-block"><span>${lIcon} ${lLabel}</span><span>${lValue}</span></div>`;
      })() : ""}
      ${paymentBlock}
      ${termsText ? `<div class="terms"><div class="terms-title">Payment Terms</div><div>${termsText}</div>${notesText ? `<div style="margin-top:8px;font-style:italic">${notesText}</div>` : ""}</div>` : notesText ? `<div class="inv-notes"><div class="terms-title" style="margin-bottom:6px">Notes</div>${notesText}</div>` : ""}
      ${inv.notes ? `<div class="inv-notes"><div class="terms-title" style="margin-bottom:6px">Notes</div>${inv.notes}</div>` : ""}
      ${socialsBlock}
      ${customMsg ? `<div class="custom-msg">${customMsg.replace(/\n/g, "<br>")}</div>` : ""}
      ${thankYouMsg ? `<div class="thank-you">${thankYouMsg}</div>` : ""}
      ${footerText ? `<div class="footer">${footerText}</div>` : ""}
      ${barcodeBlock}
    </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 400);
  };

  const downloadInvoicePDF = async (inv: Invoice) => {
    const opts      = invoiceOpts;
    const bizName   = merchant?.businessName ?? "Your Business";
    const abn       = profile.abn ?? "";
    const website   = profile.website ?? "";
    const address   = [
      (merchant as { address?: string } | undefined)?.address,
      (merchant as { city?: string } | undefined)?.city,
      profile.state, profile.postcode,
    ].filter(Boolean).join(", ");
    const email     = profile.contactEmail ?? "";
    const tagline   = profile.tagline ?? "";
    const rawColor  = profile.brandColors?.[0] ?? "#4f46e5";
    const logo      = profile.logo ?? "";
    const socials   = profile.socialLinks;
    const paymentTypes = profile.paymentTypes ?? ["Cash", "EFTPOS", "Mastercard", "Visa"];

    const termsText   = resolveStr(opts.paymentTerms, bizName, abn, website, email);
    const notesText   = resolveStr(opts.invoiceNotes, bizName, abn, website, email);
    const footerText  = resolveStr(opts.footerText, bizName, abn, website, email);
    const thankYouMsg = resolveStr(opts.thankYouMsg || "", bizName, abn, website, email);
    const customMsg   = resolveStr(opts.customMessage || "", bizName, abn, website, email);

    const hexToRgb = (hex: string): [number, number, number] => {
      const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return r ? [parseInt(r[1], 16), parseInt(r[2], 16), parseInt(r[3], 16)] : [79, 70, 229];
    };
    const [cr, cg, cb] = hexToRgb(rawColor);

    /* QR code data URL */
    let qrDataUrl = "";
    if (opts.showCustomerQr && inv.customerId) {
      try { qrDataUrl = await QRCode.toDataURL(`CUS-${inv.customerId}`, { width: 80, margin: 1 }); } catch { /* ignore */ }
    }

    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const W = 210, ML = 20, MR = 20, CW = W - ML - MR;
    let y = 22;

    /* ── Header ── */
    let logoH = 0;
    if (opts.showLogo) {
      if (logo) {
        try {
          /* Compress to JPEG at ≤260 px before embedding — raw user PNG logos
             (often 1000–4000 px) are the #1 cause of 100 MB+ PDF output. */
          const { dataUrl: compressedLogo, format: logoFmt } = await compressForPdf(logo, 260, 0.78);
          doc.addImage(compressedLogo, logoFmt, ML, y, 22, 22);
          logoH = 26;
        } catch {
          doc.setFillColor(cr, cg, cb);
          doc.roundedRect(ML, y, 10, 10, 2, 2, "F");
          logoH = 14;
        }
      } else {
        doc.setFillColor(cr, cg, cb);
        doc.roundedRect(ML, y, 10, 10, 2, 2, "F");
        logoH = 14;
      }
    }
    const bizY = y + logoH;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(30, 30, 30);
    doc.text(bizName, ML, bizY);
    if (opts.showTagline && tagline) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(130, 130, 130);
      doc.text(tagline, ML, bizY + 4.5);
    }
    let metaY = bizY + (opts.showTagline && tagline ? 9 : 5.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 100, 100);
    const metaLines: string[] = [];
    if (opts.showAbn && abn)         metaLines.push(`ABN ${abn}`);
    if (address)                     metaLines.push(address);
    if (email)                       metaLines.push(email);
    if (opts.showWebsite && website) metaLines.push(website);
    metaLines.forEach((l) => { doc.text(l, ML, metaY); metaY += 4.5; });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(26);
    doc.setTextColor(cr, cg, cb);
    doc.text("INVOICE", W - MR, y + 2, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    doc.text(inv.invoiceNumber, W - MR, y + 12, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    let imY = y + 18;
    doc.text(`Date: ${formatDate(inv.createdAt)}`, W - MR, imY, { align: "right" }); imY += 5;
    if (inv.dueDate) { doc.text(`Due: ${formatDateOnly(inv.dueDate)}`, W - MR, imY, { align: "right" }); imY += 5; }
    doc.text(`Status: ${STATUS_LABELS[inv.status]}`, W - MR, imY, { align: "right" });

    y = Math.max(metaY, imY) + 7;
    doc.setDrawColor(cr, cg, cb);
    doc.setLineWidth(0.8);
    doc.line(ML, y, W - MR, y);
    y += 8;

    /* ── Customer + QR ── */
    if (inv.customerName || inv.customerEmail) {
      const custLines: { text: string; bold?: boolean; small?: boolean }[] = [];
      if (inv.customerName)    custLines.push({ text: inv.customerName, bold: true });
      if (inv.customerCompany) custLines.push({ text: inv.customerCompany, small: true });
      if (opts.showAllCustomerDetails && inv.customerEmail)   custLines.push({ text: inv.customerEmail, small: true });
      if (opts.showAllCustomerDetails && inv.customerPhone)   custLines.push({ text: inv.customerPhone, small: true });
      if (opts.showAllCustomerDetails && inv.customerAddress) custLines.push({ text: inv.customerAddress, small: true });

      const lineH = 4.8;
      const custH = Math.max(16, 4 + custLines.length * lineH + 4);
      const qrSize = qrDataUrl ? 22 : 0;
      const custW  = CW - (qrSize > 0 ? qrSize + 4 : 0);

      doc.setFillColor(247, 247, 247);
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.rect(ML, y - 3, CW, custH + (qrSize > 0 ? Math.max(0, qrSize - custH + 6) : 0), "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(opts.showAllCustomerDetails ? "CUSTOMER" : "BILL TO", ML + 4, y + 2);

      let cy = y + 7;
      custLines.forEach((cl) => {
        doc.setFont("helvetica", cl.bold ? "bold" : "normal");
        doc.setFontSize(cl.small ? 8.5 : 10.5);
        doc.setTextColor(cl.bold ? 30 : 80, cl.bold ? 30 : 80, cl.bold ? 30 : 80);
        doc.text(cl.text, ML + 4, cy, { maxWidth: custW - 6 });
        cy += lineH;
      });

      if (qrDataUrl) {
        try {
          doc.addImage(qrDataUrl, "PNG", W - MR - qrSize, y - 1, qrSize, qrSize);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(160, 160, 160);
          const qrLabel = opts.loyaltyQrText || "Scan for loyalty";
          doc.text(qrLabel, W - MR - qrSize / 2, y + qrSize + 1, { align: "center", maxWidth: qrSize + 2 });
        } catch { /* ignore */ }
      }

      y += custH + (qrSize > 0 ? Math.max(0, qrSize - custH + 8) : 6);
    }

    /* ── Line items table ── */
    const COL = { desc: 98, qty: 18, unit: 32, amt: 22 };
    doc.setFillColor(245, 245, 245);
    doc.rect(ML, y - 3, CW, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(80, 80, 80);
    let cx = ML + 2;
    doc.text("DESCRIPTION", cx, y + 2);                                        cx += COL.desc;
    doc.text("QTY",    cx + COL.qty  / 2, y + 2, { align: "center" });         cx += COL.qty;
    doc.text("UNIT PRICE", cx + COL.unit, y + 2, { align: "right" });           cx += COL.unit;
    doc.text("TOTAL", cx + COL.amt,       y + 2, { align: "right" });
    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.35);
    doc.line(ML, y + 4, W - MR, y + 4);
    y += 10;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    (inv.items ?? []).forEach((item, idx) => {
      if (idx % 2 === 1) {
        doc.setFillColor(251, 251, 251);
        doc.rect(ML, y - 4, CW, 9, "F");
      }
      cx = ML + 2;
      doc.setTextColor(30, 30, 30);
      const desc = item.description.length > 54 ? item.description.slice(0, 52) + "…" : item.description;
      doc.text(desc, cx, y + 1);                                                cx += COL.desc;
      doc.setTextColor(80, 80, 80);
      doc.text(String(item.quantity), cx + COL.qty / 2, y + 1, { align: "center" }); cx += COL.qty;
      doc.text(`$${item.unitPrice.toFixed(2)}`, cx + COL.unit, y + 1, { align: "right" }); cx += COL.unit;
      doc.setTextColor(30, 30, 30);
      doc.text(`$${(item.quantity * item.unitPrice).toFixed(2)}`, cx + COL.amt, y + 1, { align: "right" });
      doc.setDrawColor(235, 235, 235);
      doc.setLineWidth(0.2);
      doc.line(ML, y + 4, W - MR, y + 4);
      y += 9;
    });
    y += 5;

    /* ── Totals ── */
    const totX = W - MR - 66;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text("Subtotal", totX + 2, y); doc.text(`$${inv.subtotal.toFixed(2)}`, W - MR, y, { align: "right" }); y += 6;
    if (opts.showGstBreakdown) {
      doc.text("GST (10%)", totX + 2, y); doc.text(`$${inv.taxTotal.toFixed(2)}`, W - MR, y, { align: "right" }); y += 6;
    }
    if (inv.discountTotal) {
      doc.setTextColor(180, 80, 0);
      doc.text("Discount", totX + 2, y); doc.text(`-$${inv.discountTotal.toFixed(2)}`, W - MR, y, { align: "right" }); y += 6;
      doc.setTextColor(80, 80, 80);
    }
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(totX, y - 2, W - MR, y - 2);
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30, 30, 30);
    doc.text("Total Due (AUD)", totX + 2, y); doc.text(`$${inv.total.toFixed(2)}`, W - MR, y, { align: "right" });
    y += 8;
    if ((inv.amountPaid ?? 0) > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(4, 120, 87);
      doc.text("Amount Paid", totX + 2, y); doc.text(`-$${(inv.amountPaid ?? 0).toFixed(2)}`, W - MR, y, { align: "right" }); y += 6;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(30, 30, 30);
      doc.text("Balance Due (AUD)", totX + 2, y);
      doc.text(`$${Math.max(0, inv.total - (inv.amountPaid ?? 0)).toFixed(2)}`, W - MR, y, { align: "right" });
      y += 8;
    }
    y += 2;

    /* ── Loyalty Earned ── */
    if (opts.showLoyaltyEarned) {
      const lPdfType = (loyaltySettings as LoyaltySettings | undefined)?.programType ?? "points";
      let lPdfLeft: string, lPdfRight: string;
      if (lPdfType === "cashback") {
        const rate = (loyaltySettings as LoyaltySettings | undefined)?.cashbackRate ?? 0.01;
        const earned = Math.round(inv.total * rate * 100) / 100;
        lPdfLeft = "$ Cashback Earned";
        lPdfRight = `+ $${earned.toFixed(2)}`;
      } else {
        const ppd = (loyaltySettings as LoyaltySettings | undefined)?.pointsPerDollar ?? 1;
        const pts = Math.floor(inv.total * ppd);
        lPdfLeft = "\u2605 Loyalty Earned";
        lPdfRight = `+${pts} pts`;
      }
      doc.setFillColor(236, 253, 245);
      doc.setDrawColor(167, 243, 208);
      doc.setLineWidth(0.3);
      doc.rect(ML, y, CW, 9, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(6, 95, 70);
      doc.text(lPdfLeft, ML + 4, y + 5.5);
      doc.text(lPdfRight, W - MR - 2, y + 5.5, { align: "right" });
      y += 13;
    } else {
      y += 2;
    }

    /* ── Payment block ── */
    if (opts.showPaymentMethods || opts.bankDetails) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const bankLines = opts.bankDetails ? opts.bankDetails.split("\n").filter(Boolean) : [];
      const pmLineCount = opts.showPaymentMethods
        ? Math.ceil(doc.splitTextToSize(paymentTypes.join("  ·  "), CW - 10).length)
        : 0;
      const blockH = 8 + (opts.showPaymentMethods ? pmLineCount * 5.5 + 2 : 0) + (bankLines.length * 4.5) + (bankLines.length ? 2 : 0);
      doc.setFillColor(249, 249, 249);
      doc.setDrawColor(220, 220, 220);
      doc.rect(ML, y, CW, blockH, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(130, 130, 130);
      if (opts.paymentSectionHeading) { doc.text(opts.paymentSectionHeading.toUpperCase(), ML + 4, y + 4.5); }
      let py = y + 9;
      if (opts.showPaymentMethods) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(80, 80, 80);
        const pmLines = doc.splitTextToSize(paymentTypes.join("  ·  "), CW - 10);
        doc.text(pmLines as string[], ML + 4, py);
        py += (pmLines as string[]).length * 5.5 + 2;
      }
      if (bankLines.length) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(80, 80, 80);
        bankLines.forEach((ln) => { doc.text(ln, ML + 4, py); py += 4.5; });
      }
      y += blockH + 4;
    }

    /* ── Terms ── */
    if (termsText || notesText) {
      const tLines  = termsText ? (doc.splitTextToSize(termsText, CW - 14) as string[]) : [];
      const nLines  = notesText ? (doc.splitTextToSize(notesText, CW - 14) as string[]) : [];
      const termsH  = 8 + tLines.length * 5 + (nLines.length ? nLines.length * 5 + 2 : 0) + 4;
      doc.setFillColor(cr, cg, cb);
      doc.rect(ML, y, 1.5, termsH, "F");
      doc.setFillColor(249, 249, 249);
      doc.rect(ML + 1.5, y, CW - 1.5, termsH, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(130, 130, 130);
      doc.text("TERMS", ML + 5, y + 4.5);
      let ty = y + 9;
      if (tLines.length) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(80, 80, 80);
        doc.text(tLines, ML + 5, ty);
        ty += tLines.length * 5 + 2;
      }
      if (nLines.length) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text(nLines, ML + 5, ty);
        ty += nLines.length * 5;
      }
      y += termsH + 4;
    }

    /* ── Invoice notes ── */
    if (inv.notes) {
      const noteLines = doc.splitTextToSize(inv.notes, CW - 10) as string[];
      const noteH = 8 + noteLines.length * 5 + 4;
      doc.setFillColor(249, 249, 249);
      doc.rect(ML, y, CW, noteH, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(130, 130, 130);
      doc.text("NOTES", ML + 4, y + 4.5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      doc.text(noteLines, ML + 4, y + 10);
      y += noteH + 4;
    }

    /* ── Socials ── */
    if (opts.showSocialLinks && (socials?.facebook || socials?.instagram || socials?.twitter || socials?.linkedin || socials?.youtube || socials?.tiktok)) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(160, 160, 160);
      const socParts: string[] = [];
      if (socials.facebook)  socParts.push(`fb/ ${socials.facebook}`);
      if (socials.instagram) socParts.push(`ig/ @${socials.instagram}`);
      if (socials.twitter)   socParts.push(`x/ @${socials.twitter}`);
      if (socials.linkedin)  socParts.push(`in/ ${socials.linkedin}`);
      if (socials.youtube)   socParts.push(`yt/ ${socials.youtube}`);
      if (socials.tiktok)    socParts.push(`tt/ @${socials.tiktok}`);
      const socLines = doc.splitTextToSize(socParts.join("    "), CW) as string[];
      doc.text(socLines, ML, y);
      y += socLines.length * 5 + 2;
    }

    /* ── Custom message ── */
    if (customMsg) {
      const cmLines = doc.splitTextToSize(customMsg, CW - 10) as string[];
      const cmH = 6 + cmLines.length * 5 + 4;
      doc.setFillColor(250, 250, 250);
      doc.rect(ML, y, CW, cmH, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(85, 85, 85);
      doc.text(cmLines, ML + 4, y + 6);
      y += cmH + 3;
    }

    /* ── Thank you message ── */
    if (thankYouMsg) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(cr, cg, cb);
      doc.text(thankYouMsg, W / 2, y + 5, { align: "center" });
      y += 10;
    }

    /* ── Footer ── */
    if (footerText) {
      doc.setDrawColor(230, 230, 230);
      doc.setLineWidth(0.3);
      doc.line(ML, 281, W - MR, 281);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(170, 170, 170);
      doc.text(footerText, W / 2, 287, { align: "center" });
    }

    /* ── Barcode (bottom of document) ── */
    if (opts.showBarcode) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(160, 160, 160);
      doc.text(inv.invoiceNumber, W / 2, y + 4, { align: "center", charSpace: 3 });
      doc.setFontSize(7);
      doc.text("INVOICE BARCODE", W / 2, y + 8.5, { align: "center" });
    }

    doc.save(`${inv.invoiceNumber}.pdf`);
  };

  /* ── Derived lists & KPIs ── */
  const filtered = useMemo(() => invoices.filter((inv) =>
    !search ||
    inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
    (inv.customerName ?? "").toLowerCase().includes(search.toLowerCase())
  ), [invoices, search]);

  const standardFiltered  = useMemo(() => filtered.filter((inv) => !inv.isRecurring).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),  [filtered]);
  // Templates only: isRecurring=true and not a child instance generated by the scheduler
  const recurringFiltered = useMemo(() => filtered.filter((inv) => inv.isRecurring && !inv.parentInvoiceId), [filtered]);

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
        onClick={(e) => { e.stopPropagation(); void downloadInvoicePDF(inv); void recordEvent(inv.id, "download"); }}>
        <Download className="w-3.5 h-3.5" />
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
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "standard" | "recurring" | "history")} className="space-y-4">

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
                  {(["draft","sent","paid","overdue","cancelled"] as InvStatus[]).map((s) => (
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
                          <Badge variant={STATUS_COLORS[inv.status]} className="capitalize text-xs">{STATUS_LABELS[inv.status]}</Badge>
                        </td>
                        <td className="p-3 hidden lg:table-cell">
                          {inv.viewedAt ? (
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
            {historyLoading ? (
              <div className="text-center py-16 text-muted-foreground">Loading history…</div>
            ) : historyInvoices.length === 0 ? (
              <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
                <History className="w-16 h-16 text-muted-foreground/30" />
                <div>
                  <p className="font-medium text-lg">No paid invoices yet</p>
                  <p className="text-muted-foreground text-sm">Fully settled invoices will appear here ordered by completion date.</p>
                </div>
              </CardContent></Card>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left p-3 font-medium">Invoice #</th>
                      <th className="text-left p-3 font-medium hidden sm:table-cell">Customer</th>
                      <th className="text-left p-3 font-medium hidden md:table-cell">Completed Date</th>
                      <th className="text-left p-3 font-medium hidden lg:table-cell">Payment Method</th>
                      <th className="text-right p-3 font-medium">Total Paid</th>
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
                        <tr key={inv.id} className="bg-background hover:bg-muted/30 transition-colors">
                          <td className="p-3">
                            <span className="font-mono font-medium text-xs">{inv.invoiceNumber}</span>
                          </td>
                          <td className="p-3 hidden sm:table-cell">
                            {inv.customerName ?? <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="p-3 hidden md:table-cell text-muted-foreground text-xs">
                            {inv.paidAt
                              ? new Date(inv.paidAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                              : <span>—</span>}
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
                                onClick={() => downloadInvoicePDF(inv)}
                              >
                                <Download className="w-3 h-3" />
                                <span className="hidden sm:inline">PDF</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[11px] font-medium gap-1"
                                title="View audit log"
                                onClick={() => openDetail(inv)}
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
                    {historyInvoices.length} fully paid invoice{historyInvoices.length !== 1 ? "s" : ""} · sorted by completion date, newest first
                  </span>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] gap-1" onClick={() => void refetchHistory()}>
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
                      onClick={() => {
                        const bizName = merchant?.businessName ?? "Your Business";
                        setEmailDialog({ open: true, invoiceId: detailInvoice.id });
                        setEmailAddr(detailInvoice.customerEmail ?? "");
                        setEmailSubject(`Invoice ${detailInvoice.invoiceNumber} from ${bizName}`);
                      }}>
                      <Mail className="w-3.5 h-3.5" /> Email
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5"
                      onClick={() => toast.info("SMS receipts require an SMS integration in Management → Integrations")}>
                      <MessageSquare className="w-3.5 h-3.5" /> SMS
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5"
                      onClick={() => { void downloadInvoicePDF(detailInvoice); void recordEvent(detailInvoice.id, "download"); }}>
                      <Download className="w-3.5 h-3.5" /> PDF
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5"
                      onClick={() => { void printInvoice(detailInvoice); void recordEvent(detailInvoice.id, "print"); }}>
                      <Printer className="w-3.5 h-3.5" /> Print
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

                {detailInvoice.notes && (
                  <div className="rounded-lg bg-muted/40 border px-4 py-3 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground mb-1 text-xs uppercase tracking-wide">Notes</p>
                    <p className="whitespace-pre-line">{detailInvoice.notes}</p>
                  </div>
                )}

                {/* Activity history */}
                {detailInvoice.events && detailInvoice.events.length > 0 && (
                  <div className="space-y-2 text-sm">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Activity</p>
                    <div className="space-y-1.5">
                      {[...detailInvoice.events].reverse().map((ev, i) => (
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
                      onClick={() => payAtTerminal(detailInvoice)}>
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

      {/* ─── Email Dialog ─── */}
      <Dialog open={emailDialog.open} onOpenChange={(o) => setEmailDialog({ open: o, invoiceId: emailDialog.invoiceId })}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Email Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input
                type="email"
                placeholder="customer@example.com"
                value={emailAddr}
                onChange={(e) => setEmailAddr(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Subject</Label>
              <Input
                type="text"
                placeholder="Invoice subject…"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSendEmail(); }}
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground rounded-md bg-muted/50 px-3 py-2">
              <Paperclip className="w-3 h-3 shrink-0" />
              <span>A PDF copy of the invoice will be attached</span>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEmailDialog({ open: false, invoiceId: null })}>Cancel</Button>
              <Button onClick={handleSendEmail} disabled={sendingEmail || !emailAddr.trim()}>
                {sendingEmail ? "Sending…" : <><Mail className="w-3.5 h-3.5 mr-1.5" /> Send Invoice</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                  <div
                    key={i}
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
                          {filteredProducts(lineSearch[i] ?? "").length === 0 ? (
                            <p className="px-3 py-3 text-xs text-muted-foreground text-center">No products found</p>
                          ) : filteredProducts(lineSearch[i] ?? "").map((p) => (
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
                      className={`px-2.5 py-1.5 flex items-center justify-center transition-colors ${discount.type === "fixed" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                    >
                      $
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscount((d) => ({ ...d, type: "percent" }))}
                      className={`px-2.5 py-1.5 flex items-center justify-center transition-colors ${discount.type === "percent" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
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
                  <div
                    key={i}
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
                          {filteredProducts(editLineSearch[i] ?? "").length === 0 ? (
                            <p className="px-3 py-3 text-xs text-muted-foreground text-center">No products found</p>
                          ) : filteredProducts(editLineSearch[i] ?? "").map((p) => (
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
                      className={`px-2.5 py-1.5 flex items-center justify-center transition-colors ${editDiscount.type === "fixed" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                    >
                      $
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditDiscount((d) => ({ ...d, type: "percent" }))}
                      className={`px-2.5 py-1.5 flex items-center justify-center transition-colors ${editDiscount.type === "percent" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
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

          </div>

          <div className="px-6 py-4 border-t shrink-0 flex justify-end gap-2 bg-background">
            <Button variant="outline" onClick={() => { if (isEditDirty) { setDiscardConfirmTarget("edit"); return; } setEditOpen(false); }}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={editSaving || hasEditLineErrors}>
              {editSaving ? "Saving…" : editRecurring.enabled ? "Save Recurring Invoice" : "Save Changes"}
            </Button>
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

    </AppLayout>
  );
}
