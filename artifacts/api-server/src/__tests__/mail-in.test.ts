import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import {
  canStaffSetStatus, statusAfterTracking, nextMailInReference, cleanTrackingNumber,
  formatOpeningHours, hashMailInToken, MAIL_IN_TERMS, mailInTerms,
} from "../lib/mail-in";

/**
 * Mail-in repairs (lib/mail-in.ts, routes/mail-in.ts). Pinned: "received" is
 * reachable only through Receive (which books the job), tracking can be added
 * only while the parcel is on its way, the form can't be sent without every
 * term ticked, the customer's link stores only a hash, and a request can't be
 * received twice.
 */

describe("mail-in rules", () => {
  it("only lets staff reach received through Receive", () => {
    expect(canStaffSetStatus("awaiting_postage", "received")).toBe(false);
    expect(canStaffSetStatus("in_transit", "received")).toBe(false);
    expect(canStaffSetStatus("in_transit", "cancelled")).toBe(true);
    expect(canStaffSetStatus("received", "cancelled")).toBe(false);
    expect(canStaffSetStatus("received", "awaiting_postage")).toBe(false);
    expect(canStaffSetStatus("cancelled", "awaiting_postage")).toBe(true);
  });

  it("moves to in transit when tracking is added, and not after arrival", () => {
    expect(statusAfterTracking("awaiting_postage")).toBe("in_transit");
    expect(statusAfterTracking("in_transit")).toBe("in_transit");
    expect(statusAfterTracking("received")).toBeNull();
    expect(statusAfterTracking("cancelled")).toBeNull();
  });

  it("numbers references MI-1001 upward, ignoring anything else", () => {
    expect(nextMailInReference([])).toBe("MI-1001");
    expect(nextMailInReference(["MI-1001", "MI-1007", "junk"])).toBe("MI-1008");
    expect(nextMailInReference(["MI-1001"], 1)).toBe("MI-1003");
  });

  it("accepts tracking numbers as printed and rejects anything else", () => {
    expect(cleanTrackingNumber(" 33ab 1234 5678 ")).toBe("33AB 1234 5678");
    expect(cleanTrackingNumber("<script>")).toBeNull();
    expect(cleanTrackingNumber("ab")).toBeNull();
  });

  it("names the business in the terms as it is saved", () => {
    const terms = mailInTerms("Koastal Kollective");
    expect(terms[0]).toContain("Koastal Kollective is not responsible");
    expect(terms.join(" ")).not.toContain("{business}");
  });

  it("formats Business Details opening hours", () => {
    expect(formatOpeningHours({
      Monday: { enabled: false, open: "09:00", close: "17:00" },
      Tuesday: { enabled: true, open: "10:00", close: "17:30" },
    })).toEqual([{ day: "Monday", hours: "Closed" }, { day: "Tuesday", hours: "10am – 5:30pm" }]);
    expect(formatOpeningHours("nope")).toEqual([]);
  });
});

const h = vi.hoisted(() => ({ rows: [] as unknown[], values: [] as Record<string, unknown>[], sets: [] as Record<string, unknown>[] }));

vi.mock("@workspace/db", async (importOriginal) => {
  process.env.DATABASE_URL ||= "postgres://user:pass@localhost:5432/test";
  const actual = await importOriginal<Record<string, unknown>>();
  const chain = (): any =>
    new Proxy({} as any, {
      get(_t, k) {
        if (k === "then") return (res: any, rej: any) => Promise.resolve(h.rows.shift() ?? []).then(res, rej);
        if (k === "values") return (v: Record<string, unknown>) => { h.values.push(v); return chain(); };
        if (k === "set") return (v: Record<string, unknown>) => { h.sets.push(v); return chain(); };
        return () => chain();
      },
    });
  return { ...actual, db: new Proxy({} as any, { get: () => () => chain() }) };
});
vi.mock("../lib/sole-merchant", () => ({ soleMerchantId: async () => 1 }));
vi.mock("../lib/phone", () => ({ normalisePhoneFor: async (_m: number, p: string) => p }));
vi.mock("../services/email", () => ({ sendEmail: vi.fn(async () => ({ success: true })) }));
vi.mock("../services/autoSyncScheduler", () => ({ triggerInstantSync: vi.fn() }));
vi.mock("../services/entityQr", () => ({ registerServiceQr: vi.fn(async () => {}), registerQrBestEffort: vi.fn() }));
vi.mock("../middlewares/requireAuth", () => ({ requireAuth: (_q: any, _s: any, n: any) => n() }));

