import { useState, useCallback } from "react";
import { Link } from "wouter";
import { FormsAttachmentPanel } from "@/components/forms/FormsAttachmentPanel";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListServiceJobs,
  useDeleteServiceJob,
  ServiceJob,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  SlidersHorizontal,
  Printer,
  Eye,
  MonitorSmartphone,
  User,
  Calendar,
  Wrench,
  Shield,
  Handshake,
  AlertCircle,
  Hash,
  ClipboardList,
  KeyRound,
  Package,
  StickyNote,
  Camera,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

/* ─── Status config ─────────────────────────────────────────────────────── */

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:             { label: "Pending",           className: "bg-amber-50 text-amber-700 border-amber-300" },
  "in-progress":       { label: "In Progress",       className: "bg-blue-50 text-blue-700 border-blue-300" },
  completed:           { label: "Completed",          className: "bg-emerald-50 text-emerald-700 border-emerald-300" },
  cancelled:           { label: "Cancelled",          className: "bg-red-50 text-red-700 border-red-300" },
  "awaiting-customer": { label: "Awaiting Customer", className: "bg-orange-50 text-orange-600 border-orange-300" },
};

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

/* ─── Detail dialog ─────────────────────────────────────────────────────── */

interface DetailDialogProps {
  job: ServiceJob | null;
  onClose: () => void;
  onDelete: (job: ServiceJob) => void;
  deleteIsPending: boolean;
}

function DetailDialog({ job, onClose, onDelete, deleteIsPending }: DetailDialogProps) {
  if (!job) return null;
  const { label, className } = getStatus(job.status);
  const photos = Array.isArray(job.photos) ? job.photos.filter(Boolean) : [];

  return (
    <Dialog open={!!job} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Wrench className="w-5 h-5 text-primary shrink-0" />
            <span className="font-mono">{job.jobNumber}</span>
            <span className={cn("ml-1 inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-medium border", className)}>
              {label}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {(job.isCritical || job.isUnderWarranty || job.isPartnerRepair) && (
            <div className="flex flex-wrap gap-2">
              {job.isCritical && (
                <Badge className="gap-1 text-xs bg-red-50 text-red-700 border-red-200 border">
                  <AlertCircle className="w-3 h-3" /> Critical
                </Badge>
              )}
              {job.isUnderWarranty && (
                <Badge className="gap-1 text-xs bg-blue-50 text-blue-700 border-blue-200 border">
                  <Shield className="w-3 h-3" /> Under Warranty
                </Badge>
              )}
              {job.isPartnerRepair && (
                <Badge className="gap-1 text-xs bg-purple-50 text-purple-700 border-purple-200 border">
                  <Handshake className="w-3 h-3" /> Partner Repair
                </Badge>
              )}
            </div>
          )}

          <div className="rounded-xl border bg-muted/20 divide-y">
            <DetailRow icon={User}     label="Customer"     value={job.customerName} />
            <DetailRow icon={Calendar} label="Book-In Date" value={formatDate(job.bookInDate)} />
            {job.partnerRepairCode && (
              <DetailRow icon={Hash} label="Partner Repair Code" value={job.partnerRepairCode} />
            )}
          </div>

          {(job.deviceType || job.deviceDescription || job.serialNumber || job.condition) && (
            <div className="rounded-xl border bg-muted/20 divide-y">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30 rounded-t-xl">
                <MonitorSmartphone className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Device</span>
              </div>
              <DetailRow icon={MonitorSmartphone} label="Device Type"   value={job.deviceType} />
              <DetailRow icon={MonitorSmartphone} label="Description"   value={job.deviceDescription} />
              <DetailRow icon={Hash}              label="Serial Number" value={job.serialNumber} />
              <DetailRow icon={AlertCircle}       label="Known Damage"  value={job.condition} />
            </div>
          )}

          {(job.workDescription || job.additionalEquipment || job.passwordOrPin || job.accounts) && (
            <div className="rounded-xl border bg-muted/20 divide-y">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30 rounded-t-xl">
                <ClipboardList className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Work Details</span>
              </div>
              <DetailRow icon={ClipboardList} label="Work Description"     value={job.workDescription} />
              <DetailRow icon={Package}       label="Additional Equipment" value={job.additionalEquipment} />
              <DetailRow icon={KeyRound}      label="Password / PIN"       value={job.passwordOrPin} />
              <DetailRow icon={StickyNote}    label="Accounts"             value={job.accounts} />
            </div>
          )}

          {photos.length > 0 && (
            <div className="rounded-xl border bg-muted/20">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30 rounded-t-xl">
                <Camera className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Photos &amp; Media ({photos.length})
                </span>
              </div>
              <div className="p-4 grid grid-cols-4 gap-2">
                {photos.map((src, i) => (
                  <img key={i} src={src} alt={`photo ${i + 1}`} className="w-full aspect-square object-cover rounded-lg border" />
                ))}
              </div>
            </div>
          )}

          {job.signature && (
            <div className="rounded-xl border bg-muted/20">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30 rounded-t-xl">
                <Eye className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer Signature</span>
              </div>
              <div className="p-4">
                <img src={job.signature} alt="signature" className="max-h-24 bg-white border rounded-lg p-2" />
              </div>
            </div>
          )}

          <FormsAttachmentPanel
            sourceType="service_job"
            sourceId={job.id}
            customerId={job.customerId ?? undefined}
            customerName={job.customerName ?? undefined}
          />
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5"
            onClick={() => { onDelete(job); onClose(); }}
            disabled={deleteIsPending}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ServiceJobsPage() {
  const [collapsed, setCollapsed]   = useState(false);
  const [priority, setPriority]     = useState("all");
  const [statusFilter, setStatus]   = useState("all");
  const [selected, setSelected]     = useState<Set<number>>(new Set());
  const [viewing, setViewing]       = useState<ServiceJob | null>(null);
  const [activeSortKey, setSortKey] = useState<SortKey>("bookInDate");
  const [sortDir, setSortDir]       = useState<SortDir>("desc");

  const queryClient = useQueryClient();
  const { data: jobsData, isLoading } = useListServiceJobs();
  const deleteMutation = useDeleteServiceJob();

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
          queryClient.invalidateQueries({ queryKey: ["listServiceJobs"] });
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
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="awaiting-customer">Awaiting Customer</SelectItem>
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
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => setViewing(job)}
                                  className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                                >
                                  <Eye className="w-3 h-3" />
                                  Parts / View
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

      <DetailDialog
        job={viewing}
        onClose={() => setViewing(null)}
        onDelete={handleDelete}
        deleteIsPending={deleteMutation.isPending}
      />
    </AppLayout>
  );
}
