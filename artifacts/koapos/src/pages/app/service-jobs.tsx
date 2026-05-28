import { useState, useCallback, useEffect } from "react";
import { Link } from "wouter";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { STICKER_TYPES, DYMO_SIZES, LabelPreview, useStickerTemplates } from "@/lib/sticker-config";
import { ServiceJobDetailDialog } from "@/components/service-jobs/ServiceJobDetailDialog";

/* ─── Status config ─────────────────────────────────────────────────────── */

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:                     { label: "Pending",                     className: "bg-amber-50 text-amber-700 border-amber-300" },
  "in-progress":               { label: "In Progress",                 className: "bg-blue-50 text-blue-700 border-blue-300" },
  "awaiting-partner-approval": { label: "Awaiting Partner Approval", className: "bg-indigo-50 text-indigo-700 border-indigo-300" },
  "partner-replacement":       { label: "Partner Replacement",       className: "bg-teal-50 text-teal-700 border-teal-300" },
  "awaiting-stock":          { label: "Awaiting Stock",              className: "bg-purple-50 text-purple-700 border-purple-300" },
  "awaiting-customer":       { label: "Awaiting Customer",           className: "bg-orange-50 text-orange-600 border-orange-300" },
  completed:                 { label: "Completed",                   className: "bg-emerald-50 text-emerald-700 border-emerald-300" },
  cancelled:                 { label: "Cancelled",                   className: "bg-red-50 text-red-700 border-red-300" },
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

