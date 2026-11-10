import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import {
  matchProducts, matchSupplier, normaliseSupplierName, supplierNamesMatch, cleanSerials, serialsNote,
} from "../lib/supplier-invoice";

/* Purchase Orders › Import supplier invoice. What a supplier's invoice is
   matched to decides whether stock lands on the right product, so the rules
   refuse to guess: an ambiguous code or name matches nothing. */

describe("supplier matching", () => {
  const suppliers = [
    { id: 1, name: "Leader Computers", accountNumber: null },
    { id: 2, name: "Dicker Data", accountNumber: "KOAS44X" },
    { id: 3, name: "Ingram Micro Australia Pty Ltd", accountNumber: "" },
  ];

  it("strips company suffixes from names", () => {
    expect(normaliseSupplierName("LEADER COMPUTERS PTY LTD")).toBe("leader computers");
    expect(supplierNamesMatch("Leader", "LEADER COMPUTERS PTY LTD")).toBe(true);
    expect(supplierNamesMatch("Ace", "Space Computers")).toBe(false);
  });

  it("matches by the account code first, then by name", () => {
    expect(matchSupplier(suppliers, { name: "Somebody Else", accountCode: "koas44x" }))
      .toEqual({ id: 2, name: "Dicker Data", matchedBy: "account" });
    expect(matchSupplier(suppliers, { name: "LEADER COMPUTERS PTY LTD", accountCode: "KOAS44" }))
      .toEqual({ id: 1, name: "Leader Computers", matchedBy: "name" });
    expect(matchSupplier(suppliers, { name: "INGRAM MICRO" })).toMatchObject({ id: 3 });
    expect(matchSupplier(suppliers, { name: "New Supplier Pty Ltd" })).toBeNull();
  });

  it("won't pick between two suppliers with the same-looking name", () => {
    expect(matchSupplier([...suppliers, { id: 4, name: "Leader Computers Pty Ltd", accountNumber: null }], { name: "Leader Computers" })).toBeNull();
  });
});

describe("product matching", () => {
  const products = [
    { id: 10, name: "Biwin 32GB", sku: "BIW-UD150-32GB", supplierCode: null, price: 25, isActive: true },
    { id: 11, name: "AOC 27", sku: "KP-001", supplierCode: "MNAO-U27B35", price: 399, isActive: true },
    { id: 12, name: "Rapoo M306", sku: "M306", supplierCode: null, price: 19, isActive: true },
    { id: 13, name: "Dup A", sku: "DUP", supplierCode: null, price: 1, isActive: true },
    { id: 14, name: "Dup B", sku: "dup", supplierCode: null, price: 1, isActive: true },
    { id: 15, name: "Old cable", sku: "CAB-1", supplierCode: null, price: 1, isActive: false },
    { id: 16, name: "New cable", sku: "CAB-1", supplierCode: null, price: 1, isActive: true },
  ];
  it("tries SKU, then supplier code, then manufacturer code", () => {
    const [a, b, c, d] = matchProducts(products, [
      { stockCode: "biw-ud150-32gb" },
      { stockCode: "MNAO-U27B35", manufCode: "U27B35" },
      { stockCode: "MIRP-M306", manufCode: "M306" },
      { stockCode: "NOPE", manufCode: "NOPE" },
    ]);
    expect(a).toMatchObject({ productId: 10, matchedBy: "sku" });
    expect(b).toMatchObject({ productId: 11, matchedBy: "supplierCode" });
    expect(c).toMatchObject({ productId: 12, matchedBy: "manufCode" });
    expect(d).toBeNull();
  });
  it("matches nothing on an ambiguous code, and prefers an active product", () => {
    const [dup, cab] = matchProducts(products, [{ stockCode: "DUP" }, { stockCode: "CAB-1" }]);
    expect(dup).toBeNull();
    expect(cab).toMatchObject({ productId: 16 });
  });
});

describe("serials", () => {
  it("dedupes and formats the PO-line note", () => {
    const s = cleanSerials([" A1 ", "A1", "", 5, "B2"]);
    expect(s).toEqual(["A1", "B2"]);
    expect(serialsNote(s)).toBe("SN: A1, B2");
    expect(serialsNote([])).toBeNull();
  });
});

/* ── Routes, against the real database ─────────────────────────────────── */

const hasDb = !!process.env.DATABASE_URL;
const h = vi.hoisted(() => ({ merchantId: 0 }));
vi.mock("../middlewares/requireAuth", () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { session: Record<string, unknown> }).session.merchantId = h.merchantId;
    next();
  },
}));
vi.mock("../services/email", () => ({ sendEmail: vi.fn() }));
vi.mock("../services/entityQr", () => ({ registerProductQr: vi.fn(async () => {}), registerQrBestEffort: vi.fn() }));

