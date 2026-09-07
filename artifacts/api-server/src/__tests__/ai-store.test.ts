/**
 * The AI store generator's safety boundary.
 *
 * Everything a language model produces for the storefront crosses exactly one
 * seam — `generatedSiteSchema` then `toStoreDraft` — and nothing downstream
 * re-checks it. These tests hold that seam: that a generated block can only be
 * a type the renderers know, that its data can only contain fields that block
 * declares, and that the raw-markup blocks are unreachable by generation even
 * though the editor still offers them to a merchant typing by hand.
 */
import { describe, it, expect } from "vitest";
import {
  AI_BLOCK_TYPES,
  AI_FORBIDDEN_BLOCKS,
  BLOCK_DEFAULTS,
  BLOCK_TYPES,
  coerceBlockData,
} from "@workspace/online-store-blocks";
import {
  blockCatalogueBrief,
  generatedSiteSchema,
  storeOutputSchema,
  toStoreDraft,
  MAX_PAGES,
  MAX_BLOCKS_PER_PAGE,
} from "../lib/ai-store";

const THEME = {
  primary: "#0EA5E9",
  accent: "#06B6D4",
  bg: "#F8FAFC",
  text: "#0F172A",
  font: "sans",
  radius: "md",
} as const;

function site(pages: unknown[]) {
  return { theme: THEME, pages };
}

describe("the block catalogue the model is given", () => {
  it("offers every block except the raw-markup escape hatches", () => {
    expect(AI_FORBIDDEN_BLOCKS).toEqual(["html", "iframe"]);
    expect(AI_BLOCK_TYPES).toEqual(BLOCK_TYPES.filter((t) => !AI_FORBIDDEN_BLOCKS.includes(t)));
    expect(AI_BLOCK_TYPES).not.toContain("html");
    expect(AI_BLOCK_TYPES).not.toContain("iframe");
  });

  it("constrains the JSON schema's block type to exactly those blocks", () => {
    const schema = storeOutputSchema() as Record<string, any>;
    const typeEnum = schema.properties.pages.items.properties.blocks.items.properties.type.enum;
    expect(typeEnum).toEqual([...AI_BLOCK_TYPES]);
  });

  it("caps pages and blocks in the schema as well as in validation", () => {
    const schema = storeOutputSchema() as Record<string, any>;
    expect(schema.properties.pages.maxItems).toBe(MAX_PAGES);
    expect(schema.properties.pages.items.properties.blocks.maxItems).toBe(MAX_BLOCKS_PER_PAGE);
  });

  it("describes each allowed block with its real field names", () => {
    const brief = blockCatalogueBrief();
    for (const type of AI_BLOCK_TYPES) {
      expect(brief).toContain(`"${type}"`);
      for (const field of Object.keys(BLOCK_DEFAULTS[type])) {
        expect(brief).toContain(field);
      }
    }
    // A brief that advertised the escape hatches would invite the model to try.
    expect(brief).not.toContain('"html"');
    expect(brief).not.toContain('"iframe"');
  });
});

