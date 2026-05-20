import { useState, useCallback, useEffect, useRef } from "react";
import { Link } from "wouter";
import { FormsAttachmentPanel } from "@/components/forms/FormsAttachmentPanel";
import { AppLayout } from "@/components/layout/app-layout";
import {
  useListServiceJobs,
  useDeleteServiceJob,
  useUpdateServiceJob,
  useGetMerchant,
  ServiceJob,
} from "@workspace/api-client-react";
import { useBusinessProfile } from "@/lib/business-profile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { STICKER_TYPES, DYMO_SIZES, LabelPreview, useStickerTemplates } from "@/lib/sticker-config";

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
  onPrint: (job: ServiceJob, mode: "sheet" | "sticker") => void;
}

function DetailDialog({ job, onClose, onDelete, deleteIsPending, onPrint }: DetailDialogProps) {
  const queryClient  = useQueryClient();
  const updateMutation = useUpdateServiceJob();
  const fileInputRef   = useRef<HTMLInputElement>(null);

  const [localStatus, setLocalStatus] = useState<string>(job?.status ?? "pending");
  const [localNotes,  setLocalNotes]  = useState(job?.notes  ?? "");
  const [notesDirty,  setNotesDirty]  = useState(false);
  const [localPhotos, setLocalPhotos] = useState<string[]>([]);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [uploading,   setUploading]   = useState(false);

  useEffect(() => {
    if (!job) return;
    setLocalStatus(job.status ?? "pending");
    setLocalNotes(job.notes ?? "");
    setNotesDirty(false);
    setLocalPhotos(Array.isArray(job.photos) ? (job.photos as string[]).filter(Boolean) : []);
    setLightboxSrc(null);
  }, [job?.id]);

  if (!job) return null;

  const { className } = getStatus(localStatus);
  const invalidate    = () => queryClient.invalidateQueries({ queryKey: ["listServiceJobs"] });

  const handleStatusChange = (status: string) => {
    setLocalStatus(status);
    updateMutation.mutate(
      { id: job.id, data: { status } as never },
      { onSuccess: invalidate, onError: () => toast.error("Failed to update status") }
    );
  };

  const handleSaveNotes = () => {
    updateMutation.mutate(
      { id: job.id, data: { notes: localNotes } as never },
      { onSuccess: () => { invalidate(); setNotesDirty(false); toast.success("Notes saved"); }, onError: () => toast.error("Failed to save notes") }
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    Promise.all(
      files.map((file) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      }))
    ).then((newPhotos) => {
      const updated = [...localPhotos, ...newPhotos];
      setLocalPhotos(updated);
      return updateMutation.mutateAsync({ id: job.id, data: { photos: updated } as never });
    }).then(() => { invalidate(); toast.success("Files uploaded"); })
     .catch(() => toast.error("Upload failed"))
     .finally(() => { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; });
  };

  const handleRemovePhoto = (idx: number) => {
    const updated = localPhotos.filter((_, i) => i !== idx);
    setLocalPhotos(updated);
    updateMutation.mutate(
      { id: job.id, data: { photos: updated } as never },
      { onSuccess: invalidate, onError: () => toast.error("Failed to remove photo") }
    );
  };

  return (
    <>
      {/* Lightbox */}
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

      <Dialog open={!!job} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold flex-wrap">
              <Wrench className="w-5 h-5 text-primary shrink-0" />
              <span className="font-mono">{job.jobNumber}</span>
              <Select value={localStatus} onValueChange={handleStatusChange}>
                <SelectTrigger className={cn("h-7 text-[11px] font-medium border w-auto min-w-[140px] px-2.5 rounded-md", className)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                    <SelectItem key={val} value={val} className="text-xs">{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <DetailRow icon={User}     label="Customer"      value={job.customerName} />
              {job.customerPhone && <DetailRow icon={User} label="Phone"  value={job.customerPhone} />}
              {job.customerEmail && <DetailRow icon={User} label="Email"  value={job.customerEmail} />}
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

            {/* ── Notes ── */}
            <div className="rounded-xl border bg-muted/20">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30 rounded-t-xl">
                <StickyNote className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</span>
              </div>
              <div className="p-4 space-y-3">
                <Textarea
                  value={localNotes}
                  onChange={(e) => { setLocalNotes(e.target.value); setNotesDirty(true); }}
                  placeholder="Add internal notes for this service job…"
                  rows={3}
                  className="resize-none"
                />
                {notesDirty && (
                  <Button size="sm" className="h-7 text-xs" onClick={handleSaveNotes} disabled={updateMutation.isPending}>
                    Save Notes
                  </Button>
                )}
              </div>
            </div>

            {/* ── Photos & Files ── */}
            <div className="rounded-xl border bg-muted/20">
              <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30 rounded-t-xl">
                <div className="flex items-center gap-2">
                  <Camera className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Photos &amp; Files ({localPhotos.length})
                  </span>
                </div>
                <label className="cursor-pointer">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,video/*,.pdf"
                    className="sr-only"
                    onChange={handleFileUpload}
                    disabled={uploading}
                  />
                  <span className={cn("inline-flex items-center gap-1 text-xs font-medium transition-colors select-none", uploading ? "text-muted-foreground cursor-wait" : "text-primary hover:underline cursor-pointer")}>
                    <Upload className="w-3 h-3" />
                    {uploading ? "Uploading…" : "Upload"}
                  </span>
                </label>
              </div>
              <div className="p-4">
                {localPhotos.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-2">No files uploaded yet.</p>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {localPhotos.map((src, i) => (
                      <div key={i} className="relative group">
                        <img
                          src={src}
                          alt={`file ${i + 1}`}
                          className="w-full aspect-square object-cover rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setLightboxSrc(src)}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(i)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow-sm"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

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
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onPrint(job, "sheet")}>
                <Printer className="w-3.5 h-3.5" />
                A4 Sheet
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onPrint(job, "sticker")}>
                <Printer className="w-3.5 h-3.5" />
                Sticker
              </Button>
              <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

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
      document.body.setAttribute("data-print", printState.mode === "sheet" ? "sj-sheet" : "sj-sticker");
      window.print();
      document.body.removeAttribute("data-print");
      setPrintState(null);
    }, 120);
    return () => clearTimeout(t);
  }, [printState]);

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

      <DetailDialog
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
        return (
          <>
            <style>{`
              @media print {
                body * { visibility: hidden !important; }
                body[data-print="sj-sheet"] #sj-sheet-print-area,
                body[data-print="sj-sheet"] #sj-sheet-print-area * { visibility: visible !important; }
                body[data-print="sj-sheet"] #sj-sheet-print-area {
                  position: fixed !important; left: 0 !important; top: 0 !important; width: 100% !important;
                }
                body[data-print="sj-sticker"] #sj-sticker-print-area,
                body[data-print="sj-sticker"] #sj-sticker-print-area * { visibility: visible !important; }
                body[data-print="sj-sticker"] #sj-sticker-print-area {
                  position: fixed !important; left: 0 !important; top: 0 !important;
                  width: 100vw !important; height: 100vh !important;
                  display: flex !important; align-items: center !important; justify-content: center !important;
                }
              }
            `}</style>

            {/* A4 service sheet */}
            <div
              id="sj-sheet-print-area"
              aria-hidden="true"
              style={{ position: "absolute", left: "-9999px", top: 0, width: 794, background: "white", padding: "48px 48px 48px 48px", boxSizing: "border-box", fontFamily: "Arial, sans-serif", fontSize: 12, color: "#111", lineHeight: 1.6 }}
            >
              {/* Header */}
              <div style={{ borderBottom: `4px solid ${brandColor}`, paddingBottom: 16, marginBottom: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: "bold" }}>{businessName}</div>
                    <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>Service Job Record</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 18, fontWeight: "bold", fontFamily: "monospace", color: brandColor }}>{pj.jobNumber}</div>
                    <div style={{ fontSize: 11, color: "#666" }}>{pj.bookInDate ? formatDate(pj.bookInDate) : ""}</div>
                    <div style={{ display: "inline-block", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: "bold", marginTop: 4, color: "#334155" }}>
                      {getStatus(pj.status).label}
                    </div>
                  </div>
                </div>
              </div>

              {/* Customer / Device */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.08em", color: "#666", borderBottom: "1px solid #e2e8f0", paddingBottom: 4, marginBottom: 8 }}>Customer</div>
                  <div style={{ fontWeight: "bold" }}>{pj.customerName || "—"}</div>
                  {pj.customerPhone && <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>📞 {pj.customerPhone}</div>}
                  {pj.customerEmail && <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>✉ {pj.customerEmail}</div>}
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.08em", color: "#666", borderBottom: "1px solid #e2e8f0", paddingBottom: 4, marginBottom: 8 }}>Device</div>
                  {pj.deviceType && <div style={{ fontWeight: "bold" }}>{pj.deviceType}</div>}
                  {pj.deviceDescription && <div>{pj.deviceDescription}</div>}
                  {pj.serialNumber && <div style={{ color: "#666", fontSize: 11 }}>SN: {pj.serialNumber}</div>}
                  {pj.condition && <div style={{ color: "#666", fontSize: 11 }}>Condition: {pj.condition}</div>}
                </div>
              </div>

              {(pj.workDescription || pj.additionalEquipment || pj.passwordOrPin || pj.accounts) && (
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
                      {pj.passwordOrPin && (
                        <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "5px 8px 5px 0", width: "28%", color: "#666", fontSize: 11, fontWeight: "bold", verticalAlign: "top" }}>Password / PIN</td>
                          <td style={{ padding: "5px 0", verticalAlign: "top" }}>{pj.passwordOrPin}</td>
                        </tr>
                      )}
                      {pj.accounts && (
                        <tr>
                          <td style={{ padding: "5px 8px 5px 0", width: "28%", color: "#666", fontSize: 11, fontWeight: "bold", verticalAlign: "top" }}>Accounts</td>
                          <td style={{ padding: "5px 0", verticalAlign: "top" }}>{pj.accounts}</td>
                        </tr>
                      )}
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

              {Array.isArray(pj.photos) && (pj.photos as string[]).filter(Boolean).length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.08em", color: "#666", borderBottom: "1px solid #e2e8f0", paddingBottom: 4, marginBottom: 8 }}>
                    Photos ({(pj.photos as string[]).filter(Boolean).length})
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                    {(pj.photos as string[]).filter(Boolean).map((src, i) => (
                      <img key={i} src={src} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 4, border: "1px solid #e2e8f0" }} />
                    ))}
                  </div>
                </div>
              )}

              {pj.signature && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.08em", color: "#666", borderBottom: "1px solid #e2e8f0", paddingBottom: 4, marginBottom: 8 }}>Customer Signature</div>
                  <img src={pj.signature} style={{ maxHeight: 80, background: "white", border: "1px solid #e2e8f0", borderRadius: 4, padding: 8 }} />
                </div>
              )}

              {/* Call history table */}
              <div style={{ marginTop: 24 }}>
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
                    {Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        <td style={{ border: "1px solid #e2e8f0", padding: "6px 8px", height: 28 }} />
                        <td style={{ border: "1px solid #e2e8f0", padding: "6px 8px", height: 28 }} />
                        <td style={{ border: "1px solid #e2e8f0", padding: "6px 8px", height: 28 }} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sticker */}
            <div
              id="sj-sticker-print-area"
              aria-hidden="true"
              style={{ position: "absolute", left: "-9999px", top: 0 }}
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
