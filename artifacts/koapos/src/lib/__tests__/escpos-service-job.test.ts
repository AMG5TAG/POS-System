import { describe, expect, it } from "vitest";
import { charsPerLine, wrap } from "@/lib/escpos";
import { buildServiceJobDocketBytes } from "@/lib/escpos-service-job";
import { humanizeStatus, mergeCredentialLines } from "@/lib/service-sheet-fields";
import { DEFAULT_OPTS } from "@/pages/app/management-templates";
import type { ServiceSheetBranding, ServiceSheetData } from "@/components/printing/ServiceJobSheet";

const branding: ServiceSheetBranding = {
  businessName: "Koastal Repairs",
  abn: "12 345 678 901",
  website: "koastal.com.au",
  email: "hi@koastal.com.au",
  address: "New South Wales 2259",
  brandColor: "#efbf04",
  techAppUsername: "koastal",
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

  it("encodes the Tech App QR, and omits it when the template hides it", () => {
    // GS ( k -- the model-2 QR command prefix.
    const hasQrCommand = (b: Uint8Array) =>
      b.some((_, i) => b[i] === 0x1d && b[i + 1] === 0x28 && b[i + 2] === 0x6b);

    const withQr = buildServiceJobDocketBytes(data, branding, opts, "80mm");
    expect(hasQrCommand(withQr)).toBe(true);
    expect(textOf(withQr)).toContain("koastal");

    const noQr = buildServiceJobDocketBytes(data, branding, { ...opts, showServiceQr: false }, "80mm");
    expect(hasQrCommand(noQr)).toBe(false);
  });

  it("folds characters a thermal printer can't render", () => {
    const fancy: ServiceSheetData = { ...data, notes: "Charge — “urgent” • 5×" };
    const text = textOf(buildServiceJobDocketBytes(fancy, branding, opts, "80mm"));
    expect(text).toContain('Charge - "urgent" * 5x');
  });
});
