import { db, merchantsTable, productTypesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const DEFAULT_PRODUCT_TYPES: Array<{
  name: string; slug: string; sortOrder: number;
  description: string; trackStock: boolean; printCode: boolean;
  requiresShipping: boolean; hasVariants: boolean; isDigital: boolean; isService: boolean; isComposite: boolean;
}> = [
  { name: "Standard", slug: "standard", sortOrder: 0, description: "Physical, basic inventory tracking", trackStock: true, printCode: false, requiresShipping: true, hasVariants: false, isDigital: false, isService: false, isComposite: false },
  { name: "Variable", slug: "variable", sortOrder: 1, description: "Parent with child variants for sizes, colours, attributes", trackStock: true, printCode: false, requiresShipping: true, hasVariants: true, isDigital: false, isService: false, isComposite: false },
  { name: "Digital",  slug: "digital",  sortOrder: 2, description: "Downloadable files, no physical shipping", trackStock: false, printCode: false, requiresShipping: false, hasVariants: false, isDigital: true, isService: false, isComposite: false },
  { name: "Service",  slug: "service",  sortOrder: 3, description: "Time-based or labour-based, non-shippable", trackStock: false, printCode: false, requiresShipping: false, hasVariants: false, isDigital: false, isService: true, isComposite: false },
  { name: "Composite", slug: "composite", sortOrder: 4, description: "Bundles or kits made from existing items, adjusting constituent stock", trackStock: true, printCode: false, requiresShipping: true, hasVariants: false, isDigital: false, isService: false, isComposite: true },
  { name: "Digital Code", slug: "digital_code", sortOrder: 5, description: "Digital product keys (game keys, software licences)", trackStock: true, printCode: true, requiresShipping: false, hasVariants: false, isDigital: true, isService: false, isComposite: false },
];

async function main() {
  const merchants = await db.select({ id: merchantsTable.id }).from(merchantsTable);

  let total = 0;
  for (const merchant of merchants) {
    const existing = await db
      .select({ slug: productTypesTable.slug })
      .from(productTypesTable)
      .where(
        eq(productTypesTable.merchantId, merchant.id)
      );

    const existingSlugs = new Set(existing.map((r) => r.slug));
    const missing = DEFAULT_PRODUCT_TYPES.filter((t) => !existingSlugs.has(t.slug));

    if (missing.length === 0) {
      console.log(`Merchant ${merchant.id}: all types present, skipping`);
      continue;
    }

    await db.insert(productTypesTable).values(
      missing.map((t) => ({
        merchantId: merchant.id,
        name: t.name,
        slug: t.slug,
        description: t.description,
        trackStock: t.trackStock,
        printCode: t.printCode,
        requiresShipping: t.requiresShipping,
        hasVariants: t.hasVariants,
        isDigital: t.isDigital,
        isService: t.isService,
        isComposite: t.isComposite,
        sortOrder: t.sortOrder,
      }))
    );

    console.log(
      `Merchant ${merchant.id}: added ${missing.map((t) => t.slug).join(", ")}`
    );
    total += missing.length;
  }

  console.log(`Done — inserted ${total} product type row(s) across ${merchants.length} merchant(s)`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
