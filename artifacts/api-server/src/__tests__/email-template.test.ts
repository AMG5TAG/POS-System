import { describe, expect, it } from "vitest";
import { mergeEmailTemplate, savedEmailTemplate } from "../lib/email-template";

const bp = {
  brandColors: JSON.stringify(["#166534", "#000000"]),
  logo: "https://cdn.example.com/logo.png",
  website: "koastal.com.au",
  contactEmail: "hi@koastal.com.au",
  tagline: "Coastal repairs done right",
  socialLinks: JSON.stringify({ instagram: "koastal" }),
};

const row = {
  selectedStyle: "e-casual",
  footerHtml: "Reply to this email any time.",
  showLogo: true,
  options: {
    subjectLine: "Your invoice from Koastal",
    customGreeting: "Hi there,",
    customMessage: "Here is the invoice we discussed.",
    customSignOff: "— Koastal",
    thankYouMsg: "Thanks for your business!",
    showSocialLinks: true,
    showGstBreakdown: false,
  },
};

describe("savedEmailTemplate", () => {
  it("resolves the merchant's wording, style and branding", () => {
    const t = savedEmailTemplate(row, bp);
    expect(t.templateId).toBe("e-casual");
    expect(t.subjectLine).toBe("Your invoice from Koastal");
    expect(t.customGreeting).toBe("Hi there,");
    expect(t.footerText).toBe("Reply to this email any time.");
    expect(t.brandColor).toBe("#166534");
    expect(t.logo).toBe("https://cdn.example.com/logo.png");
    expect(t.socialLinks).toEqual({ instagram: "koastal" });
  });

  it("keeps GST and website on unless the merchant turned them off", () => {
    expect(savedEmailTemplate({ options: {} }, bp).showGstBreakdown).toBe(true);
    expect(savedEmailTemplate({ options: {} }, bp).showWebsite).toBe(true);
    // false is a real choice, not an absent value.
    expect(savedEmailTemplate(row, bp).showGstBreakdown).toBe(false);
  });

  it("brands a background send even with no saved row at all", () => {
    const t = savedEmailTemplate(undefined, bp);
    expect(t.templateId).toBe("e-pro");
    expect(t.logo).toBe("https://cdn.example.com/logo.png");
    expect(t.showLogo).toBe(true);
    expect(t.subjectLine).toBeUndefined();
  });

  it("survives unparseable branding JSON", () => {
    const t = savedEmailTemplate(row, { brandColors: "{oops", socialLinks: "nope" });
    expect(t.brandColor).toBeUndefined();
    expect(t.socialLinks).toEqual({});
  });

  it("treats a whitespace-only field as unset so the default shows through", () => {
    expect(savedEmailTemplate({ options: { customGreeting: "   " } }, bp).customGreeting).toBeUndefined();
  });
});

describe("mergeEmailTemplate", () => {
  const saved = savedEmailTemplate(row, bp);

  it("lets a caller override a field for one send", () => {
    const t = mergeEmailTemplate(saved, { subjectLine: "Reminder: invoice INV-1042" });
    expect(t.subjectLine).toBe("Reminder: invoice INV-1042");
    expect(t.customGreeting).toBe("Hi there,");
  });

  it("ignores a caller's blanks rather than erasing saved wording", () => {
    const t = mergeEmailTemplate(saved, { subjectLine: "", customGreeting: "", customSignOff: null });
    expect(t.subjectLine).toBe("Your invoice from Koastal");
    expect(t.customGreeting).toBe("Hi there,");
    expect(t.customSignOff).toBe("— Koastal");
  });

  it("keeps a caller's false, which is a choice and not a blank", () => {
    expect(mergeEmailTemplate(saved, { showSocialLinks: false }).showSocialLinks).toBe(false);
  });

  it("returns the saved template untouched for a background send", () => {
    expect(mergeEmailTemplate(saved, undefined)).toEqual(saved);
    expect(mergeEmailTemplate(saved, null)).toEqual(saved);
  });
});