describe("generatedSiteSchema", () => {
  const page = (blocks: unknown[]) => ({ name: "Home", slug: "/", blocks });

  it("accepts a well-formed design", () => {
    const parsed = generatedSiteSchema.safeParse(
      site([page([{ type: "hero", data: { headline: "Fresh coffee daily" } }])]),
    );
    expect(parsed.success).toBe(true);
  });

  it("rejects a block type outside the catalogue", () => {
    const parsed = generatedSiteSchema.safeParse(
      site([page([{ type: "script-tag", data: {} }])]),
    );
    expect(parsed.success).toBe(false);
  });

  it("rejects the raw-markup blocks even though the editor has them", () => {
    for (const type of AI_FORBIDDEN_BLOCKS) {
      const parsed = generatedSiteSchema.safeParse(site([page([{ type, data: {} }])]));
      expect(parsed.success, `${type} must not be generatable`).toBe(false);
    }
  });

  it("rejects a theme colour that is not a hex value", () => {
    const parsed = generatedSiteSchema.safeParse({
      theme: { ...THEME, primary: "javascript:alert(1)" },
      pages: [page([{ type: "heading", data: {} }])],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a design larger than a merchant could review", () => {
    const many = Array.from({ length: MAX_PAGES + 1 }, (_, i) => ({
      name: `P${i}`,
      slug: `/p${i}`,
      blocks: [{ type: "heading", data: {} }],
    }));
    expect(generatedSiteSchema.safeParse(site(many)).success).toBe(false);
  });

  it("rejects a page with no blocks at all", () => {
    expect(generatedSiteSchema.safeParse(site([page([])])).success).toBe(false);
  });
});

describe("coerceBlockData", () => {
  it("drops fields the block type does not declare", () => {
    const data = coerceBlockData("heading", {
      text: "Our range",
      onclick: "steal()",
      dangerouslySetInnerHTML: "<script>",
    });
    expect(data).toEqual({ text: "Our range", size: "lg", align: "left" });
    expect(data).not.toHaveProperty("onclick");
  });

  it("keeps the default for a field the model omitted", () => {
    expect(coerceBlockData("spacer", {})).toEqual(BLOCK_DEFAULTS.spacer);
  });

  it("coerces a value to the type the field's default has", () => {
    const grid = coerceBlockData("product-grid", { columns: "3", count: "12" });
    expect(grid.columns).toBe(3);
    expect(grid.count).toBe(12);
  });

  it("falls back to the default when a number cannot be salvaged", () => {
    expect(coerceBlockData("spacer", { height: "tall" }).height).toBe(
      BLOCK_DEFAULTS.spacer.height,
    );
  });

  it("never returns a key the block does not declare, for any block type", () => {
    for (const type of BLOCK_TYPES) {
      const out = coerceBlockData(type, { injected: "x", __proto__: { polluted: true } });
      expect(Object.keys(out).sort()).toEqual(Object.keys(BLOCK_DEFAULTS[type]).sort());
    }
  });
});

describe("toStoreDraft", () => {
  const parse = (pages: unknown[]) => {
    const parsed = generatedSiteSchema.safeParse(site(pages));
    if (!parsed.success) throw new Error("fixture failed validation");
    return toStoreDraft(parsed.data);
  };

  it("forces the first page onto the home slug whatever the model called it", () => {
    const draft = parse([
      { name: "Welcome", slug: "/welcome", blocks: [{ type: "hero", data: {} }] },
    ]);
    expect(draft.pages[0]!.slug).toBe("/");
  });

  it("normalises later slugs to lowercase paths", () => {
    const draft = parse([
      { name: "Home", slug: "/", blocks: [{ type: "hero", data: {} }] },
      { name: "About Us", slug: "About Us", blocks: [{ type: "text", data: {} }] },
    ]);
    expect(draft.pages[1]!.slug).toBe("/about-us");
  });

  it("disambiguates duplicate slugs rather than dropping a page", () => {
    const draft = parse([
      { name: "Home", slug: "/", blocks: [{ type: "hero", data: {} }] },
      { name: "Shop", slug: "/shop", blocks: [{ type: "product-grid", data: {} }] },
      { name: "Store", slug: "/shop", blocks: [{ type: "product-grid", data: {} }] },
    ]);
    expect(draft.pages).toHaveLength(3);
    expect(draft.pages[2]!.slug).toBe("/shop-2");
  });

  it("gives every page and block a distinct id so the editor can render at once", () => {
    const draft = parse([
      { name: "Home", slug: "/", blocks: [{ type: "hero", data: {} }, { type: "cta", data: {} }] },
      { name: "About", slug: "/about", blocks: [{ type: "text", data: {} }] },
    ]);
    const ids = [
      ...draft.pages.map((p) => p.id),
      ...draft.pages.flatMap((p) => p.blocks.map((b) => b.id)),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("sanitises every block's data on the way through", () => {
    const draft = parse([
      {
        name: "Home",
        slug: "/",
        blocks: [{ type: "hero", data: { headline: "Hi", script: "<script>alert(1)</script>" } }],
      },
    ]);
    const block = draft.pages[0]!.blocks[0]!;
    expect(block.data).not.toHaveProperty("script");
    expect(Object.keys(block.data).sort()).toEqual(Object.keys(BLOCK_DEFAULTS.hero).sort());
  });

  it("marks generated pages visible so the merchant sees what was made", () => {
    const draft = parse([{ name: "Home", slug: "/", blocks: [{ type: "hero", data: {} }] }]);
    expect(draft.pages[0]!.visible).toBe(true);
  });
});
