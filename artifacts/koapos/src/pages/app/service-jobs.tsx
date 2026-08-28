import { useState, useCallback, useEffect } from "react";
import { Link, useRoute } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListServiceJobs,
  useDeleteServiceJob,
  useGetMerchant,
  useGetPosSettings,
  getListServiceJobsQueryKey,
  ServiceJob,
} from "@workspace/api-client-react";
import { useBusinessProfile } from "@/lib/business-profile";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  SlidersHorizontal,
  Printer,
  Send,
  Package,
  Wrench,
  History,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useStickerPrinter } from "@/lib/sticker-config";
import { techAppJobUrl } from "@/lib/public-url";
import { ServiceJobDetailDialog } from "@/components/service-jobs/ServiceJobDetailDialog";
import { SendButton } from "@/components/send/send-dialog";
import { useSalesTemplate } from "@/lib/use-sales-template";
import { ServiceJobSheet, type ServiceSheetBranding, type ServiceSheetData } from "@/components/printing/ServiceJobSheet";
import { ServiceJobDocket } from "@/components/printing/ServiceJobDocket";
import { parseHardwareConfig } from "@/lib/hardware-config";
import {
  isServiceJobRouteSilent, printServiceJobDocument, serviceJobPaperFromOpts,
  SERVICE_PAPER_LABEL, type ServicePaper,
} from "@/lib/service-job-print";

/* ─── Status config ─────────────────────────────────────────────────────── */

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:                     { label: "Pending",                     className: "bg-amber-50 text-amber-700 border-amber-300" },
  "in-progress":               { label: "In Progress",                 className: "bg-blue-50 text-blue-700 border-blue-300" },
  "awaiting-parts":            { label: "Awaiting Parts",              className: "bg-rose-50 text-rose-700 border-rose-300" },
  "awaiting-stock":            { label: "Awaiting Stock",              className: "bg-purple-50 text-purple-700 border-purple-300" },
  "at-repairer":               { label: "At Repairer",                 className: "bg-yellow-50 text-yellow-700 border-yellow-300" },
  "awaiting-partner-approval": { label: "Awaiting Partner Approval",   className: "bg-indigo-50 text-indigo-700 border-indigo-300" },
  "partner-replacement":       { label: "Partner Replacement",         className: "bg-teal-50 text-teal-700 border-teal-300" },
  "awaiting-customer":         { label: "Awaiting Customer",           className: "bg-orange-50 text-orange-600 border-orange-300" },
  "awaiting-pickup":           { label: "Completed - Awaiting Pickup", className: "bg-lime-50 text-lime-700 border-lime-300" },
  completed:                   { label: "Completed",                   className: "bg-emerald-50 text-emerald-700 border-emerald-300" },
  cancelled:                   { label: "Cancelled",                   className: "bg-red-50 text-red-700 border-red-300" },
};

/* ─── Note helpers ──────────────────────────────────────────────────────── */

const NOTE_SEP = "\n\n---\n\n";

function parseNotes(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw.split("---").map((s) => s.trim()).filter(Boolean);
}

function buildNoteTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `[${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}]`;
}

function appendNote(existing: string | null | undefined, text: string): string {
  const ts = buildNoteTimestamp();
  const entry = `${ts} ${text.trim()}`;
  const parts = parseNotes(existing);
  return [...parts, entry].join(NOTE_SEP);
}

function getStatus(s: string) {
  return STATUS_CONFIG[s] ?? { label: s, className: "bg-muted text-muted-foreground border-border" };
}

function formatDate(d: string) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

/* ─── Sorting ────────────────────────────────────────────────────────────── */

type SortKey = "jobNumber" | "priority" | "customerName" | "bookInDate" | "status" | "deviceType" | "description";
type SortDir = "asc" | "desc";

