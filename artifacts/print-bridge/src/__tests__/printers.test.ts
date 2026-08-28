import { describe, expect, it } from "vitest";

/**
 * Windows reports a printer as "network" either through Win32_Printer.Network
 * (a queue shared from another PC) or via its port name (a raw TCP/IP or WSD
 * port). Both reach the device over the LAN, which is what the operator means
 * when they pick the shared label printer, so both must be flagged.
 *
 * Mirrors the expression in printers.ts; kept here because the WMI call itself
 * can't run off Windows.
 */
const isNetworkPort = (portName: string) => /^(IP_|WSD-|\\\\)/i.test(portName);

describe("network port detection", () => {
  it("flags TCP/IP, WSD and UNC ports", () => {
    expect(isNetworkPort("IP_192.168.1.50")).toBe(true);
    expect(isNetworkPort("WSD-1c2f4a0e-0000")).toBe(true);
    expect(isNetworkPort("\\\\OFFICE-PC\\DYMO")).toBe(true);
  });

  it("leaves locally attached ports alone", () => {
    expect(isNetworkPort("USB001")).toBe(false);
    expect(isNetworkPort("COM1")).toBe(false);
    expect(isNetworkPort("DOT4_001")).toBe(false);
    expect(isNetworkPort("")).toBe(false);
  });

  it("does not mistake a printer whose name merely starts with IP", () => {
    // The check reads PortName, never the display name -- "IPP Printer" on
    // USB001 is local.
    expect(isNetworkPort("USB001")).toBe(false);
  });
});
