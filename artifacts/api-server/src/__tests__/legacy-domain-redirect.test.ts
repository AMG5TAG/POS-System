import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { legacyDomainRedirect } from "../middlewares/legacyDomainRedirect";

/* The app moved from koapos.com.au to pos.koastal.com.au. Stickers and service
   sheets printed with the old domain must keep landing somewhere useful. */

function makeApp() {
  const app = express();
  app.use(legacyDomainRedirect);
  app.use((_req, res) => { res.status(200).send("served"); });
  return app;
}

beforeEach(() => {
  delete process.env.APP_BASE_URL;
  delete process.env.LEGACY_DOMAINS;
  process.env.PUBLIC_DOMAIN = "pos.koastal.com.au";
});

describe("legacy domain redirect", () => {
  it("sends a QR scan on the old domain to the same path on the new one", async () => {
    const res = await request(makeApp()).get("/api/qr/j/42?x=1").set("Host", "koapos.com.au");
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe("https://pos.koastal.com.au/api/qr/j/42?x=1");
  });

  it("treats www. on the old domain the same way", async () => {
    const res = await request(makeApp()).get("/b/koastal/c/tok").set("Host", "www.koapos.com.au");
    expect(res.headers.location).toBe("https://pos.koastal.com.au/b/koastal/c/tok");
  });

  it("never redirects a POST, which would drop its body", async () => {
    const res = await request(makeApp()).post("/api/auth/login").set("Host", "koapos.com.au").send({});
    expect(res.status).toBe(200);
  });

  it("leaves the current domain alone", async () => {
    const res = await request(makeApp()).get("/dashboard").set("Host", "pos.koastal.com.au");
    expect(res.status).toBe(200);
  });
});
