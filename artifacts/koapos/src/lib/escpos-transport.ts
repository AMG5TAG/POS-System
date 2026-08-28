/* ─── WebUSB / Web Serial ESC/POS transport ───────────────────────────────────
 * The browser-native half of silent printing: raw ESC/POS bytes straight to a
 * thermal printer over WebUSB or Web Serial, with no print dialog and no helper
 * software. Chrome/Edge only.
 *
 * Device grants persist per-origin: the Hardware settings "Connect" buttons call
 * requestDevice()/requestPort() once, then at print time we retrieve the granted
 * device via getDevices()/getPorts() — no handle needs to cross components.
 *
 * Split out of thermal-printer.ts so both the receipt driver and the print
 * router (print-router.ts) can use it without importing each other.
 */

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
export async function sendNativeBytes(connection: "usb" | "serial", data: Uint8Array): Promise<void> {
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
