import { useState, useCallback, useRef, useEffect } from "react";
import { useCustomerSettings } from "@/lib/customer-settings";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useGetMerchant,
  useListCustomers,
  useUpdateCustomer,
  useDeleteCustomer,
  useGetCustomerHistory,
  useListCustomerNotes,
  useCreateCustomerNote,
  useDeleteCustomerNote,
  useListCustomerFiles,
  useCreateCustomerFile,
  useDeleteCustomerFile,
  useRequestUploadUrl,
  useGetLoyaltySettings,
  getListCustomersQueryKey,
  Customer,
  CustomerNote,
  CustomerFile,
} from "@workspace/api-client-react";
import { AddCustomerWizard } from "@/components/customers/AddCustomerWizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatCurrency } from "@/lib/utils";
import {
  Search, Plus, Pencil, Trash2, Users, Star, CheckCircle2, User, MapPin,
  Settings2, AlertTriangle, ChevronUp, ChevronDown, ChevronsUpDown,
  Mail, Phone, Building2, StickyNote, Calendar, Hash, Upload, FileText,
  Receipt, Clock, Wrench, ExternalLink, Loader2, X, QrCode, Copy, Check, Wallet,
  Download, ChevronLeft, ChevronRight,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  useListFormSubmissions,
  useListForms,
  useDeleteFormSubmission,
  type FormSubmission,
} from "@/lib/forms-api";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type SortKey = "name" | "email" | "company" | "loyaltyPoints" | "visitCount";
type SortDir  = "asc" | "desc";
type DetailTab = "overview" | "address" | "account" | "history" | "notes" | "files" | "qr";
type Step = "personal" | "address" | "account";
const STEPS: Step[] = ["personal", "address", "account"];

type CustomerForm = {
  firstName: string; lastName: string; email: string; phone: string;
  whatsappSameAsPhone: boolean; dateOfBirth: string; company: string;
  abn: string; referredBy: string; referralCode: string;
  billingStreet: string; billingCity: string;
  billingState: string; billingPostcode: string; billingCountry: string;
  addShipping: boolean; shippingSameAsBilling: boolean;
  shippingStreet: string; shippingCity: string; shippingState: string;
  shippingPostcode: string; shippingCountry: string;
  customerGroup: string; warningNote: string; agreedToMarketing: boolean; notes: string;
};

const defaultForm: CustomerForm = {
  firstName: "", lastName: "", email: "", phone: "",
  whatsappSameAsPhone: false, dateOfBirth: "", company: "",
  abn: "", referredBy: "", referralCode: "",
  billingStreet: "", billingCity: "",
  billingState: "", billingPostcode: "", billingCountry: "Australia",
  addShipping: true, shippingSameAsBilling: true,
  shippingStreet: "", shippingCity: "", shippingState: "",
  shippingPostcode: "", shippingCountry: "Australia",
  customerGroup: "Standard", warningNote: "", agreedToMarketing: false, notes: "",
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function ServiceJobPhotoStrip({ photos }: { photos: string[] }) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  return (
    <>
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxSrc(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
            onClick={() => setLightboxSrc(null)}
          >
            <X className="w-8 h-8" />
          </button>
          <img
            src={lightboxSrc}
            alt="Full size"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      <div className="flex gap-1.5 flex-wrap">
        {photos.map((src, i) => (
          <img
            key={i}
            src={src}
            alt={`photo ${i + 1}`}
            className="w-12 h-12 object-cover rounded-md border cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => setLightboxSrc(src)}
          />
        ))}
      </div>
    </>
  );
}

function StepPill({ label, icon, active, done }: { label: string; icon: React.ReactNode; active: boolean; done: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
      active ? "bg-primary text-primary-foreground" : done ? "bg-muted text-muted-foreground" : "text-muted-foreground",
    )}>
      {done && !active ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <span className="shrink-0">{icon}</span>}
      {label}
    </div>
  );
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`space-y-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <Label className="font-medium">{label}</Label>
      {children}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, href, className }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string | number | null;
  href?: string;
  className?: string;
}) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className={cn("text-sm min-w-0", className)}>
        <p className="text-xs text-muted-foreground">{label}</p>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium truncate flex items-center gap-1 text-primary hover:underline">
            {value} <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
        ) : (
          <p className="font-medium truncate">{value}</p>
        )}
      </div>
    </div>
  );
}

function mapsUrl(addr: string) {
  const q = encodeURIComponent(addr);
  const ua = navigator.userAgent;
  if (/iPhone|iPad|Mac/.test(ua)) return `maps://maps.apple.com/?q=${q}`;
  return `https://maps.google.com/?q=${q}`;
}

/* ─── Sort header ────────────────────────────────────────────────────────── */

function SortTh({ label, sortKey, active, dir, onSort, className }: {
  label: string; sortKey: SortKey; active: SortKey; dir: SortDir;
  onSort: (k: SortKey) => void; className?: string;
}) {
  const isActive = active === sortKey;
  return (
    <th
      className={cn("p-3 text-left font-medium whitespace-nowrap cursor-pointer select-none group", className)}
      onClick={() => onSort(sortKey)}
    >
      <span className="flex items-center gap-1 hover:text-foreground transition-colors">
        {label}
        <span className={cn("transition-colors", isActive ? "text-foreground" : "text-muted-foreground/40 group-hover:text-muted-foreground")}>
          {isActive
            ? dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
            : <ChevronsUpDown className="w-3 h-3" />}
        </span>
      </span>
    </th>
  );
}

/* ─── Customer detail dialog ─────────────────────────────────────────────── */

