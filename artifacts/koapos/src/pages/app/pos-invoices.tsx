import { useState, useEffect, useRef } from "react";
import jsPDF from "jspdf";
import { AppLayout } from "@/components/layout/app-layout";
import { useListProducts, useGetMerchant } from "@workspace/api-client-react";
import { useBusinessProfile } from "@/lib/business-profile";
import { CustomerSearchInput } from "@/components/customers/CustomerSearchInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  DEFAULT_OPTS as TPL_DEFAULT_OPTS,
  resolveCode,
  ACTIVE_STORAGE_KEY,
  type TplOpts,
} from "@/pages/app/management-templates";
import {
  Plus, FileText, Search, Trash2, CheckCircle2, Send, RefreshCw, Package,
  Eye, EyeOff, Mail, MessageSquare, Printer, X, ExternalLink, Clock, Download, Pencil,
} from "lucide-react";
import { toast } from "sonner";

/* ── Types ───────────────────────────────────────────────────────────────── */

type InvStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";
type LineItem = { description: string; quantity: number; unitPrice: number; taxRate: number };
type InvoiceEvent = { type: string; timestamp: string; detail?: string };
type Invoice = {
  id: number;
  invoiceNumber: string;
  customerId: number | null;
  customerName: string | null;
  customerEmail: string | null;
  status: InvStatus;
  subtotal: number;
  taxTotal: number;
  total: number;
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
  createdAt: string;
};

/* ── Constants ───────────────────────────────────────────────────────────── */

const STATUS_COLORS: Record<InvStatus, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary", sent: "outline", paid: "default", overdue: "destructive", cancelled: "secondary",
};

const STATUS_LABELS: Record<InvStatus, string> = {
  draft: "Draft", sent: "Sent", paid: "Paid", overdue: "Overdue", cancelled: "Cancelled",
};

const FREQ_LABELS = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };

const API = "/api/invoices";

/* ── Prefix settings from localStorage ──────────────────────────────────── */

function getInvoicePrefix(): { invoicePrefix: string; invoiceDigits: number } {
  try {
    const raw = localStorage.getItem("koapos_code_prefixes");
    if (raw) {
      const parsed = JSON.parse(raw) as { invoicePrefix?: string; invoiceDigits?: number };
      return {
        invoicePrefix: parsed.invoicePrefix ?? "KI",
        invoiceDigits: parsed.invoiceDigits ?? 5,
      };
    }
  } catch { /* ignore */ }
  return { invoicePrefix: "KI", invoiceDigits: 5 };
}

/* ── Main page ───────────────────────────────────────────────────────────── */

