/* ─── ESC/POS service job docket ──────────────────────────────────────────────
 * The 80mm counter docket for a service job — the thermal counterpart to the A4
 * ServiceJobSheet. Same data, same template toggles (Management › Templates ›
 * Service Ticket), folded onto a receipt roll so it prints silently on the till's
 * ESC/POS printer instead of going through the OS print dialog.
 *
 * Text + native QR only: photos and captured signatures can't go down a thermal
 * roll, so the docket prints a signature *line* and leaves photos to the A4 sheet.
 */
import { EscPos, charsPerLine, cols, toAscii, wrap } from "@/lib/escpos";
import { techAppJobUrl } from "@/lib/public-url";
import { humanizeStatus, mergeCredentialLines } from "@/lib/service-sheet-fields";
import type { ServiceSheetBranding, ServiceSheetData } from "@/components/printing/ServiceJobSheet";
import type { TplOpts } from "@/pages/app/management-templates";

/**
 * Encode a service job docket to ESC/POS bytes, finishing with a feed + auto-cut.
 * `copies` is handled by the caller so each copy is a separate print job.
 */
export function buildServiceJobDocketBytes(
  data: ServiceSheetData,
  branding: ServiceSheetBranding,
  opts: TplOpts,
  paperWidth: "80mm" | "58mm",
): Uint8Array {
  const width = charsPerLine(paperWidth);
  const divider = "-".repeat(width);
  const b = new EscPos().init();

  const section = (title: string) => {
    b.line(divider).bold(true).line(title).bold(false);
  };
  const field = (label: string, value: string | undefined | null) => {
    const v = toAscii(value).trim();
    if (!v) return;
    // Short values sit on the label line; long ones wrap underneath it.
    const inline = `${label}: ${v}`;
    if (inline.length <= width) { b.line(inline); return; }
    b.line(`${label}:`);
    for (const l of wrap(v, width - 2)) b.line(`  ${l}`);
  };
  const block = (value: string | undefined | null) => {
    for (const l of wrap(value, width)) b.line(l);
  };

  /* ── Header ─────────────────────────────────────────────────────────────── */
  b.align("center");
  b.bold(true).double(true).line(branding.businessName || "Service Centre").double(false);
  if (opts.showAbn && branding.abn) b.line(`ABN ${toAscii(branding.abn)}`);
  if (branding.address) b.line(toAscii(branding.address));
  if (opts.showWebsite && branding.website) b.line(toAscii(branding.website));
  if (branding.email) b.line(toAscii(branding.email));
  b.line();
  b.line(toAscii(opts.headerText).replace(/<[^>]*>/g, "").trim() || "SERVICE JOB");
  b.bold(false);

  /* ── Job identity ───────────────────────────────────────────────────────── */
  b.line(divider);
  b.bold(true).double(true).line(data.jobNumber).double(false).bold(false);
  const dateStr = data.date ? new Date(data.date).toLocaleDateString("en-AU") : "";
  b.align("left");
  if (dateStr) b.line(cols("Date", dateStr, width));
  b.line(cols("Status", humanizeStatus(data.status), width));

  const flags = [
    data.isCritical ? "CRITICAL" : "",
    data.isUnderWarranty ? "WARRANTY" : "",
    data.isPartnerRepair ? `PARTNER REPAIR${data.partnerRepairCode ? ` ${data.partnerRepairCode}` : ""}` : "",
  ].filter(Boolean);
  if (flags.length) {
    b.align("center").bold(true);
    for (const f of flags) b.line(`** ${f} **`);
    b.bold(false).align("left");
  }

  /* ── Customer ───────────────────────────────────────────────────────────── */
  if (opts.showCustomerDetails) {
    section("CUSTOMER");
    field("Name", data.customerName || "Walk-in");
    field("Phone", data.customerPhone);
    field("Email", data.customerEmail);
  }

  /* ── Device ─────────────────────────────────────────────────────────────── */
  if (opts.showDeviceDetails) {
    section("DEVICE");
    field("Type", data.deviceType);
    field("Model", data.deviceModel);
    field("Serial", data.serialNumber);
    field("Condition", data.condition);
  }

  /* ── Fault / work required ──────────────────────────────────────────────── */
  if (opts.showWorkDescription) {
    section("FAULT / WORK REQUIRED");
    block(data.workDescription || "-");
  }

  if (data.additionalEquipment) {
    section("ACCESSORIES RECEIVED");
    block(data.additionalEquipment);
  }

  /* ── Logins — opt-in, since the docket often goes to the customer ───────── */
  if (opts.showLogins) {
    const credentials = mergeCredentialLines(data.accounts, data.logins);
    if (credentials.length) {
      section("LOGINS / ACCOUNTS");
      for (const line of credentials) block(line);
    }
  }

  if (opts.showFormsFiles && data.formsFiles?.length) {
    section("FORMS AND FILES");
    for (const f of data.formsFiles) {
      block(f.detail ? `${f.name} (${f.detail})` : f.name);
    }
  }

  if (data.notes) {
    section("NOTES");
    block(data.notes);
  }

  if (opts.warrantyText) {
    b.line(divider);
    block(opts.warrantyText);
  }

  /* ── Signature line ─────────────────────────────────────────────────────── */
  if (opts.showSignature) {
    b.line(divider).line();
    b.line("X" + "_".repeat(Math.max(4, width - 2)));
    b.line("Customer signature");
  }

  /* ── Tech App QR ────────────────────────────────────────────────────────── */
  b.line(divider).align("center");
  if (opts.showServiceQr !== false && data.jobId != null) {
    const target = techAppJobUrl(branding.techAppUsername, data.jobId);
    if (target) {
      b.qr(target, paperWidth === "58mm" ? 4 : 6);
      b.line("Scan to open in the Tech App");
      b.line(toAscii(data.jobNumber));
    }
  }

  const footer = toAscii(opts.footerText).replace(/<[^>]*>/g, "").trim();
  if (footer) { b.line(); block(footer); }

  b.feed(3).cut();
  return b.build();
}
