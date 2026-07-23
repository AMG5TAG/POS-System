/* ─── Thermal printer driver ──────────────────────────────────────────────────
 * Sends ESC/POS receipts to a physical thermal printer (Partner Tech RP-700 and
 * other ESC/POS models) over WebUSB or Web Serial, with an automatic fall back to
 * the HTML `window.print()` path when native printing isn't available (network/
 * system printers, non-Chromium browsers, or no device connected yet).
 *
 * Device grants persist per-origin: the Hardware settings "Connect" buttons call
 * requestDevice()/requestPort() once, then at print time we retrieve the granted
 * device via getDevices()/getPorts() — no handle needs to cross components.
 */
import type { Transaction } from "@workspace/api-client-react";
import { printReceipt as rawPrintReceipt, type ReceiptBusinessInfo, type ReceiptTemplateOpts } from "@/lib/print-receipt";
import { buildReceiptBytes, buildTestReceiptBytes, cashDrawerKickBytes } from "@/lib/escpos";
import { resolvePrinterConnection, type HardwareCfg } from "@/lib/hardware-config";

/* ── Minimal WebUSB / Web Serial typings (not in the default DOM lib) ────────── */
interface UsbEndpoint { endpointNumber: number; direction: "in" | "out" }
interface UsbAlternate { interfaceClass: number; endpoints: UsbEndpoint[] }
interface UsbInterface { interfaceNumber: number; alternate: UsbAlternate }
interface UsbConfiguration { interfaces: UsbInterface[] }
interface UsbDevice {
  configuration: UsbConfiguration | null;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(n: number): Promise<void>;
  claimInterface(n: number): Promise<void>;
  releaseInterface(n: number): Promise<void>;
  transferOut(endpointNumber: number, data: Uint8Array): Promise<unknown>;
}
interface Usb {
  getDevices(): Promise<UsbDevice[]>;
  requestDevice(options: { filters: Array<{ vendorId?: number }> }): Promise<UsbDevice>;
}
interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readonly writable: WritableStream<Uint8Array> | null;
}
interface SerialLike {
  getPorts(): Promise<SerialPortLike[]>;
  requestPort(): Promise<SerialPortLike>;
}

function getUsb(): Usb | null {
  return (navigator as unknown as { usb?: Usb }).usb ?? null;
}
function getSerial(): SerialLike | null {
  return (navigator as unknown as { serial?: SerialLike }).serial ?? null;
}

export function isWebUsbSupported(): boolean { return getUsb() !== null; }
export function isWebSerialSupported(): boolean { return getSerial() !== null; }

/* ── Permission prompts (called from Hardware settings) ─────────────────────── */

/** Prompt the user to pick + grant a USB printer. Grant persists for this origin. */
export async function connectUsbPrinter(): Promise<void> {
  const usb = getUsb();
  if (!usb) throw new Error("WebUSB isn't supported in this browser. Use Chrome or Edge on desktop/Android.");
  // Empty filter list shows all devices so any ESC/POS printer (incl. the RP-700,
  // whose USB vendor id varies by build) is selectable.
  await usb.requestDevice({ filters: [] });
}

/** Prompt the user to pick + grant a serial (RS-232 / USB-serial) printer. */
export async function connectSerialPrinter(): Promise<void> {
  const serial = getSerial();
  if (!serial) throw new Error("Web Serial isn't supported in this browser. Use Chrome or Edge on desktop.");
  await serial.requestPort();
}

/* ── Low-level transport ────────────────────────────────────────────────────── */

async function firstUsbDevice(): Promise<UsbDevice | null> {
  const usb = getUsb();
  if (!usb) return null;
  return (await usb.getDevices())[0] ?? null;
}
async function firstSerialPort(): Promise<SerialPortLike | null> {
  const serial = getSerial();
  if (!serial) return null;
  return (await serial.getPorts())[0] ?? null;
}

