import { Router, type IRouter } from "express";
import {
  db,
  merchantsTable,
  productsTable,
  categoriesTable,
  brandsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

/*
 * Public, unauthenticated product page endpoint.
 *
 *   GET /public/b/:username/products/:id
 *
 * Backs the customer-facing product page a shopper lands on after scanning a
 * product QR code (printed on a sticker or shown in the app). Resolves the
 * merchant by their public username — the same identifier used by the storefront
 * and portal public routes — then returns the single active product plus light
 * business branding so the page can render standalone. Only active products are
 * served, and inventory is reduced to an in-stock signal so exact counts never
 * leak to anonymous visitors.
 */

const router: IRouter = Router();

router.get("/public/b/:username/products/:id", async (req, res): Promise<void> => {
  const username = String(req.params.username || "").trim().toLowerCase();
  const productId = Number.parseInt(String(req.params.id), 10);
  if (!username || !Number.isFinite(productId)) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const [merchant] = await db
    .select({
      id: merchantsTable.id,
      businessName: merchantsTable.businessName,
      logoUrl: merchantsTable.logoUrl,
      phone: merchantsTable.phone,
      city: merchantsTable.city,
    })
    .from(merchantsTable)
    .where(eq(merchantsTable.username, username))
    .limit(1);
  if (!merchant) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const [product] = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      description: productsTable.description,
      price: productsTable.price,
      imageUrl: productsTable.imageUrl,
      sku: productsTable.sku,
      barcode: productsTable.barcode,
      categoryName: categoriesTable.name,
      brandName: brandsTable.name,
      trackInventory: productsTable.trackInventory,
      stockQuantity: productsTable.stockQuantity,
      warrantyDuration: productsTable.warrantyDuration,
      warrantyUnit: productsTable.warrantyUnit,
    })
    .from(productsTable)
    .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .leftJoin(brandsTable, eq(productsTable.brandId, brandsTable.id))
    .where(and(
      eq(productsTable.merchantId, merchant.id),
      eq(productsTable.id, productId),
      eq(productsTable.isActive, "true"),
    ))
    .limit(1);
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  res.json({
    id: product.id,
    name: product.name,
    description: product.description ?? "",
    price: Number.parseFloat(product.price),
    imageUrl: product.imageUrl ?? "",
    sku: product.sku ?? "",
    barcode: product.barcode ?? "",
    categoryName: product.categoryName ?? "",
    brandName: product.brandName ?? "",
    // In-stock signal only — never leak exact counts to anonymous shoppers.
    inStock: product.trackInventory !== "true" || product.stockQuantity > 0,
    warranty: product.warrantyDuration > 0
      ? `${product.warrantyDuration} ${product.warrantyUnit}`
      : "",
    business: {
      name: merchant.businessName,
      logoUrl: merchant.logoUrl ?? "",
      phone: merchant.phone ?? "",
      city: merchant.city ?? "",
    },
  });
});

export default router;
