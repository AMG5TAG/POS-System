/* ─── ESC/POS receipt encoder ─────────────────────────────────────────────────
 * Builds raw ESC/POS command bytes for a thermal receipt from the same
 * Transaction + business info + template opts the HTML receipt uses. Targets the
 * standard ESC/POS command set shared by Partner Tech RP-700/630/600 and most
 * other 80mm/58mm thermal printers (auto-cutter via GS V, cash-drawer kick via
 * ESC p). Text-only: logos/QR/barcodes stay on the HTML path.
 */
import type { Transaction } from "@workspace/api-client-react";
import {
  buildTemplateVars, applyTemplateVars,
  type ReceiptBusinessInfo, type ReceiptTemplateOpts,
} from "@/lib/print-receipt";
import type { PrinterCfg } from "@/lib/hardware-config";

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** Printable columns for a monospaced ESC/POS Font A at the given paper width. */
export function charsPerLine(paperWidth: "80mm" | "58mm"): number {
  return paperWidth === "58mm" ? 32 : 48;
}

/**
 * Fold text to the printer's single-byte code page. ESC/POS Font A can't render
 * arbitrary Unicode (emoji, en/em dashes, curly quotes), so map the common cases
 * to ASCII and drop anything else — otherwise it prints as garbage bytes.
 */
export function toAscii(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/[—–]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[•·]/g, "*")
    .replace(/×/g, "x")
    .replace(/[^\x20-\x7E]/g, "");
}

function fmtAUD(n: number): string {
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
}

/** Left label + right value packed to `width`, truncating the label if needed. */
export function cols(left: string, right: string, width: number): string {
  const r = toAscii(right);
  let l = toAscii(left);
  const maxL = width - r.length - 1;
  if (maxL < 1) return r.slice(0, width);
  if (l.length > maxL) l = l.slice(0, maxL);
  const gap = Math.max(1, width - l.length - r.length);
  return l + " ".repeat(gap) + r;
}

/** Small fluent builder accumulating ESC/POS bytes. */
export class EscPos {
  private buf: number[] = [];
  raw(...b: number[]): this { for (const x of b) this.buf.push(x & 0xff); return this; }
  text(s: string): this { for (const ch of toAscii(s)) this.buf.push(ch.charCodeAt(0) & 0xff); return this; }
  line(s = ""): this { this.text(s); this.buf.push(LF); return this; }
  init(): this { return this.raw(ESC, 0x40); }
  align(a: "left" | "center" | "right"): this { return this.raw(ESC, 0x61, a === "center" ? 1 : a === "right" ? 2 : 0); }
  bold(on: boolean): this { return this.raw(ESC, 0x45, on ? 1 : 0); }
  /** GS ! — double width+height when `on`, normal otherwise. */
  double(on: boolean): this { return this.raw(GS, 0x21, on ? 0x11 : 0x00); }
  feed(n = 1): this { return this.raw(ESC, 0x64, n & 0xff); }
  /** GS V — feed then partial cut. */
  cut(): this { return this.raw(GS, 0x56, 66, 3); }
  /**
   * GS ( k — native QR code. Uses the Epson-standard model-2 sequence that
   * Partner Tech and virtually every other ESC/POS thermal printer implements:
   * select model, set module size, set error correction, store the payload,
   * then print it. Long payloads are skipped rather than truncated into an
   * unscannable code.
   */
  qr(data: string, moduleSize = 6): this {
    const bytes = Array.from(toAscii(data), (ch) => ch.charCodeAt(0) & 0xff);
    if (!bytes.length || bytes.length > 700) return this;
    const store = bytes.length + 3;
    return this
      .raw(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00)              // model 2
      .raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, Math.max(1, Math.min(16, moduleSize)))
      .raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31)                     // error correction M
      .raw(GS, 0x28, 0x6b, store & 0xff, (store >> 8) & 0xff, 0x31, 0x50, 0x30, ...bytes)
      .raw(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);                    // print
  }
  build(): Uint8Array { return new Uint8Array(this.buf); }
}

/** Break `text` into lines no wider than `width`, splitting on whitespace. */
export function wrap(text: string | null | undefined, width: number): string[] {
  // Split before folding to ASCII: toAscii drops every byte outside the printable
  // range, newlines included, which would glue a multi-line note into one run.
  const paragraphs = (text ?? "").replace(/\r/g, "").split("\n");
  if (!paragraphs.some((p) => toAscii(p).trim())) return [];
  const out: string[] = [];
  for (const raw of paragraphs) {
    const paragraph = toAscii(raw);
    if (!paragraph.trim()) { out.push(""); continue; }
    let line = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      if (!line.length) {
        line = word;
      } else if (line.length + 1 + word.length <= width) {
        line += ` ${word}`;
      } else {
        out.push(line);
        line = word;
      }
      // A single word longer than the roll gets hard-split so it can't vanish.
      while (line.length > width) {
        out.push(line.slice(0, width));
        line = line.slice(width);
      }
    }
    if (line.length) out.push(line);
  }
  return out;
}

