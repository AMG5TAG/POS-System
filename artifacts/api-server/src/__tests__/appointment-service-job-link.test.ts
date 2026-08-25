import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

/**
 * Integration test for POST /appointments/:id/service-job — the link written
 * back when a service job is raised from a booking ("Create service job").
 * Uses a small stateful in-memory fake of the slice of drizzle the route
 * touches (select/insert/update + eq/and/inArray), so we drive real HTTP
 * requests and assert on persisted rows.
 */

const h = vi.hoisted(() => {
  const store: Record<string, any[]> = { appointments: [], service_jobs: [], customers: [], staff: [], merchants: [] };

  const mkTable = (name: string) => new Proxy({ _name: name } as any, {
    get: (t, prop: string) => (prop in t ? t[prop] : { _table: name, _col: prop }),
  });
  const appointmentsTable = mkTable("appointments");
  const serviceJobsTable = mkTable("service_jobs");
  const customersTable = mkTable("customers");
  const staffTable = mkTable("staff");
  const merchantsTable = mkTable("merchants");

  const matches = (row: any, pred: any): boolean => {
    if (!pred) return true;
    if (pred.type === "and") return pred.preds.every((p: any) => matches(row, p));
    if (pred.type === "eq") return row[pred.col._col] === pred.val;
    if (pred.type === "inArray") return pred.vals.includes(row[pred.col._col]);
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
    lim: number | null = null; setObj: any = null; vals: any = null;
    constructor(kind: string, table?: any, projection?: any) {
      this.kind = kind; this.table = table ?? null; this.projection = projection ?? null;
    }
    from(t: any) { this.table = t; return this; }
    where(p: any) { this.pred = p; return this; }
    limit(n: number) { this.lim = n; return this; }
    set(o: any) { this.setObj = o; return this; }
    values(o: any) { this.vals = o; return this; }
    returning() { return this; }
    private exec(): any {
      const rows = store[this.table._name];
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
    insert: (t: any) => new Q("insert", t),
    update: (t: any) => new Q("update", t),
  };

  return {
    store, db, appointmentsTable, serviceJobsTable, customersTable, staffTable, merchantsTable,
    reset() {
      store.appointments = []; store.service_jobs = [];
      store.customers = []; store.staff = []; store.merchants = [];
    },
  };
});

vi.mock("@workspace/db", () => ({
  db: h.db,
  appointmentsTable: h.appointmentsTable,
  serviceJobsTable: h.serviceJobsTable,
  customersTable: h.customersTable,
  staffTable: h.staffTable,
  merchantsTable: h.merchantsTable,
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ type: "eq", col, val }),
  and: (...preds: any[]) => ({ type: "and", preds }),
  gte: (col: any, val: any) => ({ type: "gte", col, val }),
  lt: (col: any, val: any) => ({ type: "lt", col, val }),
  inArray: (col: any, vals: any[]) => ({ type: "inArray", col, vals }),
}));

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../lib/customer-name", () => ({ customerDisplayName: () => "Test Customer" }));
vi.mock("../services/email", () => ({ sendEmail: vi.fn() }));
vi.mock("../services/sms", () => ({ sendSms: vi.fn(() => Promise.resolve({ success: true })) }));
vi.mock("../services/icsGenerator", () => ({ generateIcs: vi.fn(() => "BEGIN:VCALENDAR") }));
vi.mock("../services/autoSyncScheduler", () => ({ triggerInstantSync: vi.fn() }));

vi.mock("@workspace/api-zod", () => {
  const okParams = (params: any) => ({ success: true, data: { id: Number(params.id) } });
  const linkBody = (body: any) =>
    typeof body?.serviceJobId === "number" || body?.serviceJobId === null
      ? { success: true, data: { serviceJobId: body.serviceJobId } }
      : { success: false, error: { message: "serviceJobId is required" } };
  return {
    CreateAppointmentBody: { safeParse: (b: any) => ({ success: true, data: b }) },
    UpdateAppointmentBody: { safeParse: (b: any) => ({ success: true, data: b }) },
    UpdateAppointmentParams: { safeParse: okParams },
    DeleteAppointmentParams: { safeParse: okParams },
    LinkAppointmentServiceJobParams: { safeParse: okParams },
    LinkAppointmentServiceJobBody: { safeParse: linkBody },
  };
});

let app: express.Express;

beforeEach(async () => {
  h.reset();
  const { default: router } = await import("../routes/appointments");
  app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use((req: any, _res, next) => { req.session.merchantId = 1; next(); });
  app.use("/api", router);
});

const seedAppointment = (over: Record<string, unknown> = {}) => {
  const row = {
    id: 7, merchantId: 1, customerId: null, staffId: null, serviceJobId: null,
    title: "Drop-off — cracked screen", description: "Screen shattered", notes: null,
    scheduledAt: new Date("2026-03-02T01:00:00.000Z"), durationMinutes: 30,
    status: "scheduled", createdAt: new Date(), ...over,
  };
  h.store.appointments.push(row);
  return row;
};

const seedJob = (over: Record<string, unknown> = {}) => {
  const row = { id: 42, merchantId: 1, jobNumber: "KS0042", ...over };
  h.store.service_jobs.push(row);
  return row;
};

const apptRow = (id: number) => h.store.appointments.find((a) => a.id === id)!;

describe("POST /api/appointments/:id/service-job", () => {
  it("links the appointment to the job and echoes the job number back", async () => {
    seedAppointment();
    seedJob();

    const res = await request(app).post("/api/appointments/7/service-job").send({ serviceJobId: 42 });

    expect(res.status).toBe(200);
    expect(res.body.serviceJobId).toBe(42);
    expect(res.body.serviceJobNumber).toBe("KS0042");
    expect(apptRow(7).serviceJobId).toBe(42);
  });

  it("unlinks when serviceJobId is null", async () => {
    seedAppointment({ serviceJobId: 42 });
    seedJob();

    const res = await request(app).post("/api/appointments/7/service-job").send({ serviceJobId: null });

    expect(res.status).toBe(200);
    expect(res.body.serviceJobId).toBeNull();
    expect(apptRow(7).serviceJobId).toBeNull();
  });

  it("refuses to link a job belonging to another merchant and leaves the appointment alone", async () => {
    seedAppointment();
    seedJob({ id: 99, merchantId: 2, jobNumber: "KS0099" });

    const res = await request(app).post("/api/appointments/7/service-job").send({ serviceJobId: 99 });

    expect(res.status).toBe(404);
    expect(apptRow(7).serviceJobId).toBeNull();
  });

  it("404s for an unknown service job", async () => {
    seedAppointment();

    const res = await request(app).post("/api/appointments/7/service-job").send({ serviceJobId: 12345 });

    expect(res.status).toBe(404);
    expect(apptRow(7).serviceJobId).toBeNull();
  });

  it("404s when the appointment belongs to another merchant", async () => {
    seedAppointment({ id: 8, merchantId: 2 });
    seedJob();

    const res = await request(app).post("/api/appointments/8/service-job").send({ serviceJobId: 42 });

    expect(res.status).toBe(404);
    expect(apptRow(8).serviceJobId).toBeNull();
  });

  it("400s when serviceJobId is missing", async () => {
    seedAppointment();

    const res = await request(app).post("/api/appointments/7/service-job").send({});

    expect(res.status).toBe(400);
    expect(apptRow(7).serviceJobId).toBeNull();
  });
});
