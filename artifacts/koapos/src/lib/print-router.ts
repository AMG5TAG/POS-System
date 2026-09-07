/* ─── Print router ────────────────────────────────────────────────────────────
 * One entry point for every printed document. Given a *purpose* (sale receipt,
 * A4 service sheet, purchase order…) it resolves the printer profile the
 * merchant routed that purpose to and picks the best transport that can reach it
 * without a print dialog:
 *
 *   1. WebUSB / Web Serial  — raw ESC/POS straight from the browser (thermal only)
 *   2. Print Bridge (raw)   — raw ESC/POS to a *named* OS queue (thermal only)
 *   3. Print Bridge (HTML)  — HTML → PDF → a named OS queue (any paper)
 *   4. Browser              — the legacy window.print() path, dialog and all
 *
 * Every step degrades to the next, so a sale is never blocked by a printer
 * problem: the worst case is the operator seeing the print dialog they see today.
 */
import {
  isThermalProfile, profileForPurpose, thermalWidth,
  type HardwareCfg, type PrinterProfile, type PrintPurpose,
} from "@/lib/hardware-config";
import { sendNativeBytes } from "@/lib/escpos-transport";
import {
  bridgeOpenDrawer, bridgePrintHtml, bridgePrintRaw, getPrinterOverrides, isBridgePaired,
  type BridgePaper,
} from "@/lib/print-bridge";

export type PrintMethod = "usb" | "serial" | "bridge-raw" | "bridge-html" | "browser";

export interface PrintJob {
  purpose: PrintPurpose;
  hw: HardwareCfg;
  /** ESC/POS bytes for a thermal target, built at the resolved paper width. */
  escpos?: (paperWidth: "80mm" | "58mm") => Uint8Array;
  /** A complete standalone HTML document for a paper target. */
  html?: () => string;
  /** Paper hint for the bridge's HTML renderer. Defaults from the profile. */
  paper?: BridgePaper;
  /** Measured document length in mm — only meaningful when printing to a roll. */
  heightMm?: number;
  copies?: number;
  jobName?: string;
  /**
   * The existing browser print path for this document (window.print(), a hidden
   * print area, a popup). Used when no silent transport is available so nothing
   * regresses for merchants who haven't set the bridge up.
   */
  browserFallback?: () => void | Promise<void>;
}

/** The OS queue a profile should print to on *this* machine. */
export function resolveQueueName(profile: PrinterProfile): string {
  return getPrinterOverrides()[profile.id] || profile.bridgePrinterName || "";
}

/** True when the bridge is switched on for the merchant and paired on this device. */
export function bridgeUsable(hw: HardwareCfg): boolean {
  return hw.bridge.enabled && isBridgePaired();
}

function paperFor(profile: PrinterProfile | undefined, requested: BridgePaper | undefined): BridgePaper {
  if (requested) return requested;
  if (profile?.paper === "80mm") return "80mm";
  if (profile?.paper === "58mm") return "58mm";
  // Label stock: the sticker renderer already declares the exact die-cut size in
  // its own `@page` rule, so the bridge must not override it.
  if (profile?.paper === "label") return "auto";
  return "A4";
}

/** Print an HTML document through a hidden iframe — no popup blocker, no new tab. */
export function printHtmlViaIframe(html: string): boolean {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);
  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) { iframe.remove(); return false; }

  let removed = false;
  const cleanup = () => { if (!removed) { removed = true; window.setTimeout(() => iframe.remove(), 1000); } };

  doc.open();
  doc.write(html);
  doc.close();
  win.addEventListener("afterprint", cleanup, { once: true });
  // Give images/fonts a beat to settle before the dialog captures the page.
  window.setTimeout(() => {
    try { win.focus(); win.print(); } catch { iframe.remove(); return; }
    window.setTimeout(cleanup, 30_000);
  }, 250);
  return true;
}

/**
 * Route one document to the best available printer. Returns the transport that
 * actually carried it, so callers can tell the operator whether the print was
 * silent or went to the dialog.
 */
export async function printDocument(job: PrintJob): Promise<PrintMethod> {
  const { hw, purpose } = job;
  const profile = profileForPurpose(hw, purpose);
  const copies = Math.max(1, Math.min(20, job.copies ?? 1));
  const jobName = job.jobName ?? "KoaPOS";

  if (profile && job.escpos && isThermalProfile(profile)) {
    const bytes = job.escpos(thermalWidth(profile));

    // 1. Browser-native ESC/POS. Gated on the receipt-printer master switch,
    //    which is what grants the WebUSB/Web Serial device in the first place.
    if ((profile.transport === "usb" || profile.transport === "serial") && hw.printer.enabled) {
      try {
        for (let i = 0; i < copies; i++) await sendNativeBytes(profile.transport, bytes);
        return profile.transport;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`Native ESC/POS print failed for "${purpose}" — trying the next transport.`, err);
      }
    }

    // 2. Raw ESC/POS through the bridge, to a named queue. Only for profiles
    //    actually configured as bridge printers — a USB profile that just failed
    //    has no queue name, so this would fire ESC/POS at whatever the machine's
    //    default printer happens to be.
    if (profile.transport === "bridge" && bridgeUsable(hw)) {
      try {
        await bridgePrintRaw({ printer: resolveQueueName(profile), data: bytes, jobName, copies });
        return "bridge-raw";
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`Print bridge (raw) failed for "${purpose}" — falling back.`, err);
      }
    }
  }

  // 3. HTML rendered and printed silently by the bridge.
  if (job.html && bridgeUsable(hw) && profile && profile.transport === "bridge") {
    try {
      await bridgePrintHtml({
        printer: resolveQueueName(profile),
        html: job.html(),
        paper: paperFor(profile, job.paper),
        heightMm: job.heightMm,
        jobName,
        copies,
      });
      return "bridge-html";
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`Print bridge (HTML) failed for "${purpose}" — falling back to the browser.`, err);
    }
  }

  // 4. Whatever this document did before the router existed.
  if (job.browserFallback) {
    await job.browserFallback();
    return "browser";
  }
  if (job.html) {
    printHtmlViaIframe(job.html());
    return "browser";
  }
  throw new Error(`Nothing could print "${purpose}" — no printer is routed and no fallback was supplied.`);
}

/** True when the resolved route for this purpose prints without a dialog. */
export function isSilentRoute(hw: HardwareCfg, purpose: PrintPurpose, wantsEscpos: boolean): boolean {
  const profile = profileForPurpose(hw, purpose);
  if (!profile) return false;
  if (wantsEscpos && isThermalProfile(profile)) {
    if ((profile.transport === "usb" || profile.transport === "serial") && hw.printer.enabled) return true;
    if (profile.transport === "bridge" && bridgeUsable(hw)) return true;
    return false;
  }
  return profile.transport === "bridge" && bridgeUsable(hw);
}

/** Fire the cash-drawer kick down whichever transport the receipt printer uses. */
export async function kickCashDrawer(hw: HardwareCfg, bytes: Uint8Array): Promise<PrintMethod> {
  const profile = profileForPurpose(hw, "receipt");
  if (profile && (profile.transport === "usb" || profile.transport === "serial") && hw.printer.enabled) {
    await sendNativeBytes(profile.transport, bytes);
    return profile.transport;
  }
  if (profile?.transport === "bridge" && bridgeUsable(hw)) {
    await bridgeOpenDrawer(resolveQueueName(profile), hw.cashDrawer.pulseMs);
    return "bridge-raw";
  }
  throw new Error(
    "Cash-drawer kick needs the receipt printer on a USB/serial connection, or a paired Print Bridge.",
  );
}
