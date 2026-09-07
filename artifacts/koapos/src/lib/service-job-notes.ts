/* A service job's notes are one text column holding an append-only log: entries
   separated by `---`, each prefixed with a `[DD/MM/YYYY HH:MM]` stamp. The
   format was duplicated in every screen that touched it, which is how the
   "Called customer" tick box and the Called column would have drifted apart —
   one writing a note text the other no longer recognised. It lives here now. */

export const NOTE_SEP = "\n\n---\n\n";

/* The text marking a note as a call to the customer. The tick box that writes
   one and the list column that counts them must agree on it exactly. */
export const CALL_NOTE_TEXT = "Called customer";

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

/* Timestamps of every logged call, oldest first. Derived from the notes rather
   than a flag stored beside them, so it cannot disagree with the job's own log. */
export function callTimes(notes: string | null | undefined): string[] {
  return parseNotes(notes).reduce<string[]>((acc, n) => {
    const m = n.match(/^\[([^\]]+)\]\s*(.+)$/);
    if (m && m[2].trim() === CALL_NOTE_TEXT) acc.push(m[1]);
    return acc;
  }, []);
}
