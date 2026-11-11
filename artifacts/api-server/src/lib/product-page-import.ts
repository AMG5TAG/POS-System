/**
 * Product details from a web page (Products › New Product › Import Details).
 *
 * Pure: takes the page's HTML and URL, returns what it could read. No db, no
 * fetch — the route does those. Reads, in order of trust:
 *   1. schema.org `Product` JSON-LD — what shops publish for Google Shopping,
 *      so it is the most reliable source of name, SKU, GTIN, brand, price.
 *   2. OpenGraph / product meta tags (`og:title`, `product:price:amount`, …).
 *   3. Spec tables and definition lists ("Label | value" rows).
 * Nothing is invented here: a field the page doesn't carry is left out, and the
 * route may ask Claude to fill gaps from the page text, marked as such.
 */

export interface ImportedProduct {
  name?: string;
  description?: string;
  sku?: string;
  barcode?: string;
  brand?: string;
  category?: string;
  price?: number;
  weightKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  warranty?: string;
  /** "Label: value" lines, the shop's Specifications format. */
  technicalSpecs?: string;
  images: string[];
}

export type ImportField = Exclude<keyof ImportedProduct, "images">;

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", ndash: "–", mdash: "—",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", trade: "™", reg: "®", copy: "©", deg: "°",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** HTML fragment → plain text, keeping paragraph and list breaks. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\n• ")
      .replace(/<\/(p|div|h[1-6]|li|tr|section|article|ul|ol|table)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const clean = (v: unknown, max = 500): string | undefined => {
  if (typeof v !== "string" && typeof v !== "number") return undefined;
  const s = htmlToText(String(v)).replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : undefined;
};

const cleanLong = (v: unknown, max = 8000): string | undefined => {
  if (typeof v !== "string") return undefined;
  const s = (/<[a-z][\s\S]*>/i.test(v) ? htmlToText(v) : decodeEntities(v).trim());
  return s ? s.slice(0, max) : undefined;
};

function absUrl(u: unknown, base: string): string | undefined {
  if (typeof u !== "string" || !u.trim()) return undefined;
  try {
    const url = new URL(decodeEntities(u.trim()), base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch { return undefined; }
}

function num(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : undefined;
  if (typeof v !== "string") return undefined;
  const m = v.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  const n = m ? parseFloat(m[0]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/* ── Units ──────────────────────────────────────────────────────────────── */

const KG: Record<string, number> = { kg: 1, kgs: 1, kilogram: 1, kilograms: 1, g: 0.001, gram: 0.001, grams: 0.001, gr: 0.001, lb: 0.45359237, lbs: 0.45359237, pound: 0.45359237, pounds: 0.45359237, oz: 0.028349523, ounce: 0.028349523, ounces: 0.028349523, kgm: 1, grm: 0.001, lbr: 0.45359237, onz: 0.028349523 };
const CM: Record<string, number> = { cm: 1, mm: 0.1, m: 100, in: 2.54, inch: 2.54, inches: 2.54, '"': 2.54, cmt: 1, mmt: 0.1, mtr: 100, inh: 2.54 };

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** "1.2 kg", "850g", {value: 2, unitCode: "KGM"} → kilograms. */
export function toKg(v: unknown): number | undefined {
  if (v && typeof v === "object") {
    const o = v as { value?: unknown; unitCode?: unknown; unitText?: unknown };
    const n = num(o.value);
    const unit = String(o.unitCode ?? o.unitText ?? "kg").toLowerCase();
    return n != null && KG[unit] != null ? round3(n * KG[unit]!) : undefined;
  }
  if (typeof v !== "string" && typeof v !== "number") return undefined;
  const m = String(v).toLowerCase().replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(kgs?|kilograms?|grams?|gr|g|lbs?|pounds?|oz|ounces?)\b/);
  if (!m) return undefined;
  return round3(parseFloat(m[1]!) * KG[m[2]!]!);
}

/** One length in cm. */
export function toCm(v: unknown): number | undefined {
  if (v && typeof v === "object") {
    const o = v as { value?: unknown; unitCode?: unknown; unitText?: unknown };
    const n = num(o.value);
    const unit = String(o.unitCode ?? o.unitText ?? "cm").toLowerCase();
    return n != null && CM[unit] != null ? round1(n * CM[unit]!) : undefined;
  }
  if (typeof v !== "string" && typeof v !== "number") return undefined;
  const m = String(v).toLowerCase().replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(mm|cm|m|inches|inch|in|")(?![a-z])/);
  return m ? round1(parseFloat(m[1]!) * CM[m[2]!]!) : undefined;
}

/** "30 x 20 x 5 cm" / "300 x 200 x 50mm" → [l, w, h] in cm. */
export function parseDimensions(v: string): [number, number, number] | undefined {
  const m = v.toLowerCase().replace(/,/g, "").match(
    /(\d+(?:\.\d+)?)\s*(mm|cm|m|in|")?\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|in|")?\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|inches|inch|in|")?/,
  );
  if (!m) return undefined;
  const unit = m[6] ?? m[4] ?? m[2];
  if (!unit) return undefined; // a bare "30 x 20 x 5" could be anything
  const f = CM[unit]!;
  return [round1(parseFloat(m[1]!) * f), round1(parseFloat(m[3]!) * f), round1(parseFloat(m[5]!) * f)];
}

/**
 * "Width: 14.09” / 357.80 mm Depth: 9.19” / 233.30 mm Height: 0.78” / 19.87 mm"
 * → [length(depth), width, height] in cm. Metric is preferred when both are given.
 */
export function labelledDimensions(v: string): [number, number, number] | undefined {
  const text = v.replace(/[”″“]/g, '"');
  const read = (label: RegExp): number | undefined => {
    const m = text.match(label);
    if (!m) return undefined;
    const rest = text.slice(m.index! + m[0].length).split(/\b(?:width|depth|length|height|weight)\b/i)[0]!;
    const metric = rest.match(/(\d+(?:\.\d+)?)\s*(mm|cm)\b/i);
    return toCm(metric ? metric[0] : rest);
  };
  const l = read(/\b(?:depth|length)\b\s*:?/i), w = read(/\bwidth\b\s*:?/i), h = read(/\bheight\b\s*:?/i);
  return l != null && w != null && h != null ? [l, w, h] : undefined;
}

/** A barcode is kept only when its GTIN check digit is right. */
export function validGtin(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/* ── JSON-LD ────────────────────────────────────────────────────────────── */

type Json = Record<string, unknown>;

function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    const raw = m[1]!.trim().replace(/^<!--|-->$/g, "");
    try { out.push(JSON.parse(raw)); } catch {
      // Some shops leave raw control characters in strings.
      try { out.push(JSON.parse(raw.replace(/[\u0000-\u001f]+/g, " "))); } catch { /* unreadable block */ }
    }
  }
  return out;
}

const isType = (o: Json, t: string) => {
  const ty = o["@type"];
  return Array.isArray(ty) ? ty.includes(t) : ty === t;
};

/** Every object in the JSON-LD graphs, flattened. */
function walk(v: unknown, out: Json[] = [], depth = 0): Json[] {
  if (depth > 8 || v == null) return out;
  if (Array.isArray(v)) { for (const x of v) walk(x, out, depth + 1); return out; }
  if (typeof v === "object") {
    out.push(v as Json);
    for (const x of Object.values(v as Json)) if (x && typeof x === "object") walk(x, out, depth + 1);
  }
  return out;
}

const first = <T>(v: T | T[] | undefined): T | undefined => (Array.isArray(v) ? v[0] : v);

function nameOf(v: unknown): string | undefined {
  const x = first(v as unknown[]);
  if (typeof x === "string") return clean(x, 120);
  if (x && typeof x === "object") return clean((x as Json).name, 120);
  return undefined;
}

function imagesOf(v: unknown, base: string): string[] {
  const arr = Array.isArray(v) ? v : v ? [v] : [];
  return arr
    .map((x) => (typeof x === "string" ? x : x && typeof x === "object" ? ((x as Json).contentUrl ?? (x as Json).url) : undefined))
    .map((u) => absUrl(u, base))
    .filter((u): u is string => !!u);
}

function priceOf(offers: unknown): number | undefined {
  for (const o of walk(offers)) {
    const p = num(o.price) ?? num(o.lowPrice) ?? num((first(o.priceSpecification as unknown[]) as Json | undefined)?.price);
    if (p != null) return p;
  }
  return undefined;
}

function fromJsonLd(html: string, base: string): Partial<ImportedProduct> & { specs: [string, string][] } {
  const objs = jsonLdBlocks(html).flatMap((b) => walk(b));
  const products = objs.filter((o) => isType(o, "Product") || isType(o, "ProductGroup") || isType(o, "IndividualProduct"));
  const p = products.find((o) => o.name) ?? products[0];
  const specs: [string, string][] = [];
  if (!p) {
    const crumbs = objs.find((o) => isType(o, "BreadcrumbList"));
    return { images: [], specs, category: crumbs ? breadcrumbCategory(crumbs) : undefined };
  }

  const gtin = [p.gtin13, p.gtin14, p.gtin12, p.gtin8, p.gtin, p.ean]
    .map((g) => (typeof g === "string" || typeof g === "number" ? String(g).replace(/\D/g, "") : ""))
    .find((g) => validGtin(g));

  for (const prop of walk(p.additionalProperty)) {
    const label = clean(prop.name, 80);
    const value = clean(prop.value ?? prop.description, 300);
    if (label && value) specs.push([label, value]);
  }

  const dims = [p.depth, p.width, p.height].map(toCm);
  const crumbs = objs.find((o) => isType(o, "BreadcrumbList"));
  return {
    name: clean(p.name, 200),
    description: cleanLong(p.description),
    sku: clean(p.sku ?? p.mpn, 80),
    barcode: gtin,
    brand: nameOf(p.brand) ?? nameOf(p.manufacturer),
    category: (typeof p.category === "string" ? clean(p.category.split(/>|\//).pop(), 120) : undefined)
      ?? (crumbs ? breadcrumbCategory(crumbs) : undefined),
    price: priceOf(p.offers),
    weightKg: toKg(p.weight),
    lengthCm: dims[0], widthCm: dims[1], heightCm: dims[2],
    images: imagesOf(p.image, base),
    specs,
  };
}

/** The last breadcrumb that isn't the product itself or "Home". */
function breadcrumbCategory(list: Json): string | undefined {
  const items = walk(list.itemListElement).filter((o) => isType(o, "ListItem"));
  items.sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0));
  const names = items
    .map((i) => clean(i.name ?? ((i.item as Json | undefined)?.name), 120))
    .filter((n): n is string => !!n && !/^home$/i.test(n));
  // The final crumb is usually the product's own name.
  return names.length >= 2 ? names[names.length - 2] : undefined;
}

/* ── Meta tags ──────────────────────────────────────────────────────────── */

function metaTags(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of html.matchAll(/<meta\b([^>]*)>/gi)) {
    const attrs = m[1]!;
    const key = attrs.match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const content = attrs.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? attrs.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1];
    if (key && content != null && !out.has(key)) out.set(key, decodeEntities(content).trim());
  }
  return out;
}

/* ── Spec tables ────────────────────────────────────────────────────────── */

const SPEC_LIMIT = 60;

/** Two-cell table rows and <dt>/<dd> pairs, the usual spec layouts. */
export function specRows(html: string): [string, string][] {
  const body = html.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ");
  const rows: [string, string][] = [];
  for (const tr of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1]!.matchAll(/<t([hd])\b[^>]*>([\s\S]*?)<\/t\1>/gi)].map((c) => clean(c[2], 300));
    if (cells.length === 2 && cells[0] && cells[1]) rows.push([cells[0], cells[1]]);
  }
  for (const dl of body.matchAll(/<dl\b[^>]*>([\s\S]*?)<\/dl>/gi)) {
    const parts = [...dl[1]!.matchAll(/<(dt|dd)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
    for (let i = 0; i + 1 < parts.length; i++) {
      if (parts[i]![1]!.toLowerCase() === "dt" && parts[i + 1]![1]!.toLowerCase() === "dd") {
        const k = clean(parts[i]![2], 80), v = clean(parts[i + 1]![2], 300);
        if (k && v) rows.push([k, v]);
        i++;
      }
    }
  }
  // A label longer than a short phrase is prose, not a spec.
  return rows.filter(([k]) => k.length <= 60 && !/[.!?]$/.test(k)).slice(0, SPEC_LIMIT);
}

/** Specs that also say weight / dimensions / warranty / barcode fill those fields. */
function applySpecs(out: ImportedProduct, specs: [string, string][]): void {
  for (const [label, value] of specs) {
    const l = label.toLowerCase();
    if (out.weightKg == null && /\bweight\b/.test(l) && !/capacity|load|max/.test(l)) out.weightKg = toKg(value);
    if (/dimension|size \(|^size$|measurements/.test(l)) {
      const d = parseDimensions(value) ?? labelledDimensions(value);
      if (d && out.lengthCm == null && out.widthCm == null && out.heightCm == null) [out.lengthCm, out.widthCm, out.heightCm] = d;
    }
    if (out.lengthCm == null && /^(length|depth)\b/.test(l)) out.lengthCm = toCm(value);
    if (out.widthCm == null && /^width\b/.test(l)) out.widthCm = toCm(value);
    if (out.heightCm == null && /^height\b/.test(l)) out.heightCm = toCm(value);
    if (!out.warranty && /warranty/.test(l)) out.warranty = value.slice(0, 120);
    if (!out.barcode && /\b(ean|upc|gtin|barcode)\b/.test(l)) {
      const g = value.replace(/\D/g, "");
      if (validGtin(g)) out.barcode = g;
    }
    if (!out.brand && /^(brand|manufacturer|make)$/.test(l)) out.brand = value.slice(0, 120);
    if (!out.sku && /^(sku|model|model number|part number|mpn|manufacturer part number)$/.test(l)) out.sku = value.slice(0, 80);
  }
}

/* ── Whole page ─────────────────────────────────────────────────────────── */

/**
 * A page title is the product name plus shop chrome: "Buy X | ACT",
 * "X - Shop Name". Only used for names taken from titles/meta, never JSON-LD.
 */
export function cleanTitleName(t: string | undefined): string | undefined {
  if (!t) return undefined;
  let s = t.replace(/^\s*(buy|shop)\s+/i, "");
  const m = s.match(/^(.*\S)\s+(?:\||–|—|-|::)\s+([^|–—]{1,40})$/);
  if (m && m[1]!.length >= 8) s = m[1]!;
  return s.trim() || undefined;
}

export function extractProduct(html: string, pageUrl: string): ImportedProduct {
  const ld = fromJsonLd(html, pageUrl);
  const meta = metaTags(html);
  const title = clean(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1], 200);
  const h1 = clean(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1], 200);

  const out: ImportedProduct = {
    name: ld.name ?? cleanTitleName(clean(meta.get("og:title"), 200))
      ?? h1?.replace(/\s+(SKU|Item|Model|Code)\s*(#|no\.?)?\s*:\s*\S+\s*$/i, "")
      ?? cleanTitleName(title),
    description: ld.description ?? cleanLong(meta.get("og:description")) ?? cleanLong(meta.get("description")),
    sku: ld.sku ?? clean(meta.get("product:retailer_item_id") ?? meta.get("sku"), 80),
    barcode: ld.barcode,
    brand: ld.brand ?? clean(meta.get("product:brand") ?? meta.get("og:brand"), 120),
    category: ld.category ?? clean(meta.get("product:category"), 120),
    price: ld.price ?? num(meta.get("product:price:amount") ?? meta.get("og:price:amount") ?? meta.get("price")),
    weightKg: ld.weightKg ?? toKg(meta.get("product:weight:value") ? `${meta.get("product:weight:value")} ${meta.get("product:weight:units") ?? "kg"}` : undefined),
    lengthCm: ld.lengthCm, widthCm: ld.widthCm, heightCm: ld.heightCm,
    images: [],
  };

  const specs = [...ld.specs];
  const seen = new Set(specs.map(([k]) => k.toLowerCase()));
  for (const row of specRows(html)) {
    if (!seen.has(row[0].toLowerCase())) { seen.add(row[0].toLowerCase()); specs.push(row); }
  }
  applySpecs(out, specs);
  if (!out.warranty && out.description) {
    const w = out.description.match(/\b(\d{1,3})[\s-]*(months?|years?|yrs?)(?:'s)?\s+(?:[a-z]+\s+)?warranty\b/i);
    if (w) out.warranty = `${w[1]} ${w[2]}`;
  }
  if (specs.length) out.technicalSpecs = specs.slice(0, SPEC_LIMIT).map(([k, v]) => `${k}: ${v}`).join("\n");

  const imgs = [...(ld.images ?? []), absUrl(meta.get("og:image:secure_url") ?? meta.get("og:image"), pageUrl), absUrl(meta.get("twitter:image"), pageUrl)];
  out.images = [...new Set(imgs.filter((u): u is string => !!u))].slice(0, 12);

  for (const k of Object.keys(out) as (keyof ImportedProduct)[]) if (out[k] === undefined) delete out[k];
  return out;
}

/** The page's readable text, capped, for Claude to fill gaps from. */
export function pageTextForAi(html: string, max = 20000): string {
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  return htmlToText(main.replace(/<(header|footer|nav)\b[\s\S]*?<\/\1>/gi, " ")).slice(0, max);
}

/** Fields Claude may fill, and only when the page's structured data didn't. */
export const AI_FIELDS = ["name", "description", "sku", "barcode", "brand", "category", "price", "weightKg", "lengthCm", "widthCm", "heightCm", "warranty", "technicalSpecs"] as const;

export const AI_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
    sku: { type: ["string", "null"] },
    barcode: { type: ["string", "null"] },
    brand: { type: ["string", "null"] },
    category: { type: ["string", "null"] },
    price: { type: ["number", "null"] },
    weightKg: { type: ["number", "null"] },
    lengthCm: { type: ["number", "null"] },
    widthCm: { type: ["number", "null"] },
    heightCm: { type: ["number", "null"] },
    warranty: { type: ["string", "null"] },
    technicalSpecs: { type: ["string", "null"] },
  },
  required: [...AI_FIELDS],
} as const;

/**
 * Merge Claude's answer under what the page said: Claude only fills a field the
 * page left empty, and its values pass the same checks (a barcode needs a valid
 * check digit, numbers must be positive). Returns which fields it filled.
 */
export function mergeAiFields(page: ImportedProduct, ai: Record<string, unknown>): { product: ImportedProduct; aiFilled: ImportField[] } {
  const product: ImportedProduct = { ...page, images: [...page.images] };
  const aiFilled: ImportField[] = [];
  for (const f of AI_FIELDS) {
    if (product[f] != null && product[f] !== "") continue;
    const v = ai[f];
    let val: string | number | undefined;
    if (f === "price" || f === "weightKg" || f === "lengthCm" || f === "widthCm" || f === "heightCm") {
      val = typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1_000_000 ? v : undefined;
    } else if (f === "barcode") {
      const g = typeof v === "string" ? v.replace(/\D/g, "") : "";
      val = validGtin(g) ? g : undefined;
    } else if (f === "description" || f === "technicalSpecs") {
      val = typeof v === "string" && v.trim() ? v.trim().slice(0, 8000) : undefined;
    } else {
      val = typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : undefined;
    }
    if (val !== undefined) { (product as unknown as Record<string, unknown>)[f] = val; aiFilled.push(f); }
  }
  return { product, aiFilled };
}

/* ── Which supplier is this site? ───────────────────────────────────────── */

/** "https://www.Example.com.au/x" or "example.com.au" → "example.com.au". */
export function siteHost(raw: string | null | undefined): string | undefined {
  const s = (raw ?? "").trim();
  if (!s) return undefined;
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`).hostname.toLowerCase();
    return host.replace(/^www\d?\./, "") || undefined;
  } catch { return undefined; }
}

/**
 * The supplier whose saved website is the page's site — same host, or one a
 * subdomain of the other (shop.example.com vs example.com). Ambiguous → none.
 */
export function matchSupplierBySite<T extends { website: string | null }>(suppliers: T[], pageUrl: string): T | undefined {
  const host = siteHost(pageUrl);
  if (!host) return undefined;
  const hits = suppliers.filter((s) => {
    const h = siteHost(s.website);
    return !!h && (h === host || host.endsWith(`.${h}`) || h.endsWith(`.${host}`));
  });
  // Prefer an exact host over a parent domain; two exact hits is ambiguous.
  const exact = hits.filter((s) => siteHost(s.website) === host);
  if (exact.length === 1) return exact[0];
  return hits.length === 1 ? hits[0] : undefined;
}

/** The site's own name (og:site_name / application-name), for a new supplier. */
export function siteName(html: string): string | undefined {
  const meta = metaTags(html);
  return clean(meta.get("og:site_name") ?? meta.get("application-name"), 120);
}
