import { useState, useCallback, useEffect } from "react";
import { Link, useRoute } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListServiceJobs,
  useDeleteServiceJob,
  useGetMerchant,
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
  Eye,
  Package,
  Wrench,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useStickerPrinter } from "@/lib/sticker-config";
import { ServiceJobDetailDialog } from "@/components/service-jobs/ServiceJobDetailDialog";
import { useSalesTemplate } from "@/lib/use-sales-template";
import { ServiceJobSheet } from "@/components/printing/ServiceJobSheet";

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
  initialMode,
}: {
  job: ServiceJob | null;
  onClose: () => void;
  onSelect: (mode: "sheet" | "sticker", copies: number) => void;
  defaultCopies: number;
  initialMode?: "sheet" | null;
}) {
  const [mode, setMode] = useState<"sheet" | "sticker" | null>(initialMode ?? null);
  const [copies, setCopies] = useState(defaultCopies);

  // Reset when dialog opens
  useEffect(() => {
    if (job) {
      setMode(initialMode ?? null);
      setCopies(defaultCopies);
    }
  }, [job, initialMode, defaultCopies]);

  const handleCardClick = (m: "sheet" | "sticker") => {
    if (m === "sticker") { onSelect("sticker", 1); return; }
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
              <p className="font-semibold text-sm">A4 Service Sheet</p>
              <p className="text-xs text-muted-foreground mt-0.5">Full job details on A4</p>
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
          <div className="flex items-center justify-between border-t pt-4 gap-3">
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
              onClick={() => onSelect("sheet", copies)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              Print {copies > 1 ? `${copies} Copies` : "1 Copy"}
            </button>
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
  const [selected, setSelected]             = useState<Set<number>>(new Set());
  const [viewing, setViewing]               = useState<ServiceJob | null>(null);
  const [printChoiceJob, setPrintChoiceJob] = useState<ServiceJob | null>(null);
  const [printState, setPrintState]         = useState<{ job: ServiceJob; copies: number } | null>(null);
  const [activeSortKey, setSortKey]         = useState<SortKey>("bookInDate");
  const [sortDir, setSortDir]               = useState<SortDir>("desc");

  const queryClient = useQueryClient();
  const { data: jobsData, isLoading } = useListServiceJobs();
  const deleteMutation = useDeleteServiceJob();

  const { data: merchant }   = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const { profile }          = useBusinessProfile();
  const businessName         = merchant?.businessName ?? "Your Business";
  const brandColor           = (profile.brandColors as string[] | undefined)?.[0] ?? "#efbf04";
  const { printStickers } = useStickerPrinter();

  // Sheet print: reveal the hidden A4 print area, fire window.print(), then clean up.
  useEffect(() => {
    if (!printState) return;
    const t = setTimeout(() => {
      document.body.setAttribute("data-print", "sj-sheet");
      const cleanup = () => {
        document.body.removeAttribute("data-print");
        setPrintState(null);
      };
      // Use afterprint so the print area stays mounted until the browser is done rendering the print
      window.addEventListener("afterprint", cleanup, { once: true });
      window.print();
      // Fallback: if afterprint never fires (some environments), clean up after 30 s
      const fallback = window.setTimeout(cleanup, 30_000);
      window.addEventListener("afterprint", () => window.clearTimeout(fallback), { once: true });
    }, 150);
    return () => clearTimeout(t);
  }, [printState]);

  /* Read active service-sheet template + opts from Management > Templates */
  const { opts: serviceOpts, fontCss: serviceFontCss } = useSalesTemplate("Service_Ticket");

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
      },
    });
    if (!ok) toast.error("Couldn't open the print dialog — please try again");
  };

  const startPrint = (job: ServiceJob, mode: "sheet" | "sticker", copies = 1) => {
    if (mode === "sticker") { printRepairSticker(job); return; }
    setPrintState({ job, copies });
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
    setSelected(new Set());
    setSortKey("bookInDate");
    setSortDir("desc");
  };

  const [, routeParams] = useRoute("/service-jobs/:id");
  useEffect(() => {
    if (!routeParams?.id || jobs.length === 0 || viewing) return;
    const job = jobs.find((j) => j.id === Number(routeParams.id));
    if (job) {
      setViewing(job);
      /* Land on the tab the job lives in so closing the dialog shows it */
      if (isFinished(job)) switchTab("history");
    }
  }, [routeParams?.id, jobs]);

  /* Filter */
  const filtered = tabJobs.filter((j) => {
    if (priority === "critical" && !j.isCritical) return false;
    if (priority === "normal"   &&  j.isCritical) return false;
    if (statusFilter !== "all"  && j.status !== statusFilter) return false;
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
            <Link href="/service-jobs/new">
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
            <div className="flex items-center justify-between border-x border-b border-border bg-muted/20 px-5 py-2.5 gap-3">
              <div className="flex items-center gap-2">
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
                                <button
                                  onClick={() => setViewing(job)}
                                  className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                                >
                                  <Eye className="w-3 h-3" />
                                  View
                                </button>
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
        onSelect={(mode, copies) => { const job = printChoiceJob!; setPrintChoiceJob(null); startPrint(job, mode, copies); }}
        defaultCopies={Math.max(1, parseInt(serviceOpts.defaultPrintCopies ?? "1") || 1)}
      />

      {/* ── Print areas ─────────────────────────────────────────────────── */}
      {printState && (() => {
        const pj = printState.job;
        const printCopies = printState.copies;
        const sheetData = {
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
        };
        const sheetBranding = {
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
        return (
          <>
            {/* Screen: hide the print area so it doesn't appear in the UI.
               Print: show only the A4 service sheet. */}
            <style>{`
              @media screen {
                #sj-sheet-print-area { display: none !important; }
              }
              @media print {
                body * { visibility: hidden !important; }
                body[data-print="sj-sheet"] #sj-sheet-print-area,
                body[data-print="sj-sheet"] #sj-sheet-print-area * { visibility: visible !important; }
                body[data-print="sj-sheet"] #sj-sheet-print-area {
                  display: block !important;
                  position: fixed !important; left: 0 !important; top: 0 !important;
                  width: 210mm !important; box-sizing: border-box !important;
                }
                @page { size: A4 portrait; margin: 10mm; }
              }
            `}</style>

            {/* A4 service sheet — rendered once per copy with page breaks */}
            <div id="sj-sheet-print-area">
              {Array.from({ length: printCopies }, (_, i) => (
                <div key={i} style={i < printCopies - 1 ? { pageBreakAfter: "always" } : {}}>
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
          </>
        );
      })()}
    </AppLayout>
  );
}
