import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useArchiveServiceJobs, getListServiceJobsQueryKey } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Archive, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* Service Jobs › Archive. Archiving parks open jobs — the customer declined,
   or it's a long-term job — without changing their status, so Restore puts
   them back where they were. Server rules: api-server lib/service-job-archive.ts. */

export type ArchiveReason = "declined" | "long-term" | "other";

export const ARCHIVE_REASON_LABEL: Record<ArchiveReason, string> = {
  declined: "Customer declined",
  "long-term": "Long-term job",
  other: "Other",
};

export function archiveReasonLabel(reason: string | null | undefined): string {
  return ARCHIVE_REASON_LABEL[(reason ?? "other") as ArchiveReason] ?? "Archived";
}

/** Every list that shows service jobs, so an archive/restore updates them all. */
const JOB_QUERY_KEYS = [getListServiceJobsQueryKey(), ["service-jobs-dash"], ["service-jobs-panel"]];

/** Archive or restore, then refresh the job lists. Returns how many changed. */
export function useArchiveJobs() {
  const queryClient = useQueryClient();
  const mutation = useArchiveServiceJobs();
  const run = async (ids: number[], archived: boolean, reason?: ArchiveReason, note?: string): Promise<number> => {
    const res = await mutation.mutateAsync({ data: { ids, archived, ...(archived ? { reason, note: note?.trim() || undefined } : {}) } });
    for (const key of JOB_QUERY_KEYS) void queryClient.invalidateQueries({ queryKey: key });
    return res.jobs.length;
  };
  return { run, isPending: mutation.isPending };
}

export function ArchiveJobsDialog({ jobs, onClose, onDone }: {
  /** The jobs to archive; null when closed. */
  jobs: Array<{ id: number; jobNumber: string }> | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [reason, setReason] = useState<ArchiveReason>("declined");
  const [note, setNote] = useState("");
  const { run, isPending } = useArchiveJobs();

  const close = () => { setReason("declined"); setNote(""); onClose(); };
  const submit = async () => {
    if (!jobs?.length) return;
    try {
      const n = await run(jobs.map((j) => j.id), true, reason, note);
      toast.success(n === 1 ? `${jobs.length === 1 ? jobs[0]!.jobNumber : "1 job"} moved to the archive` : `${n} jobs moved to the archive`);
      if (n < jobs.length) toast.info(`${jobs.length - n} skipped — completed or cancelled jobs live in Service History.`);
      onDone?.();
      close();
    } catch {
      toast.error("Couldn't archive — please try again");
    }
  };

  const title = jobs?.length === 1 ? `Archive ${jobs[0]!.jobNumber}?` : `Archive ${jobs?.length ?? 0} jobs?`;
  return (
    <Dialog open={!!jobs} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Archive className="w-5 h-5 text-primary" />{title}</DialogTitle>
          <DialogDescription>
            Archived jobs leave the Services list, the dashboard counts and the Tech App work list. They keep their status, and Restore puts them back where they were.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(ARCHIVE_REASON_LABEL) as ArchiveReason[]).map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)}
                className={cn("rounded-lg border-2 px-3 py-2.5 text-sm text-center transition-colors",
                  reason === r ? "border-primary bg-primary/5 text-primary font-medium" : "border-border text-muted-foreground hover:border-muted-foreground/40")}>
                {ARCHIVE_REASON_LABEL[r]}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Note <span className="text-muted-foreground font-normal">(optional, added to the job's notes)</span></Label>
            <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder={reason === "declined" ? "e.g. Quote too high — will come back after payday" : reason === "long-term" ? "e.g. Waiting on board from overseas, ETA March" : ""} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={isPending}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={isPending}>
            {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Archive className="w-4 h-4 mr-2" />}Archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
