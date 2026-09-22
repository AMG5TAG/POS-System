import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ServiceJobDocket } from "@/components/printing/ServiceJobDocket";
import type { ServiceSheetBranding, ServiceSheetData } from "@/components/printing/ServiceJobSheet";
import { DEFAULT_OPTS } from "@/pages/app/management-templates";

/**
 * The docket body is narrower than the roll it prints on — 72mm inside an 80mm
 * page, 48mm inside 58mm — because that is the strip a thermal printer can
 * actually mark, and that strip is centred on the paper.
 *
 * Every browser/bridge surface renders this component at the *full* paper width
 * (`@page { size: 80mm auto; margin: 0 }` in service-jobs.tsx,
 * service-jobs-new.tsx and the Templates print preview), so without auto margins
 * the whole docket sat hard against the left edge with the 8mm difference dumped
 * on the right. Asserted on the emitted markup rather than the constant, because
 * the width was always right — it was the placement that was wrong.
 */

const branding: ServiceSheetBranding = { businessName: "Koastal Repairs", brandColor: "#efbf04" };
const data: ServiceSheetData = { jobId: 42, jobNumber: "SVC-1042", status: "pending", customerName: "Sarah Johnson" };

const root = (html: string) => html.slice(0, html.indexOf(">") + 1);

describe("ServiceJobDocket placement on the roll", () => {
  it("centres the 72mm body in an 80mm page", () => {
    const html = renderToStaticMarkup(
      <ServiceJobDocket id="d" data={data} branding={branding} opts={DEFAULT_OPTS} fontCss="Arial" />,
    );
    expect(root(html)).toMatch(/width:\s*72mm/);
    expect(root(html)).toMatch(/margin:\s*0(px)?\s+auto/);
  });

  it("centres the 48mm body on a 58mm roll too", () => {
    const html = renderToStaticMarkup(
      <ServiceJobDocket id="d" data={data} branding={branding} opts={DEFAULT_OPTS} fontCss="Arial" paperWidth="58mm" />,
    );
    expect(root(html)).toMatch(/width:\s*48mm/);
    expect(root(html)).toMatch(/margin:\s*0(px)?\s+auto/);
  });
});