export default function POSInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({ customerId: "", dueDate: "", notes: "" });
  const [lines, setLines] = useState<LineItem[]>([{ description: "", quantity: 1, unitPrice: 0, taxRate: 10 }]);
  const [saving, setSaving] = useState(false);
  const [emailDialog, setEmailDialog] = useState<{ open: boolean; invoiceId: number | null }>({ open: false, invoiceId: null });
  const [emailAddr, setEmailAddr] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [editForm, setEditForm] = useState({ customerId: "", dueDate: "", notes: "" });
  const [editLines, setEditLines] = useState<LineItem[]>([{ description: "", quantity: 1, unitPrice: 0, taxRate: 10 }]);
  const [editLineSearch, setEditLineSearch] = useState<string[]>([""]);
  const [editLineDropOpen, setEditLineDropOpen] = useState<boolean[]>([false]);
  const [editSaving, setEditSaving] = useState(false);
  const [editRecurring, setEditRecurring] = useState({
    enabled: false,
    frequency: "monthly" as "daily" | "weekly" | "monthly" | "yearly",
    startDate: "",
    occurrences: 1,
  });

  const lineDropRefs = useRef<(HTMLDivElement | null)[]>([]);
  const editLineDropRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [lineSearch, setLineSearch] = useState<string[]>([""]);
  const [lineDropOpen, setLineDropOpen] = useState<boolean[]>([false]);

  const [recurring, setRecurring] = useState({
    enabled: false,
    frequency: "monthly" as "daily" | "weekly" | "monthly" | "yearly",
    startDate: "",
    occurrences: 1,
  });

  const { data: productsData } = useListProducts({ limit: 500 });
  const allProducts = productsData?.items ?? [];
  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const { profile } = useBusinessProfile();

  /* ── Data loading ── */
  const load = async () => {
    setLoading(true);
    const q = statusFilter !== "all" ? `?status=${statusFilter}` : "";
    const res = await fetch(`${API}${q}`, { credentials: "include" });
    if (res.ok) setInvoices((await res.json()).items);
    setLoading(false);
  };

  useEffect(() => { load(); }, [statusFilter]);

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
    setLines((p) => [...p, { description: "", quantity: 1, unitPrice: 0, taxRate: 10 }]);
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
  const selectProduct = (i: number, product: { name: string; price?: number | null }) => {
    setLines((p) => p.map((l, idx) => idx === i ? { ...l, description: product.name, unitPrice: product.price ?? 0, taxRate: 10 } : l));
    setLineSearch((p) => { const n = [...p]; n[i] = ""; return n; });
    setLineDropOpen((p) => { const n = [...p]; n[i] = false; return n; });
  };
  const filteredProducts = (q: string) =>
    !q.trim() ? allProducts.slice(0, 8) : allProducts.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8);

  // Prices are GST-inclusive (Australian standard): extract tax from the total
  const invTotal  = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const taxTotal  = lines.reduce((s, l) => s + l.quantity * l.unitPrice * (l.taxRate / (100 + l.taxRate)), 0);
  const subtotal  = invTotal - taxTotal;

  /* ── Edit line helpers ── */
  const addEditLine = () => {
    setEditLines((p) => [...p, { description: "", quantity: 1, unitPrice: 0, taxRate: 10 }]);
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
  const selectEditProduct = (i: number, product: { name: string; price?: number | null }) => {
    setEditLines((p) => p.map((l, idx) => idx === i ? { ...l, description: product.name, unitPrice: product.price ?? 0, taxRate: 10 } : l));
    setEditLineSearch((p) => { const n = [...p]; n[i] = ""; return n; });
    setEditLineDropOpen((p) => { const n = [...p]; n[i] = false; return n; });
  };

  const editInvTotal  = editLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const editTaxTotal  = editLines.reduce((s, l) => s + l.quantity * l.unitPrice * (l.taxRate / (100 + l.taxRate)), 0);
  const editSubtotal  = editInvTotal - editTaxTotal;

  /* ── Open edit dialog ── */
  const openEdit = (inv: Invoice) => {
    setEditingInvoice(inv);
    setEditForm({
      customerId: String(inv.customerId ?? ""),
      dueDate: inv.dueDate ? inv.dueDate.slice(0, 10) : "",
      notes: inv.notes ?? "",
    });
    setEditRecurring({
      enabled: inv.isRecurring ?? false,
      frequency: (inv.recurringFrequency as "daily" | "weekly" | "monthly" | "yearly") ?? "monthly",
      startDate: inv.recurringStartDate ? inv.recurringStartDate.slice(0, 10) : "",
      occurrences: inv.recurringOccurrences ?? 1,
    });
    const items = inv.items?.length ? inv.items : [{ description: "", quantity: 1, unitPrice: 0, taxRate: 10 }];
    setEditLines(items);
    setEditLineSearch(items.map(() => ""));
    setEditLineDropOpen(items.map(() => false));
    setEditOpen(true);
  };

  /* ── Save edits ── */
  const handleUpdate = async () => {
    if (!editingInvoice) return;
    const validLines = editLines.filter((l) => l.description.trim());
    if (!validLines.length) { toast.error("Add at least one line item"); return; }
    setEditSaving(true);
    const res = await fetch(`${API}/${editingInvoice.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        customerId: editForm.customerId ? parseInt(editForm.customerId) : null,
        dueDate: editForm.dueDate || null,
        notes: editForm.notes || null,
        items: validLines,
        recurring: {
          enabled: editRecurring.enabled,
          frequency: editRecurring.frequency,
          startDate: editRecurring.startDate || null,
          occurrences: editRecurring.occurrences,
        },
      }),
    });
    setEditSaving(false);
    if (!res.ok) { toast.error("Failed to update invoice"); return; }
    const updated = await res.json() as Invoice;
    setInvoices((prev) => prev.map((i) => i.id === updated.id ? updated : i));
    if (detailInvoice?.id === updated.id) setDetailInvoice(updated);
    toast.success("Invoice updated");
    setEditOpen(false);
  };

  /* ── Reset create dialog ── */
  const resetCreate = () => {
    setForm({ customerId: "", dueDate: "", notes: "" });
    setLines([{ description: "", quantity: 1, unitPrice: 0, taxRate: 10 }]);
    setLineSearch([""]);
    setLineDropOpen([false]);
    setRecurring({ enabled: false, frequency: "monthly", startDate: "", occurrences: 1 });
  };

  /* ── Create invoice ── */
  const handleSave = async () => {
    const validLines = lines.filter((l) => l.description.trim());
    if (!validLines.length) { toast.error("Add at least one line item"); return; }
    setSaving(true);
    const prefixSettings = getInvoicePrefix();
    const body = {
      customerId: form.customerId ? parseInt(form.customerId) : null,
      dueDate: form.dueDate || null,
      notes: form.notes || null,
      items: validLines,
      invoicePrefix: prefixSettings.invoicePrefix,
      invoiceDigits: prefixSettings.invoiceDigits,
      ...(recurring.enabled && {
        recurring: {
          frequency: recurring.frequency,
          startDate: recurring.startDate || null,
          occurrences: recurring.occurrences,
        },
      }),
    };
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) { toast.error("Failed to create invoice"); return; }
    toast.success(recurring.enabled ? "Recurring invoice created" : "Invoice created");
    setCreateOpen(false);
    resetCreate();
    load();
  };

  /* ── Record a client-side event (download, print) ── */
  const recordEvent = async (invoiceId: number, type: string, detail?: string) => {
    const res = await fetch(`${API}/${invoiceId}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ type, detail }),
    });
    if (res.ok) {
      const updated = await res.json() as Invoice;
      setInvoices((prev) => prev.map((i) => i.id === invoiceId ? updated : i));
      setDetailInvoice((d) => d?.id === invoiceId ? updated : d);
    }
  };

  /* ── Row click: open detail + mark viewed ── */
  const openDetail = async (inv: Invoice) => {
    setDetailInvoice(inv);
    if (!inv.viewedAt) {
      const res = await fetch(`${API}/${inv.id}/viewed`, { method: "PATCH", credentials: "include" });
      if (res.ok) {
        const updated = await res.json() as Invoice;
        setInvoices((prev) => prev.map((i) => i.id === inv.id ? updated : i));
        setDetailInvoice(updated);
      }
    }
  };

  /* ── Status update ── */
  const updateStatus = async (id: number, status: string) => {
    const res = await fetch(`${API}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json() as Invoice;
      setInvoices((prev) => prev.map((i) => i.id === id ? updated : i));
      if (detailInvoice?.id === id) setDetailInvoice(updated);
      toast.success(`Marked as ${status}`);
    }
  };

  /* ── Delete ── */
  const deleteInvoice = async (id: number) => {
    await fetch(`${API}/${id}`, { method: "DELETE", credentials: "include" });
    setInvoices((prev) => prev.filter((i) => i.id !== id));
    if (detailInvoice?.id === id) setDetailInvoice(null);
    toast.success("Invoice deleted");
  };

  /* ── Send email ── */
  const handleSendEmail = async () => {
    if (!emailDialog.invoiceId || !emailAddr.trim()) return;
    setSendingEmail(true);
    const invId = emailDialog.invoiceId;
    const res = await fetch(`${API}/${invId}/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: emailAddr }),
    });
    setSendingEmail(false);
    if (res.ok) {
      toast.success("Invoice emailed");
      setEmailDialog({ open: false, invoiceId: null });
      setEmailAddr("");
      // Refresh the invoice so the activity log updates
      const refreshRes = await fetch(`${API}/${invId}`, { credentials: "include" });
      if (refreshRes.ok) {
        const updated = await refreshRes.json() as Invoice;
        setInvoices((prev) => prev.map((i) => i.id === invId ? updated : i));
        if (detailInvoice?.id === invId) setDetailInvoice(updated);
      }
      load();
    } else {
      const err = await res.json() as { error?: string };
      toast.error(err.error ?? "Failed to send email");
    }
  };

  /* ── Helpers ── */
  function getInvoiceTemplateOpts(): TplOpts {
    try {
      const active = JSON.parse(localStorage.getItem(ACTIVE_STORAGE_KEY) ?? "{}") as Record<string, string>;
      const tplId  = active.invoices ?? "i-pro";
      const stored = JSON.parse(localStorage.getItem(`koapos_tpl_opts_${tplId}`) ?? "{}") as Partial<TplOpts>;
      return { ...TPL_DEFAULT_OPTS, ...stored };
    } catch {
      return { ...TPL_DEFAULT_OPTS };
    }
  }

  const resolveStr = (text: string, biz: string, abn: string, web: string, em: string) =>
    resolveCode(text || "", biz, abn, web, em);

  /* ── Print ── */
  const printInvoice = (inv: Invoice) => {
    const opts   = getInvoiceTemplateOpts();
    const bizName = merchant?.businessName ?? "Your Business";
    const abn     = profile.abn ?? "";
    const website = profile.website ?? "";
    const address = [profile.state, profile.postcode].filter(Boolean).join(" ");
    const email   = profile.contactEmail ?? "";
    const tagline = profile.tagline ?? "";
    const brandColor = profile.brandColors?.[0] ?? "#4f46e5";
    const socials = profile.socialLinks;
    const paymentTypes = profile.paymentTypes ?? ["Cash", "EFTPOS", "Mastercard", "Visa"];

    const termsText    = resolveStr(opts.paymentTerms, bizName, abn, website, email);
    const notesText    = resolveStr(opts.invoiceNotes, bizName, abn, website, email);
    const footerText   = resolveStr(opts.footerText, bizName, abn, website, email);

    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;

    const rows = (inv.items ?? []).map((l) => `
      <tr>
        <td>${l.description}</td>
        <td style="text-align:center">${l.quantity}</td>
        <td style="text-align:right">$${l.unitPrice.toFixed(2)}</td>
        <td style="text-align:right">$${(l.quantity * l.unitPrice * (l.taxRate / 100)).toFixed(2)}</td>
        <td style="text-align:right">$${(l.quantity * l.unitPrice).toFixed(2)}</td>
      </tr>`).join("");

    const hasCustomerDetails = inv.customerName || inv.customerEmail;
    const customerBlock = hasCustomerDetails ? `
      <div class="bill-to">
        <strong>${opts.showAllCustomerDetails ? "Customer" : "Bill To"}</strong>
        <div style="margin-top:4px">
          ${inv.customerName ? `<p>${inv.customerName}</p>` : ""}
          ${opts.showAllCustomerDetails && inv.customerEmail ? `<p style="color:#666">${inv.customerEmail}</p>` : ""}
        </div>
      </div>` : "";

    const paymentBlock = (opts.showPaymentMethods || opts.bankDetails) ? `
      <div class="payment-block">
        <div class="terms-title">${opts.paymentSectionHeading || "PAYMENT DETAILS"}</div>
        ${opts.showPaymentMethods ? `
          <div class="payment-methods">
            ${paymentTypes.map(m => `<span class="pm-badge">${m}</span>`).join("")}
          </div>` : ""}
        ${opts.bankDetails ? `<pre class="bank-details">${opts.bankDetails}</pre>` : ""}
      </div>` : "";

    const socialsBlock = opts.showSocialLinks && (socials?.facebook || socials?.instagram || socials?.twitter) ? `
      <div class="socials">
        ${socials.facebook ? `<span>fb/ ${socials.facebook}</span>` : ""}
        ${socials.instagram ? `<span>ig/ @${socials.instagram}</span>` : ""}
        ${socials.twitter ? `<span>x/ @${socials.twitter}</span>` : ""}
        ${socials.linkedin ? `<span>in/ ${socials.linkedin}</span>` : ""}
      </div>` : "";

    w.document.write(`<!DOCTYPE html><html><head>
      <title>Invoice ${inv.invoiceNumber}</title>
      <style>
        *{box-sizing:border-box}
        body{font-family:Arial,sans-serif;padding:40px;color:#222;max-width:720px;margin:0 auto}
        .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid ${brandColor};padding-bottom:16px;margin-bottom:24px}
        .logo-box{width:40px;height:40px;border-radius:6px;background:${brandColor};display:inline-block;margin-bottom:6px}
        .biz-name{font-size:20px;font-weight:700;margin:0}
        .biz-meta{font-size:12px;color:#666;margin-top:4px;line-height:1.6}
        .inv-title{font-size:28px;font-weight:800;color:${brandColor};text-align:right;margin:0}
        .inv-meta{font-size:13px;color:#666;text-align:right;margin-top:4px;line-height:1.7}
        .bill-to{background:#f7f7f7;border-radius:6px;padding:12px 16px;margin-bottom:20px;font-size:13px}
        .bill-to strong{display:block;margin-bottom:2px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888}
        table{width:100%;border-collapse:collapse;margin:0 0 16px}
        th{text-align:left;border-bottom:2px solid #ddd;padding:8px 6px;font-size:12px;color:#555;text-transform:uppercase;letter-spacing:.5px}
        td{padding:9px 6px;border-bottom:1px solid #eee;font-size:13px}
        .totals{margin-left:auto;width:240px;margin-top:4px}
        .totals .row{display:flex;justify-content:space-between;padding:4px 0;font-size:13px;color:#555}
        .totals .grand{font-weight:700;border-top:2px solid #ddd;padding-top:8px;margin-top:4px;font-size:16px;color:#111;display:flex;justify-content:space-between}
        .terms{margin-top:28px;padding:14px 16px;background:#f9f9f9;border-left:3px solid ${brandColor};border-radius:0 6px 6px 0;font-size:12px;color:#555;white-space:pre-wrap;line-height:1.7}
        .terms-title{font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:#888;margin-bottom:6px}
        .inv-notes{margin-top:12px;padding:12px 16px;background:#f9f9f9;border-radius:6px;font-size:12px;color:#555;white-space:pre-wrap;line-height:1.7}
        .footer{margin-top:32px;padding-top:12px;border-top:1px solid #eee;font-size:11px;color:#aaa;text-align:center}
        .payment-block{margin-top:20px;padding:14px 16px;background:#f9f9f9;border-radius:6px;font-size:12px;color:#555}
        .payment-methods{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
        .pm-badge{border:1px solid #ddd;border-radius:4px;padding:2px 8px;font-size:11px;color:#666;background:#fff}
        .bank-details{margin-top:6px;font-family:monospace;font-size:11px;white-space:pre-wrap;color:#666}
        .socials{display:flex;gap:12px;margin-top:8px;font-size:11px;color:#aaa}
        @media print{body{padding:20px}}
      </style>
    </head><body>
      <div class="header">
        <div>
          ${opts.showLogo ? `<div class="logo-box"></div>` : ""}
          <p class="biz-name">${bizName}</p>
          ${opts.showTagline && tagline ? `<p style="font-size:12px;color:#888;font-style:italic;margin:2px 0 0">${tagline}</p>` : ""}
          <div class="biz-meta">
            ${opts.showAbn && abn ? `ABN ${abn}<br>` : ""}
            ${address ? `${address}<br>` : ""}
            ${email ? `${email}<br>` : ""}
            ${opts.showWebsite && website ? `${website}` : ""}
          </div>
        </div>
        <div>
          <p class="inv-title">INVOICE</p>
          <div class="inv-meta">
            <strong>${inv.invoiceNumber}</strong><br>
            Date: ${formatDate(inv.createdAt)}<br>
            ${inv.dueDate ? `Due: ${formatDateOnly(inv.dueDate)}<br>` : ""}
            Status: ${STATUS_LABELS[inv.status]}
          </div>
        </div>
      </div>
      ${customerBlock}
      <table>
        <thead><tr>
          <th>Description</th>
          <th style="text-align:center">Qty</th>
          <th style="text-align:right">Unit Price</th>
          <th style="text-align:right">Tax</th>
          <th style="text-align:right">Amount</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="totals">
        <div class="row"><span>Subtotal</span><span>$${inv.subtotal.toFixed(2)}</span></div>
        ${opts.showGstBreakdown ? `<div class="row"><span>GST (10%)</span><span>$${inv.taxTotal.toFixed(2)}</span></div>` : ""}
        <div class="grand"><span>Total Due (AUD)</span><span>$${inv.total.toFixed(2)}</span></div>
      </div>
      ${paymentBlock}
      ${termsText || notesText ? `
        <div class="terms">
          <div class="terms-title">Terms</div>
          ${termsText ? `<div>${termsText}</div>` : ""}
          ${notesText ? `<div style="margin-top:8px">${notesText}</div>` : ""}
        </div>` : ""}
      ${inv.notes ? `<div class="inv-notes"><div class="terms-title" style="margin-bottom:6px">Notes</div>${inv.notes}</div>` : ""}
      ${socialsBlock}
      ${footerText ? `<div class="footer">${footerText}</div>` : ""}
    </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 300);
  };

  const downloadInvoicePDF = (inv: Invoice) => {
    const opts    = getInvoiceTemplateOpts();
    const bizName = merchant?.businessName ?? "Your Business";
    const abn     = profile.abn ?? "";
    const website = profile.website ?? "";
    const address = [profile.state, profile.postcode].filter(Boolean).join(" ");
    const email   = profile.contactEmail ?? "";
    const tagline = profile.tagline ?? "";
    const rawColor = profile.brandColors?.[0] ?? "#4f46e5";
    const socials = profile.socialLinks;
    const paymentTypes = profile.paymentTypes ?? ["Cash", "EFTPOS", "Mastercard", "Visa"];

    const termsText  = resolveStr(opts.paymentTerms, bizName, abn, website, email);
    const notesText  = resolveStr(opts.invoiceNotes, bizName, abn, website, email);
    const footerText = resolveStr(opts.footerText, bizName, abn, website, email);

    const hexToRgb = (hex: string): [number, number, number] => {
      const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return r ? [parseInt(r[1], 16), parseInt(r[2], 16), parseInt(r[3], 16)] : [79, 70, 229];
    };
    const [cr, cg, cb] = hexToRgb(rawColor);

    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const W = 210, ML = 20, MR = 20, CW = W - ML - MR;
    let y = 22;

    /* ── Header ── */
    if (opts.showLogo) {
      doc.setFillColor(cr, cg, cb);
      doc.roundedRect(ML, y, 8, 8, 1.5, 1.5, "F");
    }
    const bizY = opts.showLogo ? y + 11 : y;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
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
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    const metaLines: string[] = [];
    if (opts.showAbn && abn)          metaLines.push(`ABN ${abn}`);
    if (address)                      metaLines.push(address);
    if (email)                        metaLines.push(email);
    if (opts.showWebsite && website)   metaLines.push(website);
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

    /* ── Customer ── */
    if (inv.customerName) {
      const custHeight = opts.showAllCustomerDetails && inv.customerEmail ? 20 : 14;
      doc.setFillColor(247, 247, 247);
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.rect(ML, y - 3, CW, custHeight, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(opts.showAllCustomerDetails ? "CUSTOMER" : "BILL TO", ML + 4, y + 2);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(30, 30, 30);
      doc.text(inv.customerName, ML + 4, y + 7);
      if (opts.showAllCustomerDetails && inv.customerEmail) {
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text(inv.customerEmail, ML + 4, y + 12);
      }
      y += custHeight + 6;
    }

    /* ── Line items table ── */
    const COL = { desc: 78, qty: 18, unit: 30, tax: 24, amt: 20 };
    doc.setFillColor(245, 245, 245);
    doc.rect(ML, y - 3, CW, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(80, 80, 80);
    let cx = ML + 2;
    doc.text("DESCRIPTION", cx, y + 2);        cx += COL.desc;
    doc.text("QTY",  cx + COL.qty / 2, y + 2, { align: "center" }); cx += COL.qty;
    doc.text("UNIT PRICE", cx + COL.unit, y + 2, { align: "right" }); cx += COL.unit;
    doc.text("TAX",  cx + COL.tax,  y + 2, { align: "right" }); cx += COL.tax;
    doc.text("AMOUNT", cx + COL.amt, y + 2, { align: "right" });
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
      const desc = item.description.length > 42 ? item.description.slice(0, 40) + "…" : item.description;
      doc.text(desc, cx, y + 1);                               cx += COL.desc;
      doc.setTextColor(80, 80, 80);
      doc.text(String(item.quantity), cx + COL.qty / 2, y + 1, { align: "center" }); cx += COL.qty;
      doc.text(`$${item.unitPrice.toFixed(2)}`, cx + COL.unit, y + 1, { align: "right" }); cx += COL.unit;
      const tax = item.quantity * item.unitPrice * (item.taxRate / 100);
      doc.text(`$${tax.toFixed(2)}`, cx + COL.tax, y + 1, { align: "right" }); cx += COL.tax;
      doc.setTextColor(30, 30, 30);
      doc.text(`$${(item.quantity * item.unitPrice).toFixed(2)}`, cx + COL.amt, y + 1, { align: "right" });
      doc.setDrawColor(235, 235, 235);
      doc.setLineWidth(0.2);
      doc.line(ML, y + 4, W - MR, y + 4);
      y += 9;
    });
    y += 5;

    /* ── Totals ── */
    const totX = W - MR - 62;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text("Subtotal",  totX + 2, y); doc.text(`$${inv.subtotal.toFixed(2)}`, W - MR, y, { align: "right" }); y += 6;
    if (opts.showGstBreakdown) {
      doc.text("GST (10%)", totX + 2, y); doc.text(`$${inv.taxTotal.toFixed(2)}`, W - MR, y, { align: "right" }); y += 6;
    }
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(totX, y - 2, W - MR, y - 2);
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30, 30, 30);
    doc.text("Total Due (AUD)", totX + 2, y); doc.text(`$${inv.total.toFixed(2)}`, W - MR, y, { align: "right" });
    y += 12;

    /* ── Payment block ── */
    if (opts.showPaymentMethods || opts.bankDetails) {
      const blockH = 8 + (opts.showPaymentMethods ? 6 : 0) + (opts.bankDetails ? 14 : 0);
      doc.setFillColor(249, 249, 249);
      doc.setDrawColor(220, 220, 220);
      doc.rect(ML, y, CW, blockH, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(130, 130, 130);
      doc.text((opts.paymentSectionHeading || "PAYMENT DETAILS").toUpperCase(), ML + 4, y + 4.5);
      let py = y + 9;
      if (opts.showPaymentMethods) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(80, 80, 80);
        const pmText = paymentTypes.join("  ·  ");
        doc.text(pmText, ML + 4, py);
        py += 6;
      }
      if (opts.bankDetails) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(80, 80, 80);
        const bankLines = opts.bankDetails.split("\n");
        bankLines.forEach((ln) => { doc.text(ln, ML + 4, py); py += 4.5; });
      }
      y += blockH + 4;
    }

    /* ── Terms ── */
    if (termsText || notesText) {
      const termsH = 8 + (termsText ? 8 : 0) + (notesText ? 8 : 0);
      doc.setFillColor(cr, cg, cb);
      doc.rect(ML, y, 1.5, termsH, "F");
      doc.setFillColor(249, 249, 249);
      doc.rect(ML + 1.5, y, CW - 1.5, termsH, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(130, 130, 130);
      doc.text("TERMS", ML + 5, y + 4.5);
      let ty = y + 9;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      if (termsText) { doc.text(termsText, ML + 5, ty, { maxWidth: CW - 10 }); ty += 8; }
      if (notesText) { doc.setFont("helvetica", "italic"); doc.text(notesText, ML + 5, ty, { maxWidth: CW - 10 }); ty += 8; }
      y += termsH + 4;
    }

    /* ── Invoice notes ── */
    if (inv.notes) {
      doc.setFillColor(249, 249, 249);
      doc.rect(ML, y, CW, 14, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(130, 130, 130);
      doc.text("NOTES", ML + 4, y + 4.5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      doc.text(inv.notes, ML + 4, y + 10, { maxWidth: CW - 8 });
      y += 18;
    }

    /* ── Socials ── */
    if (opts.showSocialLinks && (socials?.facebook || socials?.instagram || socials?.twitter || socials?.linkedin)) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(160, 160, 160);
      const socParts: string[] = [];
      if (socials.facebook)  socParts.push(`fb/ ${socials.facebook}`);
      if (socials.instagram) socParts.push(`ig/ @${socials.instagram}`);
      if (socials.twitter)   socParts.push(`x/ @${socials.twitter}`);
      if (socials.linkedin)  socParts.push(`in/ ${socials.linkedin}`);
      doc.text(socParts.join("    "), ML, y);
      y += 6;
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

    doc.save(`${inv.invoiceNumber}.pdf`);
  };

  const filtered = invoices.filter((inv) =>
    !search ||
    inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
    (inv.customerName ?? "").toLowerCase().includes(search.toLowerCase())
  );

  /* ── Render ── */
  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">

        {/* Header */}
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

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by number or customer..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(["draft","sent","paid","overdue","cancelled"] as InvStatus[]).map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-16 text-muted-foreground">Loading invoices…</div>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <FileText className="w-16 h-16 text-muted-foreground/30" />
            <div><p className="font-medium text-lg">No invoices yet</p><p className="text-muted-foreground text-sm">Create invoices to send to customers.</p></div>
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
                {filtered.map((inv) => (
                  <tr
                    key={inv.id}
                    className="bg-background hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => openDetail(inv)}
                  >
                    <td className="p-3">
                      <span className="font-mono font-medium text-xs">{inv.invoiceNumber}</span>
                      {inv.isRecurring && inv.nextSendDate && (
                        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-blue-600 font-medium">
                          <RefreshCw className="w-2.5 h-2.5" />
                          Next {formatDateOnly(inv.nextSendDate)}
                        </div>
                      )}
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
                          <Eye className="w-3.5 h-3.5 text-green-500" />
                          {formatDate(inv.viewedAt)}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <EyeOff className="w-3.5 h-3.5" />
                          Not viewed
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right font-medium">{formatCurrency(inv.total)}</td>
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {inv.status === "draft" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Mark as sent"
                            onClick={(e) => { e.stopPropagation(); updateStatus(inv.id, "sent"); }}>
                            <Send className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {inv.status === "sent" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" title="Mark as paid"
                            onClick={(e) => { e.stopPropagation(); updateStatus(inv.id, "paid"); }}>
                            💵
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(inv.id); }}>
                          <Trash2 className="w-3.5 h-3.5" />
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

      {/* ─── Invoice Detail Dialog ─── */}
      <Dialog open={!!detailInvoice} onOpenChange={(o) => { if (!o) setDetailInvoice(null); }}>
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
                      onClick={() => { setEmailDialog({ open: true, invoiceId: detailInvoice.id }); setEmailAddr(detailInvoice.customerEmail ?? ""); }}>
                      <Mail className="w-3.5 h-3.5" /> Email
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5"
                      onClick={() => toast.info("SMS receipts require an SMS integration in Management → Integrations")}>
                      <MessageSquare className="w-3.5 h-3.5" /> SMS
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5"
                      onClick={() => { downloadInvoicePDF(detailInvoice); void recordEvent(detailInvoice.id, "download"); }}>
                      <Download className="w-3.5 h-3.5" /> Download PDF
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5"
                      onClick={() => { printInvoice(detailInvoice); void recordEvent(detailInvoice.id, "print"); }}>
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
                    <div className="flex justify-between font-semibold border-t pt-1.5 text-base">
                      <span>Total</span><span>{formatCurrency(detailInvoice.total)}</span>
                    </div>
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
                  {(detailInvoice.status === "draft" || detailInvoice.status === "sent" || detailInvoice.status === "overdue") && (
                    <Button size="sm" variant="outline" className="gap-1.5 text-green-600 border-green-200 hover:bg-green-50"
                      onClick={() => updateStatus(detailInvoice.id, "paid")}>
                      💵 Mark as Paid
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
                <Button variant="outline" size="sm" onClick={() => setDetailInvoice(null)}>Close</Button>
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
              <Label>Recipient Email</Label>
              <Input
                type="email"
                placeholder="customer@example.com"
                value={emailAddr}
                onChange={(e) => setEmailAddr(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSendEmail(); }}
              />
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
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) resetCreate(); setCreateOpen(o); }}>
        <DialogContent className="max-w-2xl flex flex-col p-0 gap-0 max-h-[90vh]">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle>New Invoice</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

            {/* Customer + Due Date */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Customer (optional)</Label>
                <CustomerSearchInput
                  value={form.customerId}
                  onChange={(id) => setForm({ ...form, customerId: id })}
                  allowNone
                  placeholder="Walk-in customer"
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
              <div className="grid grid-cols-[1fr_56px_88px_60px_32px] gap-1.5 px-1 text-xs font-medium text-muted-foreground">
                <span>Description</span>
                <span className="text-center">Qty</span>
                <span className="text-right">Price</span>
                <span className="text-right">Tax%</span>
                <span />
              </div>
              <div className="space-y-1.5">
                {lines.map((line, i) => (
                  <div key={i} className="grid grid-cols-[1fr_56px_88px_60px_32px] gap-1.5 items-start">
                    <div className="relative" ref={(el) => { lineDropRefs.current[i] = el; }}>
                      <div className="relative">
                        <Package className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                        <Input
                          value={(lineSearch[i] ?? "") !== "" ? lineSearch[i] : line.description}
                          placeholder="Search or type description..."
                          className="h-8 text-sm pl-6"
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
                    </div>
                    <Input type="number" min={1} value={line.quantity}
                      onChange={(e) => updateLine(i, "quantity", parseFloat(e.target.value) || 1)}
                      className="h-8 text-sm text-center" />
                    <Input type="number" step="0.01" value={line.unitPrice || ""}
                      onChange={(e) => updateLine(i, "unitPrice", parseFloat(e.target.value) || 0)}
                      placeholder="0.00" className="h-8 text-sm text-right" />
                    <Input type="number" min={0} max={100} value={line.taxRate}
                      onChange={(e) => updateLine(i, "taxRate", parseFloat(e.target.value) || 0)}
                      className="h-8 text-sm text-right" />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                      onClick={() => removeLine(i)} disabled={lines.length === 1}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-52 space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal (ex-GST)</span><span>{formatCurrency(subtotal)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>GST included</span><span>{formatCurrency(taxTotal)}</span></div>
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
            <Button variant="outline" onClick={() => { setCreateOpen(false); resetCreate(); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Creating…" : recurring.enabled ? "Create Recurring Invoice" : "Create Invoice"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Invoice Dialog ─── */}
      <Dialog open={editOpen} onOpenChange={(o) => { if (!o) setEditOpen(false); }}>
        <DialogContent className="max-w-2xl flex flex-col p-0 gap-0 max-h-[90vh]">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle>Edit Invoice {editingInvoice?.invoiceNumber}</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

            {/* Customer + Due Date */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Customer (optional)</Label>
                <CustomerSearchInput
                  value={editForm.customerId}
                  onChange={(id) => setEditForm({ ...editForm, customerId: id })}
                  allowNone
                  placeholder="Walk-in customer"
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
              <div className="grid grid-cols-[1fr_56px_88px_60px_32px] gap-1.5 px-1 text-xs font-medium text-muted-foreground">
                <span>Description</span>
                <span className="text-center">Qty</span>
                <span className="text-right">Price</span>
                <span className="text-right">Tax%</span>
                <span />
              </div>
              <div className="space-y-1.5">
                {editLines.map((line, i) => (
                  <div key={i} className="grid grid-cols-[1fr_56px_88px_60px_32px] gap-1.5 items-start">
                    <div className="relative" ref={(el) => { editLineDropRefs.current[i] = el; }}>
                      <div className="relative">
                        <Package className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                        <Input
                          value={editLineSearch[i] !== undefined && editLineSearch[i] !== "" ? editLineSearch[i] : line.description}
                          placeholder="Search or type description..."
                          className="h-8 text-sm pl-6"
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
                    </div>
                    <Input type="number" min={1} value={line.quantity}
                      onChange={(e) => updateEditLine(i, "quantity", parseFloat(e.target.value) || 1)}
                      className="h-8 text-sm text-center" />
                    <Input type="number" step="0.01" value={line.unitPrice || ""}
                      onChange={(e) => updateEditLine(i, "unitPrice", parseFloat(e.target.value) || 0)}
                      placeholder="0.00" className="h-8 text-sm text-right" />
                    <Input type="number" min={0} max={100} value={line.taxRate}
                      onChange={(e) => updateEditLine(i, "taxRate", parseFloat(e.target.value) || 0)}
                      className="h-8 text-sm text-right" />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                      onClick={() => removeEditLine(i)} disabled={editLines.length === 1}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-52 space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground"><span>Subtotal (ex-GST)</span><span>{formatCurrency(editSubtotal)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>GST included</span><span>{formatCurrency(editTaxTotal)}</span></div>
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
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={editSaving}>
              {editSaving ? "Saving…" : editRecurring.enabled ? "Save Recurring Invoice" : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </AppLayout>
  );
}
