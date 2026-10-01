import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

/**
 * POST /service-jobs/:id/portal-link — the job dialog's "Portal" button, which
 * called a route that did not exist. It sends the customer their account link
 * (the shop account that replaced the portal), and only ever to the email or
 * mobile on file: the link signs them in.
 */

const h = vi.hoisted(() => ({
  rows: [] as unknown[][], sets: [] as Record<string, unknown>[],
  sms: [] as { to: string; body: string }[], emails: [] as { to: string; html: string; text: string }[],
}));

vi.mock("@workspace/db", async (importOriginal) => {
  process.env.DATABASE_URL ||= "postgres://user:pass@localhost:5432/test";
  const actual = await importOriginal<Record<string, unknown>>();
  const chain = (): any =>
    new Proxy({} as any, {
      get(_t, k) {
        if (k === "then") return (res: any, rej: any) => Promise.resolve(h.rows.shift() ?? []).then(res, rej);
        if (k === "set") return (v: Record<string, unknown>) => { h.sets.push(v); return chain(); };
        return () => chain();
      },
    });
  return { ...actual, db: new Proxy({} as any, { get: () => () => chain() }) };
});
vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: any, _res: any, next: any) => { req.session = { merchantId: 1 }; next(); },
}));
vi.mock("../services/sms", () => ({ sendSms: vi.fn(async (m: { to: string; body: string }) => { h.sms.push(m); return { success: true }; }) }));
vi.mock("../services/email", () => ({
  sendEmail: vi.fn(async (_m: number, e: { to: string; html: string; text: string }) => { h.emails.push(e); return { success: true }; }),
}));

let app: express.Express;
const JOB = { id: 7, merchantId: 1, customerId: 9, jobNumber: "KS0007", status: "in-progress" };
const CUSTOMER = { id: 9, merchantId: 1, firstName: "Sam", email: "sam@example.com", phone: "+61400000000", portalToken: "tok-9" };

beforeAll(async () => {
  delete process.env.SITE_DOMAIN;
  const { default: router } = await import("../routes/service-jobs");
  app = express();
  app.use(express.json());
  app.use("/api", router);
}, 60000);

beforeEach(() => { h.rows = []; h.sets = []; h.sms = []; h.emails = []; });

describe("POST /service-jobs/:id/portal-link", () => {
  it("emails the account link to the address on file", async () => {
    h.rows = [[JOB], [CUSTOMER], [{ businessName: "Koastal" }]];
    const res = await request(app).post("/api/service-jobs/7/portal-link?via=email");
    expect(res.status).toBe(200);
    expect(h.emails).toHaveLength(1);
    expect(h.emails[0]!.to).toBe("sam@example.com");
    expect(h.emails[0]!.text).toContain("https://koastal.com.au/shop/c/tok-9");
  });

  it("texts it to the mobile on file", async () => {
    h.rows = [[JOB], [CUSTOMER], [{ businessName: "Koastal" }]];
    const res = await request(app).post("/api/service-jobs/7/portal-link?via=sms");
    expect(res.status).toBe(200);
    expect(h.sms[0]).toMatchObject({ to: "+61400000000" });
    expect(h.sms[0]!.body).toContain("https://koastal.com.au/shop/c/tok-9");
  });

  it("gives a customer without a token one first", async () => {
    h.rows = [[JOB], [{ ...CUSTOMER, portalToken: null }], [], [{ businessName: "Koastal" }]];
    const res = await request(app).post("/api/service-jobs/7/portal-link?via=sms");
    expect(res.status).toBe(200);
    const token = h.sets[0]!.portalToken as string;
    expect(token).toMatch(/^[0-9a-f-]{36}$/);
    expect(h.sms[0]!.body).toContain(`/shop/c/${token}`);
  });

  it("refuses when there is no address for that channel", async () => {
    h.rows = [[JOB], [{ ...CUSTOMER, email: null }]];
    const res = await request(app).post("/api/service-jobs/7/portal-link?via=email");
    expect(res.status).toBe(400);
    expect(h.emails).toEqual([]);
  });

  it("refuses a job with no customer", async () => {
    h.rows = [[{ ...JOB, customerId: null }]];
    const res = await request(app).post("/api/service-jobs/7/portal-link?via=sms");
    expect(res.status).toBe(400);
  });

  it("needs a channel", async () => {
    const res = await request(app).post("/api/service-jobs/7/portal-link");
    expect(res.status).toBe(400);
  });
});
