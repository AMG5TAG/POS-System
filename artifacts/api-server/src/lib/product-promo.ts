/**
 * Inventory › Promotions — the rules for a promo card's words, with no `db` or
 * `req` in sight (the route queries, this decides). Pinned by
 * `product-promo.test.ts`.
 *
 * Three templates print from one saved copy:
 *  - `classic`   — 6×4 portrait: name, five features, one-line pitch, price.
 *  - `products`  — square: name, subtitle, condition banner, price, five
 *                  features, photo, pitch heading + blurb, shop QR.
 *  - `computers` — square: as `products`, but eight spec tiles (CPU, RAM, …)
 *                  instead of the five features.
 *
 * Name, price, photo and QR always come live from the product, so a price
 * change is on the next print without anyone re-saving the copy.
 */

export const PROMO_TEMPLATES = ["classic", "products", "computers"] as const;
export type PromoTemplate = (typeof PROMO_TEMPLATES)[number];

export const PROMO_SPEC_KEYS = ["cpu", "ram", "storage", "gpu", "display", "os", "warranty", "grade"] as const;
export type PromoSpecKey = (typeof PROMO_SPEC_KEYS)[number];
export type PromoSpecs = Record<PromoSpecKey, string>;

export const PROMO_FEATURE_COUNT = 5;
/** Longer than this will not fit one line of a card at a readable size. */
export const PROMO_FEATURE_MAX = 60;
export const PROMO_PITCH_MAX = 120;
export const PROMO_HEADLINE_MAX = 80;
export const PROMO_SUBTITLE_MAX = 80;
export const PROMO_BANNER_MAX = 80;
export const PROMO_BLURB_MAX = 220;
export const PROMO_SPEC_MAX = 30;

/** Printed on the condition strip when a product reads as refurbished. */
export const REFURB_BANNER = "Refurbished - Works Perfectly - Fully Tested";

export interface PromoSource {
  name: string;
  description?: string | null;
  technicalSpecs?: string | null;
  brand?: string | null;
  category?: string | null;
  warrantyDuration?: number | null;
  warrantyUnit?: string | null;
}

export interface PromoCopy {
  headline: string;
  subtitle: string;
  banner: string;
  features: string[];
  pitch: string;
  blurb: string;
  specs: PromoSpecs;
}

function tidy(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Descriptions may be pasted HTML; the card is plain text. */
export function stripHtml(s: string): string {
  return s
    .replace(/<\s*(br|\/p|\/li|\/div|\/h\d)\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Cut on a word boundary rather than mid-word. */
function cut(s: string, max: number): string {
  const t = tidy(s);
  if (t.length <= max) return t;
  const head = t.slice(0, max + 1);
  const sp = head.lastIndexOf(" ");
  return (sp > max * 0.6 ? head.slice(0, sp) : t.slice(0, max)).replace(/[,;:\-–—\s]+$/, "");
}

function str(raw: unknown, max: number): string {
  return typeof raw === "string" ? cut(raw, max) : "";
}

/** Trim, drop blanks and duplicates (case-insensitively), cap length and count. */
export function cleanFeatures(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of raw) {
    if (typeof f !== "string") continue;
    const t = cut(f.replace(/^[\s•\-*·▪●◦✓✔]+/, "").replace(/[.;]+$/, ""), PROMO_FEATURE_MAX);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= PROMO_FEATURE_COUNT) break;
  }
  return out;
}

export function emptySpecs(): PromoSpecs {
  return { cpu: "", ram: "", storage: "", gpu: "", display: "", os: "", warranty: "", grade: "" };
}

/**
 * Every field present, trimmed and capped. Used on read as well as write: a
 * stored row may predate a field, or be hand-edited.
 */
export function cleanPromoCopy(raw: unknown): PromoCopy {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (r.specs && typeof r.specs === "object" ? r.specs : {}) as Record<string, unknown>;
  const specs = emptySpecs();
  for (const k of PROMO_SPEC_KEYS) specs[k] = str(s[k], PROMO_SPEC_MAX);
  return {
    headline: str(r.headline, PROMO_HEADLINE_MAX),
    subtitle: str(r.subtitle, PROMO_SUBTITLE_MAX),
    banner: str(r.banner, PROMO_BANNER_MAX),
    features: cleanFeatures(r.features),
    pitch: str(r.pitch, PROMO_PITCH_MAX),
    blurb: str(r.blurb, PROMO_BLURB_MAX),
    specs,
  };
}

export function cleanTemplate(raw: unknown): PromoTemplate {
  return (PROMO_TEMPLATES as readonly string[]).includes(raw as string) ? (raw as PromoTemplate) : "classic";
}

const COMPUTER_RE = /\b(laptops?|notebooks?|desktops?|computers?|pcs?|all[- ]in[- ]one|aio|workstations?|macbooks?|imacs?|mac mini|chromebooks?|ultrabooks?|thinkpads?|optiplex|elitebook|probook|latitude)\b/i;

/** Computers get the spec-tile template; everything else the five-feature one. */
export function suggestTemplate(src: Pick<PromoSource, "name" | "category">): Exclude<PromoTemplate, "classic"> {
  return COMPUTER_RE.test(`${src.category ?? ""} ${src.name}`) ? "computers" : "products";
}

const BULLET_RE = /^\s*(?:[•\-*·▪●◦✓✔]|\d+[.)])\s+(.+)$/;
const SPEC_RE = /^\s*([^:]{2,40}):\s*(.+)$/;

