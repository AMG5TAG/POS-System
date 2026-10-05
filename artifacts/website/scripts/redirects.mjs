// Single source of truth for legacy URLs kept alive after the KoaSOFT-to-Koastal rebrand.
//
// Two things moved:
//   /koasoft, /koasoft/*        -> /media, /media/*
//       The section was renamed when the business dropped the KoaSOFT name.
//   /koasoft/web-services/:sub  -> /computer-repairs/:sub
//   /kollective/:sub            -> /computer-repairs/:sub
//       The 241 per-suburb Media pages were retired and their website, domain,
//       email and app content folded into the combined suburb page.
//
// The production server (artifacts/koapos/server.mjs) answers these with a real
// 301 from the redirects.json written alongside the stubs. The stubs remain
// for any static host without it. `write-redirects.mjs` therefore emits a small HTML stub at
// each old path carrying <link rel="canonical"> plus a zero-delay meta refresh
// — the pattern Google documents for static hosting, and which it treats as a
// permanent redirect. `legacyTarget()` in src/App.tsx mirrors these rules so
// the SPA also self-corrects if it ever boots on an old URL.

import { readSuburbs, readRetiredSuburbs, slugify } from "./suburbs.mjs";

const SECTION_REDIRECTS = {
  "/koasoft": "/media",
  "/koasoft/website-design": "/media/website-design",
  "/koasoft/domains": "/media/domains",
  "/koasoft/apps": "/media/apps",
  "/koasoft/email-hosting": "/media/email-hosting",
  "/koasoft/portfolio": "/media/portfolio",
};

// Suburb pages were cut to the hub towns within 20 km of the workshop
// (src/data/suburbs.ts). Every other /computer-repairs/<suburb> 301s to its
// nearest hub (inside 20 km) or its region page (beyond), and the older legacy forms go straight there too — never a
// chain of two redirects.
export function redirectPairs() {
  const pairs = Object.entries(SECTION_REDIRECTS);
  const retired = readRetiredSuburbs();
  const targets = new Map(readSuburbs().map((name) => [slugify(name), `/computer-repairs/${slugify(name)}`]));
  for (const [slug, r] of Object.entries(retired)) {
    const to = r.to ? `/computer-repairs/${slugify(r.to)}` : `/computer-repairs/${r.region}`;
    targets.set(slug, to);
    pairs.push([`/computer-repairs/${slug}`, to]);
  }
  for (const [slug, to] of targets) {
    pairs.push([`/koasoft/web-services/${slug}`, to]);
    pairs.push([`/kollective/${slug}`, to]);
  }
  return pairs;
}
