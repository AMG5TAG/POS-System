import { describe, it, expect, vi, beforeEach } from "vitest";

/* Records every update issued so a test can assert which record was completed.
 * Selects are answered from `rows`, keyed by the table `.from()` named. */
type Update = { table: string; set: Record<string, unknown> };
const updates: Update[] = [];
const rows: Record<string, unknown[]> = {};

vi.mock("@workspace/db", () => {
  const mkTable = (name: string) =>
    new Proxy({ __name: name } as Record<string, unknown>, {
      get: (t, k) => (k === "__name" ? name : (t[k as string] ??= { __name: name })),
    });
  const makeExecutor = () => {
    let table: string | null = null;
    const chain: Record<string, unknown> = new Proxy({} as Record<string, unknown>, {
      get(_t, k) {
        if (k === "then") {
          const res = table ? (rows[table] ?? []) : [];
          return (resolve: (v: unknown[]) => unknown) => Promise.resolve(res).then(resolve);
        }
        if (k === "from") return (t: { __name?: string }) => { table = t?.__name ?? null; return chain; };
        return () => chain;
      },
    });
    return new Proxy({} as Record<string, unknown>, {
      get(_t, k) {
        if (k === "update") return (t: { __name?: string }) => {
          const tableName = t?.__name ?? "?";
          const upd: Record<string, unknown> = new Proxy({} as Record<string, unknown>, {
            get(_u, uk) {
              if (uk === "set") return (v: Record<string, unknown>) => {
                updates.push({ table: tableName, set: v });
                return upd;
              };
              if (uk === "then") return (resolve: (v: unknown) => unknown) => Promise.resolve(undefined).then(resolve);
              return () => upd;
            },
          });
          return upd;
        };
        return () => { table = null; return chain; };
      },
    });
  };
  return {
    db: makeExecutor(),
    serviceJobsTable: mkTable("serviceJobs"),
    appointmentsTable: mkTable("appointments"),
  };
});

const { completeLinkedWork, parseLinkedWorkFromNotes, mergeLinkedWork } =
  await import("../lib/linked-work");
const { db } = await import("@workspace/db");

beforeEach(() => {
  updates.length = 0;
  for (const k of Object.keys(rows)) delete rows[k];
});

describe("parseLinkedWorkFromNotes", () => {
  it("reads the markers the POS writes into a sale's notes", () => {
    expect(parseLinkedWorkFromNotes("[Service #SJ-0012: laptop] | [Appt #48: Battery swap] | walk-in"))
      .toEqual({ serviceJobNumber: "SJ-0012", appointmentId: 48 });
  });

  it("reads a marker with no description, which the old colon-only pattern missed", () => {
    expect(parseLinkedWorkFromNotes("[Service #SJ-0012]")).toMatchObject({ serviceJobNumber: "SJ-0012" });
    expect(parseLinkedWorkFromNotes("[Appt #7]")).toMatchObject({ appointmentId: 7 });
  });

  it("returns nothing for notes with no markers", () => {
    expect(parseLinkedWorkFromNotes("Customer asked for a callback")).toMatchObject({
      serviceJobNumber: null, appointmentId: null,
    });
    expect(parseLinkedWorkFromNotes(undefined)).toEqual({});
  });
});

describe("mergeLinkedWork", () => {
  it("prefers the explicit id over the notes marker", () => {
    const ref = mergeLinkedWork({ serviceJobId: 5, appointmentId: 9 }, "[Service #SJ-0012: x] [Appt #48: y]");
    expect(ref).toEqual({ serviceJobId: 5, serviceJobNumber: null, appointmentId: 9 });
  });

  it("falls back to the markers when no ids are sent (older clients, parked BNPL sales)", () => {
    const ref = mergeLinkedWork({}, "[Service #SJ-0012: x] [Appt #48: y]");
    expect(ref).toEqual({ serviceJobId: null, serviceJobNumber: "SJ-0012", appointmentId: 48 });
  });
});

describe("completeLinkedWork", () => {
  it("completes an open service job referenced by id", async () => {
    rows.serviceJobs = [{ id: 5, status: "in_progress" }];
    const res = await completeLinkedWork(db, 1, { serviceJobId: 5 });
    expect(res.serviceJobIds).toEqual([5]);
    expect(updates).toEqual([{ table: "serviceJobs", set: { status: "completed" } }]);
  });

  it("completes an open service job referenced only by its notes marker", async () => {
    rows.serviceJobs = [{ id: 5, status: "pending" }];
    const res = await completeLinkedWork(db, 1, { serviceJobNumber: "SJ-0012" });
    expect(res.serviceJobIds).toEqual([5]);
  });

  it("completes an open appointment", async () => {
    rows.appointments = [{ id: 48, status: "scheduled" }];
    const res = await completeLinkedWork(db, 1, { appointmentId: 48 });
    expect(res.appointmentIds).toEqual([48]);
    expect(updates).toEqual([{ table: "appointments", set: { status: "completed" } }]);
  });

  it("completes both when a sale links a job and an appointment", async () => {
    rows.serviceJobs = [{ id: 5, status: "in_progress" }];
    rows.appointments = [{ id: 48, status: "scheduled" }];
    const res = await completeLinkedWork(db, 1, { serviceJobId: 5, appointmentId: 48 });
    expect(res).toEqual({ serviceJobIds: [5], appointmentIds: [48] });
    expect(updates).toHaveLength(2);
  });

  /* A record that belongs to another merchant resolves to no row at all — the
     lookup is merchant-scoped — so a forged id writes nothing. */
  it("writes nothing when the id resolves to no row for this merchant", async () => {
    rows.serviceJobs = [];
    rows.appointments = [];
    const res = await completeLinkedWork(db, 1, { serviceJobId: 999, appointmentId: 999 });
    expect(res).toEqual({ serviceJobIds: [], appointmentIds: [] });
    expect(updates).toEqual([]);
  });

  it("leaves a cancelled record alone rather than inventing completed work", async () => {
    rows.serviceJobs = [{ id: 5, status: "cancelled" }];
    rows.appointments = [{ id: 48, status: "cancelled" }];
    const res = await completeLinkedWork(db, 1, { serviceJobId: 5, appointmentId: 48 });
    expect(res).toEqual({ serviceJobIds: [], appointmentIds: [] });
    expect(updates).toEqual([]);
  });

  it("is a no-op on an already-completed record, so a retried sale writes nothing", async () => {
    rows.serviceJobs = [{ id: 5, status: "completed" }];
    const res = await completeLinkedWork(db, 1, { serviceJobId: 5 });
    expect(res.serviceJobIds).toEqual([]);
    expect(updates).toEqual([]);
  });

  it("does nothing when the sale links no work at all", async () => {
    const res = await completeLinkedWork(db, 1, {});
    expect(res).toEqual({ serviceJobIds: [], appointmentIds: [] });
    expect(updates).toEqual([]);
  });
});
