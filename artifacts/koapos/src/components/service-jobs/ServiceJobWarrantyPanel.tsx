import { useState } from "react";
import {
  useUpdateServiceJob,
  useCreateServiceJobRework,
  useReopenServiceJob,
  getListServiceJobsQueryKey,
  type ServiceJob,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert, RotateCcw, RefreshCw, Loader2, Link2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Repair (labour) warranty window + one-click no-charge rework. */
export function ServiceJobWarrantyPanel({ job }: { job: ServiceJob }) {
  const queryClient = useQueryClient();
  const update = useUpdateServiceJob();
  const rework = useCreateServiceJobRework();
  const reopen = useReopenServiceJob();
  const [days, setDays] = useState(String(job.repairWarrantyDays ?? 0));
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListServiceJobsQueryKey() });

  const saveDays = () => {
    const n = Math.max(0, Math.round(parseFloat(days) || 0));
    if (n === (job.repairWarrantyDays ?? 0)) return;
    update.mutate({ id: job.id, data: { repairWarrantyDays: n } as never }, {
      onSuccess: () => { invalidate(); toast.success("Repair warranty updated"); },
      onError: () => toast.error("Couldn't update warranty"),
    });
  };

  // Compute repair-warranty status from completion date + window.
  const warrantyDays = job.repairWarrantyDays ?? 0;
  let expiry: Date | null = null;
  if (job.completedAt && warrantyDays > 0) {
    expiry = new Date(job.completedAt);
    expiry.setDate(expiry.getDate() + warrantyDays);
  }
  const now = Date.now();
  const active = expiry ? expiry.getTime() >= now : false;

  const startRework = () => {
    rework.mutate({ id: job.id }, {
      onSuccess: (created) => {
        invalidate();
        toast.success(`Rework job ${(created as { jobNumber?: string })?.jobNumber ?? ""} created (no charge)`);
      },
      onError: () => toast.error("Couldn't create rework job"),
    });
  };

  const startReopen = () => {
    reopen.mutate({ id: job.id }, {
      onSuccess: (created) => {
        invalidate();
        toast.success(`New repair ${(created as { jobNumber?: string })?.jobNumber ?? ""} opened from this job`);
      },
      onError: () => toast.error("Couldn't reopen this job"),
    });
  };

  return (
    <div className="space-y-3">
      {job.reworkOfJobId != null && (
        <div className="flex items-center gap-2 text-sm rounded-lg border bg-amber-50 dark:bg-amber-950/20 px-3 py-2">
          <Link2 className="w-4 h-4 text-amber-600 shrink-0" />
          <span>This is a <strong>no-charge rework</strong> of job #{job.reworkOfJobId}.</span>
        </div>
      )}

      {job.reopenedFromJobId != null && (
        <div className="flex items-center gap-2 text-sm rounded-lg border bg-sky-50 dark:bg-sky-950/20 px-3 py-2">
          <Link2 className="w-4 h-4 text-sky-600 shrink-0" />
          <span>This repair was <strong>reopened from</strong> job #{job.reopenedFromJobId}.</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <p className="text-xs text-muted-foreground mb-1">Repair warranty (days from completion)</p>
          <Input type="number" min={0} value={days} className="h-8 w-28 text-sm"
            onChange={(e) => setDays(e.target.value)} onBlur={saveDays} />
        </div>
        {expiry && (
          <Badge className={cn("gap-1 self-end mb-1",
            active ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-red-100 text-red-700 border-red-200")}>
            {active ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
            {active ? `Covered until ${expiry.toLocaleDateString("en-AU")}` : "Repair warranty expired"}
          </Badge>
        )}
        {!expiry && warrantyDays > 0 && (
          <span className="text-xs text-muted-foreground self-end mb-2">Starts when job is completed</span>
        )}
      </div>

      {job.status === "completed" && (
        <div className="flex flex-wrap gap-2">
          {job.reworkOfJobId == null && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={startRework} disabled={rework.isPending}>
              {rework.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
              Return for rework (no charge)
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5" onClick={startReopen} disabled={reopen.isPending}>
            {reopen.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Reopen as new repair
          </Button>
        </div>
      )}
    </div>
  );
}
