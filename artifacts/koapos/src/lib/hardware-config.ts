/* ─── POS hardware configuration ─────────────────────────────────────────────
 * Shared types + defaults for the peripherals a register can drive: cash drawer,
 * receipt printer, barcode scanner. Persisted as JSON in `pos_settings.hardwareConfig`
 * (one row per merchant). Both the Hardware settings UI (management-registers) and
 * the thermal-printer driver (thermal-printer.ts) import from here so the shape
 * stays in one place.
 */

export interface CashDrawerCfg {
  enabled: boolean;
  interface: "usb" | "serial" | "network";
  openOnCashSale: boolean;
  pulseMs: number;
}

export interface PrinterCfg {
  enabled: boolean;
  /** Legacy field kept for back-compat with previously-saved configs. New code
   *  should read `connection` (derived from this when absent). */
  type: "thermal" | "network" | "pdf";
  /** How the app talks to the printer. Absent on old configs — see
   *  `resolvePrinterConnection`. "system" = fall back to the OS print dialog. */
  connection?: "usb" | "serial" | "network" | "system";
  /** Preset model id (see PRINTER_MODELS), e.g. "partner-rp700". */
  model?: string;
  paperWidth: "80mm" | "58mm";
  autoPrintOnSale: boolean;
  autoPrintOnRefund: boolean;
  ipAddress: string;
  port: string;
}

export interface ScannerCfg {
  enabled: boolean;
  interface: "usb-hid" | "serial" | "bluetooth";
  beepOnScan: boolean;
  prefix: string;
  suffix: string;
}

export interface HardwareCfg {
  cashDrawer: CashDrawerCfg;
  printer: PrinterCfg;
  scanner: ScannerCfg;
}

export const DEFAULT_HW: HardwareCfg = {
  cashDrawer: { enabled: false, interface: "usb",     openOnCashSale: true,  pulseMs: 200 },
  printer:    { enabled: false, type: "thermal", connection: "usb", model: "partner-rp700", paperWidth: "80mm", autoPrintOnSale: false, autoPrintOnRefund: false, ipAddress: "", port: "9100" },
  scanner:    { enabled: false, interface: "usb-hid", beepOnScan: true,      prefix: "", suffix: "" },
};

/** Parse the stored `hardwareConfig` JSON, tolerating absent/legacy fields. */
export function parseHardwareConfig(json: string | null | undefined): HardwareCfg {
  if (json) {
    try {
      const parsed = JSON.parse(json) as Partial<HardwareCfg>;
      return {
        cashDrawer: { ...DEFAULT_HW.cashDrawer, ...parsed.cashDrawer },
        printer:    { ...DEFAULT_HW.printer,    ...parsed.printer },
        scanner:    { ...DEFAULT_HW.scanner,    ...parsed.scanner },
      };
    } catch { /* fall through to defaults */ }
  }
  return DEFAULT_HW;
}

/** How to reach the printer, deriving from the legacy `type` when `connection`
 *  hasn't been set on an older saved config. */
export function resolvePrinterConnection(p: PrinterCfg): "usb" | "serial" | "network" | "system" {
  if (p.connection) return p.connection;
  if (p.type === "thermal") return "usb";
  if (p.type === "network") return "network";
  return "system";
}

export interface PrinterModelPreset {
  id: string;
  brand: string;
  label: string;
  paperWidth: "80mm" | "58mm";
  defaultConnection: "usb" | "serial" | "network";
  /** Known USB vendor id(s) for a convenience filter in the WebUSB chooser.
   *  Empty means "show all devices" (the RP-700 is still selectable). */
  usbVendorIds?: number[];
}

/**
 * Supported receipt-printer presets. Partner Tech models (RP-700/630/600) are
 * standard 80mm ESC/POS printers with auto-cutter + cash-drawer kick, so they
 * share the generic ESC/POS driver. Adding a new brand/model is just another
 * entry here.
 */
export const PRINTER_MODELS: PrinterModelPreset[] = [
  { id: "partner-rp700", brand: "Partner Tech", label: "Partner Tech RP-700 (80mm)", paperWidth: "80mm", defaultConnection: "usb" },
  { id: "partner-rp630", brand: "Partner Tech", label: "Partner Tech RP-630 (80mm)", paperWidth: "80mm", defaultConnection: "usb" },
  { id: "partner-rp600", brand: "Partner Tech", label: "Partner Tech RP-600 (80mm)", paperWidth: "80mm", defaultConnection: "usb" },
  { id: "generic-80",    brand: "Generic",      label: "Generic 80mm ESC/POS",       paperWidth: "80mm", defaultConnection: "usb" },
  { id: "generic-58",    brand: "Generic",      label: "Generic 58mm ESC/POS",       paperWidth: "58mm", defaultConnection: "usb" },
];

export function findPrinterModel(id: string | undefined): PrinterModelPreset | undefined {
  return PRINTER_MODELS.find((m) => m.id === id);
}
