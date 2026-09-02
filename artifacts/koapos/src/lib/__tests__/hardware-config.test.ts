import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROUTING, DOCUMENT_PROFILE_ID, LABEL_PROFILE_ID, PRINT_PURPOSES, RECEIPT_PROFILE_ID,
  isThermalProfile, paperFamily, parseHardwareConfig, profileForPurpose, thermalWidth,
} from "@/lib/hardware-config";

describe("parseHardwareConfig", () => {
  it("seeds printer profiles for a config saved before routing existed", () => {
    const legacy = JSON.stringify({
      printer: { enabled: true, type: "thermal", connection: "serial", model: "partner-rp630", paperWidth: "58mm", ipAddress: "10.0.0.5", port: "9100" },
    });
    const hw = parseHardwareConfig(legacy);

    const receipt = hw.printers.find((p) => p.id === RECEIPT_PROFILE_ID);
    expect(receipt).toMatchObject({ transport: "serial", paper: "58mm", model: "partner-rp630", ipAddress: "10.0.0.5" });
    // A4 stays on the browser dialog, so nothing about today's behaviour changes.
    expect(hw.printers.find((p) => p.id === DOCUMENT_PROFILE_ID)).toMatchObject({ transport: "system", paper: "a4" });
    // Labels are seeded on the browser dialog: a bridge profile with no queue
    // name prints to the machine default, which would quietly send every label
    // to the A4 laser as soon as the bridge was paired for anything else.
    expect(hw.printers.find((p) => p.id === LABEL_PROFILE_ID)).toMatchObject({ transport: "system", paper: "label" });
    expect(hw.routing).toEqual(DEFAULT_ROUTING);
    expect(hw.bridge.enabled).toBe(false);
  });

  it("derives the transport from the legacy `type` when no connection was saved", () => {
    const hw = parseHardwareConfig(JSON.stringify({ printer: { enabled: true, type: "network", paperWidth: "80mm" } }));
    expect(hw.printers.find((p) => p.id === RECEIPT_PROFILE_ID)?.transport).toBe("network");
  });

  it("keeps saved profiles and merges new purposes into the routing map", () => {
    const saved = JSON.stringify({
      printers: [{ id: "counter", label: "Counter", transport: "bridge", paper: "80mm" }],
      routing: { receipt: "counter" },
    });
    const hw = parseHardwareConfig(saved);

    expect(hw.printers).toHaveLength(1);
    expect(hw.routing.receipt).toBe("counter");
    // Purposes the merchant never touched keep their defaults.
    expect(hw.routing.purchaseOrder).toBe(DOCUMENT_PROFILE_ID);
  });

  it("falls back to defaults for absent or corrupt JSON", () => {
    for (const input of [undefined, null, "", "{not json"]) {
      const hw = parseHardwareConfig(input);
      expect(hw.printer.enabled).toBe(false);
      expect(hw.printers).toHaveLength(3);
    }
  });
});

describe("routing helpers", () => {
  const hw = parseHardwareConfig(undefined);

  it("resolves a purpose to its profile", () => {
    expect(profileForPurpose(hw, "receipt")?.id).toBe(RECEIPT_PROFILE_ID);
    expect(profileForPurpose(hw, "purchaseOrder")?.id).toBe(DOCUMENT_PROFILE_ID);
  });

  it("treats an unrouted purpose as unprinted rather than guessing", () => {
    const unrouted = { ...hw, routing: { ...hw.routing, receipt: "" } };
    expect(profileForPurpose(unrouted, "receipt")).toBeUndefined();
  });

  it("classifies thermal profiles and their width", () => {
    expect(isThermalProfile(profileForPurpose(hw, "receipt"))).toBe(true);
    expect(isThermalProfile(profileForPurpose(hw, "invoice"))).toBe(false);
    expect(thermalWidth(profileForPurpose(hw, "receipt"))).toBe("80mm");
    expect(thermalWidth({ id: "x", label: "x", transport: "bridge", paper: "58mm" })).toBe("58mm");
    // An A4 profile has no roll width; the encoders need a sane default.
    expect(thermalWidth(profileForPurpose(hw, "invoice"))).toBe("80mm");
  });

  it("gives every purpose a default route, at a profile that exists", () => {
    for (const purpose of PRINT_PURPOSES) {
      const id = DEFAULT_ROUTING[purpose.id];
      expect(id, purpose.id).toBeTruthy();
      expect(hw.printers.map((p) => p.id), purpose.id).toContain(id);
    }
  });

  it("routes A4 documents that have no printer of their own at the document printer", () => {
    for (const purpose of ["customerForm", "appointment", "purchaseOrder", "eod"] as const) {
      expect(profileForPurpose(hw, purpose)?.id, purpose).toBe(DOCUMENT_PROFILE_ID);
    }
  });

  it("routes labels at the label printer, not the receipt or document one", () => {
    const label = profileForPurpose(hw, "label");
    expect(label?.id).toBe(LABEL_PROFILE_ID);
    // A DYMO doesn't speak ESC/POS, so labels must never take the raw path.
    expect(isThermalProfile(label)).toBe(false);
  });
});

describe("paperFamily", () => {
  it("treats the two roll widths as interchangeable and everything else as distinct", () => {
    expect(paperFamily("80mm")).toBe(paperFamily("58mm"));
    expect(paperFamily("a4")).toBe("sheet");
    expect(paperFamily("label")).toBe("label");
    expect(paperFamily("label")).not.toBe(paperFamily("a4"));
    expect(paperFamily("label")).not.toBe(paperFamily("80mm"));
  });
});
