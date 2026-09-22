import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ServiceJobSheet, type ServiceSheetBranding, type ServiceSheetData } from "@/components/printing/ServiceJobSheet";
import { ServiceJobDocket } from "@/components/printing/ServiceJobDocket";
import { DEFAULT_OPTS, ServiceSheetPreview, type TplOpts } from "@/pages/app/management-templates";
import { buildServiceJobPrintHtml } from "@/lib/print-receipt";

/**
 * Service ticket QR alignment, asserted on the markup each surface actually
 * emits rather than on the helper that computes it.
 *
 * There are five renderers and a preview panel, and the failure this guards
 * against is the one that already happened once: the helper is right, the print
 * output is right, and one surface quietly ignores the setting. Rendering them
 * is the only way to tell those apart.
 */

const branding: ServiceSheetBranding = { businessName: "Koastal Repairs", brandColor: "#efbf04" };

const data: ServiceSheetData = {
  jobId: 42,
  jobNumber: "SVC-1042",
  status: "pending",
  customerName: "Sarah Johnson",
};

const CUSTOM_QR = "https://example.com/qr.png";

function opts(over: Partial<TplOpts> = {}): TplOpts {
  return { ...DEFAULT_OPTS, showServiceQr: true, showCustomQr: true, customQrImage: CUSTOM_QR, ...over };
}

/** Every `justify-content:` in the markup, in document order. */
const justifies = (html: string) => html.match(/justify-content:\s*[a-z-]+/g)?.map((m) => m.split(/:\s*/)[1]) ?? [];
/** Every `text-align:` in the markup, in document order. */
const textAligns = (html: string) => html.match(/text-align:\s*[a-z]+/g)?.map((m) => m.split(/:\s*/)[1]) ?? [];

/* ─── A4 sheet component ──────────────────────────────────────────────────── */

describe("ServiceJobSheet (A4)", () => {
  const render = (o: Partial<TplOpts>) =>
    renderToStaticMarkup(<ServiceJobSheet id="s" data={data} branding={branding} opts={opts(o)} fontCss="Arial" />);

  it("corners the job QR left when the template says nothing", () => {
    expect(justifies(render({})).at(-1)).toBe("flex-start");
  });

  it("moves the job QR to the chosen side", () => {
    expect(justifies(render({ serviceQrAlign: "right" })).at(-1)).toBe("flex-end");
    expect(justifies(render({ serviceQrAlign: "center" })).at(-1)).toBe("center");
  });
});

/* ─── 80mm docket component ───────────────────────────────────────────────── */

describe("ServiceJobDocket (80mm)", () => {
  const render = (o: Partial<TplOpts>) =>
    renderToStaticMarkup(<ServiceJobDocket id="d" data={data} branding={branding} opts={opts(o)} fontCss="Arial" />);

  /** The docket's last two aligned blocks are the job QR then the custom QR. */
  const qrBlocks = (html: string) => textAligns(html).slice(-2);

  it("centres both codes when the template says nothing — the roll always has", () => {
    expect(qrBlocks(render({}))).toEqual(["center", "center"]);
  });

  it("aligns each code independently", () => {
    expect(qrBlocks(render({ serviceQrAlign: "left", serviceCustomQrAlign: "right" }))).toEqual(["left", "right"]);
    expect(qrBlocks(render({ serviceQrAlign: "right", serviceCustomQrAlign: "left" }))).toEqual(["right", "left"]);
  });

  /* text-align cannot move a block-level box, and Tailwind's preflight makes
     both `svg` and `img` display:block — so each code needs its own auto
     margins. The job QR relied on the parent's text-align and printed hard
     left under a centred caption; asserting both keeps that symmetrical. */
  it("pushes each QR with a margin, since text-align cannot move a block", () => {
    const both = render({ serviceQrAlign: "right", serviceCustomQrAlign: "right" });
    expect(both.match(/margin:0 0 0 auto/g)).toHaveLength(2);

    const left = render({ serviceQrAlign: "left", serviceCustomQrAlign: "left" });
    expect(left.match(/margin:0 auto 0 0/g)).toHaveLength(2);
  });

  it("centres each QR with auto margins by default, not just its caption", () => {
    // The docket root also centres itself on the roll, so the default render
    // carries three `margin:0 auto` — the body, the job QR and the custom QR.
    expect(render({}).match(/margin:0 auto(?![ 0])/g)).toHaveLength(3);
  });
});

/* ─── A4 report HTML ──────────────────────────────────────────────────────── */

describe("A4 service report HTML", () => {
  const render = (o: Partial<TplOpts>) =>
    buildServiceJobPrintHtml(
      {
        id: 42, jobNumber: "SVC-1042", status: "pending",
        bookInDate: "2026-08-28", createdAt: "2026-08-28T00:00:00Z",
        customerName: "Sarah Johnson",
      },
      { businessName: "Koastal Repairs" },
      opts(o),
    );

  it("gives the two QR blocks their own rules so they can differ", () => {
    const html = render({ serviceQrAlign: "right", serviceCustomQrAlign: "left" });
    expect(html).toContain(".qr-block.qr-job    { justify-content: flex-end; }");
    expect(html).toContain(".qr-block.qr-custom { justify-content: flex-start; }");
    // Both blocks must actually carry the class the rule targets.
    expect(html).toContain('class="qr-block qr-job"');
    expect(html).toContain('class="qr-block qr-custom"');
  });

  it("corners both left when the template says nothing", () => {
    const html = render({});
    expect(html).toContain(".qr-block.qr-job    { justify-content: flex-start; }");
    expect(html).toContain(".qr-block.qr-custom { justify-content: flex-start; }");
  });
});

/* ─── The template preview panel ──────────────────────────────────────────── */

describe("Service Ticket preview panel", () => {
  const render = (o: Partial<TplOpts>) =>
    renderToStaticMarkup(
      <ServiceSheetPreview
        templateId="ss-standard"
        businessName="Koastal Repairs"
        abn="12 345 678 901"
        tagline=""
        website="koastal.com.au"
        email="hi@koastal.com.au"
        address="NSW 2259"
        brandColor="#efbf04"
        opts={opts(o)}
      />,
    );

  /** The preview's last two justified rows are the job QR then the custom QR. */
  const qrRows = (html: string) => justifies(html).slice(-2);

  it("shows the alignment a merchant picks — this is what the setting is judged by", () => {
    expect(qrRows(render({ serviceQrAlign: "right", serviceCustomQrAlign: "center" })))
      .toEqual(["flex-end", "center"]);
  });

  it("aligns each code independently, matching what will print", () => {
    expect(qrRows(render({ serviceQrAlign: "center", serviceCustomQrAlign: "right" })))
      .toEqual(["center", "flex-end"]);
  });

  it("defaults both to the A4 sheet's left corner", () => {
    expect(qrRows(render({}))).toEqual(["flex-start", "flex-start"]);
  });

  it("keeps the QR and its caption in a shrink-to-fit row", () => {
    // Without this the caption is a flex sibling that can fill the narrow
    // preview column, leaving justify-content nothing to distribute — the
    // alignment then silently does nothing on screen.
    expect(render({ serviceQrAlign: "right" })).toContain("inline-flex items-center gap-2 max-w-full");
  });
});
