import { describe, it, expect, vi, beforeAll } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";

vi.mock("@workspace/db", () => {
  const chain: any = new Proxy({} as any, {
    get(_t, k) {
      if (k === "then") return (res: any) => Promise.resolve([]).then(res);
      if (k === "catch") return () => chain;
      if (k === "finally") return () => chain;
      return () => chain;
    },
  });
  const tableProxy = new Proxy({} as any, { get: () => tableProxy });
  return {
    db: new Proxy({} as any, { get: () => () => chain }),
    followUpTemplatesTable: tableProxy,
    followUpLogTable: tableProxy,
    followUpSettingsTable: tableProxy,
    serviceJobsTable: tableProxy,
    appointmentsTable: tableProxy,
    customersTable: tableProxy,
    staffTable: tableProxy,
    merchantsTable: tableProxy,
    businessProfileTable: tableProxy,
  };
});

vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  invalidateMerchantStatusCache: () => {},
}));

vi.mock("../services/email", () => ({ sendEmail: vi.fn(async () => ({ success: true })) }));
vi.mock("../services/sms", () => ({ sendSms: vi.fn(async () => ({ success: true })) }));

let app: express.Express;
let helpers: typeof import("../routes/follow-ups");

beforeAll(async () => {
  helpers = await import("../routes/follow-ups");

  app = express();
  app.use(express.json());
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.use((req, _res, next) => { (req as any).session.merchantId = 1; next(); });
  app.use("/api", helpers.default);
});

describe("windowCutoff — days / weeks / months", () => {
  const from = new Date("2026-08-12T00:00:00.000Z");

  it("subtracts days", () => {
    expect(helpers.windowCutoff(30, "days", from).toISOString()).toBe("2026-07-13T00:00:00.000Z");
  });

  it("subtracts weeks as 7-day blocks", () => {
    expect(helpers.windowCutoff(2, "weeks", from).toISOString()).toBe("2026-07-29T00:00:00.000Z");
  });

  it("subtracts calendar months, not 30-day blocks", () => {
    expect(helpers.windowCutoff(6, "months", from).toISOString()).toBe("2026-02-12T00:00:00.000Z");
  });

  it("treats a zero window as 'everything completed so far'", () => {
    expect(helpers.windowCutoff(0, "days", from).toISOString()).toBe(from.toISOString());
  });
});

describe("applyShortcodes", () => {
  it("substitutes known codes and tolerates whitespace", () => {
    const out = helpers.applyShortcodes("Hi {{first_name}}, your {{ device }} is done", {
      first_name: "Sarah",
      device: "iPhone 13",
    });
    expect(out).toBe("Hi Sarah, your iPhone 13 is done");
  });

  it("leaves unknown codes untouched rather than blanking them", () => {
    expect(helpers.applyShortcodes("Hi {{nickname}}", { first_name: "Sarah" })).toBe("Hi {{nickname}}");
  });

  it("substitutes an empty value when the field is on file but blank", () => {
    expect(helpers.applyShortcodes("Ref {{job_number}}.", { job_number: "" })).toBe("Ref .");
  });
});

describe("htmlToText", () => {
  it("turns block tags into line breaks and unescapes entities", () => {
    expect(helpers.htmlToText("<p>Hi Sarah</p><p>Ben &amp; Co<br/>Thanks</p>")).toBe("Hi Sarah\n\nBen & Co\nThanks");
  });
});

describe("GET /api/follow-ups — query validation", () => {
  it("rejects an unsupported window unit", async () => {
    const res = await request(app).get("/api/follow-ups?windowValue=3&windowUnit=fortnights");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  it("rejects a non-numeric window value", async () => {
    const res = await request(app).get("/api/follow-ups?windowValue=soon");
    expect(res.status).toBe(400);
  });

  it("rejects a negative window value", async () => {
    const res = await request(app).get("/api/follow-ups?windowValue=-5");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/follow-ups/shortcodes", () => {
  it("lists the shortcodes the renderer actually supports", async () => {
    const res = await request(app).get("/api/follow-ups/shortcodes");
    expect(res.status).toBe(200);
    const codes = (res.body.items as { code: string }[]).map((s) => s.code);
    expect(codes).toContain("first_name");
    expect(codes).toContain("days_since");
    expect(res.body.total).toBe(codes.length);
  });
});

describe("POST /api/follow-ups/send — validation", () => {
  const target = { sourceType: "service_job", sourceId: 7 };

  it("rejects an empty target list", async () => {
    const res = await request(app).post("/api/follow-ups/send").send({ targets: [], channel: "email" });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown source type", async () => {
    const res = await request(app).post("/api/follow-ups/send")
      .send({ targets: [{ sourceType: "invoice", sourceId: 1 }], channel: "email" });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown channel", async () => {
    const res = await request(app).post("/api/follow-ups/send").send({ targets: [target], channel: "carrier-pigeon" });
    expect(res.status).toBe(400);
  });

  it("requires a subject and body for an email send", async () => {
    const res = await request(app).post("/api/follow-ups/send").send({ targets: [target], channel: "email", body: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/body is required/i);
  });

  it("requires a subject even when a body is supplied", async () => {
    const res = await request(app).post("/api/follow-ups/send")
      .send({ targets: [target], channel: "email", body: "<p>Hi</p>" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/subject is required/i);
  });

  it("requires a message for an SMS send", async () => {
    const res = await request(app).post("/api/follow-ups/send").send({ targets: [target], channel: "sms" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sms body is required/i);
  });
});

describe("PUT /api/follow-up-settings — validation", () => {
  it("rejects an unsupported window unit", async () => {
    const res = await request(app).put("/api/follow-up-settings").send({ windowUnit: "fortnights" });
    expect(res.status).toBe(400);
  });

  it("rejects a window longer than ten years", async () => {
    const res = await request(app).put("/api/follow-up-settings").send({ windowValue: 4000 });
    expect(res.status).toBe(400);
  });
});

describe("follow-up templates — route param validation", () => {
  it("rejects a non-integer id on update", async () => {
    const res = await request(app).put("/api/follow-up-templates/abc").send({ name: "x" });
    expect(res.status).toBe(400);
  });

  it("rejects a non-integer id on delete", async () => {
    const res = await request(app).delete("/api/follow-up-templates/abc");
    expect(res.status).toBe(400);
  });

  it("requires a name when creating", async () => {
    const res = await request(app).post("/api/follow-up-templates").send({ channel: "email" });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown channel when creating", async () => {
    const res = await request(app).post("/api/follow-up-templates").send({ name: "x", channel: "fax" });
    expect(res.status).toBe(400);
  });
});