function getValue(job: ServiceJob, key: SortKey): string {
  switch (key) {
    case "jobNumber":    return job.jobNumber ?? "";
    case "priority":     return job.isCritical ? "1" : "0"; // critical sorts first when desc
    case "customerName": return (job.customerName ?? "").toLowerCase();
    case "bookInDate":   return job.bookInDate ?? "";
    case "status":       return job.status ?? "";
    case "deviceType":   return (job.deviceType ?? "").toLowerCase();
    case "description":  return (job.workDescription ?? job.deviceDescription ?? "").toLowerCase();
  }
}

/* Active and finished jobs live on separate tabs, so a plain sort suffices —
   no need to pin completed jobs to the bottom any more. */
function sortJobs(jobs: ServiceJob[], key: SortKey, dir: SortDir): ServiceJob[] {
  const compare = (a: ServiceJob, b: ServiceJob) => {
    const av = getValue(a, key);
    const bv = getValue(b, key);
    const result = av < bv ? -1 : av > bv ? 1 : 0;
    return dir === "asc" ? result : -result;
  };
  return [...jobs].sort(compare);
}

/* ─── Sortable column header ─────────────────────────────────────────────── */

interface SortableHeaderProps {
  label: string;
  sortKey: SortKey;
  activeSortKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}

function SortableHeader({ label, sortKey, activeSortKey, dir, onSort, className }: SortableHeaderProps) {
  const isActive = sortKey === activeSortKey;
  return (
    <th
      className={cn("px-3 py-3 text-left font-medium select-none cursor-pointer group", className)}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
        {label}
        <span className={cn("transition-colors", isActive ? "text-foreground" : "text-muted-foreground/40 group-hover:text-muted-foreground")}>
          {isActive ? (
            dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronsUpDown className="w-3 h-3" />
          )}
        </span>
      </span>
    </th>
  );
}

/* ─── Priority dot ──────────────────────────────────────────────────────── */

function PriorityDot({ critical }: { critical: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-sm">
      <span className={cn("inline-block w-2.5 h-2.5 rounded-full shrink-0", critical ? "bg-red-500" : "bg-blue-500")} />
      <span className={critical ? "text-red-600 font-medium" : "text-foreground"}>
        {critical ? "Critical" : "Normal"}
      </span>
    </span>
  );
}

/* ─── Detail row ────────────────────────────────────────────────────────── */

function DetailRow({ icon: Icon, label, value }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: string | null;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="text-sm min-w-0">
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <p className="font-medium break-words">{value}</p>
      </div>
    </div>
  );
}

/* ─── DetailDialog: see @/components/service-jobs/ServiceJobDetailDialog.tsx ── */

/* ─── Print choice dialog ────────────────────────────────────────────────── */

