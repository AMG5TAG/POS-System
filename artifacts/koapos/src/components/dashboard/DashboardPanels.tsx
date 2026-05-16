import { useState } from "react";
import {
  useListServiceJobs,
  useUpdateServiceJob,
  ServiceJob,
  ServiceJobInputStatus,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Bell, Circle, AlertTriangle, Wrench, User, CalendarDays, FileText, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

// ─── helpers ──────────────────────────────────────────────────────────────────

const ALL_STATUSES: { value: string; label: string }[] = [
  { value: "pending",           label: "Pending" },
  { value: "in-progress",       label: "In Progress" },
  { value: "awaiting-customer", label: "Awaiting Customer" },
  { value: "completed",         label: "Completed" },
  { value: "cancelled",         label: "Cancelled" },
];

function statusLabel(status: string): string {
  return ALL_STATUSES.find((s) => s.value === status)?.label
    ?? status.charAt(0).toUpperCase() + status.slice(1);
}

function statusColor(status: string): string {
  switch (status) {
    case "in-progress":       return "bg-blue-100 text-blue-700 border-blue-200";
    case "awaiting-customer": return "bg-orange-100 text-orange-700 border-orange-200";
    case "pending":           return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "completed":         return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "cancelled":         return "bg-gray-100 text-gray-500 border-gray-200";
    default:                  return "bg-muted text-muted-foreground border-border";
  }
}

function statusIconColor(status: string): string {
  switch (status) {
    case "in-progress":       return "text-blue-500";
    case "awaiting-customer": return "text-orange-500";
    case "pending":           return "text-yellow-500";
    case "completed":         return "text-emerald-500";
    case "cancelled":         return "text-gray-400";
    default:                  return "text-muted-foreground";
  }
}

function formatBookDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-AU", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

// ─── Service Job Detail Dialog ────────────────────────────────────────────────

interface JobDialogProps {
  job: ServiceJob;
  onClose: () => void;
}

function ServiceJobDialog({ job, onClose }: JobDialogProps) {
  const queryClient = useQueryClient();
  const updateMutation = useUpdateServiceJob();

  const [newStatus, setNewStatus] = useState<string>(job.status as string);
  const [newNote, setNewNote] = useState("");
  const [isCritical, setIsCritical] = useState(job.isCritical);
  const [workDesc, setWorkDesc] = useState(job.workDescription ?? "");
  const [deviceType, setDeviceType] = useState(job.deviceType ?? "");
  const [deviceDesc, setDeviceDesc] = useState(job.deviceDescription ?? "");

  const isDirty =
    newStatus !== (job.status as string) ||
    isCritical !== job.isCritical ||
    workDesc !== (job.workDescription ?? "") ||
    deviceType !== (job.deviceType ?? "") ||
    deviceDesc !== (job.deviceDescription ?? "") ||
    newNote.trim().length > 0;

  const handleSave = async () => {
    const mergedNotes = [job.notes, newNote.trim()].filter(Boolean).join("\n\n---\n\n");
    await updateMutation.mutateAsync({
      id: job.id,
      data: {
        status: newStatus as ServiceJobInputStatus,
        isCritical,
        workDescription: workDesc || null,
        deviceType: deviceType || null,
        deviceDescription: deviceDesc || null,
        notes: mergedNotes || null,
      },
    });
    await queryClient.invalidateQueries({ queryKey: ["service-jobs-panel"] });
    await queryClient.invalidateQueries({ queryKey: ["service-jobs-dash"] });
    toast.success("Service job updated");
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Wrench className="w-4 h-4 text-primary shrink-0" />
            {job.jobNumber}
            {job.customerName && (
              <span className="text-muted-foreground font-normal">— {job.customerName}</span>
            )}
          </DialogTitle>
          <DialogDescription>
            View and update service job details, status, and notes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Read-only details */}
          <div className="rounded-lg bg-muted/40 p-3 space-y-2.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                Book-in: <span className="text-foreground font-medium ml-1">{formatBookDate(job.bookInDate)}</span>
              </div>
              {job.customerName && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <User className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-foreground font-medium">{job.customerName}</span>
                </div>
              )}
            </div>
            <DetailRow label="Device" value={[deviceType, deviceDesc].filter(Boolean).join(" — ") || job.deviceType || job.deviceDescription} />
            <DetailRow label="Serial #" value={job.serialNumber} />
            <DetailRow label="Condition" value={job.condition} />
            {job.estimatedCost != null && (
              <DetailRow label="Estimate" value={`$${job.estimatedCost.toFixed(2)}`} />
            )}
          </div>

          <Separator />

          {/* Editable fields */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Status */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Critical toggle */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Priority</Label>
                <div
                  className={cn(
                    "h-9 flex items-center gap-2 px-3 rounded-md border cursor-pointer select-none transition-colors",
                    isCritical ? "bg-red-50 border-red-300" : "bg-background border-input"
                  )}
                  onClick={() => setIsCritical(!isCritical)}
                >
                  <Checkbox checked={isCritical} onCheckedChange={(v) => setIsCritical(!!v)} id="critical-cb" />
                  <label htmlFor="critical-cb" className={cn("text-sm font-medium cursor-pointer", isCritical ? "text-red-700" : "text-foreground")}>
                    Critical
                  </label>
                  {isCritical && <AlertTriangle className="w-3.5 h-3.5 text-red-500 ml-auto" />}
                </div>
              </div>
            </div>

            {/* Device type */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Device Type</Label>
              <Input value={deviceType} onChange={(e) => setDeviceType(e.target.value)} className="h-9 text-sm" placeholder="e.g. iPhone, Laptop..." />
            </div>

            {/* Work description */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Work Description</Label>
              <Textarea
                value={workDesc}
                onChange={(e) => setWorkDesc(e.target.value)}
                className="text-sm min-h-[70px] resize-none"
                placeholder="Describe the work to be done..."
              />
            </div>

            {/* Existing notes */}
            {job.notes && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                  <FileText className="w-3 h-3" /> Existing Notes
                </Label>
                <div className="text-xs bg-muted/40 rounded-md p-2.5 text-muted-foreground whitespace-pre-wrap">{job.notes}</div>
              </div>
            )}

            {/* Add note */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {job.notes ? "Append Note" : "Add Note"}
              </Label>
              <Textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="text-sm min-h-[70px] resize-none"
                placeholder="Type a note to append..."
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              onClick={handleSave}
              disabled={!isDirty || updateMutation.isPending}
              className="flex-1"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Service Job Row ──────────────────────────────────────────────────────────

function ServiceJobRow({ job, onClick }: { job: ServiceJob; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 py-3 border-b last:border-0 text-left hover:bg-muted/30 rounded-md px-1 -mx-1 transition-colors group"
    >
      <Circle className={cn("w-4 h-4 mt-0.5 shrink-0 fill-current", statusIconColor(job.status as string))} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-mono font-medium text-primary group-hover:underline">{job.jobNumber}</span>
          {job.customerName && (
            <span className="text-xs font-medium text-primary">{job.customerName}</span>
          )}
          <Badge variant="outline" className={cn("text-[10px] py-0 h-4", statusColor(job.status as string))}>
            {statusLabel(job.status as string)}
          </Badge>
          <span className="flex items-center gap-1 text-[10px]">
            <span className={cn("w-2 h-2 rounded-full inline-block", job.isCritical ? "bg-red-500" : "bg-blue-400")} />
            <span className={cn("font-medium", job.isCritical ? "text-red-600" : "text-blue-600")}>
              {job.isCritical ? "Critical" : "Normal"}
            </span>
          </span>
        </div>
        {(job.workDescription || job.deviceDescription) && (
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {job.workDescription ?? job.deviceDescription}
          </p>
        )}
      </div>
      <span className="text-[11px] text-muted-foreground shrink-0 mt-0.5">{formatBookDate(job.bookInDate)}</span>
    </button>
  );
}

// ─── All Service Jobs Panel ───────────────────────────────────────────────────

function AllServiceJobsPanel() {
  const { data: jobs = [], isLoading } = useListServiceJobs({ query: { queryKey: ["service-jobs-panel"] } });
  const [selectedJob, setSelectedJob] = useState<ServiceJob | null>(null);

  const visible = jobs.filter((j) => {
    const s = j.status as string;
    if (s === "completed") {
      const todayStr = new Date().toISOString().split("T")[0];
      return j.updatedAt.startsWith(todayStr) || j.bookInDate === todayStr;
    }
    return true;
  });

  return (
    <>
      <Card className="flex flex-col h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-primary">All Service Jobs</CardTitle>
            <span className="text-xs text-muted-foreground font-medium">{jobs.length} total</span>
          </div>
          <p className="text-[11px] text-muted-foreground">Completed shown for today only · Click any row to edit</p>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto max-h-[400px]">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
          ) : visible.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No service jobs found.</div>
          ) : (
            <div>
              {visible.map((job) => (
                <ServiceJobRow key={job.id} job={job} onClick={() => setSelectedJob(job)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedJob && (
        <ServiceJobDialog
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
        />
      )}
    </>
  );
}

// ─── Notifications Panel ──────────────────────────────────────────────────────

interface Notification {
  id: number;
  text: string;
  isCritical: boolean;
  createdAt: string;
}

function NotificationsPanel() {
  const [notes, setNotes] = useState<Notification[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftCritical, setDraftCritical] = useState(false);

  const save = () => {
    if (!draft.trim()) return;
    setNotes((prev) => [
      ...prev,
      { id: Date.now(), text: draft.trim(), isCritical: draftCritical, createdAt: new Date().toISOString() },
    ]);
    setDraft("");
    setDraftCritical(false);
    setAdding(false);
  };

  const remove = (id: number) => setNotes((prev) => prev.filter((n) => n.id !== id));

  // Critical notes first, then the rest
  const sorted = [
    ...notes.filter((n) => n.isCritical),
    ...notes.filter((n) => !n.isCritical),
  ];

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          Notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-2.5">
        {sorted.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground text-center py-4">No notes yet.</p>
        )}

        {sorted.map((n) => (
          <div
            key={n.id}
            className={cn(
              "flex items-start gap-2 text-sm rounded-lg px-3 py-2.5",
              n.isCritical
                ? "bg-red-50 border border-red-200"
                : "bg-muted/40"
            )}
          >
            {n.isCritical && (
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            )}
            <span className={cn("flex-1", n.isCritical ? "text-red-800 font-medium" : "text-foreground")}>
              {n.text}
            </span>
            <button onClick={() => remove(n.id)} className="text-muted-foreground hover:text-destructive shrink-0 mt-0.5">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        {adding ? (
          <div className="space-y-2 mt-1">
            <Textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); }
                if (e.key === "Escape") { setAdding(false); setDraft(""); setDraftCritical(false); }
              }}
              placeholder="Type a notification..."
              className="text-sm min-h-[70px] resize-none"
            />
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer select-none transition-colors",
                draftCritical ? "bg-red-50 border-red-300" : "bg-muted/30 border-border"
              )}
              onClick={() => setDraftCritical(!draftCritical)}
            >
              <Checkbox
                checked={draftCritical}
                onCheckedChange={(v) => setDraftCritical(!!v)}
                id="critical-note-cb"
              />
              <label htmlFor="critical-note-cb" className={cn("text-sm font-medium cursor-pointer flex items-center gap-1.5", draftCritical ? "text-red-700" : "text-muted-foreground")}>
                <AlertCircle className={cn("w-3.5 h-3.5", draftCritical ? "text-red-500" : "text-muted-foreground")} />
                Mark as Critical
              </label>
              {draftCritical && <span className="ml-auto text-xs text-red-600 font-semibold">Will appear at top ↑</span>}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={save} className="flex-1">Save</Button>
              <Button size="sm" variant="outline" onClick={() => { setAdding(false); setDraft(""); setDraftCritical(false); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors mt-1"
          >
            <Plus className="w-3.5 h-3.5" />
            Add a Notification...
          </button>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function DashboardPanels({
  showNotifications = true,
  showServiceJobsPanel = true,
}: {
  showNotifications?: boolean;
  showServiceJobsPanel?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {showNotifications && <NotificationsPanel />}
      {showServiceJobsPanel && <AllServiceJobsPanel />}
    </div>
  );
}
