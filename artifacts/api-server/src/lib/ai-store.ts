/**
 * The AI store generator's contract with the model.
 *
 * A generated storefront is not code — it is a `pages`/`theme` JSON document of
 * exactly the shape the Design editor already saves and the public storefront
 * already renders. That is the whole reason this feature is safe: the model
 * picks blocks from a fixed catalogue and fills in their fields, and everything
 * it produces is drawn by the same `BlockPreview` a hand-built store uses. No
 * generated markup ever reaches a page.
 *
 * Three layers enforce that, in order:
 *
 *  1. **The JSON Schema** (`storeOutputSchema`) constrains block `type` to
 *     `AI_BLOCK_TYPES` and the theme to hex colours and known enums. Claude
 *     enforces this server-side via structured outputs.
 *  2. **Zod** (`generatedSiteSchema`) re-checks the parsed value, because the
 *     OpenAI fallback path only has the schema *described* to it, and because a
 *     schema-valid document can still be nonsense (30 pages, 500 blocks).
 *  3. **`coerceBlockData`** reduces each block's `data` to the exact fields that
 *     block type declares, coercing each to the type its default has. This is
 *     what makes a permissive `data` object in the schema safe: unknown keys are
 *     dropped rather than trusted.
 *
 * Nothing here writes to the database. Generation returns a document; applying
 * it is a separate, explicit action the merchant takes in the editor through the
 * existing save path — so a generation can never overwrite a live storefront.
 */
import { z } from "zod/v4";
import {
  AI_BLOCK_TYPES,
  BLOCK_DEFAULTS,
  BLOCK_DESCRIPTIONS,
  coerceBlockData,
  type BlockData,
  type BlockType,
} from "@workspace/online-store-blocks";

/** Ceilings that keep one generation from producing an unreviewable site. */
export const MAX_PAGES = 6;
export const MAX_BLOCKS_PER_PAGE = 18;

const HEX = /^#[0-9a-fA-F]{6}$/;

/* ─── What the model is told it may build ────────────────────────────────── */

/**
 * The block catalogue as prose, one line per block: its name, what it is for,
 * and the exact field names it understands with their default values.
 *
 * Generated from the shared catalogue rather than written out, so a block added
 * to `@workspace/online-store-blocks` is described to the model automatically
 * and can never be described wrongly.
 */
export function blockCatalogueBrief(): string {
  return AI_BLOCK_TYPES.map((type) => {
    const fields = Object.entries(BLOCK_DEFAULTS[type])
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(", ");
    return `- "${type}" — ${BLOCK_DESCRIPTIONS[type]}\n    fields: ${fields}`;
  }).join("\n");
}

/**
 * JSON Schema handed to Claude's structured outputs.
 *
 * `data` is deliberately an unconstrained object. A per-type discriminated
 * schema would be 24 branches of `oneOf` for no gain: the field names are given
 * to the model in the catalogue brief above, and `coerceBlockData` is what
 * actually decides which keys survive. Constraining `data` here would add a
 * second place to update whenever a block gains a field.
 */
