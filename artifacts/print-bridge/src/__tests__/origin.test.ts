import { describe, expect, it } from "vitest";
import { isOriginAllowed } from "../config.js";
import { hostIsLoopback } from "../server.js";

/**
 * The origin allow-list is the bridge's outer perimeter: any website the till's
 * browser visits could try to talk to loopback, so only KoaPOS deployments may
 * get past it (the bearer token then gates the actual printing).
 */
describe("isOriginAllowed", () => {
  const allowed = ["https://*.replit.app", "https://pos.koastal.com.au", "https://pos.example.com:8443"];

  it("accepts subdomains of a wildcard entry, and the bare domain", () => {
    expect(isOriginAllowed("https://my-app.replit.app", allowed)).toBe(true);
    expect(isOriginAllowed("https://deep.sub.replit.app", allowed)).toBe(true);
    expect(isOriginAllowed("https://replit.app", allowed)).toBe(true);
  });

  it("rejects a lookalike domain that merely starts with the allowed one", () => {
    expect(isOriginAllowed("https://replit.app.evil.com", allowed)).toBe(false);
    expect(isOriginAllowed("https://notreplit.app", allowed)).toBe(false);
    expect(isOriginAllowed("https://evil.com", allowed)).toBe(false);
  });

  it("requires the scheme to match, so an http impostor can't stand in", () => {
    expect(isOriginAllowed("http://my-app.replit.app", allowed)).toBe(false);
    expect(isOriginAllowed("http://pos.koastal.com.au", allowed)).toBe(false);
  });

  it("matches an exact entry including its port", () => {
    expect(isOriginAllowed("https://pos.example.com:8443", allowed)).toBe(true);
    expect(isOriginAllowed("https://pos.example.com", allowed)).toBe(false);
    expect(isOriginAllowed("https://pos.example.com:9000", allowed)).toBe(false);
  });

  it("always allows the local dev frontend on any port", () => {
    expect(isOriginAllowed("http://localhost:5173", allowed)).toBe(true);
    expect(isOriginAllowed("http://127.0.0.1:3000", allowed)).toBe(true);
  });

  it("rejects a missing, malformed, or unlisted origin", () => {
    expect(isOriginAllowed(undefined, allowed)).toBe(false);
    expect(isOriginAllowed("not a url", allowed)).toBe(false);
    expect(isOriginAllowed("https://pos.koastal.com.au", [])).toBe(false);
  });
});

describe("hostIsLoopback (DNS-rebinding guard)", () => {
  it("accepts the loopback names on our port", () => {
    expect(hostIsLoopback("127.0.0.1:17777", 17777)).toBe(true);
    expect(hostIsLoopback("localhost:17777", 17777)).toBe(true);
    expect(hostIsLoopback("[::1]:17777", 17777)).toBe(true);
  });
  it("refuses any other host, port or a missing header", () => {
    expect(hostIsLoopback("attacker.com:17777", 17777)).toBe(false);
    expect(hostIsLoopback("127.0.0.1:8080", 17777)).toBe(false);
    expect(hostIsLoopback("127.0.0.1", 17777)).toBe(false);
    expect(hostIsLoopback(undefined, 17777)).toBe(false);
  });
});
