import { useState, useEffect, useRef } from "react";
import {
  useUpdateServiceJob,
  getListServiceJobsQueryKey,
  ServiceJob,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Wrench, Shield, Handshake, AlertCircle, User, Calendar, MonitorSmartphone,
  Hash, ClipboardList, KeyRound, Package, StickyNote, Camera, Upload, X,
  Mail, Loader2, Printer, Trash2, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { FormsAttachmentPanel } from "@/components/forms/FormsAttachmentPanel";

/* ─── Status config ─────────────────────────────────────────────────────── */

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:                     { label: "Pending",                     className: "bg-amber-50 text-amber-700 border-amber-300" },
  "in-progress":               { label: "In Progress",                 className: "bg-blue-50 text-blue-700 border-blue-300" },
  "awaiting-partner-approval": { label: "Awaiting Partner Approval", className: "bg-indigo-50 text-indigo-700 border-indigo-300" },
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

/* ─── Exported dialog ─────────────────────────────────────────────────── */

export interface ServiceJobDetailDialogProps {
  job: ServiceJob | null;
  onClose: () => void;
  onDelete?: (job: ServiceJob) => void;
  deleteIsPending?: boolean;
  onPrint?: (job: ServiceJob, mode: "sheet" | "sticker") => void;
  onRefresh?: () => void;
  queryKeys?: string[][];
}

export function ServiceJobDetailDialog({
  job,
  onClose,
  onDelete,
  deleteIsPending,
  onPrint,
  onRefresh,
  queryKeys,
}: ServiceJobDetailDialogProps) {
  const queryClient  = useQueryClient();
  const updateMutation = useUpdateServiceJob();
  const fileInputRef   = useRef<HTMLInputElement>(null);

  const [localStatus, setLocalStatus] = useState<string>(job?.status ?? "pending");
  const [newNoteText, setNewNoteText] = useState("");
  const [localPhotos, setLocalPhotos] = useState<string[]>([]);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAll,     setShowAll]     = useState(false);

  useEffect(() => {
    if (!job) return;
    setLocalStatus(job.status ?? "pending");
    setNewNoteText("");
    setLocalPhotos(Array.isArray(job.photos) ? (job.photos as string[]).filter(Boolean) : []);
    setLightboxSrc(null);
    setShowAll(false);
  }, [job?.id]);

  if (!job) return null;

  const { className } = getStatus(localStatus);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListServiceJobsQueryKey() });
    queryKeys?.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    onRefresh?.();
  };

  const handleStatusChange = (status: string) => {
    setLocalStatus(status);
    updateMutation.mutate(
      { id: job.id, data: { status } as never },
      { onSuccess: invalidate, onError: () => toast.error("Failed to update status") }
    );
  };

  const handleAppendNote = () => {
    if (!newNoteText.trim()) return;
    const updated = appendNote(job.notes, newNoteText.trim());
    updateMutation.mutate(
      { id: job.id, data: { notes: updated } as never },
      {
        onSuccess: () => { invalidate(); setNewNoteText(""); toast.success("Note appended"); },
        onError: () => toast.error("Failed to save note"),
      }
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
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className={cn(
                  "ml-auto text-[11px] font-medium px-2.5 py-1 rounded-md border transition-colors",
                  showAll
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-muted-foreground border-border hover:border-primary hover:text-foreground"
                )}
              >
                {showAll ? "Compact View" : "Display All"}
              </button>
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

            {/* Customer */}
            <div className="rounded-xl border bg-muted/20 divide-y">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30 rounded-t-xl">
                <User className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer</span>
              </div>
              <div className="grid grid-cols-2 divide-x">
                <div className="divide-y">
                  <DetailRow icon={User}     label="Name"        value={job.customerName} />
                  <DetailRow icon={Calendar} label="Book-In Date" value={formatDate(job.bookInDate)} />
                  {job.partnerRepairCode && (
                    <DetailRow icon={Hash} label="Partner Repair Code" value={job.partnerRepairCode} />
                  )}
                  {(showAll && !job.partnerRepairCode) && (
                    <div className="flex items-start gap-3 px-4 py-3">
                      <Hash className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="text-sm min-w-0">
                        <p className="text-xs text-muted-foreground mb-0.5">Partner Repair Code</p>
                        <p className="font-medium text-muted-foreground/40">—</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="divide-y">
                  {(job.customerPhone || showAll) && (
                    <DetailRow icon={User} label="Phone" value={job.customerPhone ?? (showAll ? "—" : null)} />
                  )}
                  {(job.customerEmail || showAll) && (
                    <DetailRow icon={User} label="Email" value={job.customerEmail ?? (showAll ? "—" : null)} />
                  )}
                  {job.estimatedCost != null && (
                    <DetailRow icon={ClipboardList} label="Estimated Cost" value={`$${job.estimatedCost.toFixed(2)}`} />
                  )}
                  {(showAll && job.estimatedCost == null) && (
                    <div className="flex items-start gap-3 px-4 py-3">
                      <ClipboardList className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="text-sm min-w-0">
                        <p className="text-xs text-muted-foreground mb-0.5">Estimated Cost</p>
                        <p className="font-medium text-muted-foreground/40">—</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Device */}
            {(showAll || job.deviceType || job.deviceDescription || job.serialNumber || job.condition) && (
              <div className="rounded-xl border bg-muted/20 divide-y">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30 rounded-t-xl">
                  <MonitorSmartphone className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Device</span>
                </div>
                {(job.deviceType || showAll) && <DetailRow icon={MonitorSmartphone} label="Device Type"   value={job.deviceType ?? (showAll ? "—" : null)} />}
                {(job.deviceDescription || showAll) && <DetailRow icon={MonitorSmartphone} label="Description"   value={job.deviceDescription ?? (showAll ? "—" : null)} />}
                {(job.serialNumber || showAll) && <DetailRow icon={Hash}              label="Serial Number" value={job.serialNumber ?? (showAll ? "—" : null)} />}
                {(job.condition || showAll) && <DetailRow icon={AlertCircle}       label="Known Damage / Condition"  value={job.condition ?? (showAll ? "—" : null)} />}
                {/* Logins / Accounts */}
                {(job.passwordOrPin || job.accounts || showAll) && (() => {
                  const pins  = (job.passwordOrPin ?? "").split("\n").map(s => s.trim());
                  const accts = (job.accounts ?? "").split("\n").map(s => s.trim());
                  const max   = Math.max(pins.length, accts.length);
                  const hasBoth = pins.some(Boolean) && accts.some(Boolean);
                  const hasAny  = pins.some(Boolean) || accts.some(Boolean);
                  return (
                    <div className="flex items-start gap-3 px-4 py-3">
                      <KeyRound className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="text-sm min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground mb-1.5">Logins / Accounts</p>
                        {!hasAny ? (
                          <p className="font-medium text-muted-foreground/40">—</p>
                        ) : hasBoth ? (
                          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide font-semibold">Account</p>
                            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wide font-semibold">Password / PIN</p>
                            {Array.from({ length: max }, (_, i) => [
                              <p key={`a-${i}`} className="font-medium break-all">{accts[i] || "—"}</p>,
                              <p key={`p-${i}`} className="font-medium font-mono break-all">{pins[i] || "—"}</p>,
                            ])}
                          </div>
                        ) : (
                          <p className="font-medium break-words whitespace-pre-line">
                            {(job.passwordOrPin || job.accounts)?.trim()}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Work Details */}
            {(showAll || job.workDescription || job.additionalEquipment) && (
              <div className="rounded-xl border bg-muted/20 divide-y">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30 rounded-t-xl">
                  <ClipboardList className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Work Details</span>
                </div>
                {(job.workDescription || showAll) && (
                  <div className="flex items-start gap-3 px-4 py-3">
                    <ClipboardList className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="text-sm min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground mb-0.5">Work Description</p>
                      <p className="font-medium break-words whitespace-pre-line">{job.workDescription ?? "—"}</p>
                    </div>
                  </div>
                )}
                {(job.additionalEquipment || showAll) && <DetailRow icon={Package} label="Additional Equipment" value={job.additionalEquipment ?? (showAll ? "—" : null)} />}
              </div>
            )}

            {/* Notes */}
            <div className="rounded-xl border bg-muted/20">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30 rounded-t-xl">
                <StickyNote className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</span>
              </div>
              <div className="p-4 space-y-3">
                {/* Append note input */}
                <div className="flex gap-2 items-start">
                  <Textarea
                    value={newNoteText}
                    onChange={(e) => setNewNoteText(e.target.value)}
                    placeholder="Type a note to append…"
                    rows={2}
                    className="resize-none flex-1"
                  />
                  <Button
                    size="sm"
                    className="shrink-0 h-auto py-2 px-3 text-xs"
                    onClick={handleAppendNote}
                    disabled={!newNoteText.trim() || updateMutation.isPending}
                  >
                    Append Note
                  </Button>
                </div>
                {/* Existing notes — newest first */}
                {parseNotes(job.notes).length > 0 && (
                  <div className="space-y-2 pt-1">
                    {[...parseNotes(job.notes)].reverse().map((note, i) => {
                      const tsMatch = note.match(/^\[(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2})\]\s*/);
                      const ts   = tsMatch ? tsMatch[1] : null;
                      const text = ts ? note.slice(tsMatch![0].length) : note;
                      return (
                        <div key={i} className="rounded-lg border bg-background p-3 text-sm space-y-1">
                          {ts && (
                            <p className="text-[10px] font-semibold text-muted-foreground/70 flex items-center gap-1">
                              <StickyNote className="w-3 h-3" />
                              {ts}
                            </p>
                          )}
                          <p className="whitespace-pre-wrap break-words leading-relaxed">{text}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Photos & Files */}
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
            {onDelete && (
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5"
                onClick={() => setConfirmDelete(true)}
                disabled={deleteIsPending}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </Button>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={emailLoading || !job?.customerEmail}
                title={job?.customerEmail ? "Email job details to customer" : "No customer email on file"}
                onClick={async () => {
                  if (!job?.customerEmail || emailLoading) return;
                  setEmailLoading(true);
                  try {
                    const res = await fetch(`/api/service-jobs/${job.id}/email`, {
                      method: "POST",
                      credentials: "include",
                    });
                    const data = await res.json().catch(() => ({ success: false, error: "Server error" }));
                    if (res.ok && data.success) {
                      toast.success(`Email sent to ${job.customerEmail}`);
                    } else {
                      toast.error(data.error ?? "Failed to send email");
                    }
                  } catch {
                    toast.error("Network error — email not sent");
                  } finally {
                    setEmailLoading(false);
                  }
                }}
              >
                {emailLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                Email
              </Button>
              {onPrint && (
                <>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onPrint(job, "sheet")}>
                    <Printer className="w-3.5 h-3.5" />
                    Print
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onPrint(job, "sticker")}>
                    <Printer className="w-3.5 h-3.5" />
                    Sticker
                  </Button>
                </>
              )}
              <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {onDelete && (
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete service job #{job?.jobNumber}?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this service job and cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => { if (job) { onDelete(job); onClose(); } }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
