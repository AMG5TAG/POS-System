import { useState, useRef, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import {
  Star, User, Calendar, Wrench, Loader2, Phone, Mail, MapPin,
  CheckCircle2, Clock, AlertCircle, Copy, Check, ExternalLink,
  ChevronLeft, Wallet, FileText,
} from "lucide-react";
import { setHomeScreenApp } from "@/lib/home-screen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface PortalData {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  dateOfBirth: string | null;
  loyaltyPoints: number;
  totalSpent: number;
  visitCount: number;
  merchant: { businessName: string; logoUrl: string | null };
  loyalty: { programType: string; isEnabled: boolean };
}

interface Appointment {
  id: number;
  title: string;
  description: string | null;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  notes: string | null;
}

interface ServiceJob {
  id: number;
  jobNumber: string;
  title: string;
  status: string;
  bookInDate: string;
  deviceType: string | null;
  deviceDescription: string | null;
  workDescription: string | null;
  estimatedCost: number | null;
  notes: string | null;
  createdAt: string;
}

/* ── Fetching hooks ─────────────────────────────────────────────────────────── */

function usePortalData(token: string) {
  return useQuery<PortalData>({
    queryKey: ["portal", token],
    queryFn: async () => {
      const r = await fetch(`/api/portal/${token}`, { credentials: "include" });
      if (!r.ok) throw new Error("Portal not found");
      return r.json();
    },
    retry: false,
  });
}

function usePortalAppointments(token: string, enabled: boolean) {
  return useQuery<Appointment[]>({
    queryKey: ["portal-appts", token],
    queryFn: () => fetch(`/api/portal/${token}/appointments`, { credentials: "include" }).then(r => r.json()),
    enabled,
  });
}

function usePortalServices(token: string, enabled: boolean) {
  return useQuery<ServiceJob[]>({
    queryKey: ["portal-services", token],
    queryFn: () => fetch(`/api/portal/${token}/services`, { credentials: "include" }).then(r => r.json()),
    enabled,
  });
}

interface PortalQuote {
  id: number;
  quoteNumber: string;
  status: string;
  total: number;
  depositRequired: number | null;
  items: { description: string; quantity: number; unitPrice: number; taxRate: number }[];
  expiryDate: string | null;
  notes: string | null;
  createdAt: string;
}

function usePortalQuotes(token: string, enabled: boolean) {
  return useQuery<PortalQuote[]>({
    queryKey: ["portal-quotes", token],
    queryFn: () => fetch(`/api/portal/${token}/quotes`, { credentials: "include" }).then(r => r.json()),
    enabled,
  });
}

/* ── Status helpers ─────────────────────────────────────────────────────────── */

const JOB_COLORS: Record<string, string> = {
  pending:                     "bg-amber-100  text-amber-800  border-amber-200",
  "in-progress":               "bg-blue-100   text-blue-800   border-blue-200",
  "awaiting-parts":            "bg-rose-100   text-rose-800   border-rose-200",
  "awaiting-stock":            "bg-purple-100 text-purple-800 border-purple-200",
  "at-repairer":               "bg-yellow-100 text-yellow-800 border-yellow-200",
  "awaiting-partner-approval": "bg-indigo-100 text-indigo-800 border-indigo-200",
  "partner-replacement":       "bg-teal-100   text-teal-800   border-teal-200",
  "awaiting-customer":         "bg-orange-100 text-orange-800 border-orange-200",
  completed:                   "bg-emerald-100 text-emerald-800 border-emerald-200",
  cancelled:                   "bg-red-100    text-red-700    border-red-200",
};
const JOB_LABEL: Record<string, string> = {
  pending:                     "Pending",
  "in-progress":               "In Progress",
  "awaiting-parts":            "Awaiting Parts",
  "awaiting-stock":            "Awaiting Stock",
  "at-repairer":               "At Repairer",
  "awaiting-partner-approval": "Awaiting Partner Approval",
  "partner-replacement":       "Partner Replacement",
  "awaiting-customer":         "Awaiting Your Decision",
  completed:                   "Completed — Ready for Pickup",
  cancelled:                   "Cancelled",
};
const APPT_COLORS: Record<string, string> = {
  scheduled:  "bg-blue-100  text-blue-800",
  confirmed:  "bg-green-100 text-green-800",
  completed:  "bg-gray-100  text-gray-700",
  cancelled:  "bg-red-100   text-red-700",
  no_show:    "bg-orange-100 text-orange-800",
};

