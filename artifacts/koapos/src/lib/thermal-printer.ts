/* ─── Thermal printer driver ──────────────────────────────────────────────────
 * Receipt-specific entry points on top of the shared print router. Routing,
 * transport selection and fallbacks all live in print-router.ts; this module
 * just builds the right ESC/POS bytes for a receipt and names the purpose.
 *
 * The WebUSB/Web Serial plumbing moved to escpos-transport.ts and is re-exported
 * here so existing callers (Hardware settings) keep working unchanged.
 */
import type { Transaction } from "@workspace/api-client-react";
import { printReceipt as rawPrintReceipt, type ReceiptBusinessInfo, type ReceiptTemplateOpts } from "@/lib/print-receipt";
import { buildReceiptBytes, buildTestReceiptBytes, cashDrawerKickBytes } from "@/lib/escpos";
import {
  profileForPurpose, thermalWidth,
  type HardwareCfg, type PrintPurpose,
} from "@/lib/hardware-config";
import { bridgePrintRaw } from "@/lib/print-bridge";
import { bridgeUsable, kickCashDrawer, printDocument, resolveQueueName, type PrintMethod } from "@/lib/print-router";
import { sendNativeBytes } from "@/lib/escpos-transport";

export {
  connectUsbPrinter, connectSerialPrinter, isWebUsbSupported, isWebSerialSupported,
} from "@/lib/escpos-transport";
export type { PrintMethod } from "@/lib/print-router";

/**
 * Print a receipt for a sale or refund. Goes out as raw ESC/POS over WebUSB /
 * Web Serial or the Print Bridge when either is available, and falls back to the
 * HTML print path so a sale is never blocked. Also kicks the cash drawer on cash
 * sales when configured.
 */
export async function printThermalReceipt(
  tx: Transaction,
  businessInfo: ReceiptBusinessInfo | undefined,
  opts: ReceiptTemplateOpts | undefined,
  hw: HardwareCfg,
  purpose: PrintPurpose = "receipt",
): Promise<PrintMethod> {
  const method = await printDocument({
    purpose,
    hw,
    jobName: `Receipt ${tx.receiptNumber ?? tx.id ?? ""}`.trim(),
    escpos: (paperWidth) => buildReceiptBytes(tx, businessInfo, opts, { ...hw.printer, paperWidth }),
    browserFallback: () => rawPrintReceipt(tx, businessInfo, opts),
  });

  const wasSilent = method !== "browser";
  const isCash = (tx.paymentMethod ?? "").toLowerCase() === "cash";
  if (wasSilent && hw.cashDrawer.enabled && hw.cashDrawer.openOnCashSale && isCash) {
    await openCashDrawer(hw).catch(() => { /* drawer is optional — never block the sale */ });
  }
  return method;
}

/** Fire the cash-drawer kick pulse over the receipt printer's connection. */
export async function openCashDrawer(hw: HardwareCfg): Promise<void> {
  await kickCashDrawer(hw, cashDrawerKickBytes(hw.cashDrawer.pulseMs));
}

/**
 * Print the Hardware-settings self-test ticket for one printer profile. Defaults
 * to whichever profile the sale receipt is routed to.
 */
export async function printTestReceipt(hw: HardwareCfg, profileId?: string): Promise<PrintMethod> {
  const profile = profileId
    ? hw.printers.find((p) => p.id === profileId)
    : profileForPurpose(hw, "receipt");
  if (!profile) throw new Error("No printer profile selected for the test print.");

  const bytes = buildTestReceiptBytes({ ...hw.printer, paperWidth: thermalWidth(profile) });

  if (profile.transport === "usb" || profile.transport === "serial") {
    await sendNativeBytes(profile.transport, bytes);
    return profile.transport;
  }
  if (profile.transport === "bridge") {
    if (!bridgeUsable(hw)) {
      throw new Error("Turn the Print Bridge on and pair this device before running a bridge test print.");
    }
    await bridgePrintRaw({ printer: resolveQueueName(profile), data: bytes, jobName: "KoaPOS test ticket" });
    return "bridge-raw";
  }
  throw new Error(
    "Test print needs a USB, serial, or Print Bridge connection. Network/system printers print via a normal sale.",
  );
}
