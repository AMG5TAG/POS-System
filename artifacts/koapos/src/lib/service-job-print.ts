/* ─── Service job printing ────────────────────────────────────────────────────
 * A service job prints in two shapes and the merchant picks which:
 *
 *   • "a4"   — the full ServiceJobSheet, signature area, call-history grid, photos
 *   • "80mm" — the ServiceJobDocket, the same fields folded onto a receipt roll
 *
 * Which one a job *defaults* to comes from the saved Service Ticket template: the
 * catalogue offers A4 styles and 80mm thermal styles side by side, so picking a
 * thermal style is itself the paper choice (and picks the docket's density).
 *
 * They are separate print *purposes* (`serviceJobSheet` / `serviceJobDocket`) so
 * Hardware settings can route the A4 sheet at the office laser and the docket at
 * the counter thermal printer at the same time.
 *
 * This module owns the routing decision for both; the pages own the print-area
 * markup and their existing browser fallback.
 */
import type { HardwareCfg } from "@/lib/hardware-config";
import { isSilentRoute, printDocument, type PrintMethod } from "@/lib/print-router";
import { buildServiceJobDocketBytes } from "@/lib/escpos-service-job";
import { standaloneHtmlFrom } from "@/lib/print-dom";
import {
  isThermalServiceStyle, serviceDocketDensity, type ServiceDocketDensity,
} from "@/lib/service-sheet-fields";
import type { ServiceSheetBranding, ServiceSheetData } from "@/components/printing/ServiceJobSheet";
import type { TplOpts } from "@/pages/app/management-templates";

export type ServicePaper = "a4" | "80mm";

export const SERVICE_PAPER_LABEL: Record<ServicePaper, { title: string; detail: string }> = {
  a4: { title: "A4 sheet", detail: "Full job sheet + signature" },
  "80mm": { title: "80mm docket", detail: "Thermal counter docket" },
};

/**
 * Paper pre-selected from the saved Service Ticket template.
 *
 * An 80mm thermal *style* is a paper choice in itself, so it wins outright. Only
 * when the saved style is one of the A4 sheet layouts does the "Default Paper"
 * option decide — which is what keeps merchants who set 80mm before the thermal
 * styles existed printing exactly what they print today.
 */
export function serviceJobPaperFromOpts(
  opts: Pick<TplOpts, "serviceSheetPaper">,
  selectedStyle?: string | null,
): ServicePaper {
  if (isThermalServiceStyle(selectedStyle)) return "80mm";
  return opts.serviceSheetPaper === "80mm" ? "80mm" : "a4";
}

/** Docket density for the saved Service Ticket style. Re-exported for the pages. */
export { serviceDocketDensity };
export type { ServiceDocketDensity };

/**
 * True when this paper choice can print without the OS dialog on this device.
 * Pages use it to decide how many copies to lay out in the print area: a silent
 * route prints the copies itself, the browser path needs them in the markup.
 */
export function isServiceJobRouteSilent(hw: HardwareCfg, paper: ServicePaper): boolean {
  return paper === "80mm"
    ? isSilentRoute(hw, "serviceJobDocket", true)
    : isSilentRoute(hw, "serviceJobSheet", false);
}

export interface ServiceJobPrintArgs {
  paper: ServicePaper;
  copies: number;
  hw: HardwareCfg;
  data: ServiceSheetData;
  branding: ServiceSheetBranding;
  opts: TplOpts;
  fontCss: string;
  /** Docket density from the saved style — ignored when the paper is A4. */
  density?: ServiceDocketDensity;
  /** Mounted print-area element id, serialized when the bridge renders the HTML. */
  elementId: string;
  /** The page's existing window.print() flow — used when nothing silent applies. */
  browserFallback: () => void | Promise<void>;
}

/** Route one service job to whichever printer the merchant mapped it to. */
export function printServiceJobDocument(args: ServiceJobPrintArgs): Promise<PrintMethod> {
  const { paper, hw, data, branding, opts, fontCss, elementId } = args;
  const silent = isServiceJobRouteSilent(hw, paper);

  return printDocument({
    purpose: paper === "80mm" ? "serviceJobDocket" : "serviceJobSheet",
    hw,
    jobName: `Service job ${data.jobNumber}`,
    // A silent transport repeats the job itself; the browser path already has
    // every copy laid out in the print area, so it must only fire once.
    copies: silent ? args.copies : 1,
    paper: paper === "80mm" ? "80mm" : "A4",
    escpos: paper === "80mm"
      ? (paperWidth) => buildServiceJobDocketBytes(data, branding, opts, paperWidth, args.density)
      : undefined,
    html: () => standaloneHtmlFrom(document.getElementById(elementId), {
      title: `Service job ${data.jobNumber}`,
      fontCss,
    }),
    browserFallback: args.browserFallback,
  });
}