async function sendUsb(device: UsbDevice, data: Uint8Array): Promise<void> {
  await device.open();
  try {
    if (!device.configuration) await device.selectConfiguration(1);
    const cfg = device.configuration;
    if (!cfg) throw new Error("USB printer has no configuration");
    // Prefer the printer-class interface (class 7); fall back to the first.
    const iface = cfg.interfaces.find((i) => i.alternate.interfaceClass === 7) ?? cfg.interfaces[0];
    if (!iface) throw new Error("USB printer exposes no interface");
    await device.claimInterface(iface.interfaceNumber);
    const ep = iface.alternate.endpoints.find((e) => e.direction === "out");
    if (!ep) throw new Error("USB printer exposes no OUT endpoint");
    await device.transferOut(ep.endpointNumber, data);
    await device.releaseInterface(iface.interfaceNumber).catch(() => { /* ignore */ });
  } finally {
    await device.close().catch(() => { /* ignore */ });
  }
}

async function sendSerial(port: SerialPortLike, data: Uint8Array): Promise<void> {
  await port.open({ baudRate: 9600 });
  try {
    const writer = port.writable?.getWriter();
    if (!writer) throw new Error("Serial port is not writable");
    await writer.write(data);
    writer.releaseLock();
  } finally {
    await port.close().catch(() => { /* ignore */ });
  }
}

/** Send raw bytes over the chosen native connection. Throws if no device granted. */
async function sendBytes(connection: "usb" | "serial", data: Uint8Array): Promise<void> {
  if (connection === "usb") {
    const device = await firstUsbDevice();
    if (!device) throw new Error("No USB printer connected — connect it in Settings › Registers › Hardware.");
    await sendUsb(device, data);
    return;
  }
  const port = await firstSerialPort();
  if (!port) throw new Error("No serial printer connected — connect it in Settings › Registers › Hardware.");
  await sendSerial(port, data);
}

/* ── Public API ─────────────────────────────────────────────────────────────── */

export type PrintMethod = "usb" | "serial" | "html";

/**
 * Print a receipt. Uses native ESC/POS over USB/serial when the printer is
 * enabled and connected that way; otherwise (network/system printers, no device,
 * or any native error) falls back to the HTML print path so a sale is never
 * blocked. Also kicks the cash drawer on cash sales when configured.
 */
export async function printThermalReceipt(
  tx: Transaction,
  businessInfo: ReceiptBusinessInfo | undefined,
  opts: ReceiptTemplateOpts | undefined,
  hw: HardwareCfg,
): Promise<PrintMethod> {
  const connection = resolvePrinterConnection(hw.printer);
  if (hw.printer.enabled && (connection === "usb" || connection === "serial")) {
    try {
      await sendBytes(connection, buildReceiptBytes(tx, businessInfo, opts, hw.printer));
      if (hw.cashDrawer.enabled && hw.cashDrawer.openOnCashSale && (tx.paymentMethod ?? "").toLowerCase() === "cash") {
        await sendBytes(connection, cashDrawerKickBytes(hw.cashDrawer.pulseMs)).catch(() => { /* drawer optional */ });
      }
      return connection;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Native ESC/POS print failed — falling back to HTML print.", err);
    }
  }
  await rawPrintReceipt(tx, businessInfo, opts);
  return "html";
}

/** Fire the cash-drawer kick pulse over the printer's USB/serial connection. */
export async function openCashDrawer(hw: HardwareCfg): Promise<void> {
  const connection = resolvePrinterConnection(hw.printer);
  if (connection !== "usb" && connection !== "serial") {
    throw new Error("Cash-drawer kick needs a USB or serial printer connection.");
  }
  await sendBytes(connection, cashDrawerKickBytes(hw.cashDrawer.pulseMs));
}

/** Print the Hardware-settings self-test ticket over the native connection. */
export async function printTestReceipt(hw: HardwareCfg): Promise<PrintMethod> {
  const connection = resolvePrinterConnection(hw.printer);
  if (connection === "usb" || connection === "serial") {
    await sendBytes(connection, buildTestReceiptBytes(hw.printer));
    return connection;
  }
  throw new Error("Test print needs a USB or serial connection. Network/system printers print via a normal sale.");
}
