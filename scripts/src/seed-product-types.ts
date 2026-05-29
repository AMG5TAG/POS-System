import { db, merchantsTable, productTypesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const DEFAULT_PRODUCT_TYPES: Array<{ name: string; slug: string; sortOrder: number }> = [
  { name: "Standard", slug: "standard", sortOrder: 0 },
  { name: "3D Print",  slug: "3d_print", sortOrder: 1 },
  { name: "Bundle",    slug: "bundle",   sortOrder: 2 },
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