function CustomerDetailInner({
  customer, onClose, onEdit, onDelete, deleteIsPending, merchantUsername,
}: {
  customer: Customer;
  onClose: () => void;
  onEdit: (c: Customer) => void;
  onDelete: (id: number) => void;
  deleteIsPending: boolean;
  merchantUsername: string | null;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<DetailTab>("overview");
  const [newNote, setNewNote] = useState("");
  const [notePopupOnSale, setNotePopupOnSale] = useState(false);
  const [notePopupOnBooking, setNotePopupOnBooking] = useState(false);
  const [uploadingFile, setUploadingFile]       = useState(false);
  const [viewingSub, setViewingSub]             = useState<FormSubmission | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qrSvgRef = useRef<SVGSVGElement>(null);

  /* QR / Portal state */
  const [qrCopied, setQrCopied] = useState(false);
  const [qrWalletLoading, setQrWalletLoading] = useState<"apple" | "google" | null>(null);
  const [localPortalToken, setLocalPortalToken] = useState(customer.portalToken);

  useEffect(() => {
    if (tab === "qr" && !localPortalToken) {
      fetch(`/api/customers/${customer.id}/portal-token`, { credentials: "include" })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(({ token }: { token: string }) => setLocalPortalToken(token))
        .catch(() => {});
    }
  }, [tab, customer.id, localPortalToken]);

  const buildPortalUrl = (token: string | null | undefined) =>
    token && merchantUsername
      ? `${window.location.origin}/b/${merchantUsername}/c/${token}`
      : null;

  const handleCopyPortalUrl = async () => {
    const url = buildPortalUrl(localPortalToken);
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setQrCopied(true);
    setTimeout(() => setQrCopied(false), 2000);
  };

  const handleDownloadQR = () => {
    const svg = qrSvgRef.current;
    if (!svg) return;
    const canvas = document.createElement("canvas");
    canvas.width = 400; canvas.height = 400;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    const blob = new Blob([svg.outerHTML], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 400, 400);
      ctx.drawImage(img, 0, 0, 400, 400);
      URL.revokeObjectURL(url);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `${customer.firstName ?? "customer"}-loyalty-qr.png`;
      a.click();
    };
    img.src = url;
  };

  const handleAppleWallet = async () => {
    if (!localPortalToken) return;
    setQrWalletLoading("apple");
    try {
      const r = await fetch(`/api/portal/${localPortalToken}/apple-wallet`, { credentials: "include" });
      if (r.status === 503) { const j = await r.json(); toast.error("Apple Wallet not configured", { description: j.setup }); return; }
      const blob = await r.blob();
      const dl = document.createElement("a");
      dl.href = URL.createObjectURL(blob); dl.download = "loyalty-card.pkpass"; dl.click();
    } catch { toast.error("Could not download Apple Wallet pass"); }
    finally { setQrWalletLoading(null); }
  };

  const handleGoogleWallet = async () => {
    if (!localPortalToken) return;
    setQrWalletLoading("google");
    try {
      const r = await fetch(`/api/portal/${localPortalToken}/google-wallet`, { credentials: "include" });
      if (r.status === 503) { const j = await r.json(); toast.error("Google Wallet not configured", { description: j.setup }); return; }
      const { saveUrl } = await r.json();
      window.open(saveUrl, "_blank");
    } catch { toast.error("Could not open Google Wallet"); }
    finally { setQrWalletLoading(null); }
  };

  /* Loyalty adjustment state */
  const [loyaltyMode, setLoyaltyMode] = useState<"add" | "deduct" | "set">("add");
  const [loyaltyAmount, setLoyaltyAmount] = useState("");
  const [localLoyaltyPts, setLocalLoyaltyPts] = useState(customer.loyaltyPoints ?? 0);

  const { data: history, isLoading: histLoading } = useGetCustomerHistory(customer.id);
  const { data: notes = [], isLoading: notesLoading } = useListCustomerNotes(customer.id);
  const { data: files = [], isLoading: filesLoading } = useListCustomerFiles(customer.id);
  const { data: loyaltySettings } = useGetLoyaltySettings();
  const { data: formSubmissions = [] } = useListFormSubmissions({ customerId: customer.id });
  const { data: allForms = [] }        = useListForms();
  const deleteSubMutation              = useDeleteFormSubmission();

  const createNoteMutation = useCreateCustomerNote();
  const deleteNoteMutation = useDeleteCustomerNote();
  const createFileMutation = useCreateCustomerFile();
  const deleteFileMutation = useDeleteCustomerFile();
  const requestUploadMutation = useRequestUploadUrl();
  const loyaltyUpdateMutation = useUpdateCustomer();

  const programType     = loyaltySettings?.programType ?? "cashback";
  const isPointsProgram = programType === "points";
  const isStampProgram  = programType === "stamp";
  const loyaltyLabel    =
    isPointsProgram ? "Loyalty Points"
    : isStampProgram ? "Loyalty Stamps"
    : "Loyalty Dollars";
  const loyaltyIcon     = isPointsProgram ? "⭐" : isStampProgram ? "🎟" : "$";
  const formatBalance = (n: number) =>
    isPointsProgram ? `${n} pts`
    : isStampProgram ? `${n} ${n === 1 ? "stamp" : "stamps"}`
    : `$${n}`;

  const handleLoyaltySave = () => {
    const n = parseFloat(loyaltyAmount);
    if (isNaN(n) || n < 0) return;
    const amount = Math.round(n);
    let next: number;
    if (loyaltyMode === "add")    next = localLoyaltyPts + amount;
    else if (loyaltyMode === "deduct") next = Math.max(0, localLoyaltyPts - amount);
    else next = amount;

    loyaltyUpdateMutation.mutate(
      { id: customer.id, data: { loyaltyPoints: next } },
      {
        onSuccess: () => {
          toast.success(`${loyaltyLabel} updated`);
          setLocalLoyaltyPts(next);
          setLoyaltyAmount("");
          queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
        },
        onError: () => toast.error("Failed to update loyalty balance"),
      }
    );
  };

  const fullName = [customer.firstName, customer.lastName].filter(Boolean).join(" ") || "Unknown";
  const initials = ((customer.firstName?.[0] ?? "") + (customer.lastName?.[0] ?? "")).toUpperCase() || "?";

  const billingAddr = [
    customer.billingStreet, customer.billingCity,
    customer.billingState, customer.billingPostcode, customer.billingCountry,
  ].filter(Boolean).join(", ") || customer.address || null;

  const shippingAddr = [
    customer.shippingStreet, customer.shippingCity,
    customer.shippingState, customer.shippingPostcode, customer.shippingCountry,
  ].filter(Boolean).join(", ") || null;

  const TABS: { key: DetailTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "address",  label: "Address"  },
    { key: "account",  label: "Account"  },
    { key: "history",  label: "History"  },
    { key: "notes",    label: "Notes"    },
    { key: "files",    label: "Files"    },
    { key: "qr",       label: "QR Code"  },
  ];

  const invalidateNotes = () => queryClient.invalidateQueries({ queryKey: [`/customers/${customer.id}/notes`] });
  const invalidateFiles = () => queryClient.invalidateQueries({ queryKey: [`/customers/${customer.id}/files`] });

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    createNoteMutation.mutate(
      { id: customer.id, data: { note: newNote.trim(), popupOnSale: notePopupOnSale, popupOnBooking: notePopupOnBooking } },
      {
        onSuccess: () => { toast.success("Note added"); setNewNote(""); setNotePopupOnSale(false); setNotePopupOnBooking(false); invalidateNotes(); },
        onError: () => toast.error("Failed to add note"),
      }
    );
  };

  const handleDeleteNote = (noteId: number) => {
    deleteNoteMutation.mutate({ id: customer.id, noteId }, {
      onSuccess: () => { toast.success("Note deleted"); invalidateNotes(); },
      onError: () => toast.error("Failed to delete note"),
    });
  };

  const handleDeleteFile = (fileId: number) => {
    deleteFileMutation.mutate({ id: customer.id, fileId }, {
      onSuccess: () => { toast.success("File removed"); invalidateFiles(); },
      onError: () => toast.error("Failed to remove file"),
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      const urlResp = await new Promise<{ uploadURL: string; objectPath: string }>((resolve, reject) => {
        requestUploadMutation.mutate(
          { data: { name: file.name, size: file.size, contentType: file.type || "application/octet-stream" } },
          { onSuccess: (d) => resolve(d as { uploadURL: string; objectPath: string }), onError: reject }
        );
      });
      await fetch(urlResp.uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      await new Promise<void>((resolve, reject) => {
        createFileMutation.mutate(
          { id: customer.id, data: { filename: file.name, fileKey: urlResp.objectPath, contentType: file.type || "application/octet-stream", sizeBytes: file.size } },
          { onSuccess: () => resolve(), onError: reject }
        );
      });
      toast.success("File uploaded");
      invalidateFiles();
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  function formatBytes(n: number) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function fileIcon(contentType: string) {
    if (contentType.startsWith("image/")) return "🖼️";
    if (contentType === "application/pdf") return "📄";
    if (contentType.includes("spreadsheet") || contentType.includes("excel")) return "📊";
    if (contentType.includes("word") || contentType.includes("document")) return "📝";
    return "📎";
  }

  const tabIndex = TABS.findIndex(t => t.key === tab);

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-primary/15 flex items-center justify-center font-bold text-primary text-sm shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-base leading-tight truncate">{fullName}</p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {customer.customerGroup && (
                  <Badge variant="outline" className="text-xs px-2 py-0 h-5">{customer.customerGroup}</Badge>
                )}
                {customer.loyaltyPoints != null && customer.loyaltyPoints > 0 && (
                  <span className="flex items-center gap-0.5 text-xs text-amber-600 font-medium">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    {customer.loyaltyPoints} pts
                  </span>
                )}
              </div>
            </div>
          </div>
        </DialogTitle>
      </DialogHeader>

      {/* Tabs */}
      <div className="flex flex-wrap border-b -mx-6 px-6 gap-0">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap shrink-0",
              tab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-[320px]">
      {/* ── Overview ── */}
      {tab === "overview" && (
        <div className="space-y-3">
          {customer.warningNote && (
            <div className="flex items-start gap-2 bg-destructive/10 text-destructive border border-destructive/20 rounded-lg px-3 py-2.5 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{customer.warningNote}</span>
            </div>
          )}
          <div className="rounded-xl border bg-muted/20 divide-y">
            <InfoRow icon={Mail}      label="Email"   value={customer.email} href={customer.email ? `mailto:${customer.email}` : undefined} />
            <InfoRow icon={Phone}     label="Phone"   value={customer.phone} href={customer.phone ? `tel:${customer.phone.replace(/\s/g, "")}` : undefined} />
            <InfoRow icon={Building2} label="Company" value={customer.company} />
          </div>
          <div className="rounded-xl border bg-muted/20 divide-y">
            <InfoRow icon={Star}  label="Loyalty Points" value={customer.loyaltyPoints ?? 0} />
            <InfoRow icon={User}  label="Visit Count"    value={`${customer.visitCount ?? 0} visits`} />
            {customer.totalSpent != null && (
              <InfoRow icon={Hash} label="Total Spent" value={formatCurrency(customer.totalSpent)} />
            )}
          </div>
          {customer.notes && (
            <div className="rounded-xl border bg-muted/20 px-4 py-3 flex gap-3">
              <StickyNote className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-xs text-muted-foreground mb-0.5">Notes</p>
                <p className="whitespace-pre-wrap">{customer.notes}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Address ── */}
      {tab === "address" && (
        <div className="space-y-3">
          <div className="rounded-xl border bg-muted/20">
            <p className="px-4 pt-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Billing Address</p>
            {billingAddr
              ? <InfoRow icon={MapPin} label="" value={billingAddr} href={mapsUrl(billingAddr)} />
              : <p className="px-4 pb-3 text-sm text-muted-foreground">No billing address on file.</p>}
          </div>
          <div className="rounded-xl border bg-muted/20">
            <p className="px-4 pt-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shipping Address</p>
            {shippingAddr
              ? <InfoRow icon={MapPin} label="" value={shippingAddr} href={mapsUrl(shippingAddr)} />
              : <p className="px-4 pb-3 text-sm text-muted-foreground">Same as billing / not set.</p>}
          </div>
        </div>
      )}

      {/* ── Account ── */}
      {tab === "account" && (
        <div className="space-y-3">
          <div className="rounded-xl border bg-muted/20 divide-y">
            <InfoRow icon={Calendar} label="Date of Birth" value={customer.dateOfBirth} />
            <InfoRow icon={Hash}     label="ABN"           value={customer.abn} />
            <InfoRow icon={Hash}     label="Referral Code" value={customer.referralCode} />
            <InfoRow icon={User}     label="Referred By"   value={customer.referredBy} />
          </div>
          <div className="rounded-xl border bg-muted/20 divide-y">
            <div className="flex items-center gap-3 px-4 py-3">
              <Settings2 className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="text-sm">
                <p className="text-xs text-muted-foreground">Marketing Consent</p>
                <p className="font-medium">{customer.agreedToMarketing === "true" ? "✓ Agreed" : "Not agreed"}</p>
              </div>
            </div>
          </div>

          {/* ── Loyalty balance ── */}
          <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" />
                <p className="text-sm font-semibold">{loyaltyLabel}</p>
              </div>
              <span className="text-xl font-bold tabular-nums text-amber-600">
                {formatBalance(localLoyaltyPts)}
              </span>
            </div>

            {/* Mode buttons */}
            <div className="flex rounded-lg border overflow-hidden text-sm">
              {(["add", "deduct", "set"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setLoyaltyMode(m)}
                  className={cn(
                    "flex-1 py-1.5 font-medium transition-colors capitalize",
                    loyaltyMode === m
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted",
                  )}
                >
                  {m === "set" ? "Set to" : m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>

            {/* Amount input + save */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                {!isPointsProgram && loyaltyMode !== "deduct" && (
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                )}
                <Input
                  type="number"
                  min="0"
                  step={isPointsProgram ? "1" : "1"}
                  placeholder={loyaltyMode === "set" ? "New balance" : "Amount"}
                  value={loyaltyAmount}
                  onChange={(e) => setLoyaltyAmount(e.target.value)}
                  className={!isPointsProgram && loyaltyMode !== "deduct" ? "pl-7" : ""}
                  onKeyDown={(e) => { if (e.key === "Enter") handleLoyaltySave(); }}
                />
              </div>
              <Button
                size="sm"
                onClick={handleLoyaltySave}
                disabled={!loyaltyAmount || isNaN(parseFloat(loyaltyAmount)) || parseFloat(loyaltyAmount) < 0 || loyaltyUpdateMutation.isPending}
                className="shrink-0"
              >
                {loyaltyUpdateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save"}
              </Button>
            </div>

            {/* Preview */}
            {loyaltyAmount && !isNaN(parseFloat(loyaltyAmount)) && (
              <p className="text-xs text-muted-foreground">
                {loyaltyMode === "add"
                  ? `Balance will become ${formatBalance(localLoyaltyPts + Math.round(parseFloat(loyaltyAmount)))}`
                  : loyaltyMode === "deduct"
                  ? `Balance will become ${formatBalance(Math.max(0, localLoyaltyPts - Math.round(parseFloat(loyaltyAmount))))}`
                  : `Balance will be set to ${isPointsProgram ? `${Math.round(parseFloat(loyaltyAmount))} pts` : `$${Math.round(parseFloat(loyaltyAmount))}`}`
                }
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── History ── */}
      {tab === "history" && (
        <div className="space-y-4">
          {histLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading history...
            </div>
          ) : (
            <>
              {/* Transactions */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5" /> Sales ({history?.transactions?.length ?? 0})
                </p>
                {!history?.transactions?.length ? (
                  <p className="text-sm text-muted-foreground pl-1">No sales recorded.</p>
                ) : (
                  <div className="rounded-xl border divide-y bg-muted/20">
                    {history.transactions.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <div>
                          <p className="font-medium">{tx.receiptNumber || `#${tx.id}`}</p>
                          <p className="text-xs text-muted-foreground">{tx.paymentMethod} · {new Date(tx.createdAt).toLocaleDateString("en-AU")}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">{formatCurrency(tx.total)}</p>
                          <Badge variant="outline" className="text-xs capitalize">{tx.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Appointments */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Appointments ({history?.appointments?.length ?? 0})
                </p>
                {!history?.appointments?.length ? (
                  <p className="text-sm text-muted-foreground pl-1">No appointments recorded.</p>
                ) : (
                  <div className="rounded-xl border divide-y bg-muted/20">
                    {history.appointments.map((a) => (
                      <div key={a.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <div>
                          <p className="font-medium">{a.title}</p>
                          <p className="text-xs text-muted-foreground">{new Date(a.scheduledAt).toLocaleString("en-AU")} · {a.durationMinutes}min</p>
                        </div>
                        <Badge variant="outline" className="text-xs capitalize">{a.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Service Jobs */}
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5" /> Service Jobs ({history?.serviceJobs?.length ?? 0})
                </p>
                {!history?.serviceJobs?.length ? (
                  <p className="text-sm text-muted-foreground pl-1">No service jobs recorded.</p>
                ) : (
                  <div className="rounded-xl border divide-y bg-muted/20">
                    {history.serviceJobs.map((j) => {
                      const jobPhotos = Array.isArray(j.photos) ? (j.photos as string[]).filter(Boolean) : [];
                      return (
                        <div key={j.id} className="px-4 py-2.5 text-sm space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{j.jobNumber} {j.deviceType ? `· ${j.deviceType}` : ""}</p>
                              <p className="text-xs text-muted-foreground">{j.deviceDescription || "—"}</p>
                            </div>
                            <div className="text-right">
                              {j.estimatedCost != null && <p className="font-bold">{formatCurrency(j.estimatedCost)}</p>}
                              <Badge variant="outline" className="text-xs capitalize">{j.status}</Badge>
                            </div>
                          </div>
                          {jobPhotos.length > 0 && (
                            <ServiceJobPhotoStrip photos={jobPhotos} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Notes ── */}
      {tab === "notes" && (
        <div className="space-y-4">
          {/* Add note */}
          <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Add Note</p>
            <Textarea
              placeholder="Enter a note about this customer..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              className="resize-none"
              rows={3}
            />
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={notePopupOnSale} onCheckedChange={(v) => setNotePopupOnSale(!!v)} />
                Popup on POS sale
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={notePopupOnBooking} onCheckedChange={(v) => setNotePopupOnBooking(!!v)} />
                Popup on booking
              </label>
              <Button
                size="sm" className="ml-auto"
                onClick={handleAddNote}
                disabled={!newNote.trim() || createNoteMutation.isPending}
              >
                {createNoteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
                Add Note
              </Button>
            </div>
          </div>

          {/* Note list */}
          {notesLoading ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading notes...
            </div>
          ) : !notes.length ? (
            <p className="text-sm text-muted-foreground text-center py-4">No notes yet.</p>
          ) : (
            <div className="space-y-2">
              {notes.map((note: CustomerNote) => (
                <div key={note.id} className="rounded-xl border bg-background p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm whitespace-pre-wrap">{note.note}</p>
                    </div>
                    <Button
                      variant="ghost" size="icon" className="w-7 h-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteNote(note.id)}
                      disabled={deleteNoteMutation.isPending}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {note.popupOnSale && <Badge variant="secondary" className="text-xs">Popup on sale</Badge>}
                    {note.popupOnBooking && <Badge variant="secondary" className="text-xs">Popup on booking</Badge>}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(note.createdAt).toLocaleDateString("en-AU")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Files ── */}
      {tab === "files" && (
        <div className="space-y-4">
          {/* Upload */}
          <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-center space-y-2">
            <Upload className="w-6 h-6 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">Upload documents, IDs, or images</p>
            <Button
              variant="outline" size="sm" className="gap-1.5"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFile}
            >
              {uploadingFile
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...</>
                : <><Upload className="w-3.5 h-3.5" /> Choose File</>}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt"
            />
          </div>

          {/* File list */}
          {filesLoading ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading files...
            </div>
          ) : !files.length ? (
            <p className="text-sm text-muted-foreground text-center py-4">No files attached yet.</p>
          ) : (
            <div className="rounded-xl border divide-y bg-muted/20">
              {files.map((f: CustomerFile) => (
                <div key={f.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-xl shrink-0">{fileIcon(f.contentType)}</span>
                  <div className="flex-1 min-w-0">
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-primary hover:underline truncate block"
                    >
                      {f.filename}
                    </a>
                    <p className="text-xs text-muted-foreground">{formatBytes(f.sizeBytes)} · {new Date(f.createdAt).toLocaleDateString("en-AU")}</p>
                  </div>
                  <Button
                    variant="ghost" size="icon" className="w-7 h-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeleteFile(f.id)}
                    disabled={deleteFileMutation.isPending}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Submitted Forms */}
          <div className="space-y-3 pt-4 border-t">
            <h3 className="text-sm font-semibold">Submitted Forms</h3>
            {!(formSubmissions as FormSubmission[]).length ? (
              <p className="text-sm text-muted-foreground text-center py-4">No form submissions yet.</p>
            ) : (
              <div className="rounded-xl border divide-y bg-muted/20">
                {(formSubmissions as FormSubmission[]).map(sub => {
                  const form = (allForms as Array<{ id: number; name: string }>)
                    .find(f => f.id === sub.formId);
                  return (
                    <div key={sub.id} className="flex items-center gap-3 px-4 py-3">
                      <FileText className="w-4 h-4 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{form?.name ?? "Form"}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(sub.createdAt).toLocaleDateString("en-AU")}
                        </p>
                      </div>
                      <Button
                        variant="ghost" size="sm" className="h-7 px-2.5 text-xs shrink-0"
                        onClick={() => setViewingSub(sub)}
                      >
                        View
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── QR Code / Portal ── */}
      {tab === "qr" && (
        <div className="space-y-3">
          {/* QR Code card */}
          <div className="rounded-xl border bg-white p-5 flex flex-col items-center gap-3">
            {localPortalToken ? (
              <>
                <div className="flex items-center gap-2 self-start">
                  <QrCode className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm font-semibold">Customer QR Code</p>
                </div>
                <div className="p-3 rounded-xl border-2 border-gray-100 bg-white">
                  <QRCodeSVG
                    ref={qrSvgRef}
                    value={buildPortalUrl(localPortalToken) ?? ""}
                    size={180}
                    level="M"
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center break-all max-w-xs">
                  {buildPortalUrl(localPortalToken) ?? ""}
                </p>
                <div className="flex gap-2 w-full">
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={handleCopyPortalUrl}>
                    {qrCopied ? <><Check className="w-3.5 h-3.5" />Copied!</> : <><Copy className="w-3.5 h-3.5" />Copy Link</>}
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={handleDownloadQR}>
                    <QrCode className="w-3.5 h-3.5" /> Download
                  </Button>
                </div>
                <a
                  href={buildPortalUrl(localPortalToken) ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-primary hover:underline self-center"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open Customer Portal
                </a>
              </>
            ) : (
              <div className="py-4 text-center text-muted-foreground space-y-2">
                <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                <p className="text-sm">Generating QR code…</p>
              </div>
            )}
          </div>

          {/* Wallet buttons */}
          {localPortalToken && (
            <div className="rounded-xl border bg-muted/20 p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Save to Wallet</p>
              <button
                onClick={handleAppleWallet}
                disabled={qrWalletLoading !== null}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-black text-white py-2.5 text-sm font-semibold hover:opacity-80 disabled:opacity-50 transition-opacity"
              >
                {qrWalletLoading === "apple" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
                Add to Apple Wallet
              </button>
              <button
                onClick={handleGoogleWallet}
                disabled={qrWalletLoading !== null}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-white text-gray-800 border py-2.5 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {qrWalletLoading === "google" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4 text-blue-500" />}
                Save to Google Wallet
              </button>
              <p className="text-xs text-muted-foreground text-center pt-1">
                Wallet integration requires Apple/Google credentials in your environment secrets.
              </p>
            </div>
          )}
        </div>
      )}

      </div>
      <DialogFooter className="flex-row justify-between sm:justify-between gap-2 flex-wrap">
        <Button
          variant="destructive" size="sm" className="gap-1.5"
          onClick={() => { onDelete(customer.id); onClose(); }}
          disabled={deleteIsPending}
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </Button>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost" size="sm" className="gap-1 px-2"
            disabled={tabIndex === 0}
            onClick={() => setTab(TABS[tabIndex - 1].key)}
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline text-xs">Back</span>
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums select-none px-1">
            {tabIndex + 1}/{TABS.length}
          </span>
          <Button
            variant="ghost" size="sm" className="gap-1 px-2"
            disabled={tabIndex === TABS.length - 1}
            onClick={() => setTab(TABS[tabIndex + 1].key)}
          >
            <span className="hidden sm:inline text-xs">Next</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          <Button size="sm" className="gap-1.5" onClick={() => { onClose(); onEdit(customer); }}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
        </div>
      </DialogFooter>

      {/* ── View form submission ── */}
      {viewingSub && (() => {
        const viewForm = (allForms as Array<{ id: number; name: string; fields: Array<{ id: string; label: string }> }>)
          .find(f => f.id === viewingSub.formId);
        return (
          <Dialog open onOpenChange={() => setViewingSub(null)}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{viewForm?.name ?? "Form Submission"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 max-h-[55vh] overflow-y-auto">
                <p className="text-xs text-muted-foreground">
                  {new Date(viewingSub.createdAt).toLocaleString("en-AU")}
                </p>
                <div className="rounded-xl border divide-y">
                  {Object.entries(viewingSub.data).map(([key, value]) => {
                    const field = viewForm?.fields.find(f => f.id === key || f.label === key);
                    const label = field?.label ?? key;
                    return (
                      <div key={key} className="px-4 py-3 flex gap-3">
                        <span className="text-xs text-muted-foreground w-32 shrink-0 pt-0.5">{label}</span>
                        <span className="text-sm flex-1 min-w-0 break-words">{String(value ?? "—")}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-between gap-2 pt-2 border-t">
                <Button
                  variant="destructive" size="sm" className="gap-1.5"
                  disabled={deleteSubMutation.isPending}
                  onClick={() => deleteSubMutation.mutate(viewingSub.id, {
                    onSuccess: () => setViewingSub(null),
                    onError:   () => toast.error("Failed to delete"),
                  })}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </Button>
                <Button size="sm" onClick={() => setViewingSub(null)}>Close</Button>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}
    </>
  );
}

function CustomerDetailDialog({
  customer, onClose, onEdit, onDelete, deleteIsPending, merchantUsername,
}: {
  customer: Customer | null;
  onClose: () => void;
  onEdit: (c: Customer) => void;
  onDelete: (id: number) => void;
  deleteIsPending: boolean;
  merchantUsername: string | null;
}) {
  return (
    <Dialog open={!!customer} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {customer && (
          <CustomerDetailInner
            customer={customer}
            onClose={onClose}
            onEdit={onEdit}
            onDelete={onDelete}
            deleteIsPending={deleteIsPending}
            merchantUsername={merchantUsername}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const { settings: customerSettings } = useCustomerSettings();
  const customerGroups = customerSettings.groups.map(g => g.name);
  const [search, setSearch]             = useState("");
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer]   = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [sortKey, setSortKey]           = useState<SortKey>("name");
  const [sortDir, setSortDir]           = useState<SortDir>("asc");
  const [checked, setChecked]               = useState<Set<number>>(new Set());
  const [page, setPage]                     = useState(1);
  const [pageSize, setPageSize]             = useState<number | "all">(25);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  const { data: loyaltySettings } = useGetLoyaltySettings();
  const { data: merchantData } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const merchantUsername = (merchantData as any)?.username as string | null ?? null;

  const { data: customersData, isLoading } = useListCustomers(
    { search: search || undefined, limit: 1000 },
  );

  const deleteMutation = useDeleteCustomer();

  const customers = customersData?.items || [];

  /* Sort */
  const sorted = [...customers].sort((a, b) => {
    let av: string | number = "", bv: string | number = "";
    switch (sortKey) {
      case "name":          av = `${a.firstName ?? ""} ${a.lastName ?? ""}`.toLowerCase(); bv = `${b.firstName ?? ""} ${b.lastName ?? ""}`.toLowerCase(); break;
      case "email":         av = (a.email ?? "").toLowerCase();   bv = (b.email ?? "").toLowerCase();   break;
      case "company":       av = (a.company ?? "").toLowerCase(); bv = (b.company ?? "").toLowerCase(); break;
      case "loyaltyPoints": av = a.loyaltyPoints ?? 0;            bv = b.loyaltyPoints ?? 0;            break;
      case "visitCount":    av = a.visitCount ?? 0;               bv = b.visitCount ?? 0;               break;
    }
    const r = av < bv ? -1 : av > bv ? 1 : 0;
    return sortDir === "asc" ? r : -r;
  });

  /* Pagination */
  const totalPages  = pageSize === "all" ? 1 : Math.max(1, Math.ceil(sorted.length / (pageSize as number)));
  const safePage    = Math.min(page, totalPages);
  const paginated   = pageSize === "all" ? sorted : sorted.slice((safePage - 1) * (pageSize as number), safePage * (pageSize as number));

  /* Reset to page 1 when search or sort changes */
  useEffect(() => { setPage(1); }, [search, sortKey, sortDir]);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) { setSortDir((d) => d === "asc" ? "desc" : "asc"); return prev; }
      setSortDir("asc"); return key;
    });
  }, []);

  /* Checkboxes — operate on current page */
  const allChecked = paginated.length > 0 && paginated.every((c) => checked.has(c.id));
  const toggleAll  = () => setChecked((prev) => {
    const n = new Set(prev);
    if (allChecked) { paginated.forEach((c) => n.delete(c.id)); }
    else            { paginated.forEach((c) => n.add(c.id)); }
    return n;
  });
  const toggleOne  = (id: number) => setChecked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  /* Bulk actions */
  const handleBulkExport = () => {
    const selected = sorted.filter((c) => checked.has(c.id));
    const escape   = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const headers  = ["firstName","lastName","email","phone","company","abn","billingStreet","billingCity","billingState","billingPostcode","billingCountry","customerGroup","loyaltyPoints","visitCount","notes"];
    const rows     = selected.map((c) => [
      c.firstName, c.lastName, c.email, c.phone, c.company, c.abn,
      c.billingStreet, c.billingCity, c.billingState, c.billingPostcode, c.billingCountry,
      c.customerGroup, String(c.loyaltyPoints ?? 0), String(c.visitCount ?? 0), c.notes,
    ].map((v) => escape(String(v ?? ""))).join(","));
    const csv      = [headers.join(","), ...rows].join("\n");
    const a        = document.createElement("a");
    a.href         = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download     = `customers_${selected.length}.csv`;
    a.click();
    toast.success(`${selected.length} customer${selected.length === 1 ? "" : "s"} exported`);
  };

  const handleBulkDelete = async () => {
    const ids = [...checked];
    let success = 0;
    await Promise.all(ids.map((id) =>
      fetch(`/api/customers/${id}`, { method: "DELETE", credentials: "include" })
        .then((r) => { if (r.ok) success++; })
        .catch(() => {})
    ));
    setChecked(new Set());
    setBulkDeleteConfirm(false);
    queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
    toast.success(`${success} customer${success === 1 ? "" : "s"} deleted`);
  };

  const openCreate = () => {
    setEditingCustomer(null);
    setDialogOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditingCustomer(c);
    setDialogOpen(true);
  };

  const handleDelete = (id?: number) => {
    const targetId = id ?? deletingCustomer?.id;
    if (!targetId) return;
    deleteMutation.mutate({ id: targetId }, {
      onSuccess: () => {
        toast.success("Customer deleted");
        setDeleteDialogOpen(false);
        queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
      },
      onError: () => toast.error("Failed to delete customer"),
    });
  };

  const sh = (label: string, key: SortKey, className?: string) => ({
    label, sortKey: key, active: sortKey, dir: sortDir, onSort: handleSort, className,
  });

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-sm text-muted-foreground">Manage your customer database, contacts, and loyalty activity.</p>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> Add Customer
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or phone..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading customers...</div>
        ) : customers.length === 0 ? (
          <div className="rounded-lg border">
            <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
              <Users className="w-16 h-16 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-lg">No customers yet</p>
                <p className="text-muted-foreground text-sm">Add customers to track their purchases and loyalty.</p>
              </div>
              <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" /> Add Customer</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* ── Bulk action bar ── */}
            {checked.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-primary/5 border-primary/20 px-4 py-2.5">
                <span className="text-sm font-medium text-primary mr-1">
                  {checked.size} selected
                </span>
                <div className="flex items-center gap-2 ml-auto flex-wrap">
                  {checked.size === 1 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-8"
                      onClick={() => {
                        const c = sorted.find((x) => checked.has(x.id));
                        if (c) openEdit(c);
                      }}
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-8"
                    onClick={handleBulkExport}
                  >
                    <Download className="w-3.5 h-3.5" /> Export
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1.5 h-8"
                    onClick={() => setBulkDeleteConfirm(true)}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </Button>
                  <button
                    onClick={() => setChecked(new Set())}
                    className="text-muted-foreground hover:text-foreground transition-colors ml-1"
                    title="Clear selection"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ── Table ── */}
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="p-3 w-10">
                      <input type="checkbox" checked={allChecked} onChange={toggleAll}
                        className="rounded border-muted-foreground/40 accent-primary" />
                    </th>
                    <SortTh {...sh("Name", "name")} />
                    <SortTh {...sh("Email", "email", "hidden sm:table-cell")} />
                    <th className="p-3 text-left font-medium whitespace-nowrap hidden md:table-cell">Phone</th>
                    <SortTh {...sh("Company", "company", "hidden lg:table-cell")} />
                    <th className="p-3 text-left font-medium whitespace-nowrap hidden xl:table-cell">Address</th>
                    <th className="p-3 text-left font-medium whitespace-nowrap hidden lg:table-cell">Group</th>
                    <SortTh {...sh("Loyalty", "loyaltyPoints", "hidden md:table-cell")} />
                    <SortTh {...sh("Activity", "visitCount", "hidden lg:table-cell")} />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {paginated.map((customer) => {
                    const address = [customer.billingStreet, customer.billingCity, customer.billingState, customer.billingPostcode, customer.billingCountry]
                      .filter(Boolean).join(", ") || customer.address || "—";
                    const isChecked = checked.has(customer.id);
                    return (
                      <tr
                        key={customer.id}
                        className={cn(
                          "bg-background hover:bg-muted/30 transition-colors cursor-pointer",
                          isChecked && "bg-primary/5",
                        )}
                        onClick={() => setSelectedCustomer(customer)}
                      >
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={isChecked} onChange={() => toggleOne(customer.id)}
                            className="rounded border-muted-foreground/40 accent-primary" />
                        </td>
                        <td className="p-3 font-medium">
                          <div className="flex items-center gap-2">
                            {[customer.firstName, customer.lastName].filter(Boolean).join(" ") || "—"}
                            {customer.warningNote && <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />}
                          </div>
                        </td>
                        <td className="p-3 hidden sm:table-cell text-muted-foreground">
                          {customer.email || "—"}
                        </td>
                        <td className="p-3 hidden md:table-cell text-muted-foreground">
                          {customer.phone || "—"}
                        </td>
                        <td className="p-3 hidden lg:table-cell text-muted-foreground">
                          {customer.company || "—"}
                        </td>
                        <td className="p-3 hidden xl:table-cell text-muted-foreground max-w-[180px] truncate">
                          {address}
                        </td>
                        <td className="p-3 hidden lg:table-cell">
                          {customer.customerGroup
                            ? <Badge variant="outline" className="text-xs">{customer.customerGroup}</Badge>
                            : "—"}
                        </td>
                        <td className="p-3 hidden md:table-cell">
                          {(() => {
                            const pts = customer.loyaltyPoints ?? 0;
                            const pType = loyaltySettings?.programType ?? "cashback";
                            if (pType === "cashback" || pType === "tiered" || pType === "custom") {
                              return <span className="font-medium text-emerald-600">${(pts as number).toFixed(2)}</span>;
                            }
                            if (pType === "stamp") {
                              return <span className="flex items-center gap-1 text-muted-foreground"><span>🎟</span>{pts}</span>;
                            }
                            return <span className="flex items-center gap-1"><Star className="w-3 h-3 text-amber-500 shrink-0" />{pts}</span>;
                          })()}
                        </td>
                        <td className="p-3 hidden lg:table-cell text-muted-foreground">
                          {customer.visitCount ?? 0} visits
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Pagination controls ── */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Rows per page:</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => { setPageSize(v === "all" ? "all" : Number(v)); setPage(1); }}
                >
                  <SelectTrigger className="h-8 w-20 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                {pageSize !== "all" && (
                  <>
                    <span>
                      {(safePage - 1) * (pageSize as number) + 1}–{Math.min(safePage * (pageSize as number), sorted.length)} of {sorted.length}
                    </span>
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={safePage <= 1}
                      className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors ml-2"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      const start = Math.max(1, Math.min(safePage - 2, totalPages - 4));
                      const p = start + i;
                      return p <= totalPages ? (
                        <button
                          key={p}
                          onClick={() => setPage(p)}
                          className={cn(
                            "w-7 h-7 rounded text-xs font-medium transition-colors",
                            p === safePage ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                          )}
                        >
                          {p}
                        </button>
                      ) : null;
                    })}
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage >= totalPages}
                      className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                )}
                {pageSize === "all" && (
                  <span>{sorted.length} customers</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Detail dialog */}
      <CustomerDetailDialog
        customer={selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
        onEdit={openEdit}
        onDelete={handleDelete}
        deleteIsPending={deleteMutation.isPending}
        merchantUsername={merchantUsername}
      />

      {/* Bulk delete confirmation */}
      <Dialog open={bulkDeleteConfirm} onOpenChange={setBulkDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {checked.size} customer{checked.size === 1 ? "" : "s"}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete {checked.size === 1 ? "this customer" : `these ${checked.size} customers`} and all their data. This cannot be undone.
          </p>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setBulkDeleteConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={deleteMutation.isPending}>
              Delete {checked.size === 1 ? "Customer" : `${checked.size} Customers`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddCustomerWizard
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingCustomer={editingCustomer}
      />
    </AppLayout>
  );
}
