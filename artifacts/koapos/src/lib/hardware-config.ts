/* ─── POS hardware configuration ─────────────────────────────────────────────
 * Shared types + defaults for the peripherals a register can drive: cash drawer,
 * receipt printer(s), barcode scanner. Persisted as JSON in
 * `pos_settings.hardwareConfig` (one row per merchant). The Hardware settings UI
 * (management-registers), the thermal-printer driver (thermal-printer.ts) and
 * the print router (print-router.ts) all import from here so the shape stays in
 * one place.
 *
 * Two generations of printer config live side by side:
 *   • `printer`  — the original single receipt printer. Still written so older
 *                  builds keep working, and still the source of truth for the
 *                  cash-drawer kick and the auto-print toggles.
 *   • `printers` + `routing` — named printer profiles plus a purpose→profile map,
 *                  so receipts, service dockets and A4 job sheets can each go to
 *                  a different device. Synthesised from `printer` on first read,
 *                  so no migration and no data loss for existing merchants.
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
  connection?: PrinterTransport;
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

/* ── Printer profiles + per-purpose routing ─────────────────────────────────── */

/** How the app reaches a printer. `bridge` = the local KoaPOS Print Bridge. */
export type PrinterTransport = "usb" | "serial" | "bridge" | "network" | "system";

/** Paper a profile is loaded with. Drives which renderer a document uses.
 *  `label` is a die-cut label roll (DYMO and friends) — not a thermal receipt
 *  roll, because those printers don't speak ESC/POS; labels always render as
 *  HTML at the exact label dimensions the sticker template declares. */
export type PrinterPaper = "80mm" | "58mm" | "a4" | "label";

/**
 * Papers that can stand in for each other. Used to warn when a document is
 * routed at a printer loaded with the wrong stock.
 */
export function paperFamily(paper: PrinterPaper): "sheet" | "roll" | "label" {
  if (paper === "a4") return "sheet";
  if (paper === "label") return "label";
  return "roll";
}

/**
 * Every document the app can print. Adding one means: a member here, a label in
 * `PRINT_PURPOSES`, a default in `DEFAULT_ROUTING`, and a `printDocument()` call
 * at the print site.
 */
export type PrintPurpose =
  | "receipt"
  | "refund"
  | "serviceJobSheet"
  | "serviceJobDocket"
  | "invoice"
  | "quote"
  | "a4Receipt"
  | "purchaseOrder"
  | "eod"
  | "label";

export interface PrintPurposeMeta {
  id: PrintPurpose;
  label: string;
  hint: string;
  /** Paper this document is rendered for — used to warn on a mismatched profile. */
  paper: PrinterPaper;
}

export const PRINT_PURPOSES: PrintPurposeMeta[] = [
  { id: "receipt",          label: "Sale receipt",        hint: "Printed at the end of a POS sale",        paper: "80mm" },
  { id: "refund",           label: "Refund receipt",      hint: "Printed when a sale is refunded",          paper: "80mm" },
  { id: "serviceJobDocket", label: "Service docket (80mm)", hint: "Thermal job docket for the counter",     paper: "80mm" },
  { id: "serviceJobSheet",  label: "Service job sheet (A4)", hint: "Full A4 job sheet with signature area", paper: "a4"   },
  { id: "invoice",          label: "Tax invoice",         hint: "A4 invoice",                               paper: "a4"   },
  { id: "quote",            label: "Quote",               hint: "A4 quote",                                 paper: "a4"   },
  { id: "a4Receipt",        label: "A4 receipt",          hint: "Full-page receipt",                        paper: "a4"   },
  { id: "purchaseOrder",    label: "Purchase order",      hint: "A4 purchase order",                        paper: "a4"   },
  { id: "eod",              label: "End-of-day report",   hint: "Register close / cash-up report",          paper: "a4"   },
  { id: "label",            label: "Labels & stickers",   hint: "Product, repair, customer and address labels", paper: "label" },
];

export interface PrinterProfile {
  /** Stable key referenced by `routing`. */
  id: string;
  label: string;
  transport: PrinterTransport;
  paper: PrinterPaper;
  /** ESC/POS model preset (thermal profiles only). */
  model?: string;
  /**
   * OS print-queue name used by the bridge transport. Left blank the bridge
   * prints to the machine's default printer. A till whose queue is named
   * differently can override this locally — see `setPrinterOverride`.
   */
  bridgePrinterName?: string;
  ipAddress?: string;
  port?: string;
}

export interface PrintBridgeCfg {
  /** Master switch — off means every document takes the legacy browser path. */
  enabled: boolean;
}

export interface HardwareCfg {
  cashDrawer: CashDrawerCfg;
  printer: PrinterCfg;
  scanner: ScannerCfg;
  printers: PrinterProfile[];
  /** purpose → printer profile id. An unmapped purpose falls back to the browser. */
  routing: Partial<Record<PrintPurpose, string>>;
  bridge: PrintBridgeCfg;
}

/** Profile ids created by the migration; also the defaults for a fresh merchant. */
export const RECEIPT_PROFILE_ID = "receipt-printer";
export const DOCUMENT_PROFILE_ID = "document-printer";
export const LABEL_PROFILE_ID = "label-printer";