describe.skipIf(!hasDb)("import routes (real DB)", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let db: any, t: any, orm: any, app: express.Express;
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const tag = `T${Date.now()}`;
  let existingId = 0;
  const created = { po: [] as number[], products: [] as number[], suppliers: [] as number[] };

  beforeAll(async () => {
    t = await import("@workspace/db");
    db = t.db;
    orm = await import("drizzle-orm");
    const [m] = await db.select({ id: t.merchantsTable.id }).from(t.merchantsTable).limit(1);
    h.merchantId = m.id;
    const [p] = await db.insert(t.productsTable).values({ merchantId: h.merchantId, name: `Existing ${tag}`, sku: `${tag}-EXIST`, price: "50", costPrice: "10" }).returning();
    existingId = p.id;
    created.products.push(p.id);
    const { default: router } = await import("../routes/purchase-orders");
    app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use("/api", router);
  });

  afterAll(async () => {
    if (!db) return;
    const { inArray } = orm;
    if (created.po.length) {
      await db.delete(t.productPriceHistoryTable).where(inArray(t.productPriceHistoryTable.poId, created.po));
      await db.delete(t.purchaseOrderItemsTable).where(inArray(t.purchaseOrderItemsTable.poId, created.po));
      await db.delete(t.purchaseOrdersTable).where(inArray(t.purchaseOrdersTable.id, created.po));
    }
    if (created.products.length) {
      await db.delete(t.productPriceHistoryTable).where(inArray(t.productPriceHistoryTable.productId, created.products));
      await db.delete(t.productsTable).where(inArray(t.productsTable.id, created.products));
    }
    if (created.suppliers.length) await db.delete(t.suppliersTable).where(inArray(t.suppliersTable.id, created.suppliers));
    await t.pool.end();
  });

  it("matches, then imports: new supplier, one existing and two new products", async () => {
    const match = await request(app).post("/api/purchase-orders/import/match").send({
      supplierName: `Supplier ${tag} PTY LTD`, accountCode: `ACC-${tag}`, poNumber: `INV-${tag}`,
      lines: [{ stockCode: `${tag}-exist` }, { stockCode: `${tag}-NEW1` }],
    }).expect(200);
    expect(match.body.supplier).toBeNull();
    expect(match.body.poNumberTaken).toBeNull();
    expect(match.body.lines[0]).toMatchObject({ productId: existingId, matchedBy: "sku" });
    expect(match.body.lines[1]).toBeNull();

    const res = await request(app).post("/api/purchase-orders/import").send({
      newSupplier: { name: `Supplier ${tag} PTY LTD`, accountNumber: `ACC-${tag}` },
      poNumber: `INV-${tag}`, orderDate: "2026-10-01",
      lines: [
        { productId: existingId, productName: "Existing", stockCode: `${tag}-EXIST`, quantity: 2, unitCost: 12, serials: ["S1", "S2"] },
        { newProduct: { name: `New priced ${tag}`, manufCode: "MPN1", sellPrice: 39.95 }, productName: "x", stockCode: `${tag}-NEW1`, quantity: 1, unitCost: 20 },
        { newProduct: { name: `New unpriced ${tag}` }, productName: "y", stockCode: `${tag}-NEW2`, quantity: 3, unitCost: 5 },
        { productName: "Freight", quantity: 1, unitCost: 15 },
      ],
    }).expect(201);
    created.po.push(res.body.purchaseOrder.id);
    created.suppliers.push(res.body.purchaseOrder.supplierId);
    for (const p of res.body.newProducts) created.products.push(p.id);

    expect(res.body.supplierCreated).toBe(true);
    expect(res.body.purchaseOrder.status).toBe("Ordered");
    expect(res.body.purchaseOrder.poNumber).toBe(`INV-${tag}`);
    expect(res.body.newProducts).toHaveLength(2);
    expect(res.body.newProducts.map((p: { hidden: boolean }) => p.hidden)).toEqual([false, true]);

    const [priced] = await db.select().from(t.productsTable).where(orm.eq(t.productsTable.id, res.body.newProducts[0].id));
    expect(priced).toMatchObject({ sku: `${tag}-NEW1`, supplierCode: `${tag}-NEW1`, isActive: "true", stockQuantity: 0, technicalSpecs: "Manufacturer code: MPN1" });
    expect(parseFloat(priced.price)).toBe(39.95);
    expect(parseFloat(priced.costPrice)).toBe(20);
    const [unpriced] = await db.select().from(t.productsTable).where(orm.eq(t.productsTable.id, res.body.newProducts[1].id));
    expect(unpriced.isActive).toBe("false");

    const items = res.body.purchaseOrder.items;
    expect(items[0].notes).toBe("SN: S1, S2");
    expect(items[3].productId).toBeNull();
    // Cost price of the existing product follows the invoice, as for any PO.
    const [ex] = await db.select().from(t.productsTable).where(orm.eq(t.productsTable.id, existingId));
    expect(parseFloat(ex.costPrice)).toBe(12);

    // The second time round the supplier is known by account, and the invoice is refused.
    const again = await request(app).post("/api/purchase-orders/import/match").send({
      supplierName: "Anything", accountCode: `acc-${tag}`, poNumber: `INV-${tag}`, lines: [],
    }).expect(200);
    expect(again.body.supplier).toMatchObject({ matchedBy: "account" });
    expect(again.body.poNumberTaken).toMatchObject({ poNumber: `INV-${tag}` });
    await request(app).post("/api/purchase-orders/import").send({
      supplierId: again.body.supplier.id, poNumber: `INV-${tag}`, orderDate: "2026-10-01",
      lines: [{ productId: existingId, productName: "Existing", quantity: 1, unitCost: 1 }],
    }).expect(409);
  });

  it("refuses a product id that isn't this business's", async () => {
    await request(app).post("/api/purchase-orders/import").send({
      newSupplier: { name: "Whoever" }, poNumber: `INV2-${tag}`, orderDate: "2026-10-01",
      lines: [{ productId: 2147483000, productName: "x", quantity: 1, unitCost: 1 }],
    }).expect(400);
  });
});