function PrintChoiceDialog({
  job,
  onClose,
  onSelect,
  defaultCopies,
  defaultPaper,
  initialMode,
}: {
  job: ServiceJob | null;
  onClose: () => void;
  onSelect: (mode: "sheet" | "sticker", copies: number, paper: ServicePaper) => void;
  defaultCopies: number;
  /** Paper pre-selected from the saved Service Ticket template. */
  defaultPaper: ServicePaper;
  initialMode?: "sheet" | null;
}) {
  const [mode, setMode] = useState<"sheet" | "sticker" | null>(initialMode ?? null);
  const [copies, setCopies] = useState(defaultCopies);
  const [paper, setPaper] = useState<ServicePaper>(defaultPaper);

  // Reset when dialog opens
  useEffect(() => {
    if (job) {
      setMode(initialMode ?? null);
      setCopies(defaultCopies);
      setPaper(defaultPaper);
    }
  }, [job, initialMode, defaultCopies, defaultPaper]);

  const handleCardClick = (m: "sheet" | "sticker") => {
    if (m === "sticker") { onSelect("sticker", 1, paper); return; }
    setMode("sheet");
  };

  return (
    <Dialog open={!!job} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Print — {job?.jobNumber}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <button
            onClick={() => handleCardClick("sheet")}
            className={`flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-colors ${mode === "sheet" ? "border-primary bg-primary/5" : "border-border hover:border-primary hover:bg-primary/5"}`}
          >
            <Printer className="w-8 h-8 text-primary" />
            <div className="text-center">
              <p className="font-semibold text-sm">Service Job</p>
              <p className="text-xs text-muted-foreground mt-0.5">A4 sheet or 80mm docket</p>
            </div>
          </button>
          <button
            onClick={() => handleCardClick("sticker")}
            className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-colors"
          >
            <Package className="w-8 h-8 text-primary" />
            <div className="text-center">
              <p className="font-semibold text-sm">Label Sticker</p>
              <p className="text-xs text-muted-foreground mt-0.5">DYMO repair label</p>
            </div>
          </button>
        </div>
        {mode === "sheet" && (
          <div className="border-t pt-4 space-y-4">
            {/* Paper choice — the A4 sheet and the 80mm docket carry the same
                fields, so this is purely where it prints. */}
            <div className="grid grid-cols-2 gap-2">
              {(["a4", "80mm"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPaper(p)}
                  className={`px-3 py-2 rounded-lg border-2 text-left transition-colors ${paper === p ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                >
                  <p className="text-sm font-semibold">{SERVICE_PAPER_LABEL[p].title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{SERVICE_PAPER_LABEL[p].detail}</p>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Label className="text-sm whitespace-nowrap">Copies</Label>
                <Input
                  type="number"
                  min="1"
                  max="20"
                  value={copies}
                  onChange={(e) => setCopies(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                  className="w-16 h-8 text-center text-sm"
                />
              </div>
              <button
                onClick={() => onSelect("sheet", copies, paper)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                Print {copies > 1 ? `${copies} Copies` : "1 Copy"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ServiceJobsPage() {
  const [tab, setTab]                       = useState<"active" | "history">("active");
  const [collapsed, setCollapsed]           = useState(false);
  const [priority, setPriority]             = useState("all");
  const [statusFilter, setStatus]           = useState("all");
  const [search, setSearch]                 = useState("");
  const [selected, setSelected]             = useState<Set<number>>(new Set());
  const [viewing, setViewing]               = useState<ServiceJob | null>(null);
  const [printChoiceJob, setPrintChoiceJob] = useState<ServiceJob | null>(null);
  const [printState, setPrintState]         = useState<{ job: ServiceJob; copies: number; paper: ServicePaper } | null>(null);
  const [activeSortKey, setSortKey]         = useState<SortKey>("bookInDate");
  const [sortDir, setSortDir]               = useState<SortDir>("desc");

  const queryClient = useQueryClient();
  const { data: jobsData, isLoading } = useListServiceJobs();
  const deleteMutation = useDeleteServiceJob();

  const { data: merchant }   = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const { data: posSettings } = useGetPosSettings({ query: { queryKey: ["pos-settings"] } });
  const hardware              = parseHardwareConfig((posSettings as { hardwareConfig?: string } | undefined)?.hardwareConfig);
  const { profile }          = useBusinessProfile();
  const businessName         = merchant?.businessName ?? "Your Business";
  const brandColor           = (profile.brandColors as string[] | undefined)?.[0] ?? "#efbf04";
  const { printStickers } = useStickerPrinter();

  /* Read active service-sheet template + opts from Management > Templates */
  const { opts: serviceOpts, fontCss: serviceFontCss } = useSalesTemplate("Service_Ticket");

  /* Branding + data shared by the A4 sheet and the 80mm docket, so the two
     outputs can never drift apart. */
  const sheetBranding: ServiceSheetBranding = {
    businessName,
    abn: (profile as { abn?: string }).abn,
    website: (profile as { website?: string }).website,
    email: (profile as { contactEmail?: string }).contactEmail ?? merchant?.email ?? undefined,
    address: [
      (merchant as { address?: string } | undefined)?.address,
      (merchant as { city?: string } | undefined)?.city,
      (profile as { state?: string }).state,
      (profile as { postcode?: string }).postcode,
    ].filter(Boolean).join(", "),
    brandColor,
    logo: (profile as { logo?: string }).logo,
    socialLinks: (profile as { socialLinks?: Record<string, string> }).socialLinks,
    techAppUsername: merchant?.username ?? undefined,
  };

  const buildSheetData = (pj: ServiceJob): ServiceSheetData => ({
    jobId: pj.id ?? null,
    jobNumber: pj.jobNumber ?? `SVC-${pj.id ?? ""}`,
    date: pj.bookInDate || null,
    status: pj.status,
    customerName: pj.customerName ?? "Walk-in",
    customerPhone: pj.customerPhone ?? undefined,
    customerEmail: pj.customerEmail ?? undefined,
    deviceType: pj.deviceType ?? undefined,
    deviceModel: pj.deviceDescription ?? undefined,
    serialNumber: pj.serialNumber ?? undefined,
    condition: pj.condition ?? undefined,
    workDescription: pj.workDescription ?? undefined,
    additionalEquipment: pj.additionalEquipment ?? undefined,
    accounts: pj.accounts ?? undefined,
    logins: pj.passwordOrPin ?? undefined,
    notes: pj.notes ?? undefined,
    photos: Array.isArray(pj.photos) ? (pj.photos as string[]) : undefined,
    signature: pj.signature ?? undefined,
    isCritical: !!pj.isCritical,
    isUnderWarranty: !!pj.isUnderWarranty,
    isPartnerRepair: !!pj.isPartnerRepair,
    partnerRepairCode: pj.partnerRepairCode ?? undefined,
  });

  /* Job print: hand the job to the print router, which sends it straight to the
     routed printer when one is reachable (ESC/POS over USB/serial, or the Print
     Bridge) and otherwise reveals the hidden print area and uses window.print(). */
  useEffect(() => {
    if (!printState) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      const { job, copies, paper } = printState;
      const printMode = paper === "80mm" ? "sj-docket" : "sj-sheet";

      const browserFallback = () => new Promise<void>((resolve) => {
        document.body.setAttribute("data-print", printMode);
        let done = false;
        let guard = 0;
        const finish = () => {
          if (done) return;
          done = true;
          window.clearTimeout(guard);
          document.body.removeAttribute("data-print");
          resolve();
        };
        // afterprint keeps the print area mounted until the browser is finished;
        // some environments never fire it, hence the guard.
        window.addEventListener("afterprint", finish, { once: true });
        guard = window.setTimeout(finish, 30_000);
        window.print();
      });

      void printServiceJobDocument({
        paper,
        copies,
        hw: hardware,
        data: buildSheetData(job),
        branding: sheetBranding,
        opts: serviceOpts,
        fontCss: serviceFontCss,
        elementId: `${printMode}-print-area`,
        browserFallback,
      })
        .then((method) => {
          if (method !== "browser") toast.success(`${SERVICE_PAPER_LABEL[paper].title} sent to the printer`);
        })
        .catch((err) => toast.error(err instanceof Error ? err.message : "Couldn't print this job"))
        .finally(() => { if (!cancelled) setPrintState(null); });
    }, 150);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [printState]);

  /* Repair sticker prints through the shared sticker printer so the saved
   * "repair" template (size + field toggles) is applied. The A4 sheet keeps its
   * own rich renderer (ServiceJobSheet) below. */
  const printRepairSticker = (job: ServiceJob) => {
    const ok = printStickers({
      typeId: "repair",
      orientation: "horizontal",
      fieldsOverride: {
        jobNo:    job.jobNumber ?? "",
        customer: job.customerName ?? "",
        device:   job.deviceType ?? job.deviceDescription ?? "",
        fault:    job.workDescription ?? "",
        dueDate:  "",
        tech:     "",
        // Device credentials (opt-in via the "Username"/"Password" label toggles).
        // Both are stored newline-joined on the job; collapse to one line for the
        // sticker and drop blanks so an empty credential doesn't print " / ".
        username: (job.accounts ?? "").split("\n").map((s) => s.trim()).filter(Boolean).join(" / "),
        password: (job.passwordOrPin ?? "").split("\n").map((s) => s.trim()).filter(Boolean).join(" / "),
        // Tech App deep link for the optional service QR (shown when the saved
        // repair template enables it).
        serviceQrUrl: job.id != null ? techAppJobUrl(merchant?.username, job.id) : "",
      },
    });
    if (!ok) toast.error("Couldn't open the print dialog — please try again");
  };

  const startPrint = (job: ServiceJob, mode: "sheet" | "sticker", copies = 1, paper: ServicePaper = "a4") => {
    if (mode === "sticker") { printRepairSticker(job); return; }
    setPrintState({ job, copies, paper });
  };

  const jobs = Array.isArray(jobsData) ? jobsData : [];

  /* History holds finished jobs — marking one completed (or cancelled) moves
     it there, mirroring the Appointments page. */
  const isFinished  = (j: ServiceJob) => j.status === "completed" || j.status === "cancelled";
  const historyJobs = jobs.filter(isFinished);
  const activeJobs  = jobs.filter((j) => !isFinished(j));
  const tabJobs     = tab === "history" ? historyJobs : activeJobs;
  const active      = activeJobs.length;

  /* Switching tabs resets the filters/selection and sorts most-recent-first */
  const switchTab = (t: "active" | "history") => {
    setTab(t);
    setPriority("all");
    setStatus("all");
    setSearch("");
    setSelected(new Set());
    setSortKey("bookInDate");
    setSortDir("desc");
  };

  const [, routeParams] = useRoute("/services/:id");
  useEffect(() => {
    if (!routeParams?.id || jobs.length === 0 || viewing) return;
    const job = jobs.find((j) => j.id === Number(routeParams.id));
    if (job) {
      setViewing(job);
      /* Land on the tab the job lives in so closing the dialog shows it */
      if (isFinished(job)) switchTab("history");
    }
  }, [routeParams?.id, jobs]);

  /* Filter — priority + status dropdowns plus a free-text search across the
     job number, customer, device and fault fields. */
  const q = search.trim().toLowerCase();
  const filtered = tabJobs.filter((j) => {
    if (priority === "critical" && !j.isCritical) return false;
    if (priority === "normal"   &&  j.isCritical) return false;
    if (statusFilter !== "all"  && j.status !== statusFilter) return false;
    if (q && ![
      j.jobNumber, j.customerName, j.customerPhone, j.customerEmail,
      j.deviceType, j.deviceDescription, j.workDescription, j.serialNumber,
    ].some((v) => (v ?? "").toString().toLowerCase().includes(q))) return false;
    return true;
  });

  /* Sort */
  const sorted = sortJobs(filtered, activeSortKey, sortDir);

  /* Column header click handler */
  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  /* Multi-select */
  const allSelected = sorted.length > 0 && sorted.every((j) => selected.has(j.id));
  const toggleAll   = () =>
    setSelected(allSelected ? new Set() : new Set(sorted.map((j) => j.id)));
  const toggleOne   = (id: number) =>
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  /* Delete */
  const handleDelete = (job: ServiceJob) => {
    if (!confirm(`Delete service job ${job.jobNumber}?`)) return;
    deleteMutation.mutate(
      { id: job.id },
      {
        onSuccess: () => {
          toast.success("Service job deleted");
          queryClient.invalidateQueries({ queryKey: getListServiceJobsQueryKey() });
          setSelected((prev) => { const n = new Set(prev); n.delete(job.id); return n; });
        },
        onError: () => toast.error("Failed to delete"),
      }
    );
  };

  /* Send job details to the customer on file. Both endpoints send server-side
   * to the stored contact; they throw on failure so the Send dialog surfaces
   * the error instead of falsely reporting success. */
  const sendJobEmail = async (job: ServiceJob) => {
    if (!job.customerEmail) return;
    let res: Response;
    try {
      res = await fetch(`/api/service-jobs/${job.id}/email`, { method: "POST", credentials: "include" });
    } catch {
      throw new Error("Network error — email not sent");
    }
    const data = await res.json().catch(() => ({ success: false, error: "Server error" }));
    if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to send email");
    toast.success(`Email sent to ${job.customerEmail}`);
  };

  const sendJobSms = async (job: ServiceJob) => {
    if (!job.customerPhone) return;
    let res: Response;
    try {
      res = await fetch(`/api/service-jobs/${job.id}/sms`, { method: "POST", credentials: "include" });
    } catch {
      throw new Error("Network error — SMS not sent");
    }
    const data = await res.json().catch(() => ({ success: false, error: "Server error" }));
    if (!res.ok || !data.success) throw new Error(data.error ?? "Failed to send SMS");
    toast.success(`SMS sent to ${job.customerPhone}`);
  };

  /* Shared header props shorthand */
  const sh = (label: string, key: SortKey, className?: string) => ({
    label, sortKey: key, activeSortKey, dir: sortDir, onSort: handleSort, className,
  });

  return (
    <AppLayout>
      <div className="p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Service Jobs</h1>
          <p className="text-sm text-muted-foreground">Manage repair and service job tickets, status updates, and job history.</p>
        </div>

        {/* Active / History tabs */}
        <Tabs value={tab} onValueChange={(v) => switchTab(v as "active" | "history")}>
          <TabsList>
            <TabsTrigger value="active" className="gap-1.5">
              <Wrench className="w-3.5 h-3.5" />
              Services
              <span className="text-xs text-muted-foreground tabular-nums">({activeJobs.length})</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5">
              <History className="w-3.5 h-3.5" />
              Service History
              <span className="text-xs text-muted-foreground tabular-nums">({historyJobs.length})</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Panel header */}
        <div className="flex items-center justify-between bg-background border border-border rounded-t-xl px-5 py-3">
          <h2 className="text-base font-semibold">
            {tab === "history" ? "Service History" : "All Services"}{" "}
            <span className="font-normal text-muted-foreground text-sm">
              {tab === "history"
                ? `(${historyJobs.length} past)`
                : `(${active} active job${active !== 1 ? "s" : ""})`}
            </span>
          </h2>
          <div className="flex items-center gap-3">
            <Link href="/services/new-job">
              <Button size="sm" className="gap-1.5 h-8 text-xs">
                <Plus className="w-3.5 h-3.5" />
                New Service
              </Button>
            </Link>
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronUp className={cn("w-4 h-4 transition-transform duration-200", collapsed && "rotate-180")} />
            </button>
          </div>
        </div>

        {!collapsed && (
          <>
            {/* Filter bar */}
            <div className="flex flex-wrap items-center justify-between border-x border-b border-border bg-muted/20 px-5 py-2.5 gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search job #, customer, device…"
                    className="h-8 text-xs w-64 pl-8 bg-background"
                  />
                </div>
                <SlidersHorizontal className="w-4 h-4 text-muted-foreground shrink-0" />
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger className="h-8 text-xs w-36 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priorities</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatus}>
                  <SelectTrigger className="h-8 text-xs w-40 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {tab === "active" ? (
                      <>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in-progress">In Progress</SelectItem>
                        <SelectItem value="awaiting-parts">Awaiting Parts</SelectItem>
                        <SelectItem value="awaiting-stock">Awaiting Stock</SelectItem>
                        <SelectItem value="at-repairer">At Repairer</SelectItem>
                        <SelectItem value="awaiting-partner-approval">Awaiting Partner Approval</SelectItem>
                        <SelectItem value="partner-replacement">Partner Replacement</SelectItem>
                        <SelectItem value="awaiting-customer">Awaiting Customer</SelectItem>
                        <SelectItem value="awaiting-pickup">Completed - Awaiting Pickup</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>{sorted.length} of {tabJobs.length}</span>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => window.print()}>
                  <Printer className="w-3.5 h-3.5" />
                  Print
                </Button>
              </div>
            </div>

            {/* Table */}
            <div className="border-x border-b border-border rounded-b-xl overflow-hidden">
              {isLoading ? (
                <div className="py-16 text-center text-sm text-muted-foreground">Loading service jobs...</div>
              ) : sorted.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  {tab === "history"
                    ? (historyJobs.length === 0
                        ? "No completed service jobs yet. When a job is marked completed it moves here."
                        : "No past service jobs match the current filters.")
                    : (activeJobs.length === 0
                        ? 'No active service jobs. Click "New Service" to book one in.'
                        : "No service jobs match the current filters.")}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
                        <th className="w-10 px-4 py-3 text-left">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={toggleAll}
                            className="rounded border-muted-foreground/40 accent-primary"
                          />
                        </th>
                        <SortableHeader {...sh("Job #",       "jobNumber")} />
                        <SortableHeader {...sh("Priority",    "priority")} />
                        <SortableHeader {...sh("Contact",     "customerName")} />
                        <SortableHeader {...sh("Date",        "bookInDate")} />
                        <SortableHeader {...sh("Status",      "status")} />
                        <SortableHeader {...sh("Device Type", "deviceType")} />
                        <SortableHeader {...sh("Description", "description")} />
                        <th className="px-3 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-background">
                      {sorted.map((job) => {
                        const { label, className } = getStatus(job.status);
                        const isChecked = selected.has(job.id);
                        const isCompleted = job.status === "completed";
                        return (
                          <tr
                            key={job.id}
                            className={cn(
                              "hover:bg-muted/30 transition-colors cursor-pointer",
                              isChecked && "bg-primary/5",
                              /* Dim finished rows only in the active list — History shows them at full strength */
                              isCompleted && tab === "active" && "opacity-60"
                            )}
                            onClick={() => setViewing(job)}
                          >
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleOne(job.id)}
                                className="rounded border-muted-foreground/40 accent-primary"
                              />
                            </td>

                            <td className="px-3 py-3 font-mono text-xs font-medium text-foreground whitespace-nowrap">
                              {job.jobNumber}
                            </td>

                            <td className="px-3 py-3 whitespace-nowrap">
                              <PriorityDot critical={!!job.isCritical} />
                            </td>

                            <td className="px-3 py-3 whitespace-nowrap">
                              {job.customerName
                                ? <span className="text-primary font-medium">{job.customerName}</span>
                                : <span className="text-muted-foreground">—</span>}
                            </td>

                            <td className="px-3 py-3 whitespace-nowrap text-muted-foreground text-xs">
                              {formatDate(job.bookInDate)}
                            </td>

                            <td className="px-3 py-3 whitespace-nowrap">
                              <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-medium border", className)}>
                                {label}
                              </span>
                            </td>

                            <td className="px-3 py-3 whitespace-nowrap">
                              {job.deviceType
                                ? <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-muted text-muted-foreground border border-border">{job.deviceType}</span>
                                : <span className="text-muted-foreground">—</span>}
                            </td>

                            <td className="px-3 py-3 max-w-[220px]">
                              <span className="text-xs text-foreground line-clamp-1">
                                {job.workDescription || job.deviceDescription || "—"}
                              </span>
                            </td>

                            <td className="px-3 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-2">
                                <SendButton
                                  variant="ghost"
                                  size="sm"
                                  className="h-auto px-0 py-0 gap-1 text-xs text-primary font-medium hover:bg-transparent hover:underline"
                                  buttonTitle={(job.customerEmail || job.customerPhone) ? "Send to customer" : "No customer contact on file"}
                                  disabled={!job.customerEmail && !job.customerPhone}
                                  title="Send Job"
                                  documentLabel={job.jobNumber}
                                  {...(job.customerEmail && {
                                    defaultEmail: job.customerEmail,
                                    emailReadonly: true,
                                    emailHint: "Emails the job details to the customer's email on file.",
                                    onEmail: () => sendJobEmail(job),
                                  })}
                                  {...(job.customerPhone && {
                                    defaultPhone: job.customerPhone,
                                    smsReadonly: true,
                                    smsHint: "Texts a status update to the customer's number on file.",
                                    onSms: () => sendJobSms(job),
                                  })}
                                >
                                  <Send className="w-3 h-3" />
                                  Send
                                </SendButton>
                                <button
                                  onClick={() => setPrintChoiceJob(job)}
                                  className="flex items-center gap-1 text-xs text-muted-foreground font-medium hover:text-foreground transition-colors"
                                >
                                  <Printer className="w-3 h-3" />
                                  Print
                                </button>
                                <button
                                  onClick={() => handleDelete(job)}
                                  disabled={deleteMutation.isPending}
                                  className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <ServiceJobDetailDialog
        job={viewing}
        onClose={() => setViewing(null)}
        onDelete={handleDelete}
        deleteIsPending={deleteMutation.isPending}
        onPrint={(job, mode) => {
          setViewing(null);
          if (mode === "sticker") { startPrint(job, "sticker"); return; }
          setPrintChoiceJob(job);
        }}
      />

      <PrintChoiceDialog
        job={printChoiceJob}
        onClose={() => setPrintChoiceJob(null)}
        onSelect={(mode, copies, paper) => { const job = printChoiceJob!; setPrintChoiceJob(null); startPrint(job, mode, copies, paper); }}
        defaultCopies={Math.max(1, parseInt(serviceOpts.defaultPrintCopies ?? "1") || 1)}
        defaultPaper={serviceJobPaperFromOpts(serviceOpts)}
      />

      {/* ── Print areas ─────────────────────────────────────────────────── */}
      {printState && (() => {
        const pj = printState.paper;
        const sheetData = buildSheetData(printState.job);
        // A silent route (ESC/POS or the Print Bridge) repeats the job itself, so
        // the markup only needs one copy. The browser dialog prints the page once,
        // so every copy has to be laid out here.
        const domCopies = isServiceJobRouteSilent(hardware, pj) ? 1 : printState.copies;
        return (
          <>
            {/* Screen: hide the print areas so they don't appear in the UI.
               Print: show only the area matching the chosen paper. */}
            <style>{`
              @media screen {
                #sj-sheet-print-area, #sj-docket-print-area { display: none !important; }
              }
              @media print {
                body * { visibility: hidden !important; }
                body[data-print="sj-sheet"] #sj-sheet-print-area,
                body[data-print="sj-sheet"] #sj-sheet-print-area *,
                body[data-print="sj-docket"] #sj-docket-print-area,
                body[data-print="sj-docket"] #sj-docket-print-area * { visibility: visible !important; }
                body[data-print="sj-sheet"] #sj-sheet-print-area,
                body[data-print="sj-docket"] #sj-docket-print-area {
                  display: block !important;
                  position: fixed !important; left: 0 !important; top: 0 !important;
                  box-sizing: border-box !important;
                }
                body[data-print="sj-sheet"] #sj-sheet-print-area { width: 210mm !important; }
                body[data-print="sj-docket"] #sj-docket-print-area { width: 80mm !important; }
              }
            `}</style>
            {/* @page can't be toggled by an attribute selector, so each paper
                brings its own rule and only the active print area is visible. */}
            <style>{pj === "80mm"
              ? "@media print { @page { size: 80mm auto; margin: 0; } }"
              : "@media print { @page { size: A4 portrait; margin: 10mm; } }"}</style>

            {pj === "a4" ? (
              /* A4 service sheet — rendered once per copy with page breaks */
              <div id="sj-sheet-print-area">
                {Array.from({ length: domCopies }, (_, i) => (
                  <div key={i} style={i < domCopies - 1 ? { pageBreakAfter: "always" } : {}}>
                    <ServiceJobSheet
                      id={`sj-sheet-copy-${i}`}
                      opts={serviceOpts}
                      fontCss={serviceFontCss}
                      branding={sheetBranding}
                      data={sheetData}
                    />
                  </div>
                ))}
              </div>
            ) : (
              /* 80mm thermal docket — same fields, receipt-roll layout */
              <div id="sj-docket-print-area">
                {Array.from({ length: domCopies }, (_, i) => (
                  <div key={i} style={i < domCopies - 1 ? { pageBreakAfter: "always" } : {}}>
                    <ServiceJobDocket
                      id={`sj-docket-copy-${i}`}
                      opts={serviceOpts}
                      fontCss={serviceFontCss}
                      branding={sheetBranding}
                      data={sheetData}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        );
      })()}
    </AppLayout>
  );
}