export const DEFAULT_ROUTING: Partial<Record<PrintPurpose, string>> = {
  receipt: RECEIPT_PROFILE_ID,
  refund: RECEIPT_PROFILE_ID,
  serviceJobDocket: RECEIPT_PROFILE_ID,
  serviceJobSheet: DOCUMENT_PROFILE_ID,
  invoice: DOCUMENT_PROFILE_ID,
  quote: DOCUMENT_PROFILE_ID,
  a4Receipt: DOCUMENT_PROFILE_ID,
  purchaseOrder: DOCUMENT_PROFILE_ID,
  eod: DOCUMENT_PROFILE_ID,
  label: LABEL_PROFILE_ID,
};

export const DEFAULT_HW: HardwareCfg = {
  cashDrawer: { enabled: false, interface: "usb",     openOnCashSale: true,  pulseMs: 200 },
  printer:    { enabled: false, type: "thermal", connection: "usb", model: "partner-rp700", paperWidth: "80mm", autoPrintOnSale: false, autoPrintOnRefund: false, ipAddress: "", port: "9100" },
  scanner:    { enabled: false, interface: "usb-hid", beepOnScan: true,      prefix: "", suffix: "" },
  printers: [],
  routing: {},
  bridge: { enabled: false },
};

/**
 * Build the starting profile list for a config that predates profiles. The
 * receipt profile mirrors whatever the merchant already configured, and the
 * document profile keeps A4 on the existing browser-dialog path — so parsing an
 * old config changes nothing about how anything prints today.
 */
function seedProfiles(printer: PrinterCfg): PrinterProfile[] {
  return [
    {
      id: RECEIPT_PROFILE_ID,
      label: "Receipt printer",
      transport: resolvePrinterConnection(printer),
      paper: printer.paperWidth,
      model: printer.model,
      bridgePrinterName: "",
      ipAddress: printer.ipAddress,
      port: printer.port,
    },
    {
      id: DOCUMENT_PROFILE_ID,
      label: "Document printer (A4)",
      transport: "system",
      paper: "a4",
      bridgePrinterName: "",
    },
    {
      // Label printers are usually shared across the shop rather than sitting on
      // one till, so this profile is seeded for the bridge. Until the bridge is
      // paired it falls back to the browser print dialog, exactly as before.
      id: LABEL_PROFILE_ID,
      label: "Label printer",
      transport: "bridge",
      paper: "label",
      bridgePrinterName: "",
    },
  ];
}

/** Parse the stored `hardwareConfig` JSON, tolerating absent/legacy fields. */
export function parseHardwareConfig(json: string | null | undefined): HardwareCfg {
  let parsed: Partial<HardwareCfg> = {};
  if (json) {
    try {
      parsed = JSON.parse(json) as Partial<HardwareCfg>;
    } catch {
      parsed = {}; // fall through to defaults
    }
  }
  const savedPrinter: Partial<PrinterCfg> = parsed.printer ?? {};
  const printer: PrinterCfg = {
    ...DEFAULT_HW.printer,
    ...savedPrinter,
    // `connection` was added after `type`. Spreading the defaults first would
    // otherwise stamp "usb" onto an older config that only recorded `type`, and
    // the app would try WebUSB on a network/system printer.
    connection: savedPrinter.connection
      ?? (savedPrinter.type ? connectionFromLegacyType(savedPrinter.type) : DEFAULT_HW.printer.connection),
  };
  const printers = Array.isArray(parsed.printers) && parsed.printers.length
    ? parsed.printers.filter((p): p is PrinterProfile => !!p && typeof p.id === "string")
    : seedProfiles(printer);
  return {
    cashDrawer: { ...DEFAULT_HW.cashDrawer, ...parsed.cashDrawer },
    printer,
    scanner:    { ...DEFAULT_HW.scanner,    ...parsed.scanner },
    printers,
    routing: { ...DEFAULT_ROUTING, ...(parsed.routing ?? {}) },
    bridge: { ...DEFAULT_HW.bridge, ...parsed.bridge },
  };
}

/** The transport an old config's `type` field implied before `connection` existed. */
function connectionFromLegacyType(type: PrinterCfg["type"]): PrinterTransport {
  if (type === "thermal") return "usb";
  if (type === "network") return "network";
  return "system";
}

/** How to reach the printer, deriving from the legacy `type` when `connection`
 *  hasn't been set on an older saved config. */
export function resolvePrinterConnection(p: PrinterCfg): PrinterTransport {
  return p.connection ?? connectionFromLegacyType(p.type);
}

/** The profile a purpose routes to, or undefined when it isn't routed anywhere. */
export function profileForPurpose(hw: HardwareCfg, purpose: PrintPurpose): PrinterProfile | undefined {
  const id = hw.routing[purpose];
  if (!id) return undefined;
  return hw.printers.find((p) => p.id === id);
}

/** True when the profile prints on a thermal roll and can take ESC/POS bytes. */
export function isThermalProfile(p: PrinterProfile | undefined): boolean {
  return !!p && (p.paper === "80mm" || p.paper === "58mm");
}

/** Thermal paper width for a profile, for the ESC/POS encoders. */
export function thermalWidth(p: PrinterProfile | undefined): "80mm" | "58mm" {
  return p?.paper === "58mm" ? "58mm" : "80mm";
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
