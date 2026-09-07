import { describe, expect, it } from "vitest";
import { hasPrinterInterface, openFailureMessage, type UsbDevice } from "@/lib/escpos-transport";

/** Minimal stand-in for a granted WebUSB device. */
function device(interfaceClasses: number[], extra: Partial<UsbDevice> = {}): UsbDevice {
  return {
    vendorId: 0x0483,
    productId: 0x5743,
    productName: "RP-700",
    manufacturerName: "Partner Tech",
    configurations: [{
      interfaces: interfaceClasses.map((interfaceClass, i) => ({
        interfaceNumber: i,
        alternate: { interfaceClass, endpoints: [] },
      })),
    }],
    ...extra,
  } as unknown as UsbDevice;
}

describe("hasPrinterInterface", () => {
  it("recognises a USB printer-class (0x07) interface", () => {
    expect(hasPrinterInterface(device([7]))).toBe(true);
    expect(hasPrinterInterface(device([255, 7]))).toBe(true);
  });

  it("rejects hardware with no printer interface", () => {
    // The device chooser lists everything, so a mis-click can grant a hub or a
    // scanner; opening one fails with the same "Access denied" as a real driver
    // conflict, which is why we filter before picking.
    expect(hasPrinterInterface(device([3]))).toBe(false);   // HID
    expect(hasPrinterInterface(device([9]))).toBe(false);   // hub
    expect(hasPrinterInterface(device([]))).toBe(false);
  });

  it("survives a device that exposes no configurations at all", () => {
    expect(hasPrinterInterface({ } as unknown as UsbDevice)).toBe(false);
  });
});

describe("openFailureMessage", () => {
  const dev = device([7]);

  it("explains the Windows driver conflict and names the way out", () => {
    const msg = openFailureMessage(new DOMException("Access denied.", "SecurityError"), dev);
    expect(msg).toContain("Partner Tech RP-700");
    expect(msg).toMatch(/printer driver attached/i);
    expect(msg).toContain("Print Bridge");
    // The actionable detail: the two modes are mutually exclusive.
    expect(msg).toMatch(/not both/i);
  });

  it("matches on the message text too, not just the DOMException name", () => {
    expect(openFailureMessage(new Error("Access denied."), dev)).toMatch(/printer driver attached/i);
  });

  it("passes through an unrelated failure rather than blaming the driver", () => {
    const msg = openFailureMessage(new Error("The device was disconnected."), dev);
    expect(msg).toContain("The device was disconnected.");
    expect(msg).not.toMatch(/printer driver attached/i);
  });

  it("identifies the device by vendor:product when it has no name", () => {
    const bare = device([7], { productName: undefined, manufacturerName: undefined });
    expect(openFailureMessage(new Error("boom"), bare)).toContain("0483:5743");
  });
});
