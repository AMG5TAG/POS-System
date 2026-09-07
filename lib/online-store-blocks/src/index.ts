/**
 * The storefront block catalogue, as data.
 *
 * Two consumers need the same answer to "what blocks exist and what fields does
 * each one carry": the Design editor, which renders them, and the AI store
 * generator on the server, which has to hand Claude a JSON Schema it cannot
 * step outside. Keeping the catalogue here — rather than only in the editor,
 * which also owns icons and labels and so cannot be imported by the API server —
 * is what makes drift between the two structurally impossible instead of merely
 * discouraged.
 *
 * The editor builds BLOCK_LIBRARY from BLOCK_DEFAULTS, so a block added here
 * reaches both sides at once. A block added only in the editor would have no
 * defaults to build from and would not compile.
 */

export type BlockType =
  | "hero"
  | "heading"
  | "text"
  | "image"
  | "product-grid"
  | "featured-product"
  | "gallery"
  | "cta"
  | "newsletter"
  | "contact"
  | "spacer"
  | "loyalty-banner"
  | "quick-code"
  | "video"
  | "testimonials"
  | "faq"
  | "columns"
  | "countdown"
  | "social"
  | "map"
  | "pricing"
  | "html"
  | "iframe"
  | "similar-products"
  | "menu"
  | "product-category";

export type BlockData = Record<string, string | number | boolean>;

/** Every block type, in the order the editor lists them. */
export const BLOCK_TYPES: BlockType[] = [
  "hero",
  "heading",
  "text",
  "image",
  "product-grid",
  "featured-product",
  "gallery",
  "cta",
  "newsletter",
  "contact",
  "spacer",
  "loyalty-banner",
  "quick-code",
  "video",
  "testimonials",
  "faq",
  "columns",
  "countdown",
  "social",
  "map",
  "pricing",
  "html",
  "iframe",
  "similar-products",
  "menu",
  "product-category",
];

/**
 * The starting values for each block, and — because every field a block
 * understands appears here — the authoritative field list and field *types*.
 */
export const BLOCK_DEFAULTS: Record<BlockType, BlockData> = {
  "hero": {"headline":"Welcome to our store","subhead":"Discover what we have to offer","cta":"Shop now","ctaLink":"/shop","imageUrl":""},
  "heading": {"text":"Section Heading","size":"lg","align":"left"},
  "text": {"text":"Add your content here. Tell your customers what makes your store special."},
  "image": {"url":"","alt":"Image","caption":""},
  "product-grid": {"columns":4,"count":8,"category":"all"},
  "featured-product": {"productSku":"","layout":"right"},
  "gallery": {"columns":3},
  "cta": {"headline":"Ready to start?","text":"Take the next step","buttonText":"Get started","buttonLink":"/contact"},
  "newsletter": {"headline":"Stay in the loop","text":"Sign up for new arrivals and special offers"},
  "contact": {"phone":"","email":"","address":"","hours":""},
  "spacer": {"height":48},
  "loyalty-banner": {"headline":"Join our rewards program","text":"Earn points on every purchase","points":100},
  "quick-code": {"code":""},
  "video": {"url":"","caption":""},
  "testimonials": {"quote1":"Fantastic service and quality!","author1":"Happy Customer","quote2":"I'll definitely be back.","author2":"Local Regular","quote3":"","author3":""},
  "faq": {"q1":"What are your hours?","a1":"We're open 9–5, Mon–Sat.","q2":"Do you offer delivery?","a2":"Yes, within the local area.","q3":"","a3":""},
  "columns": {"columns":3,"col1":"Quality first","col2":"Fast service","col3":"Local & trusted","col4":""},
  "countdown": {"headline":"Sale ends in","target":""},
  "social": {"facebook":"","instagram":"","twitter":"","tiktok":"","youtube":""},
  "map": {"address":"","zoom":14},
  "pricing": {"name1":"Basic","price1":"$9","features1":"Feature A, Feature B","name2":"Pro","price2":"$29","features2":"Everything in Basic, Feature C, Feature D","name3":"","price3":"","features3":""},
  "html": {"html":"<div style=\"padding:24px;text-align:center;font-weight:600\">Your custom HTML here</div>"},
  "iframe": {"url":"","height":400,"title":"Embedded content"},
  "similar-products": {"headline":"You may also like","productSku":"","count":4},
  "menu": {"headline":"Menu","items":"Flat White | $4.50\nMuffin | $5.00\nToasted Sandwich | $9.00"},
  "product-category": {"headline":"Shop the range","category":"all","columns":4,"count":8},
};

