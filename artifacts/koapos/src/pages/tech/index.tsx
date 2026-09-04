import { useState, useEffect, useRef, useCallback } from "react";
import { useRoute } from "wouter";
import {
  Wrench, ScanLine, Loader2, LogOut, ChevronLeft, Phone, Mail,
  AlertTriangle, ShieldAlert, Search, ShieldCheck, KeyRound, Camera,
  StickyNote, Upload, FileText, Play, X, ChevronDown,
  CalendarClock, Plus, Clock, User, Check,
} from "lucide-react";
import { cn, telHref } from "@/lib/utils";
import { setHomeScreenApp } from "@/lib/home-screen";

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
  deviceColour: string | null;
  deviceQuantity: number | null;
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
  /** From Management > Tech App — whether techs may change job status. */
  canChangeStatus: boolean;
};

type TechAppointment = {
  id: number;
  title: string;
  customerId: number | null;
  customerName: string | null;
  customerPhone: string | null;
  staffId: number | null;
  staffName: string | null;
  scheduledAt: string;
  endAt: string;
  durationMinutes: number;
  status: string;
  notes: string | null;
};

type TechCustomerLite = { id: number; name: string; phone: string | null };

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  "in-progress": "In Progress",
  "awaiting-parts": "Awaiting Parts",
  "awaiting-stock": "Awaiting Stock",
  "at-repairer": "At Repairer",
  "awaiting-partner-approval": "Awaiting Partner Approval",
  "partner-replacement": "Partner Replacement",
  "awaiting-customer": "Awaiting Customer",
  "awaiting-pickup": "Completed - Awaiting Pickup",
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
  "awaiting-pickup": "bg-lime-100 text-lime-700",
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

/* ── Note + media helpers (formats match the admin Service Job dialog) ── */

function parseNotes(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw.split("---").map((s) => s.trim()).filter(Boolean);
}

function buildNoteTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `[${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}]`;
}

/** Convert a picked file to a data URI. Images are downscaled and
    re-encoded so phone camera shots fit the API's request size limit;
    videos/PDFs pass through as-is (capped at 6 MB). */
async function fileToDataUri(file: File): Promise<string> {
  if (file.type.startsWith("image/")) {
    try {
      const bitmap = await createImageBitmap(file);
      const MAX = 1600;
      const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      return canvas.toDataURL("image/jpeg", 0.85);
    } catch { /* unsupported format — fall through to a raw read */ }
  }
  if (file.size > 6 * 1024 * 1024) {
    throw new Error(`"${file.name}" is too large — videos and files must be under 6 MB.`);
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Couldn't read "${file.name}".`));
    reader.readAsDataURL(file);
  });
}

/** Open a non-image data URI (e.g. PDF) in a new tab via a blob URL —
    mobile browsers refuse to navigate to data: URIs directly. */
function openDataUri(src: string) {
  try {
    const comma = src.indexOf(",");
    const mime = src.slice(5, src.indexOf(";"));
    const bytes = Uint8Array.from(atob(src.slice(comma + 1)), (c) => c.charCodeAt(0));
    window.open(URL.createObjectURL(new Blob([bytes], { type: mime })), "_blank");
  } catch { /* malformed data URI — nothing to open */ }
}

/** Extract a service-job id from scanned QR text. Accepts the printed
    Service Ticket QR — either the Tech App deep link (…/t/webapp?job=:id) or the
    older /service-jobs/:id URL — or a bare numeric id. */
