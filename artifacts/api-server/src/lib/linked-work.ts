import { db, serviceJobsTable, appointmentsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Statuses that already represent the end of the work. A sale must not drag a
 *  record back out of one: re-completing a completed job is a pointless write,
 *  and flipping a *cancelled* job to completed would invent work that never
 *  happened. The pickers only offer open records, so this is a guard against
 *  stale clients and replayed requests rather than an everyday branch. */
const TERMINAL_STATUSES = ["completed", "cancelled"];

/** How a sale or invoice names the work it is billing. Ids are authoritative;
 *  `serviceJobNumber` is the legacy notes-marker route, kept because a parked
 *  BNPL sale and older POS builds carry only the marker. */
export interface LinkedWorkRef {
  serviceJobId?: number | null;
  serviceJobNumber?: string | null;
  appointmentId?: number | null;
}

/** Markers the POS writes into a sale's notes to record what it was billing,
 *  e.g. `[Service #SJ-0012: laptop] | [Appt #48: Battery swap]`. Job numbers are
 *  merchant-defined, so the service pattern stops at the first `:` or `]` —
 *  whichever comes first — rather than assuming a colon is present. */
const SERVICE_MARKER = /\[Service #([^:\]]+)[:\]]/;
const APPOINTMENT_MARKER = /\[Appt #(\d+)[:\]]/;

export function parseLinkedWorkFromNotes(notes?: string | null): LinkedWorkRef {
  if (!notes) return {};
  const service = notes.match(SERVICE_MARKER);
  const appointment = notes.match(APPOINTMENT_MARKER);
  const apptId = appointment ? parseInt(appointment[1], 10) : NaN;
  return {
    serviceJobNumber: service ? service[1].trim() || null : null,
    appointmentId: Number.isSafeInteger(apptId) ? apptId : null,
  };
}

/** Merge an explicit reference with whatever the notes markers say, preferring
 *  the explicit ids. Lets a caller pass both without deciding which wins. */
export function mergeLinkedWork(explicit: LinkedWorkRef, notes?: string | null): LinkedWorkRef {
  const fromNotes = parseLinkedWorkFromNotes(notes);
  return {
    serviceJobId: explicit.serviceJobId ?? null,
    serviceJobNumber: explicit.serviceJobId != null
      ? null
      : (explicit.serviceJobNumber?.trim() || fromNotes.serviceJobNumber || null),
    appointmentId: explicit.appointmentId ?? fromNotes.appointmentId ?? null,
  };
}

/**
 * Billing work finishes it: flip the linked service job / appointment to
 * "completed". Every path that records a sale or settles an invoice funnels
 * through here so the rule can't drift between them.
 *
 * Always merchant-scoped, and a no-op for a record that is missing, belongs to
 * another merchant, or is already in a terminal status. Returns what it changed
 * so a caller can log or assert on it.
 */
export async function completeLinkedWork(
  executor: DbExecutor,
  merchantId: number,
  ref: LinkedWorkRef,
): Promise<{ serviceJobIds: number[]; appointmentIds: number[] }> {
  const changed = { serviceJobIds: [] as number[], appointmentIds: [] as number[] };

  const jobNumber = ref.serviceJobId == null ? ref.serviceJobNumber?.trim() || null : null;
  if (ref.serviceJobId != null || jobNumber) {
    // Resolve first so the status guard can be applied, and so an id from a
    // client body can never reach across merchants.
    const jobs = await executor
      .select({ id: serviceJobsTable.id, status: serviceJobsTable.status })
      .from(serviceJobsTable)
      .where(and(
        eq(serviceJobsTable.merchantId, merchantId),
        ref.serviceJobId != null
          ? eq(serviceJobsTable.id, ref.serviceJobId)
          : eq(serviceJobsTable.jobNumber, jobNumber!),
      ));
    const open = jobs.filter((j) => !TERMINAL_STATUSES.includes(j.status));
    if (open.length > 0) {
      await executor
        .update(serviceJobsTable)
        .set({ status: "completed" })
        .where(and(
          inArray(serviceJobsTable.id, open.map((j) => j.id)),
          eq(serviceJobsTable.merchantId, merchantId),
        ));
      changed.serviceJobIds = open.map((j) => j.id);
    }
  }

  if (ref.appointmentId != null) {
    const [appt] = await executor
      .select({ id: appointmentsTable.id, status: appointmentsTable.status })
      .from(appointmentsTable)
      .where(and(
        eq(appointmentsTable.id, ref.appointmentId),
        eq(appointmentsTable.merchantId, merchantId),
      ));
    if (appt && !TERMINAL_STATUSES.includes(appt.status)) {
      await executor
        .update(appointmentsTable)
        .set({ status: "completed" })
        .where(and(
          eq(appointmentsTable.id, appt.id),
          eq(appointmentsTable.merchantId, merchantId),
        ));
      changed.appointmentIds = [appt.id];
    }
  }

  return changed;
}
