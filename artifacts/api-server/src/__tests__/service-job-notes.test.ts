import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * The service job note log is written by four different places — the admin
 * dialog, the tech app, the status-change logger and now quote creation — and
 * read back by all of them. The format is what holds that together: an entry
 * that misses the `---` separator is not a note, it is extra text glued onto
 * the end of the previous one. These tests pin the separator, the stamp and the
 * merchant scoping so a writer cannot quietly stop producing readable entries.
 */

const h = vi.hoisted(() => {
  const store: Record<string, any[]> = { service_jobs: [] };
  const mkTable = (name: string, cols: string[]) => {
    const t: any = { _name: name };
    for (const c of cols) t[c] = { _table: name, _col: c };
    return t;
  };
  const serviceJobsTable = mkTable("service_jobs", ["id", "merchantId", "status", "notes"]);

  const matches = (row: any, pred: any): boolean => {
    if (!pred) return true;
    if (pred.type === "and") return pred.preds.every((p: any) => matches(row, p));
    if (pred.type === "eq") return row[pred.col._col] === pred.val;
    return true;
  };
  const project = (row: any, projection: any) => {
    if (!projection) return { ...row };
    const out: any = {};
    for (const k of Object.keys(projection)) out[k] = row[projection[k]._col];
    return out;
  };

  class Q {
    kind: string; table: any = null; projection: any = null; pred: any = null;
    lim: number | null = null; setObj: any = null;
    constructor(kind: string, table?: any, projection?: any) {
      this.kind = kind; this.table = table ?? null; this.projection = projection ?? null;
    }
    from(t: any) { this.table = t; return this; }
    where(p: any) { this.pred = p; return this; }
    limit(n: number) { this.lim = n; return this; }
    set(o: any) { this.setObj = o; return this; }
    private exec(): any {
      const rows = this.table ? store[this.table._name] : [];
      if (this.kind === "select") {
        let out = rows.filter((r) => matches(r, this.pred));
        if (this.lim != null) out = out.slice(0, this.lim);
        return out.map((r) => project(r, this.projection));
      }
      if (this.kind === "update") {
        const hit = rows.filter((r) => matches(r, this.pred));
        for (const r of hit) Object.assign(r, this.setObj);
        return hit.map((r) => ({ ...r }));
      }
      return [];
    }
    then(resolve: (v: any) => unknown, reject?: (e: unknown) => unknown) {
      try { return Promise.resolve(this.exec()).then(resolve); }
      catch (e) { return reject ? reject(e) : Promise.reject(e); }
    }
  }

  const db: any = {
    select: (projection?: any) => new Q("select", undefined, projection),
    update: (t: any) => new Q("update", t),
  };
  return { store, db, serviceJobsTable, reset() { store.service_jobs = []; } };
});

vi.mock("@workspace/db", () => ({ db: h.db, serviceJobsTable: h.serviceJobsTable }));
vi.mock("drizzle-orm", () => ({
  eq:  (col: any, val: any) => ({ type: "eq", col, val }),
  and: (...preds: any[]) => ({ type: "and", preds }),
}));

const job = (id: number) => h.store.service_jobs.find((j) => j.id === id)!;
const seedJob = (over: any = {}) =>
  h.store.service_jobs.push({ id: 42, merchantId: 1, status: "pending", notes: null, ...over });

beforeEach(() => h.reset());

describe("appendJobNote", () => {
  it("writes a stamped entry onto a job with no notes yet", async () => {
    seedJob();
    const { appendJobNote, parseNotes } = await import("../lib/service-job-notes");

    expect(await appendJobNote(1, 42, "Quote QT-0001 added — $370.00")).toBe(true);

    const entries = parseNotes(job(42).notes);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatch(/^\[\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\] Quote QT-0001 added — \$370\.00$/);
  });

  /* The one that matters: a second entry has to come back out as its OWN note,
     not as more text on the end of the first. */
  it("keeps earlier entries separate rather than gluing onto the last one", async () => {
    seedJob();
    const { appendJobNote, parseNotes } = await import("../lib/service-job-notes");

    await appendJobNote(1, 42, "Called customer");
    await appendJobNote(1, 42, "Quote QT-0002 added — $50.00");

    const entries = parseNotes(job(42).notes);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toContain("Called customer");
    expect(entries[1]).toContain("Quote QT-0002 added");
  });

  it("is a no-op for a job that isn't linked", async () => {
    const { appendJobNote } = await import("../lib/service-job-notes");
    expect(await appendJobNote(1, null, "Quote QT-0003 added — $10.00")).toBe(false);
    expect(await appendJobNote(1, undefined, "Quote QT-0003 added — $10.00")).toBe(false);
  });

  it("will not write to another merchant's job", async () => {
    seedJob({ merchantId: 2, notes: "untouched" });
    const { appendJobNote } = await import("../lib/service-job-notes");

    expect(await appendJobNote(1, 42, "Quote QT-0004 added — $99.00")).toBe(false);
    expect(job(42).notes).toBe("untouched");
  });
});
