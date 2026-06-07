import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute } from "wouter";
import {
  Wrench, ScanLine, Loader2, LogOut, ChevronLeft, Phone, Mail,
  AlertTriangle, ShieldAlert, Search, ShieldCheck, KeyRound, Camera,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tech App — mobile companion for technicians.
 *
 * Served at /b/:businessUsername/t/webapp. Technicians sign in with their
 * staff PIN (scoped to the business in the URL) and get a two-tab view:
 *   Services — all current service jobs in the system
 *   Scan     — camera QR scanner for printed Service Ticket codes
 *
 * All data flows through /api/tech/* which is session-scoped to the
 * technician's own business. Scanning a ticket from another business gets a
 * 403 (reason: foreign_business) and shows the privacy screen.
 */

/* ── Types (tech API shapes) ─────────────────────────────────────────── */

type TechStaff = { id: number; name: string; role: string };
type TechBusiness = { businessName: string; logoUrl: string | null };

type TechJobSummary = {
  id: number;
  jobNumber: string;
  status: string;
  customerName: string | null;
  deviceType: string | null;
  deviceDescription: string | null;
  isCritical: boolean;
  isUnderWarranty: boolean;
  bookInDate: string;
  createdAt: string;
};

type TechJobDetail = TechJobSummary & {
  customerPhone: string | null;
  customerEmail: string | null;
  serialNumber: string | null;
  condition: string | null;
  workDescription: string | null;
  additionalEquipment: string | null;
  passwordOrPin: string | null;
  accounts: string | null;
  notes: string | null;
  isPartnerRepair: boolean;
  partnerRepairCode: string | null;
  photos: string[];
  updatedAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  "in-progress": "In Progress",
  "awaiting-parts": "Awaiting Parts",
  "awaiting-stock": "Awaiting Stock",
  "at-repairer": "At Repairer",
  "awaiting-partner-approval": "Awaiting Partner Approval",
  "partner-replacement": "Partner Replacement",
  "awaiting-customer": "Awaiting Customer",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700",
  "in-progress": "bg-blue-100 text-blue-700",
  "awaiting-parts": "bg-amber-100 text-amber-700",
  "awaiting-stock": "bg-amber-100 text-amber-700",
  "at-repairer": "bg-violet-100 text-violet-700",
  "awaiting-partner-approval": "bg-cyan-100 text-cyan-700",
  "partner-replacement": "bg-cyan-100 text-cyan-700",
  "awaiting-customer": "bg-pink-100 text-pink-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
};

function statusLabel(s: string): string {
  return STATUS_LABELS[s] ?? s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold", STATUS_COLORS[status] ?? "bg-slate-100 text-slate-700")}>
      {statusLabel(status)}
    </span>
  );
}

/* ── Tech API helper ─────────────────────────────────────────────────── */

