import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import express from "express";

// Mocked db: every merchant lookup resolves to [], so the manifest falls back
// to unbranded names. The start_url/scope logic — the part that decides which
// page the installed home-screen icon reopens — needs no database at all.
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
    merchantsTable: tableProxy,
  };
});

let app: express.Express;

const get = (path: string) =>
  request(app).get(`/api/pwa/manifest.webmanifest?path=${encodeURIComponent(path)}`);

beforeAll(async () => {
  const { default: pwaRouter } = await import("../routes/pwa");
  app = express();
  app.use(express.json());
  app.use("/api", pwaRouter);
});

describe("GET /api/pwa/manifest.webmanifest", () => {
  it("reopens the Tech App itself, not the marketing homepage", async () => {
    const res = await get("/b/acme/t/techapp");
    expect(res.status).toBe(200);
    expect(res.body.start_url).toBe("/b/acme/t/techapp");
    expect(res.body.scope).toBe("/b/acme/t/techapp");
    expect(res.body.display).toBe("standalone");
    expect(res.headers["content-type"]).toContain("application/manifest+json");
  });

  it("serves the manifest as an app, so it installs standalone", async () => {
    const res = await get("/b/acme/t/techapp");
    expect(res.body.id).toBe("/b/acme/t/techapp");
    expect(res.body.icons.length).toBeGreaterThan(0);
  });

  it("keeps the legacy /t/webapp alias working", async () => {
    const res = await get("/b/acme/t/webapp");
    expect(res.body.start_url).toBe("/b/acme/t/webapp");
  });

  it("drops the ?job= deep link so the icon doesn't pin to one job", async () => {
    const res = await get("/b/acme/t/techapp?job=42");
    expect(res.body.start_url).toBe("/b/acme/t/techapp");
  });

  it("covers Mobile POS, Dashboard and Portal routes", async () => {
    expect((await get("/b/acme/t/posapp")).body.start_url).toBe("/b/acme/t/posapp");
    expect((await get("/d/abc123")).body.start_url).toBe("/d/abc123");
    expect((await get("/c/abc123")).body.start_url).toBe("/c/abc123");
    expect((await get("/b/acme/c/abc123")).body.start_url).toBe("/b/acme/c/abc123");
  });

  it("falls back to the plain KoaPOS manifest for ordinary pages", async () => {
    const res = await get("/pricing");
    expect(res.body.start_url).toBe("/");
    expect(res.body.scope).toBe("/");
    expect(res.body.name).toBe("KoaPOS");
  });

  it("never emits an off-origin start_url", async () => {
    for (const evil of ["//evil.example/x", "https://evil.example/x", "/\\evil.example"]) {
      const res = await get(evil);
      expect(res.body.start_url).toBe("/");
    }
  });

  it("ignores an absurdly long path", async () => {
    const res = await get(`/b/${"a".repeat(600)}/t/techapp`);
    expect(res.body.start_url).toBe("/");
  });

  it("normalises traversal segments before matching", async () => {
    const res = await get("/b/acme/t/../t/techapp");
    expect(res.body.start_url).toBe("/b/acme/t/techapp");
  });

  it("keeps short_name within the 12-char home-screen budget", async () => {
    const res = await get("/d/abc123");
    expect(res.body.name).toBe("KoaPOS Dashboard");
    expect(res.body.short_name.length).toBeLessThanOrEqual(12);
  });
});
