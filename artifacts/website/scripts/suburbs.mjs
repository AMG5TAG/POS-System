// Single source of truth for build scripts that need the suburb list.
//
// Both the sitemap generator and the prerender pass need these slugs. They used
// to each keep their own copy, which drifted and put seven 404ing URLs into the
// sitemap — so both now read src/data/suburbs.ts through here instead.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function readSuburbs() {
  const src = readFileSync(resolve(__dirname, "..", "src", "data", "suburbs.ts"), "utf8");
  const start = src.indexOf("const rawSuburbs");
  const block = src.slice(start, src.indexOf("};", start));
  const names = [...new Set([...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]))];
  if (names.length === 0) {
    throw new Error("readSuburbs: parsed 0 suburbs from src/data/suburbs.ts");
  }
  return names;
}