function parseScannedJobId(text: string): number | null {
  const jobParam = text.match(/[?&]job=(\d+)\b/);
  if (jobParam) return parseInt(jobParam[1], 10);
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

  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const changeStatus = async (status: string) => {
    if (!job || status === job.status || savingStatus) return;
    setSavingStatus(true);
    setActionError(null);
    const r = await techFetch<{ status: string; notes: string | null }>(`/service-jobs/${jobId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    setSavingStatus(false);
    if (r.ok && r.data) {
      setJob((j) => (j ? { ...j, status: r.data!.status, notes: r.data!.notes } : j));
    } else {
      setActionError("Couldn't update the status — try again.");
    }
  };

  const addNote = async () => {
    const text = noteText.trim();
    if (!text || savingNote) return;
    setSavingNote(true);
    setActionError(null);
    const r = await techFetch<{ notes: string }>(`/service-jobs/${jobId}/notes`, {
      method: "POST",
      body: JSON.stringify({ text, timestamp: buildNoteTimestamp() }),
    });
    setSavingNote(false);
    if (r.ok && r.data) {
      setJob((j) => (j ? { ...j, notes: r.data!.notes } : j));
      setNoteText("");
    } else {
      setActionError("Couldn't save the note — try again.");
    }
  };

  const addFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || uploading) return;
    setUploading(true);
    setActionError(null);
    try {
      const photos: string[] = [];
      for (const file of files) photos.push(await fileToDataUri(file));
      const r = await techFetch<{ photos: string[] }>(`/service-jobs/${jobId}/photos`, {
        method: "POST",
        body: JSON.stringify({ photos }),
      });
      if (r.ok && r.data) setJob((j) => (j ? { ...j, photos: r.data!.photos } : j));
      else setActionError("Upload failed — try again.");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Upload failed — try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

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
              {job.canChangeStatus ? (
                /* Status select styled as the status badge — tap to change */
                <span className={cn("relative inline-flex items-center rounded-full", STATUS_COLORS[job.status] ?? "bg-slate-100 text-slate-700", savingStatus && "opacity-60")}>
                  <select
                    value={job.status}
                    onChange={(e) => void changeStatus(e.target.value)}
                    disabled={savingStatus}
                    aria-label="Job status"
                    className="appearance-none bg-transparent pl-2.5 pr-6 py-0.5 text-[11px] font-semibold outline-none cursor-pointer"
                  >
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3 h-3 absolute right-1.5 pointer-events-none" />
                </span>
              ) : (
                <StatusBadge status={job.status} />
              )}
            </div>
            {(job.status === "completed" || job.status === "cancelled") && (
              <p className="text-[11px] text-muted-foreground">
                This job is closed — it has moved to Service History and will leave the Services list.
              </p>
            )}
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
                <a href={telHref(job.customerPhone)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-xs font-medium">
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
            <DetailRow label="Colour" value={job.deviceColour} />
            <DetailRow label="Quantity" value={job.deviceQuantity != null ? String(job.deviceQuantity) : null} />
            <DetailRow label="Serial Number" value={job.serialNumber} mono />
            <DetailRow label="Condition" value={job.condition} />
            <DetailRow label="Fault / Work Required" value={job.workDescription} />
            <DetailRow label="Equipment / Accessories" value={job.additionalEquipment} />
            <DetailRow label="Logins / PINs" value={job.passwordOrPin} mono />
            <DetailRow label="Accounts" value={job.accounts} mono />
          </div>

          {/* Notes — newest first, with an add form so techs can log work
              from the bench. Entries share the admin dialog's format. */}
          <div className="rounded-2xl border bg-card p-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Notes</p>
            <div className="flex gap-2 items-stretch">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note to this service…"
                rows={2}
                className="flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              />
              <button
                onClick={() => void addNote()}
                disabled={!noteText.trim() || savingNote}
                className="shrink-0 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 active:scale-95 transition-transform"
              >
                {savingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
              </button>
            </div>
            {parseNotes(job.notes).length === 0 ? (
              <p className="text-sm text-muted-foreground">No notes yet.</p>
            ) : (
              <div className="space-y-2">
                {[...parseNotes(job.notes)].reverse().map((note, i) => {
                  const tsMatch = note.match(/^\[(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2})\]\s*/);
                  const ts = tsMatch ? tsMatch[1] : null;
                  const text = ts ? note.slice(tsMatch![0].length) : note;
                  return (
                    <div key={i} className="rounded-xl border bg-muted/30 p-3 text-sm space-y-1">
                      {ts && (
                        <p className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
                          <StickyNote className="w-3 h-3" /> {ts}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap break-words leading-relaxed">{text}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Photos & files — view what's on the sheet and add new ones
              straight from the phone camera or gallery. */}
          <div className="rounded-2xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Photos &amp; Files ({job.photos.length})
              </p>
              <label className={cn("inline-flex items-center gap-1 text-xs font-semibold select-none", uploading ? "text-muted-foreground" : "text-primary cursor-pointer")}>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,video/*,.pdf"
                  className="sr-only"
                  onChange={(e) => void addFiles(e)}
                  disabled={uploading}
                />
                {uploading
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</>
                  : <><Upload className="w-3.5 h-3.5" /> Add</>}
              </label>
            </div>
            {job.photos.length === 0 ? (
              <p className="text-sm text-muted-foreground">No photos or files yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {job.photos.map((p, i) =>
                  p.startsWith("data:video") ? (
                    <button key={i} onClick={() => setLightboxSrc(p)} className="relative w-full aspect-square rounded-lg border overflow-hidden bg-black">
                      <video src={p} muted playsInline className="w-full h-full object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center">
                        <Play className="w-6 h-6 text-white drop-shadow" />
                      </span>
                    </button>
                  ) : p.startsWith("data:application") ? (
                    <button key={i} onClick={() => openDataUri(p)} className="w-full aspect-square rounded-lg border bg-muted flex flex-col items-center justify-center gap-1">
                      <FileText className="w-6 h-6 text-muted-foreground" />
                      <span className="text-[10px] font-semibold text-muted-foreground">PDF</span>
                    </button>
                  ) : (
                    <button key={i} onClick={() => setLightboxSrc(p)} className="w-full aspect-square rounded-lg border overflow-hidden">
                      <img src={p} alt={`attachment ${i + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ),
                )}
              </div>
            )}
          </div>

          {actionError && <p className="text-sm text-center text-amber-600 font-medium px-4">{actionError}</p>}

          {/* Lightbox for photos / videos */}
          {lightboxSrc && (
            <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4" onClick={() => setLightboxSrc(null)}>
              <button className="absolute top-4 right-4 text-white/80" onClick={() => setLightboxSrc(null)} aria-label="Close">
                <X className="w-7 h-7" />
              </button>
              {lightboxSrc.startsWith("data:video") ? (
                <video src={lightboxSrc} controls autoPlay playsInline className="max-w-full max-h-full" onClick={(e) => e.stopPropagation()} />
              ) : (
                <img src={lightboxSrc} alt="Full size" className="max-w-full max-h-full object-contain" onClick={(e) => e.stopPropagation()} />
              )}
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
    } else if (r.status === 410) {
      setMessage("This service QR code has expired (over 30 days old). Ask staff to reprint the ticket.");
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

/* ── Appointments ────────────────────────────────────────────────────── */

const APPT_STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  scheduled: { label: "Scheduled", cls: "bg-blue-100 text-blue-700" },
  completed: { label: "Completed", cls: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Cancelled", cls: "bg-red-100 text-red-700" },
  "no-show":  { label: "No-show",  cls: "bg-amber-100 text-amber-700" },
};

const APPT_DURATIONS = [15, 30, 45, 60, 90, 120];

function ApptStatusBadge({ status }: { status: string }) {
  const s = APPT_STATUS_STYLE[status] ?? { label: status, cls: "bg-slate-100 text-slate-700" };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold", s.cls)}>
      {s.label}
    </span>
  );
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** ISO timestamp → local <input type=date>/<input type=time> values. */
function toLocalDateParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return { date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`, time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}` };
}

/** Default a new appointment to the next full hour. */
function defaultDateParts(): { date: string; time: string } {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return { date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`, time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}` };
}

function fmtApptWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  });
}

function fmtDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Type-ahead customer search backed by /api/tech/customers. */
function CustomerPicker({ value, onChange }: {
  value: { id: number; name: string } | null;
  onChange: (c: { id: number; name: string } | null) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<TechCustomerLite[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 1) { setResults([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      void techFetch<{ items: TechCustomerLite[] }>(`/customers?q=${encodeURIComponent(term)}`).then((r) => {
        if (cancelled) return;
        setResults(r.ok && r.data ? r.data.items : []);
        setLoading(false);
      });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, open]);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-xl border bg-card px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm min-w-0">
          <User className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="truncate">{value.name}</span>
        </span>
        <button type="button" onClick={() => onChange(null)} className="p-1 rounded-lg hover:bg-muted text-muted-foreground" aria-label="Clear customer">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search customer (optional)…"
          className="w-full rounded-xl border bg-card pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>
      {open && q.trim().length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded-xl border bg-popover shadow-lg max-h-56 overflow-auto">
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No matches</p>
          ) : results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => { onChange({ id: c.id, name: c.name }); setOpen(false); setQ(""); }}
              className="w-full text-left px-3 py-2.5 hover:bg-muted text-sm border-b last:border-0"
            >
              <p className="truncate">{c.name}</p>
              {c.phone && <p className="text-xs text-muted-foreground truncate">{c.phone}</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Full-screen create/edit sheet. `existing` null → create. */
function AppointmentForm({ existing, onClose, onSaved }: {
  existing: TechAppointment | null;
  onClose: () => void;
  onSaved: (a: TechAppointment) => void;
}) {
  const initial = existing ? toLocalDateParts(existing.scheduledAt) : defaultDateParts();
  const [customer, setCustomer] = useState<{ id: number; name: string } | null>(
    existing?.customerId ? { id: existing.customerId, name: existing.customerName ?? "Customer" } : null,
  );
  const [title, setTitle] = useState(existing?.title ?? "");
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [duration, setDuration] = useState(existing?.durationMinutes ?? 30);
  const [status, setStatus] = useState(existing?.status ?? "scheduled");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const labelCls = "text-[10px] font-bold uppercase tracking-wider text-muted-foreground";
  const fieldCls = "w-full rounded-xl border bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40";

  const save = async () => {
    setError(null);
    if (!date || !time) { setError("Pick a date and time."); return; }
    const when = new Date(`${date}T${time}`);
    if (isNaN(when.getTime())) { setError("That date/time isn't valid."); return; }
    setSaving(true);
    const body = {
      scheduledAt: when.toISOString(),
      durationMinutes: duration,
      title: title.trim() || undefined,
      customerId: customer?.id ?? null,
      status,
      notes: notes.trim() || null,
    };
    const r = existing
      ? await techFetch<TechAppointment>(`/appointments/${existing.id}`, { method: "PATCH", body: JSON.stringify(body) })
      : await techFetch<TechAppointment>("/appointments", { method: "POST", body: JSON.stringify(body) });
    setSaving(false);
    if (r.ok && r.data) onSaved(r.data);
    else setError((r.data as { error?: string } | null)?.error ?? "Couldn't save — try again.");
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col max-w-lg mx-auto">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-2 py-2 flex items-center gap-1">
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
        <p className="flex-1 text-sm font-bold">{existing ? "Edit appointment" : "New appointment"}</p>
      </header>

      <div className="flex-1 overflow-auto px-4 py-4 space-y-4" style={{ paddingBottom: "6rem" }}>
        <div className="space-y-1.5">
          <label className={labelCls}>Customer</label>
          <CustomerPicker value={customer} onChange={setCustomer} />
        </div>

        <div className="space-y-1.5">
          <label className={labelCls}>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Pickup, Consultation…" className={fieldCls} />
          <p className="text-[11px] text-muted-foreground">Leave blank to name it after the customer.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={labelCls}>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldCls} />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Time</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={fieldCls} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className={labelCls}>Duration</label>
            <select value={duration} onChange={(e) => setDuration(parseInt(e.target.value, 10))} className={fieldCls}>
              {APPT_DURATIONS.map((m) => <option key={m} value={m}>{fmtDuration(m)}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={fieldCls}>
              {Object.entries(APPT_STATUS_STYLE).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className={labelCls}>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Anything the team should know…" className={cn(fieldCls, "resize-none")} />
        </div>

        {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
      </div>

      <div className="fixed bottom-0 inset-x-0 max-w-lg mx-auto border-t bg-background p-3" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}>
        <button
          onClick={() => void save()}
          disabled={saving}
          className="w-full rounded-xl bg-primary text-primary-foreground py-3 font-semibold text-sm disabled:opacity-50 active:scale-[0.99] transition-transform flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {existing ? "Save changes" : "Create appointment"}
        </button>
      </div>
    </div>
  );
}

function AppointmentCard({ a, onOpen }: { a: TechAppointment; onOpen: () => void }) {
  const past = new Date(a.endAt).getTime() < Date.now();
  return (
    <button
      onClick={onOpen}
      className={cn("w-full text-left rounded-2xl border bg-card p-4 active:scale-[0.99] transition-transform", past && "opacity-70")}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold text-sm truncate">{a.title}</p>
        <ApptStatusBadge status={a.status} />
      </div>
      <p className="flex items-center gap-1.5 text-sm mt-1.5 text-muted-foreground">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        {fmtApptWhen(a.scheduledAt)} · {fmtDuration(a.durationMinutes)}
      </p>
      {a.customerName && (
        <p className="flex items-center gap-1.5 text-xs mt-1 truncate">
          <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> {a.customerName}
        </p>
      )}
    </button>
  );
}

function AppointmentsTab() {
  const [appts, setAppts] = useState<TechAppointment[] | null>(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  /** null = list view, "new" = create, object = edit. */
  const [formFor, setFormFor] = useState<TechAppointment | "new" | null>(null);

  const load = useCallback(() => {
    setError(false);
    void techFetch<{ items: TechAppointment[] }>("/appointments").then((r) => {
      if (r.ok && r.data) setAppts(r.data.items);
      else setError(true);
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  if (formFor !== null) {
    return (
      <AppointmentForm
        existing={formFor === "new" ? null : formFor}
        onClose={() => setFormFor(null)}
        onSaved={() => { setFormFor(null); setAppts(null); load(); }}
      />
    );
  }

  const q = search.trim().toLowerCase();
  const filtered = (appts ?? []).filter((a) =>
    !q || a.title.toLowerCase().includes(q) || (a.customerName ?? "").toLowerCase().includes(q));
  const now = Date.now();
  const upcoming = filtered.filter((a) => new Date(a.endAt).getTime() >= now);
  const past = filtered.filter((a) => new Date(a.endAt).getTime() < now).reverse();

  return (
    <div className="space-y-3 pb-4">
      <button
        onClick={() => setFormFor("new")}
        className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 font-semibold text-sm active:scale-[0.99] transition-transform flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" /> New appointment
      </button>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title or customer…"
          className="w-full rounded-xl border bg-card pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {error ? (
        <p className="text-sm text-muted-foreground text-center py-16">Couldn't load appointments — pull down to retry.</p>
      ) : appts === null ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-16">
          {q ? `No appointments match "${search}"` : "No appointments yet — tap “New appointment”."}
        </p>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground pt-1">Upcoming</p>
              {upcoming.map((a) => <AppointmentCard key={a.id} a={a} onOpen={() => setFormFor(a)} />)}
            </div>
          )}
          {past.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground pt-2">Past</p>
              {past.map((a) => <AppointmentCard key={a.id} a={a} onOpen={() => setFormFor(a)} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Root page ───────────────────────────────────────────────────────── */

export default function TechAppPage() {
  // Canonical route is /t/techapp; /t/webapp is kept as a legacy alias so
  // already-printed service-ticket QR codes keep resolving.
  const [, techParams] = useRoute("/b/:businessUsername/t/techapp");
  const [, legacyParams] = useRoute("/b/:businessUsername/t/webapp");
  const username = techParams?.businessUsername ?? legacyParams?.businessUsername ?? "";

  const [phase, setPhase] = useState<"boot" | "login" | "app" | "no-business">("boot");
  const [business, setBusiness] = useState<TechBusiness | null>(null);
  const [staff, setStaff] = useState<TechStaff | null>(null);

  const [tab, setTab] = useState<"services" | "scan" | "appoint">("services");
  const [openJobId, setOpenJobId] = useState<number | null>(null);

  /* Deep link: a printed sheet QR opens /b/:username/t/webapp?job=:id. Capture
     the job id up front and open it once the technician is signed in. */
  const [pendingJobId, setPendingJobId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = new URLSearchParams(window.location.search).get("job");
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  });

  useEffect(() => {
    if (phase === "app" && pendingJobId != null) {
      setOpenJobId(pendingJobId);
      setPendingJobId(null);
    }
  }, [phase, pendingJobId]);

  /* Brand the home-screen icon for this business's Tech App. */
  useEffect(() => {
    if (business) setHomeScreenApp({ name: `${business.businessName} Tech`, iconUrl: business.logoUrl });
  }, [business]);

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
        ) : tab === "appoint" ? (
          <AppointmentsTab />
        ) : (
          <ScanTab onOpenJob={(id) => { setOpenJobId(id); setTab("services"); }} />
        )}
      </main>

      {/* Bottom nav — Services / Appoint / Scan */}
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-background border-t max-w-lg mx-auto" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="grid grid-cols-3">
          <button
            onClick={() => { setTab("services"); setOpenJobId(null); }}
            className={cn(
              "flex flex-col items-center gap-1 py-3.5 text-xs font-semibold transition-colors",
              tab === "services" && openJobId == null ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Wrench className="w-6 h-6" />
            Services
          </button>
          <button
            onClick={() => { setTab("appoint"); setOpenJobId(null); }}
            className={cn(
              "flex flex-col items-center gap-1 py-3.5 text-xs font-semibold transition-colors",
              tab === "appoint" && openJobId == null ? "text-primary" : "text-muted-foreground",
            )}
          >
            <CalendarClock className="w-6 h-6" />
            Appoint
          </button>
          <button
            onClick={() => { setTab("scan"); setOpenJobId(null); }}
            className={cn(
              "flex flex-col items-center gap-1 py-3.5 text-xs font-semibold transition-colors",
              tab === "scan" && openJobId == null ? "text-primary" : "text-muted-foreground",
            )}
          >
            <ScanLine className="w-6 h-6" />
            Scan
          </button>
        </div>
      </nav>
    </div>
  );
}
