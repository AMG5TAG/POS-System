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
// The site is a client-rendered SPA on a static host, so there is no server to
// answer with a 301. `write-redirects.mjs` therefore emits a small HTML stub at
// each old path carrying <link rel="canonical"> plus a zero-delay meta refresh
// — the pattern Google documents for static hosting, and which it treats as a
// permanent redirect. `legacyTarget()` in src/App.tsx mirrors these rules so
// the SPA also self-corrects if it ever boots on an old URL.

import { readSuburbs, slugify } from "./suburbs.mjs";

const SECTION_REDIRECTS = {
  "/koasoft": "/media",
  "/koasoft/website-design": "/media/website-design",
  "/koasoft/domains": "/media/domains",
  "/koasoft/apps": "/media/apps",
  "/koasoft/email-hosting": "/media/email-hosting",
  "/koasoft/portfolio": "/media/portfolio",
};

export function redirectPairs() {
  const pairs = Object.entries(SECTION_REDIRECTS);
  for (const name of readSuburbs()) {
    const slug = slugify(name);
    pairs.push([`/koasoft/web-services/${slug}`, `/computer-repairs/${slug}`]);
    pairs.push([`/kollective/${slug}`, `/computer-repairs/${slug}`]);
  }
  return pairs;
}
