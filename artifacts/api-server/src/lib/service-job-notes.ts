import { db, serviceJobsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

/* A service job's notes are one text column holding an append-only log: entries
   separated by `---`, each prefixed with a `[DD/MM/YYYY HH:MM]` stamp. The admin
   dialog, the tech app and now the quote routes all write into it, so the format
   lives here rather than being copied into each — a writer that drifts produces
   an entry the readers render as part of the previous note instead of its own. */

export const NOTE_SEP = "\n\n---\n\n";

export function parseNotes(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw.split("---").map((s) => s.trim()).filter(Boolean);
}

export function buildNoteTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `[${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}]`;
}

export function appendNote(existing: string | null | undefined, text: string): string {
  const entry = `${buildNoteTimestamp()} ${text.trim()}`;
  return [...parseNotes(existing), entry].join(NOTE_SEP);
}

/**
 * Append one entry to a service job's note log. No-op when the job isn't linked
 * or doesn't belong to this merchant. Returns true if a note was written.
 *
 * Read-modify-write on a text column, so two writers landing in the same instant
 * can lose an entry. That is the same exposure every other note writer already
 * carries, and a note is not money — it is not worth a transaction here.
 */
export async function appendJobNote(
  merchantId: number, serviceJobId: number | null | undefined, text: string,
): Promise<boolean> {
  if (serviceJobId == null) return false;

  const scope = and(
    eq(serviceJobsTable.id, serviceJobId),
    eq(serviceJobsTable.merchantId, merchantId),
  );
  const [job] = await db.select({ notes: serviceJobsTable.notes })
    .from(serviceJobsTable).where(scope).limit(1);
  if (!job) return false;

  await db.update(serviceJobsTable)
    .set({ notes: appendNote(job.notes, text) })
    .where(scope);
  return true;
}
