import { describe, expect, it } from "vitest";
import { charsPerLine, wrap } from "@/lib/escpos";
import { buildServiceJobDocketBytes } from "@/lib/escpos-service-job";
import {
  humanizeStatus, isThermalServiceStyle, mergeCredentialLines, serviceDocketDensity,
  serviceQrAlign, QR_JUSTIFY, QR_BLOCK_MARGIN,
} from "@/lib/service-sheet-fields";
import { serviceJobPaperFromOpts } from "@/lib/service-job-print";
import { DEFAULT_OPTS } from "@/pages/app/management-templates";
import type { ServiceSheetBranding, ServiceSheetData } from "@/components/printing/ServiceJobSheet";

const branding: ServiceSheetBranding = {
  businessName: "Koastal Repairs",
  abn: "12 345 678 901",
  website: "www.koastalrepairs.example",
  email: "hi@koastal.com.au",
  address: "New South Wales 2259",
  brandColor: "#efbf04",
};

const data: ServiceSheetData = {
  jobId: 42,
  jobNumber: "SVC-1042",
  date: "2026-08-28",
  status: "awaiting-parts",
  customerName: "Sarah Johnson",
  customerPhone: "0400 000 000",
  customerEmail: "sarah@example.com",
  deviceType: "Laptop",
  deviceModel: "Dell XPS 13",
  deviceColour: "Platinum Silver",
  deviceQuantity: 12,
  serialNumber: "ABC123",
  condition: "Scratched lid",
  workDescription: "Screen flickers intermittently and the hinge is loose.",
  additionalEquipment: "Charger, sleeve",
  accounts: "sarah@example.com",
  logins: "1234",
  notes: "Customer needs it back by Friday.",
  isCritical: true,
  isUnderWarranty: true,
};

const LF = 0x0a;

/** Printable text of an ESC/POS stream, command bytes rendered as spaces. */
function textOf(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : b === LF ? "\n" : " "))
    .join("");
}

const ESC = 0x1b;
const GS = 0x1d;

/**
 * The lines a printer would actually lay down. Command sequences (and their
 * parameter bytes, which are often printable ASCII) are skipped, so the width
 * assertion measures real text rather than encoder noise.
 */
function linesOf(bytes: Uint8Array): string[] {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === ESC) {
      const cmd = bytes[i + 1];
      // ESC @ takes no parameter; ESC a/E/d/! take one; ESC p takes three.
      i += cmd === 0x40 ? 1 : cmd === 0x70 ? 4 : 2;
      continue;
    }
    if (b === GS) {
      const cmd = bytes[i + 1];
      if (cmd === 0x28) {
        // GS ( k pL pH <pL+pH*256 bytes>
        const len = bytes[i + 2] + bytes[i + 3] * 256;
        i += 4 + len - 1 + 1;
        continue;
      }
      // GS ! takes one parameter, GS V takes two.
      i += cmd === 0x56 ? 3 : 2;
      continue;
    }
    if (b === LF) out += "\n";
    else if (b >= 0x20 && b <= 0x7e) out += String.fromCharCode(b);
  }
  return out.split("\n");
}

describe("wrap", () => {
  it("breaks on whitespace within the roll width", () => {
    expect(wrap("the quick brown fox jumps", 10)).toEqual(["the quick", "brown fox", "jumps"]);
  });

  it("hard-splits a word longer than the roll rather than dropping it", () => {
    expect(wrap("supercalifragilistic", 8)).toEqual(["supercal", "ifragili", "stic"]);
  });

  it("keeps paragraph breaks and drops empty input", () => {
    expect(wrap("one\ntwo", 20)).toEqual(["one", "two"]);
    expect(wrap("   ", 20)).toEqual([]);
    expect(wrap(undefined, 20)).toEqual([]);
  });
});

describe("mergeCredentialLines", () => {
  it("pairs accounts with their PINs and drops blanks", () => {
    expect(mergeCredentialLines("a@b.com\n\nc@d.com", "1111\n2222\n")).toEqual([
      "a@b.com - 1111",
      "2222",
      "c@d.com",
    ]);
  });

  it("takes the separator from the renderer, since ESC/POS can't print an en dash", () => {
    expect(mergeCredentialLines("acct", "1234", "\u2014")).toEqual(["acct \u2014 1234"]);
  });
});

describe("humanizeStatus", () => {
  it("uses the canonical label, falling back to title case", () => {
    expect(humanizeStatus("awaiting-parts")).toBe("Awaiting Parts");
    expect(humanizeStatus("some_new_status")).toBe("Some New Status");
    expect(humanizeStatus("")).toBe("");
  });
});

