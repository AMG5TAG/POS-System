import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";

/**
 * The terminal error handler.
 *
 * It exists because Express's default answer to a thrown route is an HTML error
 * page: the SPA parses JSON, so every server-side failure reached the operator
 * as an indistinguishable "HTTP 500" toast. What matters here is that a failure
 * comes back as JSON the client can display, that an oversized body is named as
 * such rather than guessed at, and that production doesn't leak internal
 * messages to the browser.
 */
vi.mock("../lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { errorHandler } from "../middlewares/errorHandler";

function buildApp(): express.Express {
  const app = express();
  app.use(express.json({ limit: "1kb" }));
  app.post("/echo", (_req, res) => { res.json({ ok: true }); });
  app.get("/boom", () => { throw new Error("insert failed: null value in column"); });
  app.get("/rejects", async () => { throw Object.assign(new Error("duplicate key"), { code: "23505", constraint: "service_jobs_pkey" }); });
  app.get("/teapot", () => { throw Object.assign(new Error("nope"), { status: 418 }); });
  app.use(errorHandler);
  return app;
}

const ORIGINAL_ENV = process.env.NODE_ENV;
beforeEach(() => { process.env.NODE_ENV = "test"; });
afterEach(() => { process.env.NODE_ENV = ORIGINAL_ENV; });

describe("errorHandler", () => {
  it("answers a thrown route with JSON, not an HTML error page", async () => {
    const res = await request(buildApp()).get("/boom");
    expect(res.status).toBe(500);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.error).toBe("insert failed: null value in column");
  });

  it("carries a rejected promise's message through", async () => {
    const res = await request(buildApp()).get("/rejects");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("duplicate key");
  });

  it("names the size limit for an oversized body instead of a bare 500", async () => {
    const res = await request(buildApp())
      .post("/echo")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ photo: "x".repeat(4096) }));
    expect(res.status).toBe(413);
    expect(res.body.error).toMatch(/too large/i);
  });

  it("keeps a non-5xx status and its message", async () => {
    const res = await request(buildApp()).get("/teapot");
    expect(res.status).toBe(418);
    expect(res.body.error).toBe("nope");
  });

  it("withholds the internal message in production but still answers JSON", async () => {
    process.env.NODE_ENV = "production";
    const res = await request(buildApp()).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Internal server error");
    expect(res.body.error).not.toMatch(/null value/);
  });
});