async function techFetch<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const r = await fetch(`/api/tech${path}`, {
      credentials: "include",
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      ...init,
    });
    const data = (await r.json().catch(() => null)) as T | null;
    return { ok: r.ok, status: r.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

/** Extract a service-job id from scanned QR text. Accepts the printed
    Service Ticket QR (a /service-jobs/:id URL) or a bare numeric id. */
function parseScannedJobId(text: string): number | null {
  const urlMatch = text.match(/\/service-jobs\/(\d+)\b/);
  if (urlMatch) return parseInt(urlMatch[1], 10);
  if (/^\d+$/.test(text.trim())) return parseInt(text.trim(), 10);
  return null;
}

/* ── QR scanner (BarcodeDetector with jsQR fallback) ─────────────────── */

type BarcodeDetectorLike = { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };
declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

function QrScanner({ onScan, paused }: { onScan: (text: string) => void; paused: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
      } catch {
        setError("Camera access was denied. Allow camera permission to scan service tickets.");
        return;
      }
      if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => {});

      const detector = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ["qr_code"] }) : null;
      /* jsQR is only loaded when the native BarcodeDetector is missing
         (e.g. iOS Safari) — keeps it out of the main bundle. */
      const jsqr = detector ? null : (await import("jsqr")).default;
      let lastValue = "";
      let lastAt = 0;

      const tick = async () => {
        if (stopped) return;
        const v = videoRef.current;
        if (v && v.readyState >= 2 && !pausedRef.current) {
          let value: string | null = null;
          if (detector) {
            try {
              const codes = await detector.detect(v);
              value = codes[0]?.rawValue ?? null;
            } catch { /* detector can throw on some frames — skip */ }
          } else if (jsqr && canvasRef.current) {
            const canvas = canvasRef.current;
            const w = (canvas.width = v.videoWidth);
            const h = (canvas.height = v.videoHeight);
            if (w && h) {
              const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
              ctx.drawImage(v, 0, 0, w, h);
              const img = ctx.getImageData(0, 0, w, h);
              value = jsqr(img.data, w, h)?.data ?? null;
            }
          }
          /* Debounce: ignore repeats of the same code within 3 s */
          if (value && (value !== lastValue || Date.now() - lastAt > 3000)) {
            lastValue = value;
            lastAt = Date.now();
            onScanRef.current(value);
          }
        }
        raf = requestAnimationFrame(() => { void tick(); });
      };
      raf = requestAnimationFrame(() => { void tick(); });
    };

    void start();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 text-center px-8 py-16">
        <Camera className="w-10 h-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-black aspect-square">
      <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />
      {/* Targeting frame */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-3/5 aspect-square rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      </div>
      <p className="absolute bottom-3 inset-x-0 text-center text-white/90 text-xs font-medium">
        Point the camera at the Service Ticket QR code
      </p>
    </div>
  );
}

/* ── Privacy screen (foreign-business scan) ──────────────────────────── */

function PrivacyScreen({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col items-center justify-center gap-5 px-8 text-center">
      <div className="w-20 h-20 rounded-full bg-red-500/15 flex items-center justify-center">
        <ShieldAlert className="w-10 h-10 text-red-400" />
      </div>
      <div>
        <h2 className="text-xl font-bold">Privacy Protected</h2>
        <p className="text-sm text-white/70 mt-2 leading-relaxed">
          This service ticket belongs to a different business. For customer
          privacy, its details can only be viewed by staff of that business.
        </p>
      </div>
      <button
        onClick={onDismiss}
        className="mt-2 px-6 py-3 rounded-xl bg-white text-slate-900 font-semibold text-sm active:scale-95 transition-transform"
      >
        Scan Again
      </button>
    </div>
  );
}

/* ── Job detail view ─────────────────────────────────────────────────── */

function DetailRow({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("text-sm mt-0.5 whitespace-pre-wrap break-words", mono && "font-mono text-xs")}>{value}</p>
    </div>
  );
}

