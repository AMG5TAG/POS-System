/**
 * Service Jobs › Archive — the rules, no `db` in sight. Pinned by
 * `service-job-archive.test.ts`.
 *
 * Archiving is a flag (`service_jobs.archived_at`), not a status: a parked
 * job keeps "Awaiting Customer" or "In Progress" underneath, so Restore puts
 * it back exactly where it was. Only open jobs can be archived — completed and
 * cancelled ones already live in Service History — and finishing an archived
 * job takes it out of the archive.
 */

export const ARCHIVE_REASONS = ["declined", "long-term", "other"] as const;
export type ArchiveReason = (typeof ARCHIVE_REASONS)[number];

export const ARCHIVE_REASON_LABEL: Record<ArchiveReason, string> = {
  declined: "Customer declined",
  "long-term": "Long-term job",
  other: "Other",
};

const FINISHED = new Set(["completed", "cancelled"]);

/** Completed and cancelled jobs are history, not archive. */
export function canArchive(status: string): boolean {
  return !FINISHED.has(status);
}

/** A status change that finishes a job also takes it out of the archive. */
export function clearsArchive(nextStatus: string): boolean {
  return FINISHED.has(nextStatus);
}

/** The line written to the job's notes log. */
export function archiveLogText(archived: boolean, reason?: ArchiveReason | null, note?: string | null): string {
  if (!archived) return "Restored from archive";
  const why = ARCHIVE_REASON_LABEL[reason ?? "other"];
  const extra = note?.trim();
  return `Archived — ${why}${extra ? `: ${extra}` : ""}`;
}