describe("buildServiceJobDocketBytes", () => {
  const opts = { ...DEFAULT_OPTS, showLogins: true, showSignature: true };

  it("prints the job identity, customer, device and fault", () => {
    const text = textOf(buildServiceJobDocketBytes(data, branding, opts, "80mm"));
    expect(text).toContain("Koastal Repairs");
    expect(text).toContain("ABN 12 345 678 901");
    expect(text).toContain("SVC-1042");
    expect(text).toContain("Awaiting Parts");
    expect(text).toContain("Sarah Johnson");
    expect(text).toContain("Dell XPS 13");
    expect(text).toContain("Platinum Silver");
    expect(text).toContain("Quantity: 12");
    expect(text).toContain("Screen flickers");
    expect(text).toContain("Charger, sleeve");
    expect(text).toContain("** CRITICAL **");
    expect(text).toContain("** WARRANTY **");
  });

  it("only prints logins when the template opts in", () => {
    expect(textOf(buildServiceJobDocketBytes(data, branding, opts, "80mm"))).toContain("1234");
    const hidden = { ...opts, showLogins: false };
    expect(textOf(buildServiceJobDocketBytes(data, branding, hidden, "80mm"))).not.toContain("LOGINS");
  });

  it("keeps every line inside the roll width", () => {
    for (const paper of ["80mm", "58mm"] as const) {
      const overLong = linesOf(buildServiceJobDocketBytes(data, branding, opts, paper))
        .filter((l) => l.length > charsPerLine(paper));
      expect(overLong, `${paper}: ${overLong.join(" | ")}`).toEqual([]);
    }
  });

  it("ends with a feed and an auto-cut so the docket tears off", () => {
    const bytes = buildServiceJobDocketBytes(data, branding, opts, "80mm");
    expect(Array.from(bytes.slice(-4))).toEqual([0x1d, 0x56, 66, 3]);
  });

  it("encodes the service-job QR resolver, and omits it when the template hides it", () => {
    // GS ( k -- the model-2 QR command prefix.
    const hasQrCommand = (b: Uint8Array) =>
      b.some((_, i) => b[i] === 0x1d && b[i + 1] === 0x28 && b[i + 2] === 0x6b);

    const withQr = buildServiceJobDocketBytes(data, branding, opts, "80mm");
    expect(hasQrCommand(withQr)).toBe(true);
    // The ink carries the stable resolver, never a Tech App deep link: the
    // sticker outlives the job's status. See lib/public-url.ts.
    expect(textOf(withQr)).toContain("/api/qr/j/42");

    const noQr = buildServiceJobDocketBytes(data, branding, { ...opts, showServiceQr: false }, "80mm");
    expect(hasQrCommand(noQr)).toBe(false);
  });

  it("folds characters a thermal printer can't render", () => {
    const fancy: ServiceSheetData = { ...data, notes: "Charge — “urgent” • 5×" };
    const text = textOf(buildServiceJobDocketBytes(fancy, branding, opts, "80mm"));
    expect(text).toContain('Charge - "urgent" * 5x');
  });

  /* The compact style (Management › Templates › Service Ticket › 80mm Compact)
     may only spend less roll — losing a job field to the paper choice would make
     the two thermal styles print different documents. */
  describe("compact density", () => {
    const standard = buildServiceJobDocketBytes(data, branding, opts, "80mm", "standard");
    const compact = buildServiceJobDocketBytes(data, branding, opts, "80mm", "compact");

    it("keeps every job field the standard docket prints", () => {
      const text = textOf(compact);
      for (const field of [
        "SVC-1042", "Awaiting Parts", "Sarah Johnson", "0400 000 000", "sarah@example.com",
        "Dell XPS 13", "ABC123", "Scratched lid", "Screen flickers", "Charger, sleeve",
        "1234", "Customer needs it back by Friday.", "Customer signature",
        "** CRITICAL **", "** WARRANTY **",
      ]) {
        expect(text, field).toContain(field);
      }
    });

    it("drops only the branding lines the customer already has elsewhere", () => {
      const text = textOf(compact);
      expect(text).toContain("Koastal Repairs");
      expect(text).toContain("ABN 12 345 678 901");
      expect(text).not.toContain("New South Wales 2259");
      expect(text).not.toContain("www.koastalrepairs.example");
      expect(text).not.toContain("hi@koastal.com.au");
    });

    it("spends less roll than the standard docket", () => {
      expect(linesOf(compact).length).toBeLessThan(linesOf(standard).length);
    });

    it("still cuts, and still carries a scannable service-job QR", () => {
      const hasQrCommand = (b: Uint8Array) =>
        b.some((_, i) => b[i] === 0x1d && b[i + 1] === 0x28 && b[i + 2] === 0x6b);
      expect(hasQrCommand(compact)).toBe(true);
      expect(Array.from(compact.slice(-4))).toEqual([0x1d, 0x56, 66, 3]);
    });

    it("defaults to the standard density, so existing callers are unchanged", () => {
      expect(Array.from(buildServiceJobDocketBytes(data, branding, opts, "80mm")))
        .toEqual(Array.from(standard));
    });

    it("keeps every line inside the roll width", () => {
      for (const paper of ["80mm", "58mm"] as const) {
        const overLong = linesOf(buildServiceJobDocketBytes(data, branding, opts, paper, "compact"))
          .filter((l) => l.length > charsPerLine(paper));
        expect(overLong, `${paper}: ${overLong.join(" | ")}`).toEqual([]);
      }
    });
  });
});