/* ── Loyalty Tab ────────────────────────────────────────────────────────────── */

function LoyaltyTab({ data, token, businessUsername }: { data: PortalData; token: string; businessUsername: string | undefined }) {
  // On custom domains businessUsername is absent; the current URL is already canonical.
  const portalUrl = businessUsername
    ? `${window.location.origin}/b/${businessUsername}/c/${token}`
    : `${window.location.origin}/c/${token}`;
  const [copied, setCopied] = useState(false);
  const [walletLoading, setWalletLoading] = useState<"apple" | "google" | null>(null);
  const qrRef = useRef<SVGSVGElement>(null);

  const programType = data.loyalty.programType;
  const balanceLabel =
    programType === "points" ? `${data.loyaltyPoints} pts`
    : programType === "stamp" ? `${data.loyaltyPoints} ${data.loyaltyPoints === 1 ? "stamp" : "stamps"}`
    : `$${data.loyaltyPoints.toFixed(2)}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadQR = () => {
    const svg = qrRef.current;
    if (!svg) return;
    const canvas = document.createElement("canvas");
    const size = 400;
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    const svgBlob = new Blob([svg.outerHTML], { type: "image/svg+xml" });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = "loyalty-qr.png";
      a.click();
    };
    img.src = url;
  };

  const handleAppleWallet = async () => {
    setWalletLoading("apple");
    try {
      const r = await fetch(`/api/portal/${token}/apple-wallet`, { credentials: "include" });
      if (r.status === 503) {
        const json = await r.json();
        toast.error("Apple Wallet not set up", { description: json.setup });
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "loyalty-card.pkpass"; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not download Apple Wallet pass");
    } finally {
      setWalletLoading(null);
    }
  };

  const handleGoogleWallet = async () => {
    setWalletLoading("google");
    try {
      const r = await fetch(`/api/portal/${token}/google-wallet`, { credentials: "include" });
      if (r.status === 503) {
        const json = await r.json();
        toast.error("Google Wallet not set up", { description: json.setup });
        return;
      }
      const { saveUrl } = await r.json();
      window.open(saveUrl, "_blank");
    } catch {
      toast.error("Could not open Google Wallet");
    } finally {
      setWalletLoading(null);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Loyalty Card */}
      <div className="rounded-2xl bg-gradient-to-br from-amber-400 via-amber-400 to-amber-500 p-5 text-black shadow-md">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest opacity-60 mb-0.5">{data.merchant.businessName}</p>
            <p className="text-lg font-bold leading-tight">
              {[data.firstName, data.lastName].filter(Boolean).join(" ") || "Valued Customer"}
            </p>
          </div>
          <Star className="w-6 h-6 opacity-50" fill="currentColor" />
        </div>
        <div className="mb-4">
          <p className="text-xs uppercase tracking-widest opacity-60 mb-0.5">Loyalty Balance</p>
          <p className="text-4xl font-bold tabular-nums">{balanceLabel}</p>
        </div>
        <div className="flex gap-6 text-sm border-t border-black/10 pt-3">
          <div>
            <p className="opacity-60 text-xs">Total Spent</p>
            <p className="font-semibold">${data.totalSpent.toFixed(2)}</p>
          </div>
          <div>
            <p className="opacity-60 text-xs">Visits</p>
            <p className="font-semibold">{data.visitCount}</p>
          </div>
        </div>
      </div>

      {/* QR Code */}
      <div className="rounded-xl bg-white border p-5 flex flex-col items-center gap-3">
        <p className="text-sm font-semibold text-center text-gray-700">Show this at the register</p>
        <div className="p-3 bg-white rounded-xl border-2 border-gray-100">
          <QRCodeSVG ref={qrRef} value={portalUrl} size={180} level="M" />
        </div>
        <p className="text-xs text-gray-400 text-center break-all max-w-xs">{portalUrl}</p>
        <div className="flex gap-2 w-full">
          <Button variant="outline" size="sm" className="flex-1" onClick={handleCopy}>
            {copied ? <><Check className="w-3.5 h-3.5 mr-1.5" />Copied!</> : <><Copy className="w-3.5 h-3.5 mr-1.5" />Copy Link</>}
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={handleDownloadQR}>
            Download QR
          </Button>
        </div>
      </div>

      {/* Wallet Buttons */}
      <div className="space-y-2">
        <button
          onClick={handleAppleWallet}
          disabled={walletLoading !== null}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-black text-white py-3 font-semibold text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {walletLoading === "apple" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4" />}
          Add to Apple Wallet
        </button>
        <button
          onClick={handleGoogleWallet}
          disabled={walletLoading !== null}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-white text-gray-800 border-2 border-gray-200 py-3 font-semibold text-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          {walletLoading === "google" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wallet className="w-4 h-4 text-blue-500" />}
          Save to Google Wallet
        </button>
      </div>
    </div>
  );
}

/* ── Profile Tab ────────────────────────────────────────────────────────────── */

function ProfileTab({ data, token }: { data: PortalData; token: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    firstName:   data.firstName  ?? "",
    lastName:    data.lastName   ?? "",
    email:       data.email      ?? "",
    phone:       data.phone      ?? "",
    address:     data.address    ?? "",
    dateOfBirth: data.dateOfBirth ?? "",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/portal/${token}/profile`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error();
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["portal", token] });
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof typeof form, type = "text") => (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-gray-600">{label}</Label>
      <Input
        type={type}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        className="text-sm"
      />
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      <div className="rounded-xl bg-white border p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-800 mb-1">Personal Details</p>
        {field("First Name",    "firstName")}
        {field("Last Name",     "lastName")}
        {field("Email",         "email",       "email")}
        {field("Phone",         "phone",       "tel")}
        {field("Address",       "address")}
        {field("Date of Birth", "dateOfBirth", "date")}
      </div>
      <Button className="w-full" onClick={handleSave} disabled={saving}>
        {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Save Changes
      </Button>
    </div>
  );
}