/** ESC p — cash-drawer kick pulse (pin 2). `pulseMs` in ~2ms units, clamped. */
export function cashDrawerKickBytes(pulseMs = 200): Uint8Array {
  const t = Math.max(1, Math.min(255, Math.round(pulseMs / 2)));
  return new Uint8Array([ESC, 0x70, 0x00, t, t]);
}

/**
 * Encode a full receipt to ESC/POS bytes. Mirrors the HTML receipt's content
 * (header, items, totals, payment, thank-you/footer) and finishes with a feed +
 * auto-cut. `{{...}}` template placeholders are resolved the same way as the HTML
 * path via buildTemplateVars/applyTemplateVars.
 */
export function buildReceiptBytes(
  tx: Transaction,
  businessInfo: ReceiptBusinessInfo | undefined,
  opts: ReceiptTemplateOpts | undefined,
  printer: PrinterCfg,
): Uint8Array {
  const width = charsPerLine(printer.paperWidth);
  const o: ReceiptTemplateOpts = {
    showAbn: true, showWebsite: true, showGstBreakdown: true, showPaymentMethods: true,
    showSerialNumber: true, thankYouMsg: "Thank you for your purchase!", ...opts,
  };
  const vars = buildTemplateVars(tx, businessInfo);
  const resolve = (t?: string) => toAscii(applyTemplateVars(t, vars)).trim();

  const created = tx.createdAt ? new Date(tx.createdAt) : new Date();
  const dateStr = created.toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeStr = created.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
  const receiptNum = tx.receiptNumber ? `#${tx.receiptNumber}` : `#${tx.id ?? ""}`;

  const items = (tx.items ?? []) as Array<{ productName?: string; quantity?: number; unitPrice?: number; totalPrice?: number; serials?: string[] }>;
  const divider = "-".repeat(width);

  const b = new EscPos().init();

  // Header
  b.align("center").bold(true).double(true).line(toAscii(businessInfo?.businessName ?? "Your Store")).double(false);
  if (o.showAbn && businessInfo?.abn) b.line(`ABN ${toAscii(businessInfo.abn)}`);
  if (o.showWebsite && businessInfo?.website) b.line(toAscii(businessInfo.website));
  if (businessInfo?.phone) b.line(toAscii(businessInfo.phone));
  b.bold(false);
  b.line(`${dateStr} ${timeStr}`);
  b.line(`Receipt ${toAscii(receiptNum)}`);
  const header = resolve(o.headerText);
  if (header) b.line().line(header);

  // Items
  b.align("left").line(divider);
  if (items.length) {
    for (const it of items) {
      const qty = it.quantity ?? 1;
      const lineTotal = it.totalPrice ?? (it.unitPrice ?? 0) * qty;
      b.line(toAscii(it.productName ?? "Item"));
      b.line(cols(`  ${qty} x ${fmtAUD(it.unitPrice ?? lineTotal / Math.max(1, qty))}`, fmtAUD(lineTotal), width));
      if (o.showSerialNumber !== false && it.serials?.length) {
        b.line(`  S/N: ${toAscii(it.serials.join(", "))}`);
      }
    }
  } else {
    b.line("No items");
  }

  // Totals
  b.line(divider);
  b.line(cols("Subtotal", fmtAUD(Number(tx.subtotal ?? 0)), width));
  if (o.showGstBreakdown) b.line(cols("GST (incl.)", fmtAUD(Number(tx.taxTotal ?? 0)), width));
  const discountTotal = Number((tx as { discountTotal?: number | null }).discountTotal ?? 0);
  if (discountTotal > 0) {
    const label = o.overallDiscountPct ? `${o.overallDiscountPct}% discount` : "Discount";
    b.line(cols(label, `-${fmtAUD(discountTotal)}`, width));
  }
  b.bold(true).line(cols("TOTAL AUD", fmtAUD(Number(tx.total ?? 0)), width)).bold(false);
  const pm = (tx.paymentMethod ?? "").toUpperCase();
  if (o.showPaymentMethods && pm) b.line(cols(pm, "Approved", width));

  // Footer
  b.line(divider).align("center");
  const thankYou = resolve(o.thankYouMsg);
  const footer = resolve(o.footerText);
  const custom = resolve(o.customMessage);
  if (thankYou) b.line(thankYou);
  if (footer) b.line(footer);
  if (custom) for (const l of custom.split("\n")) b.line(l);

  b.feed(3).cut();
  return b.build();
}

/** A short self-test ticket for the Hardware settings "Print test" button. */
export function buildTestReceiptBytes(printer: PrinterCfg): Uint8Array {
  const width = charsPerLine(printer.paperWidth);
  const b = new EscPos().init();
  b.align("center").bold(true).double(true).line("TEST RECEIPT").double(false).bold(false);
  b.line(`${printer.paperWidth} - ${width} cols`);
  b.align("left").line("-".repeat(width));
  b.line(cols("ESC/POS driver", "OK", width));
  b.line(cols("Auto-cutter", "GS V", width));
  b.line(cols("Cash drawer", "ESC p", width));
  b.line("-".repeat(width));
  b.align("center").line("If you can read this,").line("your printer is connected.");
  b.feed(3).cut();
  return b.build();
}