/* ─── Custom QR on the docket ──────────────────────────────────────────────── */

describe("service docket custom QR", () => {
  const base = { ...DEFAULT_OPTS, showLogins: true, showSignature: true };
  const hasQrCommand = (b: Uint8Array) =>
    b.some((_, i) => b[i] === 0x1d && b[i + 1] === 0x28 && b[i + 2] === 0x6b);
  /** GS ( k sequences in the stream. One QR costs several (model, size, ECC,
   *  store, print), so compare counts rather than reading an absolute number. */
  const qrCommands = (b: Uint8Array) =>
    b.reduce((n, _, i) => (b[i] === 0x1d && b[i + 1] === 0x28 && b[i + 2] === 0x6b ? n + 1 : n), 0);

  it("encodes a picked code alongside the service-job QR, with its caption", () => {
    const opts = { ...base, showCustomQr: true, customQrData: "https://koastal.com.au/book", customQrCaption: "Book your next service" };
    const bytes = buildServiceJobDocketBytes(data, branding, opts, "80mm");
    expect(qrCommands(bytes)).toBeGreaterThan(qrCommands(buildServiceJobDocketBytes(data, branding, base, "80mm")));
    expect(textOf(bytes)).toContain("koastal.com.au/book");
    expect(textOf(bytes)).toContain("Book your next service");
  });

  it("skips an uploaded image — the thermal head has no payload to encode", () => {
    const opts = { ...base, showCustomQr: true, customQrImage: "data:image/png;base64,iVBORw0KGgo=" };
    const bytes = buildServiceJobDocketBytes(data, branding, opts, "80mm");
    expect(qrCommands(bytes)).toBe(qrCommands(buildServiceJobDocketBytes(data, branding, base, "80mm")));
  });

  it("stays off while the template's Custom QR toggle is off", () => {
    const opts = { ...base, showCustomQr: false, customQrData: "https://koastal.com.au/book" };
    expect(textOf(buildServiceJobDocketBytes(data, branding, opts, "80mm"))).not.toContain("koastal.com.au/book");
  });

  it("still fits the roll and still cuts", () => {
    const opts = { ...base, showCustomQr: true, customQrData: "https://koastal.com.au/book", customQrCaption: "Book your next service at Koastal Repairs today" };
    for (const paper of ["80mm", "58mm"] as const) {
      const bytes = buildServiceJobDocketBytes(data, branding, opts, paper, "compact");
      expect(hasQrCommand(bytes)).toBe(true);
      expect(linesOf(bytes).filter((l) => l.length > charsPerLine(paper))).toEqual([]);
      expect(Array.from(bytes.slice(-4))).toEqual([0x1d, 0x56, 66, 3]);
    }
  });
});

/* ─── Style → paper / density ──────────────────────────────────────────────── */

describe("service ticket styles", () => {
  it("treats only the 80mm styles as thermal", () => {
    expect(isThermalServiceStyle("ss-thermal")).toBe(true);
    expect(isThermalServiceStyle("ss-thermal-compact")).toBe(true);
    expect(isThermalServiceStyle("ss-standard")).toBe(false);
    expect(isThermalServiceStyle(undefined)).toBe(false);
  });

  it("prints compact only for the compact thermal style", () => {
    expect(serviceDocketDensity("ss-thermal-compact")).toBe("compact");
    expect(serviceDocketDensity("ss-thermal")).toBe("standard");
    expect(serviceDocketDensity("ss-standard")).toBe("standard");
    expect(serviceDocketDensity(undefined)).toBe("standard");
  });

  it("lets a thermal style pick the paper, and honours Default Paper otherwise", () => {
    expect(serviceJobPaperFromOpts({ serviceSheetPaper: "a4" }, "ss-thermal")).toBe("80mm");
    expect(serviceJobPaperFromOpts({ serviceSheetPaper: "a4" }, "ss-standard")).toBe("a4");
    // Merchants who set 80mm before the thermal styles existed keep the roll.
    expect(serviceJobPaperFromOpts({ serviceSheetPaper: "80mm" }, "ss-standard")).toBe("80mm");
    expect(serviceJobPaperFromOpts({ serviceSheetPaper: "80mm" })).toBe("80mm");
    expect(serviceJobPaperFromOpts({ serviceSheetPaper: "a4" })).toBe("a4");
  });
});

