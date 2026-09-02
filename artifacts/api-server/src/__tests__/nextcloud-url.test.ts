/**
 * Nextcloud server-address handling.
 *
 * The address is merchant-supplied and every WebDAV request is aimed at it, so
 * normalisation and the SSRF guard are the two places a mistake is expensive:
 * a sloppy normaliser sends requests to the wrong path, and a hole in the guard
 * turns the integration into an SSRF primitive pointed at our own network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const lookup = vi.hoisted(() => vi.fn());
vi.mock("dns/promises", () => ({ lookup }));

import {
  assertSafeNextcloudUrl,
  normaliseServerUrl,
  nextcloudRef,
  parseNextcloudRef,
} from "../lib/nextcloud";

describe("normaliseServerUrl", () => {
  it("defaults a bare host to https", () => {
    expect(normaliseServerUrl("cloud.example.com")).toBe("https://cloud.example.com");
  });

  it("strips trailing slashes and whitespace", () => {
    expect(normaliseServerUrl("  https://cloud.example.com/  ")).toBe(
      "https://cloud.example.com",
    );
  });

  it("reduces a URL copied from the browser back to the instance root", () => {
    expect(normaliseServerUrl("https://cloud.example.com/index.php/apps/files")).toBe(
      "https://cloud.example.com",
    );
    expect(normaliseServerUrl("https://cloud.example.com/settings/user/security")).toBe(
      "https://cloud.example.com",
    );
  });

  it("keeps a sub-path install intact", () => {
    expect(normaliseServerUrl("https://example.com/nextcloud")).toBe(
      "https://example.com/nextcloud",
    );
    expect(normaliseServerUrl("https://example.com/nextcloud/index.php/apps/files")).toBe(
      "https://example.com/nextcloud",
    );
  });

  it("preserves a non-default port", () => {
    expect(normaliseServerUrl("https://cloud.example.com:8443")).toBe(
      "https://cloud.example.com:8443",
    );
  });

  it("rejects empty and malformed input", () => {
    expect(() => normaliseServerUrl("   ")).toThrow(/Enter your Nextcloud/);
    expect(() => normaliseServerUrl("http://")).toThrow();
  });

  it("rejects a non-http scheme", () => {
    expect(() => normaliseServerUrl("ftp://cloud.example.com")).toThrow();
  });

  it("rejects plain http in production, where the app password would go in the clear", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() => normaliseServerUrl("http://cloud.example.com")).toThrow(/https/);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});

describe("assertSafeNextcloudUrl", () => {
  // Block bodies matter: an arrow returning the mock would hand Vitest a
  // "teardown callback" that it then calls after every test.
  beforeEach(() => { lookup.mockReset(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("allows a host that resolves to a public address", async () => {
    lookup.mockResolvedValue([{ address: "203.0.113.10" }]);
    await expect(
      assertSafeNextcloudUrl("https://cloud.example.com"),
    ).resolves.toBeUndefined();
  });

  it.each([
    ["loopback", "127.0.0.1"],
    ["RFC1918 10/8", "10.0.0.5"],
    ["RFC1918 172.16/12", "172.20.1.1"],
    ["RFC1918 192.168/16", "192.168.1.1"],
    ["cloud metadata link-local", "169.254.169.254"],
    ["CGNAT", "100.64.0.1"],
    ["this-network", "0.0.0.0"],
    ["benchmarking", "198.18.0.1"],
    ["multicast", "239.1.1.1"],
  ])("rejects a host resolving to %s", async (_label, address) => {
    lookup.mockResolvedValue([{ address }]);
    await expect(assertSafeNextcloudUrl("https://evil.example.com")).rejects.toThrow(
      /not reachable/,
    );
  });

  it.each([
    ["IPv6 loopback", "::1"],
    ["IPv6 unique-local", "fd00::1"],
    ["IPv6 link-local", "fe80::1"],
    ["IPv4-mapped metadata address", "::ffff:169.254.169.254"],
  ])("rejects a host resolving to %s", async (_label, address) => {
    lookup.mockResolvedValue([{ address }]);
    await expect(assertSafeNextcloudUrl("https://evil.example.com")).rejects.toThrow(
      /not reachable/,
    );
  });

  it("rejects a hostname with even one private answer", async () => {
    lookup.mockResolvedValue([{ address: "203.0.113.10" }, { address: "127.0.0.1" }]);
    await expect(assertSafeNextcloudUrl("https://split.example.com")).rejects.toThrow(
      /not reachable/,
    );
  });

  it("checks a literal IP without resolving it", async () => {
    await expect(assertSafeNextcloudUrl("https://127.0.0.1")).rejects.toThrow(
      /not reachable/,
    );
    expect(lookup).not.toHaveBeenCalled();

    await expect(assertSafeNextcloudUrl("https://203.0.113.10")).resolves.toBeUndefined();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rejects a host that does not resolve", async () => {
    lookup.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(assertSafeNextcloudUrl("https://nope.example.com")).rejects.toThrow(
      /Could not resolve/,
    );
  });

  it("rejects a host that resolves to nothing", async () => {
    lookup.mockResolvedValue([]);
    await expect(assertSafeNextcloudUrl("https://nope.example.com")).rejects.toThrow(
      /Could not resolve/,
    );
  });
});

describe("backup location refs", () => {
  it("round-trips a remote path", () => {
    const ref = nextcloudRef("https://cloud.example.com", "KoaPOS/Backups/b.enc");
    expect(ref).toBe("nextcloud://cloud.example.com/KoaPOS/Backups/b.enc");
    expect(parseNextcloudRef(ref)).toBe("KoaPOS/Backups/b.enc");
  });

  it("keeps the port in the ref host", () => {
    const ref = nextcloudRef("https://cloud.example.com:8443", "b.enc");
    expect(ref).toBe("nextcloud://cloud.example.com:8443/b.enc");
    expect(parseNextcloudRef(ref)).toBe("b.enc");
  });

  it("returns null for another provider's ref", () => {
    expect(parseNextcloudRef("s3://bucket/key")).toBeNull();
    expect(parseNextcloudRef("onedrive:approot/b.enc")).toBeNull();
    // Prefix present but no path — not something we can fetch.
    expect(parseNextcloudRef("nextcloud://cloud.example.com")).toBeNull();
  });
});
