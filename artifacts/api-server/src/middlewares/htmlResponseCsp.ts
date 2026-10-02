import type { Request, Response, NextFunction } from "express";

/* A locked-down Content-Security-Policy for any HTML or SVG the API sends.
 *
 * The API answers on the POS and website domains, so a page it renders runs as
 * them, with the visitor's session. Helmet's CSP is off for the API as a whole
 * (JSON, PDFs and images don't need one, and a strict default-src blanks
 * Chrome's PDF viewer), so the few HTML responses — the unsubscribe page,
 * OAuth landing pages, anything added later — had none: one unescaped field
 * was enough to run script on pos.koastal.com.au. This applies the policy to
 * exactly those responses, decided by the Content-Type actually sent.
 *
 * No script runs, nothing loads but images and inline styles, nothing can
 * frame the page, and forms post only to this origin. */
const POLICY = [
  "default-src 'none'",
  "img-src 'self' data: https:",
  "style-src 'unsafe-inline'",
  "font-src 'self' data: https:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join("; ");

const RENDERED = /^\s*(?:text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml)/i;

export function htmlResponseCsp(_req: Request, res: Response, next: NextFunction): void {
  const writeHead = res.writeHead;
  res.writeHead = function patchedWriteHead(this: Response, ...args: unknown[]) {
    const type = String(res.getHeader("content-type") ?? "");
    if (RENDERED.test(type) && !res.getHeader("content-security-policy")) {
      res.setHeader("Content-Security-Policy", POLICY);
    }
    return (writeHead as (...a: unknown[]) => Response).apply(this, args);
  } as Response["writeHead"];
  next();
}