export function storeOutputSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["theme", "pages"],
    properties: {
      theme: {
        type: "object",
        additionalProperties: false,
        required: ["primary", "accent", "bg", "text", "font", "radius"],
        properties: {
          primary: { type: "string", description: "Brand colour, #RRGGBB." },
          accent: { type: "string", description: "Secondary colour, #RRGGBB." },
          bg: { type: "string", description: "Page background, #RRGGBB." },
          text: { type: "string", description: "Body text colour, #RRGGBB. Must contrast with bg." },
          font: { type: "string", enum: ["sans", "serif", "mono"] },
          radius: { type: "string", enum: ["none", "sm", "md", "lg"] },
        },
      },
      pages: {
        type: "array",
        minItems: 1,
        maxItems: MAX_PAGES,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "slug", "blocks"],
          properties: {
            name: { type: "string", description: 'Nav label, e.g. "Home", "About".' },
            slug: { type: "string", description: 'Path starting with "/". The home page must be "/".' },
            seoTitle: { type: "string" },
            seoDescription: { type: "string", description: "Under 160 characters." },
            blocks: {
              type: "array",
              minItems: 1,
              maxItems: MAX_BLOCKS_PER_PAGE,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["type", "data"],
                properties: {
                  type: { type: "string", enum: [...AI_BLOCK_TYPES] },
                  data: {
                    type: "object",
                    description:
                      "Field values for this block type. Use only the field names listed for that type; omit a field to keep its default.",
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

/* ─── The brief ──────────────────────────────────────────────────────────── */

export interface StoreContext {
  businessName: string;
  storeName: string;
  tagline: string;
  description: string;
  businessCategories: string[];
  categories: string[];
  products: Array<{ name: string; price: number; category: string | null }>;
  brandColors: string[];
  phone: string;
  email: string;
  address: string;
  openingHours: string;
  /** Features the merchant has switched on — the AI should only lean on these. */
  enabledFeatures: string[];
}

export function buildStorePrompt(ctx: StoreContext): string {
  const productLines = ctx.products.length
    ? ctx.products
        .slice(0, 40)
        .map((p) => `  - ${p.name} — $${p.price.toFixed(2)} AUD${p.category ? ` (${p.category})` : ""}`)
        .join("\n")
    : "  (no products in the catalogue yet)";

  return `You are a web designer building an online storefront for "${ctx.businessName}", an Australian retail business using KoaPOS.

You do not write HTML, CSS or code. You choose blocks from a fixed catalogue and fill in their fields. The storefront renders your blocks itself.

BUSINESS
- Trading name: ${ctx.businessName}
- Store name: ${ctx.storeName || ctx.businessName}
- Tagline: ${ctx.tagline || "(none set)"}
- About: ${ctx.description || "(none set)"}
- Type of business: ${ctx.businessCategories.join(", ") || "general retail"}
- Contact: ${[ctx.phone, ctx.email, ctx.address].filter(Boolean).join(" · ") || "(none on file)"}
- Opening hours: ${ctx.openingHours || "(none on file)"}
- Existing brand colours: ${ctx.brandColors.join(", ") || "(none set — choose colours that suit the business)"}

PRODUCT CATEGORIES
${ctx.categories.length ? ctx.categories.map((c) => `  - ${c}`).join("\n") : "  (none yet)"}

PRODUCTS (a sample of the live catalogue)
${productLines}

STORE FEATURES THE MERCHANT HAS ENABLED
${ctx.enabledFeatures.length ? ctx.enabledFeatures.map((f) => `  - ${f}`).join("\n") : "  (none — avoid loyalty, newsletter and quick-code blocks)"}

BLOCK CATALOGUE — you may only use these types, and only these field names
${blockCatalogueBrief()}

RULES
1. The first page must be the home page with slug "/". Later pages use lowercase slugs like "/about" or "/shop".
2. Write real copy about THIS business using the details above. Never write placeholder text like "Lorem ipsum", "Your headline here" or "Add your content".
3. You cannot create images. Leave every image URL field ("imageUrl", "url" on image blocks, "shareImage") as an empty string — the merchant adds their own artwork afterwards. Product blocks pull real product photos from the catalogue automatically, so prefer them over image blocks.
4. Only reference products and categories that appear above, by their exact names.
5. Only use "loyalty-banner", "newsletter" or "quick-code" blocks if the matching feature is listed as enabled.
6. Contact and map blocks must use the real contact details above. If a detail is missing, leave that field empty rather than inventing one.
7. Prices are AUD. Use Australian spelling and tone.
8. Choose theme colours that suit the business and keep "text" strongly readable against "bg". Use the existing brand colours when there are any.
9. Aim for 5–9 blocks on the home page and 3–6 on other pages. Every page needs a clear purpose; do not pad.`;
}

/* ─── Validating what came back ──────────────────────────────────────────── */

const themeSchema = z.object({
  primary: z.string().regex(HEX),
  accent: z.string().regex(HEX),
  bg: z.string().regex(HEX),
  text: z.string().regex(HEX),
  font: z.enum(["sans", "serif", "mono"]),
  radius: z.enum(["none", "sm", "md", "lg"]),
});

const blockSchema = z.object({
  type: z.enum(AI_BLOCK_TYPES as [BlockType, ...BlockType[]]),
  data: z.record(z.string(), z.unknown()).default({}),
});

const pageSchema = z.object({
  name: z.string().min(1).max(60),
  slug: z.string().min(1).max(80),
  seoTitle: z.string().max(120).optional(),
  seoDescription: z.string().max(300).optional(),
  blocks: z.array(blockSchema).min(1).max(MAX_BLOCKS_PER_PAGE),
});

export const generatedSiteSchema = z.object({
  theme: themeSchema,
  pages: z.array(pageSchema).min(1).max(MAX_PAGES),
});

export type GeneratedSite = z.infer<typeof generatedSiteSchema>;

/** The shape handed back to the editor — ids included so it can render at once. */
export interface StoreDraftBlock {
  id: string;
  type: BlockType;
  data: BlockData;
}
export interface StoreDraftPage {
  id: string;
  name: string;
  slug: string;
  visible: boolean;
  seoTitle?: string;
  seoDescription?: string;
  blocks: StoreDraftBlock[];
}
export interface StoreDraft {
  theme: z.infer<typeof themeSchema>;
  pages: StoreDraftPage[];
}

/** `/About Us` → `/about-us`; anything unusable becomes the home slug. */
function normaliseSlug(raw: string, isFirst: boolean): string {
  if (isFirst) return "/";
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/[^a-z0-9/-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned ? `/${cleaned}` : "/page";
}

let counter = 0;
function draftId(prefix: string): string {
  counter += 1;
  return `${prefix}-ai-${Date.now().toString(36)}-${counter.toString(36)}`;
}

/**
 * Turn a validated generation into a draft the editor can render.
 *
 * Every block's data goes through `coerceBlockData`, so a field the model
 * invented is dropped here and never reaches the editor, let alone the database.
 * Duplicate slugs are disambiguated rather than rejected — losing a good page to
 * a naming collision would be a worse outcome than renaming it.
 */
export function toStoreDraft(site: GeneratedSite): StoreDraft {
  const seenSlugs = new Set<string>();

  const pages = site.pages.map((page, i) => {
    let slug = normaliseSlug(page.slug, i === 0);
    if (seenSlugs.has(slug)) {
      let n = 2;
      while (seenSlugs.has(`${slug}-${n}`)) n += 1;
      slug = `${slug}-${n}`;
    }
    seenSlugs.add(slug);

    return {
      id: draftId("p"),
      name: page.name,
      slug,
      visible: true,
      ...(page.seoTitle ? { seoTitle: page.seoTitle } : {}),
      ...(page.seoDescription ? { seoDescription: page.seoDescription } : {}),
      blocks: page.blocks.map((block) => ({
        id: draftId("b"),
        type: block.type,
        data: coerceBlockData(block.type, block.data),
      })),
    };
  });

  return { theme: site.theme, pages };
}
