import { useState } from "react";
import { useListServiceJobs, ServiceJob } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Bell, Circle } from "lucide-react";

// ─── helpers ──────────────────────────────────────────────────────────────────

function statusLabel(status: string): string {
  switch (status) {
    case "in-progress": return "In Progress";
    case "awaiting-customer": return "Awaiting Customer";
    case "pending": return "Pending";
    case "completed": return "Completed";
    case "cancelled": return "Cancelled";
    default: return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "in-progress": return "bg-blue-100 text-blue-700 border-blue-200";
    case "awaiting-customer": return "bg-orange-100 text-orange-700 border-orange-200";
    case "pending": return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "completed": return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "cancelled": return "bg-gray-100 text-gray-500 border-gray-200";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

function statusIconColor(status: string): string {
  switch (status) {
    case "in-progress": return "text-blue-500";
    case "awaiting-customer": return "text-orange-500";
    case "pending": return "text-yellow-500";
    case "completed": return "text-emerald-500";
    case "cancelled": return "text-gray-400";
    default: return "text-muted-foreground";
  }
}

function formatBookDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "/");
}

// ─── Notifications ────────────────────────────────────────────────────────────

interface Notification {
  id: number;
  text: string;
  createdAt: string;
}

function NotificationsPanel() {
  const [notes, setNotes] = useState<Notification[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const nextId = () => Date.now();

  const save = () => {
    if (!draft.trim()) return;
    setNotes((prev) => [...prev, { id: nextId(), text: draft.trim(), createdAt: new Date().toISOString() }]);
    setDraft("");
    setAdding(false);
  };

  const remove = (id: number) => setNotes((prev) => prev.filter((n) => n.id !== id));

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          Notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3">
        {notes.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground text-center py-4">No notes yet.</p>
        )}
        {notes.map((n) => (
          <div key={n.id} className="flex items-start gap-2 text-sm bg-muted/40 rounded-lg px-3 py-2.5">
            <span className="flex-1 text-foreground">{n.text}</span>
            <button onClick={() => remove(n.id)} className="text-muted-foreground hover:text-destructive shrink-0 mt-0.5">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {adding ? (
          <div className="space-y-2">
            <Input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setAdding(false); setDraft(""); } }}
              placeholder="Type a note and press Enter..."
              className="text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={save} className="flex-1">Save</Button>
              <Button size="sm" variant="outline" onClick={() => { setAdding(false); setDraft(""); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add a Notification...
          </button>
        )}
      </CardContent>
    </Card>
  );
}

// ─── All Service Jobs ─────────────────────────────────────────────────────────

function ServiceJobRow({ job }: { job: ServiceJob }) {
  const todayStr = new Date().toISOString().split("T")[0];
  const isCompleted = (job.status as string) === "completed";
  const isToday = job.bookInDate === todayStr || job.updatedAt.startsWith(todayStr);

  if (isCompleted && !isToday) return null;

  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-0">
      <Circle className={cn("w-4 h-4 mt-0.5 shrink-0 fill-current", statusIconColor(job.status as string))} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-mono font-medium text-primary">{job.jobNumber}</span>
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
    </div>
  );
}

function AllServiceJobsPanel() {
  const { data: jobs = [], isLoading } = useListServiceJobs({ query: { queryKey: ["service-jobs-panel"] } });

  const visible = jobs.filter((j) => {
    const s = j.status as string;
    if (s === "completed") {
      const todayStr = new Date().toISOString().split("T")[0];
      return j.updatedAt.startsWith(todayStr) || j.bookInDate === todayStr;
    }
    return true;
  });

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-primary">All Service Jobs</CardTitle>
          <span className="text-xs text-muted-foreground font-medium">{jobs.length} total</span>
        </div>
        <p className="text-[11px] text-muted-foreground">Completed shown for today only</p>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto max-h-[400px]">
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : visible.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No service jobs found.</div>
        ) : (
          <div>
            {visible.map((job) => <ServiceJobRow key={job.id} job={job} />)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function DashboardPanels() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <NotificationsPanel />
      <AllServiceJobsPanel />
    </div>
  );
}