function JobDetailView({ jobId, onBack }: { jobId: number; onBack: () => void }) {
  const [job, setJob] = useState<TechJobDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "notfound" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    void techFetch<TechJobDetail>(`/service-jobs/${jobId}`).then((r) => {
      if (cancelled) return;
      if (r.ok && r.data) { setJob(r.data); setState("ready"); }
      else setState(r.status === 404 ? "notfound" : "error");
    });
    return () => { cancelled = true; };
  }, [jobId]);

  return (
    <div className="space-y-4 pb-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-medium text-primary -ml-1">
        <ChevronLeft className="w-4 h-4" /> All Services
      </button>

      {state === "loading" && (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      )}
      {state === "notfound" && <p className="text-sm text-muted-foreground text-center py-16">Service job not found.</p>}
      {state === "error" && <p className="text-sm text-muted-foreground text-center py-16">Couldn't load this job — try again.</p>}

      {state === "ready" && job && (
        <>
          <div className="rounded-2xl border bg-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-lg font-bold">{job.jobNumber}</p>
                <p className="text-xs text-muted-foreground">
                  Booked in {new Date(job.bookInDate).toLocaleDateString("en-AU")}
                </p>
              </div>
              <StatusBadge status={job.status} />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {job.isCritical && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700">
                  <AlertTriangle className="w-3 h-3" /> Critical
                </span>
              )}
              {job.isUnderWarranty && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">
                  <ShieldCheck className="w-3 h-3" /> Warranty
                </span>
              )}
              {job.isPartnerRepair && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-700">
                  Partner Repair{job.partnerRepairCode ? ` · ${job.partnerRepairCode}` : ""}
                </span>
              )}
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Customer</p>
            <p className="text-sm font-semibold">{job.customerName ?? "Walk-in"}</p>
            <div className="flex gap-2 flex-wrap">
              {job.customerPhone && (
                <a href={`tel:${job.customerPhone}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-xs font-medium">
                  <Phone className="w-3.5 h-3.5" /> {job.customerPhone}
                </a>
              )}
              {job.customerEmail && (
                <a href={`mailto:${job.customerEmail}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-xs font-medium break-all">
                  <Mail className="w-3.5 h-3.5" /> {job.customerEmail}
                </a>
              )}
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-4 space-y-3">
            <DetailRow label="Device" value={[job.deviceType, job.deviceDescription].filter(Boolean).join(" — ")} />
            <DetailRow label="Serial Number" value={job.serialNumber} mono />
            <DetailRow label="Condition" value={job.condition} />
            <DetailRow label="Fault / Work Required" value={job.workDescription} />
            <DetailRow label="Equipment / Accessories" value={job.additionalEquipment} />
            <DetailRow label="Logins / PINs" value={job.passwordOrPin} mono />
            <DetailRow label="Accounts" value={job.accounts} mono />
            <DetailRow label="Notes" value={job.notes} />
          </div>

          {job.photos.length > 0 && (
            <div className="rounded-2xl border bg-card p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Device Photos</p>
              <div className="grid grid-cols-3 gap-2">
                {job.photos.map((p, i) => (
                  <img key={i} src={p} alt={`device ${i + 1}`} className="w-full aspect-square object-cover rounded-lg border" />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Services list ───────────────────────────────────────────────────── */

function ServicesList({ onOpen }: { onOpen: (id: number) => void }) {
  const [jobs, setJobs] = useState<TechJobSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    void techFetch<{ items: TechJobSummary[] }>("/service-jobs").then((r) => {
      if (cancelled) return;
      if (r.ok && r.data) setJobs(r.data.items);
      else setError(true);
    });
    return () => { cancelled = true; };
  }, []);

  if (error) return <p className="text-sm text-muted-foreground text-center py-16">Couldn't load services — pull down to retry.</p>;
  if (!jobs) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const q = search.trim().toLowerCase();
  const filtered = q
    ? jobs.filter((j) =>
        j.jobNumber.toLowerCase().includes(q) ||
        (j.customerName ?? "").toLowerCase().includes(q) ||
        (j.deviceType ?? "").toLowerCase().includes(q) ||
        (j.deviceDescription ?? "").toLowerCase().includes(q))
    : jobs;

  return (
    <div className="space-y-3 pb-4">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search job no, customer, device…"
          className="w-full rounded-xl border bg-card pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-16">
          {q ? `No services match "${search}"` : "No current services — all caught up!"}
        </p>
      ) : (
        filtered.map((j) => (
          <button
            key={j.id}
            onClick={() => onOpen(j.id)}
            className="w-full text-left rounded-2xl border bg-card p-4 active:scale-[0.99] transition-transform"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold text-sm">{j.jobNumber}</p>
              <StatusBadge status={j.status} />
            </div>
            <p className="text-sm mt-1 truncate">{j.customerName ?? "Walk-in"}</p>
            <p className="text-xs text-muted-foreground truncate">
              {[j.deviceType, j.deviceDescription].filter(Boolean).join(" — ") || "No device details"}
            </p>
            {(j.isCritical || j.isUnderWarranty) && (
              <div className="flex gap-1.5 mt-1.5">
                {j.isCritical && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">
                    <AlertTriangle className="w-2.5 h-2.5" /> CRITICAL
                  </span>
                )}
                {j.isUnderWarranty && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">WARRANTY</span>
                )}
              </div>
            )}
          </button>
        ))
      )}
    </div>
  );
}

/* ── Scan tab ────────────────────────────────────────────────────────── */

function ScanTab({ onOpenJob }: { onOpenJob: (id: number) => void }) {
  const [busy, setBusy] = useState(false);
  const [privacyScreen, setPrivacyScreen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleScan = useCallback(async (text: string) => {
    const id = parseScannedJobId(text);
    if (id == null) {
      setMessage("That QR code isn't a KoaPOS service ticket.");
      return;
    }
    setBusy(true);
    setMessage(null);
    const r = await techFetch<{ reason?: string }>(`/service-jobs/${id}`);
    setBusy(false);
    if (r.ok) {
      onOpenJob(id);
    } else if (r.status === 403) {
      setPrivacyScreen(true);
    } else if (r.status === 404) {
      setMessage("No service job matches that ticket.");
    } else if (r.status === 401) {
      setMessage("Session expired — please sign in again.");
    } else {
      setMessage("Couldn't look up that ticket — try again.");
    }
  }, [onOpenJob]);

  return (
    <div className="space-y-4 pb-4">
      <QrScanner onScan={(t) => void handleScan(t)} paused={busy || privacyScreen} />
      {busy && (
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Looking up ticket…
        </p>
      )}
      {message && <p className="text-sm text-center text-amber-600 font-medium px-4">{message}</p>}
      <p className="text-xs text-muted-foreground text-center px-6">
        Scan the QR code in the bottom-left corner of a printed Service Ticket to open the repair instantly.
      </p>
      {privacyScreen && <PrivacyScreen onDismiss={() => setPrivacyScreen(false)} />}
    </div>
  );
}

/* ── Login screen ────────────────────────────────────────────────────── */

function LoginScreen({
  business, username, onLoggedIn,
}: {
  business: TechBusiness | null;
  username: string;
  onLoggedIn: (staff: TechStaff, business: TechBusiness) => void;
}) {
  const [pin, setPin] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!pin || pending) return;
    setPending(true);
    setError(null);
    const r = await techFetch<{ staff: TechStaff; business: TechBusiness; error?: string }>(
      `/b/${encodeURIComponent(username)}/login`,
      { method: "POST", body: JSON.stringify({ pin }) },
    );
    setPending(false);
    if (r.ok && r.data?.staff) {
      onLoggedIn(r.data.staff, r.data.business);
    } else {
      setPin("");
      setError((r.data as { error?: string } | null)?.error ?? "Sign in failed — try again.");
    }
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        {business?.logoUrl ? (
          <img src={business.logoUrl} alt="logo" className="w-16 h-16 rounded-2xl object-contain border bg-white" />
        ) : (
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Wrench className="w-8 h-8 text-primary" />
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold">{business?.businessName ?? "Tech App"}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Technician sign in</p>
        </div>
      </div>

      <div className="w-full max-w-xs space-y-3">
        <div className="relative">
          <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
            placeholder="Staff PIN"
            className="w-full rounded-xl border bg-card pl-9 pr-3 py-3 text-base tracking-widest outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        {error && <p className="text-sm text-red-600 text-center font-medium">{error}</p>}
        <button
          onClick={() => void submit()}
          disabled={!pin || pending}
          className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-semibold text-sm disabled:opacity-50 active:scale-[0.99] transition-transform"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Sign In"}
        </button>
        <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
          Use the staff PIN set for you in KoaPOS. Only staff of {business?.businessName ?? "this business"} can access these service jobs.
        </p>
      </div>
    </div>
  );
}

/* ── Root page ───────────────────────────────────────────────────────── */

export default function TechAppPage() {
  const [, params] = useRoute("/b/:businessUsername/t/webapp");
  const username = params?.businessUsername ?? "";

  const [phase, setPhase] = useState<"boot" | "login" | "app" | "no-business">("boot");
  const [business, setBusiness] = useState<TechBusiness | null>(null);
  const [staff, setStaff] = useState<TechStaff | null>(null);

  const [tab, setTab] = useState<"services" | "scan">("services");
  const [openJobId, setOpenJobId] = useState<number | null>(null);

  /* Boot: resolve business + restore an existing tech session */
  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    void (async () => {
      const info = await techFetch<TechBusiness>(`/b/${encodeURIComponent(username)}/info`);
      if (cancelled) return;
      if (!info.ok) { setPhase("no-business"); return; }
      setBusiness(info.data);
      const me = await techFetch<{ staff: TechStaff; business: TechBusiness }>("/me");
      if (cancelled) return;
      if (me.ok && me.data?.staff) {
        setStaff(me.data.staff);
        setPhase("app");
      } else {
        setPhase("login");
      }
    })();
    return () => { cancelled = true; };
  }, [username]);

  const logout = async () => {
    await techFetch("/logout", { method: "POST" });
    setStaff(null);
    setOpenJobId(null);
    setTab("services");
    setPhase("login");
  };

  if (phase === "boot") {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (phase === "no-business") {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-3 px-8 text-center">
        <ShieldAlert className="w-10 h-10 text-muted-foreground" />
        <h1 className="text-lg font-bold">Business not found</h1>
        <p className="text-sm text-muted-foreground">Check the link with your manager — the business address in the URL doesn't exist.</p>
      </div>
    );
  }

  if (phase === "login") {
    return <LoginScreen business={business} username={username} onLoggedIn={(s, b) => { setStaff(s); setBusiness(b); setPhase("app"); }} />;
  }

  return (
    <div className="min-h-dvh bg-muted/30 flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {business?.logoUrl ? (
            <img src={business.logoUrl} alt="" className="w-8 h-8 rounded-lg object-contain border bg-white shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Wrench className="w-4 h-4 text-primary" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">{business?.businessName}</p>
            <p className="text-[11px] text-muted-foreground truncate">{staff?.name}</p>
          </div>
        </div>
        <button onClick={() => void logout()} className="p-2 rounded-lg hover:bg-muted text-muted-foreground" aria-label="Sign out">
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 pt-4 pb-24">
        {openJobId != null ? (
          <JobDetailView jobId={openJobId} onBack={() => setOpenJobId(null)} />
        ) : tab === "services" ? (
          <ServicesList onOpen={setOpenJobId} />
        ) : (
          <ScanTab onOpenJob={(id) => { setOpenJobId(id); setTab("services"); }} />
        )}
      </main>

      {/* Bottom nav — Services / Scan */}
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-background border-t max-w-lg mx-auto" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="grid grid-cols-2">
          <button
            onClick={() => { setTab("services"); setOpenJobId(null); }}
            className={cn(
              "flex flex-col items-center gap-1 py-3 text-[11px] font-semibold transition-colors",
              tab === "services" && openJobId == null ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Wrench className="w-5 h-5" />
            Services
          </button>
          <button
            onClick={() => { setTab("scan"); setOpenJobId(null); }}
            className={cn(
              "flex flex-col items-center gap-1 py-3 text-[11px] font-semibold transition-colors",
              tab === "scan" && openJobId == null ? "text-primary" : "text-muted-foreground",
            )}
          >
            <ScanLine className="w-5 h-5" />
            Scan
          </button>
        </div>
      </nav>
    </div>
  );
}
