import { describe, it, expect } from "vitest";
import { canOpenInline, contentDisposition } from "../lib/customer-files-shop";

/**
 * Customer files in the shop account. Pinned: only types that can't run script
 * open in the browser (an uploaded HTML or SVG is always a download), and the
 * download name survives any filename.
 */

describe("opening in the browser", () => {
  it("opens images, PDFs and plain text", () => {
    for (const t of ["image/jpeg", "image/png", "application/pdf", "text/plain; charset=utf-8"]) expect(canOpenInline(t)).toBe(true);
  });

  it("never opens anything that could run script on our domain", () => {
    for (const t of ["text/html", "image/svg+xml", "application/xhtml+xml", "application/javascript", "application/zip", "", null]) expect(canOpenInline(t)).toBe(false);
  });
});

describe("download name", () => {
  it("keeps the name, safely", () => {
    expect(contentDisposition("Invoice 12.pdf", true)).toBe(`inline; filename="Invoice 12.pdf"; filename*=UTF-8''Invoice%2012.pdf`);
    const odd = contentDisposition('café "quote"\r\n/x.pdf', false);
    expect(odd.startsWith('attachment; filename="caf_ _quote____x.pdf"')).toBe(true);
    expect(odd).not.toMatch(/[\r\n]/);
    expect(contentDisposition("", false)).toContain('filename="file"');
  });
});