/** What each block is for. Used to brief the AI generator. */
export const BLOCK_DESCRIPTIONS: Record<BlockType, string> = {
  "hero": "Full-width header with image, headline and CTA",
  "heading": "Section title",
  "text": "Paragraph copy",
  "image": "Single image",
  "product-grid": "Grid of products from your catalogue",
  "featured-product": "Highlight a single product",
  "gallery": "Grid of images",
  "cta": "Banner with button",
  "newsletter": "Email signup form",
  "contact": "Business contact details",
  "spacer": "Vertical spacing",
  "loyalty-banner": "Promote your loyalty program",
  "quick-code": "Embed a QR code or short URL",
  "video": "Embed a YouTube or Vimeo video",
  "testimonials": "Customer quotes / reviews",
  "faq": "Expandable question & answer list",
  "columns": "Multi-column text layout",
  "countdown": "Count down to a date (e.g. a sale)",
  "social": "Links to your social profiles",
  "map": "Embedded map of your location",
  "pricing": "Compare plans or packages",
  "html": "Paste your own raw HTML",
  "iframe": "Embed an external page or widget by URL",
  "similar-products": "Show products related to one item",
  "menu": "A food / service menu list with prices",
  "product-category": "Grid of products from a chosen category",
};

/**
 * Blocks an AI generator may never author.
 *
 * "html" and "iframe" are raw-markup escape hatches: the first injects
 * merchant-authored HTML into the page, the second embeds an arbitrary origin.
 * Both are legitimate for a merchant who types them deliberately, and neither
 * is something a language model should be able to place on a live storefront —
 * so generation is denied them even though the editor still offers them.
 */
export const AI_FORBIDDEN_BLOCKS: BlockType[] = ["html", "iframe"];

/** The blocks the AI store generator is allowed to emit. */
export const AI_BLOCK_TYPES: BlockType[] = BLOCK_TYPES.filter(
  (t) => !AI_FORBIDDEN_BLOCKS.includes(t),
);

export function isBlockType(value: unknown): value is BlockType {
  return typeof value === "string" && (BLOCK_TYPES as string[]).includes(value);
}

/**
 * Reduce arbitrary parsed JSON to data this block type actually understands.
 *
 * Unknown keys are dropped and every known key is coerced to the type its
 * default has, so generated data can neither introduce a field the renderers
 * ignore nor change a field's type out from under them. Missing keys keep their
 * default. This is the boundary the AI generator's output crosses; nothing
 * downstream re-checks it.
 */
export function coerceBlockData(type: BlockType, raw: unknown): BlockData {
  const defaults = BLOCK_DEFAULTS[type];
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: BlockData = {};

  for (const [key, fallback] of Object.entries(defaults)) {
    const value = input[key];
    if (value === undefined || value === null) {
      out[key] = fallback;
      continue;
    }
    if (typeof fallback === "number") {
      const n = typeof value === "number" ? value : Number(value);
      out[key] = Number.isFinite(n) ? n : fallback;
    } else if (typeof fallback === "boolean") {
      out[key] = typeof value === "boolean" ? value : value === "true";
    } else {
      out[key] = typeof value === "string" ? value : String(value);
    }
  }
  return out;
}