function descriptionBullets(text: string): string[] {
  return text.split(/\n/).map((l) => BULLET_RE.exec(l)?.[1] ?? "").filter(Boolean);
}

function specPairs(specs: string): Array<[string, string]> {
  return specs.split(/\n/).flatMap((l) => {
    const m = SPEC_RE.exec(l);
    if (!m) return [];
    const value = tidy(m[2]!);
    return value ? [[tidy(m[1]!), value] as [string, string]] : [];
  });
}

/** "Storage: 1TB SSD" reads better on a card as "1TB SSD storage" when short. */
function specFeature([label, value]: [string, string]): string {
  return value.split(" ").length <= 3 && !value.toLowerCase().includes(label.toLowerCase())
    ? `${value} ${label.toLowerCase()}`
    : `${label}: ${value}`;
}

function sentences(text: string): string[] {
  return text
    .split(/\n/)
    .filter((l) => !BULLET_RE.test(l) && !SPEC_RE.test(l))
    .join(" ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => tidy(s).replace(/[.!]+$/, ""))
    .filter((s) => s.length >= 4);
}

function warrantyText(src: PromoSource): string {
  const n = src.warrantyDuration ?? 0;
  if (n <= 0) return "";
  const unit = src.warrantyUnit === "years" ? "year" : "month";
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/** Which spec tile a "Label: value" line belongs on, by its label. */
const SPEC_LABELS: Array<[PromoSpecKey, RegExp]> = [
  ["cpu", /\b(cpu|processor|chip|chipset)\b/i],
  ["ram", /\b(ram|memory)\b/i],
  ["storage", /\b(storage|ssd|hdd|hard ?drive|disk|drive|capacity)\b/i],
  ["gpu", /\b(gpu|graphics|video ?card)\b/i],
  ["display", /\b(display|screen|monitor|panel|resolution)\b/i],
  ["os", /\b(os|operating ?system|software)\b/i],
  ["warranty", /\bwarranty\b/i],
  ["grade", /\b(grade|condition|cosmetic)\b/i],
];

export function extractSpecs(src: PromoSource): PromoSpecs {
  const specs = emptySpecs();
  for (const [label, value] of specPairs(stripHtml(src.technicalSpecs ?? ""))) {
    const hit = SPEC_LABELS.find(([k, re]) => !specs[k] && re.test(label));
    if (hit) specs[hit[0]] = cut(value, PROMO_SPEC_MAX);
  }
  if (!specs.warranty) specs.warranty = warrantyText(src);
  return specs;
}

/**
 * Draft copy from the product's own data, used when no AI account is
 * connected (or the AI call fails). Never invents anything: every feature is a
 * line the merchant wrote somewhere on the product.
 *
 * Features, in order of preference: bullets in the description, technical
 * specs, short description sentences, the warranty. The pitch is the first
 * prose sentence that fits; the blurb the opening of the prose.
 */
export function draftPromoFromProduct(src: PromoSource): PromoCopy {
  const desc = stripHtml(src.description ?? "");
  const prose = sentences(desc);

  const pitchCandidate = prose.find((s) => s.length <= PROMO_PITCH_MAX && s.length >= 12);
  const candidates = [
    ...descriptionBullets(desc),
    ...specPairs(stripHtml(src.technicalSpecs ?? "")).map(specFeature),
    ...prose.filter((s) => s.length <= PROMO_FEATURE_MAX && s !== pitchCandidate),
  ];
  const w = warrantyText(src);
  if (w) candidates.push(`${w} warranty`);

  const blurb = cut(prose.filter((s) => s !== pitchCandidate).join(". "), PROMO_BLURB_MAX);
  const refurb = /\b(refurb(ished)?|pre-?owned|second[- ]hand|used)\b/i.test(`${src.name} ${src.category ?? ""} ${desc}`);

  return cleanPromoCopy({
    headline: "",
    subtitle: src.category ?? "",
    banner: refurb ? REFURB_BANNER : "",
    features: candidates,
    pitch: pitchCandidate ?? (src.brand ? `Quality ${tidy(src.brand)} — available now in store` : "Available now in store"),
    blurb: blurb ? `${blurb}${/[.!?]$/.test(blurb) ? "" : "."}` : "",
    specs: extractSpecs(src),
  });
}

/** The product data handed to Claude. Kept short: this is a poster, not a datasheet. */
export function promoPrompt(src: PromoSource): string {
  const w = warrantyText(src);
  const lines = [
    `Product name: ${tidy(src.name)}`,
    src.brand ? `Brand: ${tidy(src.brand)}` : "",
    src.category ? `Category: ${tidy(src.category)}` : "",
    w ? `Warranty: ${w}` : "",
    src.description ? `Description:\n${stripHtml(src.description).slice(0, 4000)}` : "",
    src.technicalSpecs ? `Technical specs:\n${stripHtml(src.technicalSpecs).slice(0, 3000)}` : "",
  ].filter(Boolean);
  return `Write the copy for an in-store promotional card for this product.

${lines.join("\n")}

Fields:
- subtitle: what the product is, at most 6 words (e.g. "128GB Android Tablet - WiFi").
- features: exactly ${PROMO_FEATURE_COUNT} of the most compelling selling points, most important first; each at most 5 words, a noun phrase, no full stop (e.g. "11\\" TFT LCD screen").
- pitch: a punchy heading of at most 6 words (e.g. "Tablet for the family").
- blurb: one or two sentences, at most 30 words, on who it suits and why.
- specs: for computers only, very short values (at most 3 words each) for cpu, ram, storage, gpu, display, os, warranty and grade (cosmetic grade, e.g. "A Grade"); use "" for anything the data does not state, and "" for all of them when the product is not a computer.

Rules:
- Use only facts present in the product data above. Do not invent specifications, numbers or awards.
- No price, no emoji, Australian English.`;
}

const SPEC_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [...PROMO_SPEC_KEYS],
  properties: Object.fromEntries(PROMO_SPEC_KEYS.map((k) => [k, { type: "string" }])),
};

export const PROMO_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["subtitle", "features", "pitch", "blurb", "specs"],
  properties: {
    subtitle: { type: "string" },
    features: { type: "array", items: { type: "string" } },
    pitch: { type: "string" },
    blurb: { type: "string" },
    specs: SPEC_SCHEMA,
  },
};

/**
 * Merge Claude's answer over the product-data draft: AI wins where it said
 * something, the draft fills the gaps. Warranty and the condition banner come
 * from the product record, which is authoritative — the model only saw it as
 * text. Callers pass the raw model output; it is cleaned here like any input.
 */
export function mergeAiCopy(ai: unknown, draft: PromoCopy): PromoCopy {
  const a = cleanPromoCopy(ai);
  const specs = { ...draft.specs };
  for (const k of PROMO_SPEC_KEYS) if (a.specs[k] && k !== "warranty") specs[k] = a.specs[k];
  if (!specs.warranty && a.specs.warranty) specs.warranty = a.specs.warranty;
  return {
    headline: draft.headline,
    subtitle: a.subtitle || draft.subtitle,
    banner: draft.banner,
    features: a.features.length >= 3 ? a.features : draft.features,
    pitch: a.pitch || draft.pitch,
    blurb: a.blurb || draft.blurb,
    specs,
  };
}