let app: express.Express;

const form = (over: Record<string, unknown> = {}) => ({
  firstName: "Sam", lastName: "Lee", email: "Sam@Example.com", phone: "0412345678",
  street: "1 Beach Rd", suburb: "Byron Bay", state: "NSW", postcode: "2481",
  deviceType: "Smartphone", brandModel: "iPhone 13 Pro", fault: "Screen cracked and touch not working",
  agreed: MAIL_IN_TERMS.map(() => true), ...over,
});

beforeAll(async () => {
  const { default: router } = await import("../routes/mail-in");
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).session = { merchantId: 1 }; next(); });
  app.use("/api", router);
}, 60000);

beforeEach(() => { h.rows = []; h.values = []; h.sets = []; });

describe("mail-in routes", () => {
  it("refuses a form without every term ticked, saving nothing", async () => {
    h.rows = [[]]; // settings (none → enabled)
    const res = await request(app).post("/api/shop/mail-in").send(form({ agreed: [true, true, true] }));
    expect(res.status).toBe(400);
    expect(h.values).toEqual([]);
  });

  it("only accepts the POS's service device types", async () => {
    h.rows = [[]];
    const res = await request(app).post("/api/shop/mail-in").send(form({ deviceType: "Phone" }));
    expect(res.status).toBe(400);
    expect(h.values).toEqual([]);
  });

  it("saves a request with only the hash of the customer's link", async () => {
    // settings, existing references, insert, business (merchant, profile)
    h.rows = [[], [{ reference: "MI-1004" }], [{ id: 3, reference: "MI-1005" }], [{ businessName: "Koastal" }], []];
    const res = await request(app).post("/api/shop/mail-in").send(form());
    expect(res.status).toBe(201);
    expect(res.body.reference).toBe("MI-1005");
    const saved = h.values[0]!;
    expect(saved.reference).toBe("MI-1005");
    expect(saved.email).toBe("sam@example.com");
    expect(saved.tokenHash).toBe(hashMailInToken(res.body.token));
    expect(JSON.stringify(saved)).not.toContain(res.body.token);
  });

  it("won't take tracking once the device has arrived", async () => {
    const token = "a".repeat(48);
    h.rows = [[{ id: 3, status: "received" }]];
    const res = await request(app).post(`/api/shop/mail-in/track/${token}`).send({ carrier: "auspost", trackingNumber: "33AB12345678" });
    expect(res.status).toBe(409);
    expect(h.sets).toEqual([]);
  });

  it("can't receive a request twice", async () => {
    h.rows = [[]]; // the open → received claim matched nothing
    const res = await request(app).post("/api/mail-in/3/receive");
    expect(res.status).toBe(409);
    expect(h.values).toEqual([]);
  });

  it("books a received parcel in as a mail-in service job", async () => {
    const req = {
      id: 3, merchantId: 1, reference: "MI-1005", status: "received", customerId: null,
      firstName: "Sam", lastName: "Lee", email: "sam@example.com", phone: "+61412345678",
      street: "1 Beach Rd", suburb: "Byron Bay", state: "NSW", postcode: "2481",
      deviceType: "Phone", brandModel: "iPhone 13 Pro", serialNumber: null, fault: "Cracked",
      accessories: null, trackingCarrier: "auspost", trackingNumber: "33AB", staffNotes: null,
      agreedAt: new Date(), createdAt: new Date(), receivedAt: new Date(), trackingAddedAt: null, serviceJobId: null,
    };
    // claim, customer by email (found), existing job numbers, job insert, link update
    h.rows = [[req], [{ id: 42 }], [{ jobNumber: "KS0009" }], [{ id: 77, jobNumber: "KS0010" }], [{ ...req, serviceJobId: 77, customerId: 42 }]];
    const res = await request(app).post("/api/mail-in/3/receive");
    expect(res.status).toBe(200);
    expect(res.body.serviceJobNumber).toBe("KS0010");
    const job = h.values.find((v) => "jobNumber" in v)!;
    expect(job).toMatchObject({ customerId: 42, jobNumber: "KS0010", isMailIn: "true", inboundTracking: "33AB", deviceDescription: "iPhone 13 Pro" });
    // An existing customer is reused, not duplicated.
    expect(h.values.filter((v) => "portalToken" in v)).toEqual([]);
  });
});