/* ─── QR alignment ─────────────────────────────────────────────────────────── */

/** ESC a n — the justification values a printer is told, in order. */
function justifications(bytes: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < bytes.length - 2; i++) {
    if (bytes[i] === ESC && bytes[i + 1] === 0x61) out.push(bytes[i + 2]);
  }
  return out;
}

/** The justification in force when the QR command (GS ( k … 1 P) is emitted. */
function alignAtFirstQr(bytes: Uint8Array): number | null {
  let current = 0;
  for (let i = 0; i < bytes.length - 6; i++) {
    if (bytes[i] === ESC && bytes[i + 1] === 0x61) { current = bytes[i + 2]; continue; }
    // GS ( k pL pH 0x31 0x50 — the "store QR data" call, which every QR makes.
    if (bytes[i] === GS && bytes[i + 1] === 0x28 && bytes[i + 2] === 0x6b
        && bytes[i + 5] === 0x31 && bytes[i + 6] === 0x50) {
      return current;
    }
  }
  return null;
}

describe("serviceQrAlign", () => {
  it("resolves each code's own saved value, not one shared setting", () => {
    // The job QR and the custom QR are separate blocks with separate options.
    expect(serviceQrAlign("left", "center")).toBe("left");
    expect(serviceQrAlign("right", "center")).toBe("right");
  });

  it("falls back to the paper's own default rather than a single global one", () => {
    // The A4 sheet has always cornered its code left and the roll has always
    // centred it. One shared default would silently re-align one of them for
    // every merchant who never asked.
    expect(serviceQrAlign("", "left")).toBe("left");
    expect(serviceQrAlign("", "center")).toBe("center");
    expect(serviceQrAlign(undefined, "center")).toBe("center");
    expect(serviceQrAlign(null, "left")).toBe("left");
  });

  it("honours an explicit choice on either paper", () => {
    expect(serviceQrAlign("right", "left")).toBe("right");
    expect(serviceQrAlign("center", "left")).toBe("center");
    expect(serviceQrAlign("left", "center")).toBe("left");
  });

  it("ignores a value it does not recognise", () => {
    // A stale or hand-edited template option must not reach CSS as-is.
    expect(serviceQrAlign("middle", "center")).toBe("center");
    expect(serviceQrAlign("flex-end", "left")).toBe("left");
  });

  it("maps to CSS that actually moves the block", () => {
    expect(QR_JUSTIFY.left).toBe("flex-start");
    expect(QR_JUSTIFY.right).toBe("flex-end");
    // text-align cannot move a block-level image, so the docket's custom QR
    // needs the auto-margin form instead.
    expect(QR_BLOCK_MARGIN.left).toBe("0 auto 0 0");
    expect(QR_BLOCK_MARGIN.right).toBe("0 0 0 auto");
  });
});

describe("thermal docket QR alignment", () => {
  const build = (job: string, custom = "") =>
    buildServiceJobDocketBytes(
      data, branding,
      {
        ...DEFAULT_OPTS,
        serviceQrAlign: job, serviceCustomQrAlign: custom,
        showCustomQr: true, customQrData: "https://example.com/book",
      },
      "80mm",
    );

  it("centres the code when the template says nothing", () => {
    expect(alignAtFirstQr(build(""))).toBe(1); // ESC a 1 = centre
  });

  it("tells the printer to justify the code left or right when asked", () => {
    expect(alignAtFirstQr(build("left"))).toBe(0);
    expect(alignAtFirstQr(build("right"))).toBe(2);
  });

  it("justifies the custom QR independently of the job QR", () => {
    // ESC a is emitted again between the two codes, so the printer is holding
    // the second alignment by the time the custom QR is stored.
    const js = justifications(build("left", "right"));
    expect(js).toContain(0);
    expect(js).toContain(2);
    expect(js.indexOf(0)).toBeLessThan(js.lastIndexOf(2));
  });

  it("returns to centre after the codes so the footer is unmoved", () => {
    // The option aligns the QR blocks, not the closing message under them.
    expect(justifications(build("right", "left")).at(-1)).toBe(1);
    expect(justifications(build("left", "right")).at(-1)).toBe(1);
  });
});
