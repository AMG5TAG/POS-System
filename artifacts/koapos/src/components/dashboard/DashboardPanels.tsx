import { useState } from "react";
import {
  useListServiceJobs,
  ServiceJob,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Bell, Circle, AlertTriangle, Wrench, User, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { ServiceJobDetailDialog } from "@/components/service-jobs/ServiceJobDetailDialog";

// ─── helpers ──────────────────────────────────────────────────────────────────

const ALL_STATUSES: { value: string; label: string }[] = [
  { value: "pending",           label: "Pending" },
  { value: "in-progress",       label: "In Progress" },
  { value: "awaiting-stock",    label: "Awaiting Stock" },
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
    case "awaiting-stock":    return "bg-purple-100 text-purple-700 border-purple-200";
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
    case "awaiting-stock":    return "text-purple-500";
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

// ─── (Legacy ServiceJobDialog removed — now uses shared ServiceJobDetailDialog from
//   @/components/service-jobs/ServiceJobDetailDialog)

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
        <ServiceJobDetailDialog
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          queryKeys={[["service-jobs-panel"], ["service-jobs-dash"]]}
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