function sortJobs(jobs: ServiceJob[], key: SortKey, dir: SortDir): ServiceJob[] {
  const active    = jobs.filter((j) => j.status !== "completed");
  const completed = jobs.filter((j) => j.status === "completed");

  const compare = (a: ServiceJob, b: ServiceJob) => {
    const av = getValue(a, key);
    const bv = getValue(b, key);
    const result = av < bv ? -1 : av > bv ? 1 : 0;
    return dir === "asc" ? result : -result;
  };

  return [...active.sort(compare), ...completed.sort(compare)];
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
}: {
  job: ServiceJob | null;
  onClose: () => void;
  onSelect: (mode: "sheet" | "sticker") => void;
}) {
  return (
    <Dialog open={!!job} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Print — {job?.jobNumber}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <button
            onClick={() => onSelect("sheet")}
            className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-colors"
          >
            <Printer className="w-8 h-8 text-primary" />
            <div className="text-center">
              <p className="font-semibold text-sm">A4 Service Sheet</p>
              <p className="text-xs text-muted-foreground mt-0.5">Full job details on A4</p>
            </div>
          </button>
          <button
            onClick={() => onSelect("sticker")}
            className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-colors"
          >
            <Package className="w-8 h-8 text-primary" />
            <div className="text-center">
              <p className="font-semibold text-sm">Label Sticker</p>
              <p className="text-xs text-muted-foreground mt-0.5">DYMO repair label</p>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ServiceJobsPage() {
  const [collapsed, setCollapsed]           = useState(false);
  const [priority, setPriority]             = useState("all");
  const [statusFilter, setStatus]           = useState("all");
  const [selected, setSelected]             = useState<Set<number>>(new Set());
  const [viewing, setViewing]               = useState<ServiceJob | null>(null);
  const [printChoiceJob, setPrintChoiceJob] = useState<ServiceJob | null>(null);
  const [printState, setPrintState]         = useState<{ job: ServiceJob; mode: "sheet" | "sticker" } | null>(null);
  const [activeSortKey, setSortKey]         = useState<SortKey>("bookInDate");
  const [sortDir, setSortDir]               = useState<SortDir>("desc");

  const queryClient = useQueryClient();
  const { data: jobsData, isLoading } = useListServiceJobs();
  const deleteMutation = useDeleteServiceJob();

  const { data: merchant }   = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const { profile }          = useBusinessProfile();
  const businessName         = merchant?.businessName ?? "Your Business";
  const brandColor           = (profile.brandColors as string[] | undefined)?.[0] ?? "#efbf04";
  const { templates: stickerTemplates } = useStickerTemplates();

  useEffect(() => {
    if (!printState) return;
    const t = setTimeout(() => {
      const attr = printState.mode === "sheet" ? "sj-sheet" : "sj-sticker";
      document.body.setAttribute("data-print", attr);
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

  /* Read active service-sheet template + opts from Management > Sale Templates */
  const serviceOpts = {
    showLogo: true, showAbn: true, headerText: "SERVICE JOB SHEET",
    jobNoFontSize: "normal" as "normal" | "large" | "xlarge",
    showCustomerDetails: true, showDeviceDetails: true, showWorkDescription: true,
    showPhotos: true, showSignature: true, showCallHistory: true,
    callHistoryRows: "6", warrantyText: "", footerText: "",
    templateId: "ss-standard",
  };
  const isCompact = serviceOpts.templateId === "ss-compact";
  const callRows  = Math.max(1, Math.min(20, parseInt(serviceOpts.callHistoryRows || "5", 10) || 5));
  const jobNoSize = serviceOpts.jobNoFontSize === "xlarge" ? 26 : serviceOpts.jobNoFontSize === "large" ? 22 : 18;
  const abn       = (profile as { abn?: string }).abn ?? "";
  const logo      = (profile as { logo?: string }).logo ?? "";

  const jobs   = Array.isArray(jobsData) ? jobsData : [];
  const active = jobs.filter((j) => j.status !== "completed" && j.status !== "cancelled").length;

  /* Filter */
  const filtered = jobs.filter((j) => {
    if (priority === "critical" && !j.isCritical) return false;
    if (priority === "normal"   &&  j.isCritical) return false;
    if (statusFilter !== "all"  && j.status !== statusFilter) return false;
    return true;
  });

  /* Sort — completed always pinned to bottom */
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
        {/* Panel header */}
        <div className="flex items-center justify-between bg-background border border-border rounded-t-xl px-5 py-3">
          <h2 className="text-base font-semibold">
            All Services{" "}
            <span className="font-normal text-muted-foreground text-sm">
              ({active} active job{active !== 1 ? "s" : ""})
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
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in-progress">In Progress</SelectItem>
                    <SelectItem value="awaiting-partner-approval">Awaiting Partner Approval</SelectItem>
                    <SelectItem value="partner-replacement">Partner Replacement</SelectItem>
                    <SelectItem value="awaiting-stock">Awaiting Stock</SelectItem>
                    <SelectItem value="awaiting-customer">Awaiting Customer</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>{sorted.length} of {jobs.length}</span>
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
                  No service jobs match the current filters.
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
                              isChecked   && "bg-primary/5",
                              isCompleted && "opacity-60"
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
        onPrint={(job, mode) => { setViewing(null); setPrintState({ job, mode }); }}
      />

      <PrintChoiceDialog
        job={printChoiceJob}
        onClose={() => setPrintChoiceJob(null)}
        onSelect={(mode) => { const job = printChoiceJob!; setPrintChoiceJob(null); setPrintState({ job, mode }); }}
      />

      {/* ── Print areas ─────────────────────────────────────────────────── */}
      {printState && (() => {
        const pj = printState.job;
        const repairType = STICKER_TYPES.find((t) => t.id === "repair") ?? STICKER_TYPES[0];
        const tpl        = stickerTemplates.find((t) => t.typeId === "repair");
        const stickerSize = DYMO_SIZES.find((s) => s.id === (tpl?.sizeId ?? repairType.defaultSize))
                         ?? DYMO_SIZES.find((s) => s.id === "S0722520")
                         ?? DYMO_SIZES[0];
        // Orientation-adjusted sticker dimensions (horizontal = landscape)
        const stkW = Math.max(stickerSize.widthMm, stickerSize.heightMm);
        const stkH = Math.min(stickerSize.widthMm, stickerSize.heightMm);
        return (
          <>
            {/* Screen: hide both print areas so they don't appear in the UI */}
            {/* Print: show only the area matching the current data-print attribute */}
            <style>{`
              @media screen {
                #sj-sheet-print-area, #sj-sticker-print-area { display: none !important; }
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
                body[data-print="sj-sticker"] #sj-sticker-print-area,
                body[data-print="sj-sticker"] #sj-sticker-print-area * { visibility: visible !important; }
                body[data-print="sj-sticker"] #sj-sticker-print-area {
                  display: flex !important;
                  position: fixed !important; left: 0 !important; top: 0 !important;
                  width: ${stkW}mm !important; height: ${stkH}mm !important;
                  align-items: center !important; justify-content: center !important;
                  overflow: hidden !important;
                }
              }
            `}</style>
            {/* Inject @page size rules separately — @page cannot be nested inside selectors */}
            {printState.mode === "sheet" && (
              <style>{`@media print { @page { size: A4 portrait; margin: 10mm; } }`}</style>
            )}
            {printState.mode === "sticker" && (
              <style>{`@media print { @page { size: ${stkW}mm ${stkH}mm; margin: 0; } }`}</style>
            )}

            {/* A4 service sheet */}
            <div
              id="sj-sheet-print-area"
              style={{ width: "100%", maxWidth: 794, background: "white", padding: "48px 48px 48px 48px", boxSizing: "border-box", fontFamily: "Arial, sans-serif", fontSize: 12, color: "#111", lineHeight: 1.6 }}
            >
              {/* Header */}
              <div style={{ borderBottom: `4px solid ${brandColor}`, paddingBottom: isCompact ? 8 : 16, marginBottom: isCompact ? 12 : 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    {serviceOpts.showLogo && logo && (
                      <img src={logo} alt="Logo" style={{ maxHeight: 42, maxWidth: 80, objectFit: "contain" }} />
                    )}
                    <div>
                      <div style={{ fontSize: isCompact ? 16 : 20, fontWeight: "bold" }}>{businessName}</div>
                      <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{serviceOpts.headerText || "SERVICE JOB SHEET"}</div>
                      {serviceOpts.showAbn && abn && <div style={{ fontSize: 10, color: "#888", marginTop: 1 }}>ABN {abn}</div>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: jobNoSize, fontWeight: "bold", fontFamily: "monospace", color: brandColor }}>{pj.jobNumber}</div>
                    <div style={{ fontSize: 11, color: "#666" }}>{pj.bookInDate ? formatDate(pj.bookInDate) : ""}</div>
                    <div style={{ display: "inline-block", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: "bold", marginTop: 4, color: "#334155" }}>
                      {getStatus(pj.status).label}
                    </div>
                  </div>
                </div>
              </div>

              {/* Customer / Device */}
              {(serviceOpts.showCustomerDetails || serviceOpts.showDeviceDetails) && (
                <div style={{ display: "grid", gridTemplateColumns: serviceOpts.showCustomerDetails && serviceOpts.showDeviceDetails ? "1fr 1fr" : "1fr", gap: 24, marginBottom: isCompact ? 12 : 20 }}>
                  {serviceOpts.showCustomerDetails && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.08em", color: "#666", borderBottom: "1px solid #e2e8f0", paddingBottom: 4, marginBottom: 8 }}>Customer</div>
                      <div style={{ fontWeight: "bold" }}>{pj.customerName || "—"}</div>
                      {pj.customerPhone && <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>📞 {pj.customerPhone}</div>}
                      {pj.customerEmail && <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>✉ {pj.customerEmail}</div>}
                    </div>
                  )}
                  {serviceOpts.showDeviceDetails && (
                    <div>
                      <div style={{ fontSize: 10, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.08em", color: "#666", borderBottom: "1px solid #e2e8f0", paddingBottom: 4, marginBottom: 8 }}>Device</div>
                      {pj.deviceType && <div style={{ fontWeight: "bold" }}>{pj.deviceType}</div>}
                      {pj.deviceDescription && <div>{pj.deviceDescription}</div>}
                      {pj.serialNumber && <div style={{ color: "#666", fontSize: 11 }}>SN: {pj.serialNumber}</div>}
                      {pj.condition && <div style={{ color: "#666", fontSize: 11 }}>Condition: {pj.condition}</div>}
                    </div>
                  )}
                </div>
              )}

              {serviceOpts.showWorkDescription && (pj.workDescription || pj.additionalEquipment || pj.passwordOrPin || pj.accounts) && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.08em", color: "#666", borderBottom: "1px solid #e2e8f0", paddingBottom: 4, marginBottom: 8 }}>Work Details</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <tbody>
                      {pj.workDescription && (
                        <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "5px 8px 5px 0", width: "28%", color: "#666", fontSize: 11, fontWeight: "bold", verticalAlign: "top" }}>Work Description</td>
                          <td style={{ padding: "5px 0", whiteSpace: "pre-wrap", verticalAlign: "top" }}>{pj.workDescription}</td>
                        </tr>
                      )}
                      {pj.additionalEquipment && (
                        <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "5px 8px 5px 0", width: "28%", color: "#666", fontSize: 11, fontWeight: "bold", verticalAlign: "top" }}>Additional Equipment</td>
                          <td style={{ padding: "5px 0", verticalAlign: "top" }}>{pj.additionalEquipment}</td>
                        </tr>
                      )}
                      {(pj.passwordOrPin || pj.accounts) && (() => {
                        const pins  = (pj.passwordOrPin ?? "").split("\n").map((s: string) => s.trim());
                        const accts = (pj.accounts ?? "").split("\n").map((s: string) => s.trim());
                        const max   = Math.max(pins.length, accts.length);
                        const lines = Array.from({ length: max }, (_, i) => {
                          const a = accts[i] || "";
                          const p = pins[i]  || "";
                          if (a && p) return `${a} — ${p}`;
                          return a || p;
                        }).filter(Boolean);
                        return (
                          <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "5px 8px 5px 0", width: "28%", color: "#666", fontSize: 11, fontWeight: "bold", verticalAlign: "top" }}>Logins / Accounts</td>
                            <td style={{ padding: "5px 0", verticalAlign: "top" }}>
                              {lines.map((line, li) => <div key={li}>{line}</div>)}
                            </td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              )}

              {pj.notes && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.08em", color: "#666", borderBottom: "1px solid #e2e8f0", paddingBottom: 4, marginBottom: 8 }}>Notes</div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{pj.notes}</div>
                </div>
              )}

              {serviceOpts.showPhotos && Array.isArray(pj.photos) && (pj.photos as string[]).filter(Boolean).length > 0 && (() => {
                const photoCount = (pj.photos as string[]).filter(Boolean).length;
                return (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 10, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.08em", color: "#666", borderBottom: "1px solid #e2e8f0", paddingBottom: 4, marginBottom: 8 }}>
                      Attachments
                    </div>
                    <div style={{ fontSize: 12, color: "#555", padding: "8px 10px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 4 }}>
                      📷 {photoCount} photo{photoCount !== 1 ? "s" : ""} attached — view on device
                    </div>
                  </div>
                );
              })()}

              {serviceOpts.showSignature && pj.signature && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.08em", color: "#666", borderBottom: "1px solid #e2e8f0", paddingBottom: 4, marginBottom: 8 }}>Customer Signature</div>
                  <img src={pj.signature} style={{ maxHeight: 80, background: "white", border: "1px solid #e2e8f0", borderRadius: 4, padding: 8 }} />
                </div>
              )}

              {/* Call history table */}
              {serviceOpts.showCallHistory && (
                <div style={{ marginTop: isCompact ? 12 : 24 }}>
                  <div style={{ fontSize: 10, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.08em", color: "#666", borderBottom: "1px solid #e2e8f0", paddingBottom: 4, marginBottom: 8 }}>Call History</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        {["Date", "Staff", "Notes"].map((h) => (
                          <th key={h} style={{ border: "1px solid #e2e8f0", padding: "4px 8px", textAlign: "left", fontWeight: "bold", color: "#555" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: callRows }).map((_, i) => (
                        <tr key={i}>
                          <td style={{ border: "1px solid #e2e8f0", padding: "6px 8px", height: 28 }} />
                          <td style={{ border: "1px solid #e2e8f0", padding: "6px 8px", height: 28 }} />
                          <td style={{ border: "1px solid #e2e8f0", padding: "6px 8px", height: 28 }} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Warranty / terms */}
              {serviceOpts.warrantyText && (
                <div style={{ marginTop: 16, padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 4, fontSize: 11, color: "#92400e", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                  <strong style={{ display: "block", marginBottom: 4, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>Warranty / Terms</strong>
                  {serviceOpts.warrantyText}
                </div>
              )}

              {/* Footer */}
              {serviceOpts.footerText && (
                <div style={{ marginTop: 24, paddingTop: 12, borderTop: "1px solid #e5e7eb", textAlign: "center", fontSize: 10, color: "#999" }}>
                  {serviceOpts.footerText}
                </div>
              )}
            </div>

            {/* Sticker */}
            <div
              id="sj-sticker-print-area"
              style={{ position: "fixed", left: "-9999px", top: 0 }}
            >
              <LabelPreview
                type={repairType}
                fields={{
                  jobNo:    pj.jobNumber ?? "",
                  customer: pj.customerName ?? "",
                  device:   pj.deviceType ?? pj.deviceDescription ?? "",
                  fault:    pj.workDescription ?? "",
                  dueDate:  "",
                  tech:     "",
                }}
                size={stickerSize}
                businessName={businessName}
                brandColor={brandColor}
                orientation="horizontal"
              />
            </div>
          </>
        );
      })()}
    </AppLayout>
  );
}
