import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import { rotateSessionKeeping } from "../lib/session-rotate";

/* Tech App / Mobile POS sign-in issues a new session id (no fixation) without
   emptying the session — the POS shares the cookie, and signing a technician
   into the Tech App must not sign the owner out of the POS. */

describe("rotateSessionKeeping", () => {
  const app = express();
  app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
  app.post("/pos-login", (req, res) => { (req.session as unknown as Record<string, unknown>).merchantId = 4; res.end(); });
  app.post("/tech-login", async (req, res) => {
    await rotateSessionKeeping(req);
    (req.session as unknown as Record<string, unknown>).tech = { staffId: 7 };
    res.end();
  });
  app.get("/me", (req, res) => res.json(req.session));
  const sid = (r: request.Response) => String(r.headers["set-cookie"]?.[0] ?? "").split(";")[0];

  it("changes the id and keeps what the session held", async () => {
    const agent = request.agent(app);
    const before = sid(await agent.post("/pos-login"));
    const after = sid(await agent.post("/tech-login"));
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
    const me = (await agent.get("/me")).body;
    expect(me.merchantId).toBe(4);
    expect(me.tech).toEqual({ staffId: 7 });

    // The old id is dead.
    const stale = (await request(app).get("/me").set("Cookie", before)).body;
    expect(stale.merchantId).toBeUndefined();
  });
});
