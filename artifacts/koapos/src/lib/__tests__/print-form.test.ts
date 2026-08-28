import { describe, expect, it } from "vitest";
import { buildFormPrintHtml } from "@/lib/print-form";
import type { FormTemplate } from "@/lib/forms-api";

const form = {
  id: 1,
  merchantId: 1,
  name: "Repair Consent",
  description: "Please read and sign before we begin work.",
  fields: [
    { id: "sec", type: "section_header", label: "Your details", required: false },
    { id: "name", type: "text", label: "Full name", required: true },
    { id: "backup", type: "checkbox", label: "Data backed up", required: false },
    { id: "contact", type: "checkbox_group", label: "Contact me by", required: false },
    { id: "hr", type: "divider", label: "", required: false },
    { id: "notes", type: "textarea", label: "Notes", required: false },
    { id: "sig", type: "signature", label: "Signature", required: true },
  ],
  createdAt: "2026-08-28T00:00:00.000Z",
  updatedAt: "2026-08-28T00:00:00.000Z",
} as unknown as FormTemplate;

const business = { name: "Koastal Repairs", phone: "02 1234 5678", primaryColor: "#efbf04" };

describe("buildFormPrintHtml", () => {
  const html = buildFormPrintHtml({
    form,
    business,
    customer: { name: "Sarah Johnson", phone: "0400 000 000" },
    submittedAt: "2026-08-28T03:30:00.000Z",
    data: {
      name: "Sarah Johnson",
      backup: true,
      contact: ["Email", "SMS"],
      sig: "data:image/png;base64,AAAA",
    },
  });

  it("is a self-contained A4 document, not a fragment of the app", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("@page { size: A4 portrait");
    // The old bug: printing the app chrome instead of the form.
    expect(html).toContain("Repair Consent");
    expect(html).toContain("Koastal Repairs");
  });

  it("renders answers by type", () => {
    expect(html).toContain("Sarah Johnson");
    expect(html).toContain(">Yes<");                       // boolean
    expect(html).toContain("Email, SMS");                  // multi-select
    expect(html).toContain('<img class="sig" src="data:image/png;base64,AAAA"'); // signature
  });

  it("keeps section headers and dividers as layout, not as answers", () => {
    expect(html).toContain('<h2 class="section">Your details</h2>');
    expect(html).toContain('<hr class="rule" />');
  });

  it("leaves an unanswered field as a blank rule to fill in by hand", () => {
    // `notes` was never answered.
    expect(html).toContain('<span class="blank"></span>');
  });

  it("escapes values so a form answer can't inject markup", () => {
    const injected = buildFormPrintHtml({
      form,
      business,
      data: { name: '<script>alert(1)</script>' },
    });
    expect(injected).not.toContain("<script>alert(1)</script>");
    expect(injected).toContain("&lt;script&gt;");
  });

  it("falls back to a safe brand colour when the profile has junk in it", () => {
    const bad = buildFormPrintHtml({ form, business: { name: "X", primaryColor: "red; }" }, data: {} });
    expect(bad).not.toContain("red; }");
    expect(bad).toContain("#0f766e");
  });
});