/* ── Appointments Tab ───────────────────────────────────────────────────────── */

function AppointmentsTab({ token }: { token: string }) {
  const { data = [], isLoading } = usePortalAppointments(token, true);
  const [booking, setBooking] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", scheduledAt: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const handleBook = async () => {
    if (!form.title || !form.scheduledAt) { toast.error("Title and date/time are required"); return; }
    setSaving(true);
    try {
      const r = await fetch(`/api/portal/${token}/appointments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, durationMinutes: 30 }),
      });
      if (!r.ok) throw new Error();
      toast.success("Appointment booked!");
      setForm({ title: "", description: "", scheduledAt: "", notes: "" });
      setBooking(false);
      qc.invalidateQueries({ queryKey: ["portal-appts", token] });
    } catch {
      toast.error("Could not book appointment");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>;

  return (
    <div className="p-4 space-y-3">
      {!booking ? (
        <Button className="w-full" onClick={() => setBooking(true)}>
          <Calendar className="w-4 h-4 mr-2" /> Book an Appointment
        </Button>
      ) : (
        <div className="rounded-xl bg-white border p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <button onClick={() => setBooking(false)} className="text-gray-500 hover:text-gray-700">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="text-sm font-semibold">New Appointment</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Service / Title *</Label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Haircut, Consultation…" className="text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Date & Time *</Label>
            <Input type="datetime-local" value={form.scheduledAt} onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))} className="text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Notes (optional)</Label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any special requests…" className="text-sm" />
          </div>
          <Button className="w-full" onClick={handleBook} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Confirm Booking
          </Button>
        </div>
      )}

      {data.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <Calendar className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No appointments yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {data.map(a => {
            const dt = new Date(a.scheduledAt);
            return (
              <div key={a.id} className="rounded-xl bg-white border p-4">
                <div className="flex justify-between items-start mb-1">
                  <p className="font-semibold text-sm">{a.title}</p>
                  <span className={cn("text-xs rounded-full px-2 py-0.5 font-medium", APPT_COLORS[a.status] ?? "bg-gray-100 text-gray-700")}>
                    {a.status.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
                  <Clock className="w-3 h-3" />
                  {dt.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                  {" · "}{dt.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}
                  {" · "}{a.durationMinutes} min
                </div>
                {a.notes && <p className="text-xs text-gray-500 mt-1.5 italic">{a.notes}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Services / Repairs Tab ─────────────────────────────────────────────────── */

function ServicesTab({ token }: { token: string }) {
  const { data = [], isLoading } = usePortalServices(token, true);
  const [expanded, setExpanded] = useState<number | null>(null);

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>;

  if (data.length === 0) return (
    <div className="text-center py-14 text-gray-400 px-4">
      <Wrench className="w-10 h-10 mx-auto mb-2 opacity-30" />
      <p className="text-sm">No service jobs on record</p>
    </div>
  );

  return (
    <div className="p-4 space-y-2">
      {data.map(job => (
        <div
          key={job.id}
          className="rounded-xl bg-white border overflow-hidden cursor-pointer"
          onClick={() => setExpanded(expanded === job.id ? null : job.id)}
        >
          <div className="p-4">
            <div className="flex justify-between items-start mb-1.5">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{job.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">#{job.jobNumber}</p>
              </div>
              <span className={cn("text-xs rounded-full px-2.5 py-0.5 border font-medium ml-2 shrink-0", JOB_COLORS[job.status] ?? "bg-gray-100 text-gray-700 border-gray-200")}>
                {JOB_LABEL[job.status] ?? job.status}
              </span>
            </div>
            {job.deviceDescription && (
              <p className="text-xs text-gray-500 truncate">{job.deviceDescription}</p>
            )}
          </div>

          {expanded === job.id && (
            <div className="border-t bg-gray-50 px-4 py-3 space-y-2 text-xs text-gray-600">
              {job.deviceType && <p><span className="font-medium">Device type:</span> {job.deviceType}</p>}
              {job.workDescription && <p><span className="font-medium">Work description:</span> {job.workDescription}</p>}
              {job.estimatedCost !== null && <p><span className="font-medium">Estimated cost:</span> ${job.estimatedCost.toFixed(2)}</p>}
              {job.notes && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5">
                  <p className="font-medium text-amber-800 mb-0.5">Notes from the workshop</p>
                  <p className="text-amber-700 leading-relaxed">{job.notes}</p>
                </div>
              )}
              <p className="text-gray-400">Booked: {new Date(job.createdAt).toLocaleDateString("en-AU")}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function QuotesTab({ token }: { token: string }) {
  const { data = [], isLoading } = usePortalQuotes(token, true);
  const qc = useQueryClient();
  const [pending, setPending] = useState<number | null>(null);

  const respond = async (quoteId: number, decision: "accept" | "decline") => {
    setPending(quoteId);
    try {
      const r = await fetch(`/api/portal/${token}/quotes/${quoteId}/respond`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ decision }),
      });
      if (!r.ok) throw new Error();
      qc.invalidateQueries({ queryKey: ["portal-quotes", token] });
    } catch {
      toast.error("Sorry, that couldn't be saved. Please try again.");
    } finally {
      setPending(null);
    }
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>;

  if (data.length === 0) return (
    <div className="text-center py-14 text-gray-400 px-4">
      <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
      <p className="text-sm">No quotes to review</p>
    </div>
  );

  return (
    <div className="p-4 space-y-3">
      {data.map((q) => {
        const isOpen = q.status === "sent";
        return (
          <div key={q.id} className="rounded-xl bg-white border overflow-hidden">
            <div className="p-4">
              <div className="flex justify-between items-start mb-1.5">
                <div>
                  <p className="font-semibold text-sm">{q.quoteNumber}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{new Date(q.createdAt).toLocaleDateString("en-AU")}</p>
                </div>
                <span className={cn("text-xs rounded-full px-2.5 py-0.5 border font-medium ml-2 shrink-0",
                  q.status === "accepted" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : q.status === "declined" ? "bg-red-50 text-red-700 border-red-200"
                  : q.status === "expired" ? "bg-gray-100 text-gray-500 border-gray-200"
                  : "bg-amber-50 text-amber-700 border-amber-200")}>
                  {q.status === "sent" ? "Awaiting your approval" : q.status.charAt(0).toUpperCase() + q.status.slice(1)}
                </span>
              </div>
              <div className="mt-2 space-y-1">
                {q.items.map((it, i) => (
                  <div key={i} className="flex justify-between text-xs text-gray-600">
                    <span className="truncate pr-2">{it.quantity} × {it.description}</span>
                    <span className="tabular-nums shrink-0">${(it.quantity * it.unitPrice).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between font-semibold text-sm mt-2 pt-2 border-t">
                <span>Total</span><span className="tabular-nums">${q.total.toFixed(2)}</span>
              </div>
              {q.depositRequired != null && q.depositRequired > 0 && (
                <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                  A deposit of <span className="font-semibold tabular-nums">${q.depositRequired.toFixed(2)}</span> is payable in store to begin this repair.
                </div>
              )}
              {q.notes && <p className="text-xs text-gray-500 mt-2">{q.notes}</p>}
            </div>
            {isOpen && (
              <div className="border-t bg-gray-50 px-4 py-3 flex gap-2">
                <button
                  onClick={() => respond(q.id, "accept")}
                  disabled={pending === q.id}
                  className="flex-1 rounded-lg bg-emerald-600 text-white text-sm font-medium py-2 hover:bg-emerald-700 disabled:opacity-50">
                  Approve
                </button>
                <button
                  onClick={() => respond(q.id, "decline")}
                  disabled={pending === q.id}
                  className="flex-1 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium py-2 hover:bg-gray-100 disabled:opacity-50">
                  Decline
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Shell ──────────────────────────────────────────────────────────────────── */

const TABS = [
  { id: "loyalty",      label: "Loyalty",      icon: Star },
  { id: "profile",      label: "Profile",      icon: User },
  { id: "appointments", label: "Appointments", icon: Calendar },
  { id: "repairs",      label: "Repairs",      icon: Wrench },
  { id: "quotes",       label: "Quotes",       icon: FileText },
] as const;

type PortalTab = typeof TABS[number]["id"];

export default function PortalPage() {
  const { businessUsername, token } = useParams<{ businessUsername?: string; token: string }>();
  const [tab, setTab] = useState<PortalTab>("loyalty");

  // Custom domain: resolve businessUsername from hostname if not in URL
  const isCustomDomain = !businessUsername;
  const { data: resolvedDomain, isLoading: domainLoading, error: domainError } = useQuery<{ username: string | null; businessName: string }>({
    queryKey: ["resolve-domain", window.location.hostname],
    queryFn: async () => {
      const r = await fetch(`/api/portal/resolve-domain?host=${encodeURIComponent(window.location.hostname)}`, { credentials: "include" });
      if (!r.ok) throw new Error("Domain not found");
      return r.json();
    },
    enabled: isCustomDomain,
    retry: false,
  });

  const { data, isLoading, error } = usePortalData(token ?? "");

  /* Brand the home-screen icon for this business's customer portal. */
  useEffect(() => {
    if (data?.merchant) setHomeScreenApp({ name: data.merchant.businessName, iconUrl: data.merchant.logoUrl, themeColor: "#f59e0b" });
  }, [data]);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="font-semibold text-gray-800">Invalid portal link</p>
          <p className="text-sm text-gray-500 mt-1">This link is missing required information.</p>
        </div>
      </div>
    );
  }

  if (isCustomDomain && domainLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  if (isCustomDomain && (domainError || !resolvedDomain)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="font-semibold text-gray-800">Portal not found</p>
          <p className="text-sm text-gray-500 mt-1">This domain is not connected to a customer portal.</p>
        </div>
      </div>
    );
  }

  const effectiveUsername = businessUsername ?? resolvedDomain?.username ?? undefined;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="font-semibold text-gray-800">Portal not found</p>
          <p className="text-sm text-gray-500 mt-1">This link may be invalid or expired.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-sm">
        <div className="w-9 h-9 rounded-xl bg-amber-400 flex items-center justify-center text-black font-bold text-base shrink-0">
          {data.merchant.businessName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate leading-tight">{data.merchant.businessName}</p>
          <p className="text-xs text-gray-400">Customer Portal</p>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-24 max-w-md mx-auto w-full">
        {tab === "loyalty"      && <LoyaltyTab      data={data} token={token} businessUsername={effectiveUsername} />}
        {tab === "profile"      && <ProfileTab      data={data} token={token} />}
        {tab === "appointments" && <AppointmentsTab token={token} />}
        {tab === "repairs"      && <ServicesTab     token={token} />}
        {tab === "quotes"       && <QuotesTab       token={token} />}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t flex max-w-md mx-auto z-10">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 flex flex-col items-center justify-center py-3.5 gap-1 text-xs font-medium transition-colors",
              tab === t.id ? "text-amber-500" : "text-gray-400 hover:text-gray-600",
            )}
          >
            <t.icon className={cn("w-6 h-6", tab === t.id && "fill-current opacity-80")} />
            <span className="text-[11px]">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
