import { db, productTypesTable, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const DEFAULT_TYPES = [
  { slug: "standard",     name: "Standard",     description: "Regular physical product",            trackStock: true,  printCode: false },
  { slug: "variant",      name: "Variant",       description: "Product with size/colour options",    trackStock: true,  printCode: false },
  { slug: "composite",    name: "Composite",     description: "Made from other products",            trackStock: true,  printCode: false },
  { slug: "service",      name: "Service",       description: "Service item, no inventory tracking", trackStock: false, printCode: false },
  { slug: "digital",      name: "Download",      description: "Digital file download, no stock",     trackStock: false, printCode: false },
  { slug: "digital_code", name: "Digital Code",  description: "Code-based delivery, no stock",       trackStock: false, printCode: true  },
];

async function run() {
  const allProducts = await db
    .select({ merchantId: productsTable.merchantId, productType: productsTable.productType, id: productsTable.id, productTypeId: productsTable.productTypeId })
    .from(productsTable);

  const merchantIds = [...new Set(allProducts.map((p) => p.merchantId))];
  console.log(`Seeding product types for ${merchantIds.length} merchant(s), ${allProducts.length} product(s)`);

  for (const merchantId of merchantIds) {
    const existingTypes = await db.select().from(productTypesTable).where(eq(productTypesTable.merchantId, merchantId));
    const existingSlugMap = new Map(existingTypes.map((t) => [t.slug, t]));

    for (const def of DEFAULT_TYPES) {
      if (!existingSlugMap.has(def.slug)) {
        const [inserted] = await db
          .insert(productTypesTable)
          .values({ ...def, merchantId, isActive: true })
          .returning();
        existingSlugMap.set(def.slug, inserted);
        console.log(`  Created type "${def.name}" (slug: ${def.slug}) for merchant ${merchantId}`);
      }
    }

    const merchantProducts = allProducts.filter((p) => p.merchantId === merchantId && p.productTypeId == null);
    let updated = 0;
    for (const product of merchantProducts) {
      const typeRecord = existingSlugMap.get(product.productType) ?? existingSlugMap.get("standard");
      if (typeRecord) {
        await db.update(productsTable).set({ productTypeId: typeRecord.id }).where(eq(productsTable.id, product.id));
        updated++;
      }
    }
    if (updated > 0) console.log(`  Linked productTypeId on ${updated} product(s) for merchant ${merchantId}`);
  }

  console.log("Migration complete.");
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
