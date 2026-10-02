import { describe, it, expect } from "vitest";
import request from "supertest";
import express from "express";
import { createOAuthState, verifyOAuthState } from "../lib/oauth-state";
import { isOwnObjectKey, isReadableObjectKey } from "../lib/object-keys";
import { servedContentType } from "../lib/safe-content-type";
import { htmlResponseCsp } from "../middlewares/htmlResponseCsp";

describe("OAuth state (lib/oauth-state.ts)", () => {
  it("round-trips the merchant for the integration it was issued to", () => {
    expect(verifyOAuthState("xero", createOAuthState("xero", 7))).toBe(7);
  });

  it("refuses the bare merchant id the callbacks used to trust", () => {
    expect(verifyOAuthState("xero", "7")).toBeNull();
    expect(verifyOAuthState("payroll", "1")).toBeNull();
  });

  it("refuses a state minted for another integration", () => {
    expect(verifyOAuthState("payroll", createOAuthState("xero", 7))).toBeNull();
  });

  it("refuses a state whose merchant id was swapped", () => {
    const [, ...rest] = createOAuthState("xero", 7).split(".");
    expect(verifyOAuthState("xero", ["8", ...rest].join("."))).toBeNull();
  });

  it("refuses an expired or malformed state", () => {
    const [mid, , nonce, mac] = createOAuthState("xero", 7).split(".");
    expect(verifyOAuthState("xero", `${mid}.1.${nonce}.${mac}`)).toBeNull();
    expect(verifyOAuthState("xero", undefined)).toBeNull();
    expect(verifyOAuthState("xero", "a.b.c.d")).toBeNull();
  });
});

describe("customer file object keys (lib/object-keys.ts)", () => {
  it("accepts only this business's own folder for new records", () => {
    expect(isOwnObjectKey("/objects/merchants/4/uploads/abc", 4)).toBe(true);
    expect(isOwnObjectKey("/objects/merchants/5/uploads/abc", 4)).toBe(false);
    expect(isOwnObjectKey("/objects/backups/4/backup-4.kkpos.enc", 4)).toBe(false);
    expect(isOwnObjectKey("/objects/merchants/4/../5/uploads/abc", 4)).toBe(false);
    expect(isOwnObjectKey(42, 4)).toBe(false);
  });

  it("never reads another business's folder or a backup, but keeps legacy keys", () => {
    expect(isReadableObjectKey("/objects/merchants/4/uploads/abc", 4)).toBe(true);
    expect(isReadableObjectKey("/objects/merchants/5/uploads/abc", 4)).toBe(false);
    expect(isReadableObjectKey("/objects/backups/4/x.kkpos.enc", 4)).toBe(false);
    expect(isReadableObjectKey("/objects/0f3c-legacy-uuid", 4)).toBe(true);
    expect(isReadableObjectKey("/objects/../backups/4/x", 4)).toBe(false);
  });
});

describe("served content types (lib/safe-content-type.ts)", () => {
  it("keeps types a browser only displays", () => {
    for (const t of ["image/png", "image/jpeg", "video/mp4", "application/pdf", "text/csv"]) {
      expect(servedContentType(t)).toEqual({ contentType: t, inline: true });
    }
  });

  it("turns anything that could run as a page into a download", () => {
    for (const t of ["text/html", "image/svg+xml", "application/xhtml+xml", "text/xml", "", undefined]) {
      expect(servedContentType(t)).toEqual({ contentType: "application/octet-stream", inline: false });
    }
  });
});

describe("CSP on HTML the API renders (middlewares/htmlResponseCsp.ts)", () => {
  const app = express();
  app.use(htmlResponseCsp);
  app.get("/page", (_req, res) => { res.send("<p>hi</p>"); });
  app.get("/json", (_req, res) => { res.json({ ok: true }); });
  app.get("/pdf", (_req, res) => { res.type("application/pdf").send(Buffer.from("%PDF")); });

  it("gives HTML a no-script policy", async () => {
    const res = await request(app).get("/page");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(res.headers["content-security-policy"]).not.toContain("script-src");
  });

  it("leaves JSON and PDFs alone (a strict CSP blanks Chrome's PDF viewer)", async () => {
    expect((await request(app).get("/json")).headers["content-security-policy"]).toBeUndefined();
    expect((await request(app).get("/pdf")).headers["content-security-policy"]).toBeUndefined();
  });
});
