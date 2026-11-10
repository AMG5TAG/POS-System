/**
 * Purchase Orders › Import supplier invoice — the matching rules, with no `db`
 * or `req` in sight. Pinned by `supplier-invoice.test.ts`.
 *
 * The browser reads the invoice (koapos `lib/supplier-invoice-parse.ts`); the
 * server decides what it corresponds to:
 *  - **Supplier**: your account code at the supplier (printed on the invoice,
 *    e.g. Leader's "Customer Code: KOAS44") against `suppliers.account_number`,
 *    then the supplier's name with company suffixes stripped.
 *  - **Product**: the invoice's stock code against our SKU, then against the
 *    product's supplier code, then the manufacturer code against our SKU.
 *    Codes compare case- and space-insensitively.
 */

/** "LEADER COMPUTERS PTY LTD" and "Leader Computers" are the same supplier. */
export function normaliseSupplierName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(pty|ltd|limited|proprietary|p l|inc|co|company|the|australia|aust|au)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Two normalised names are the same supplier when equal, or one is the other plus words. */
export function supplierNamesMatch(a: string, b: string): boolean {
  const x = normaliseSupplierName(a);
  const y = normaliseSupplierName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  // "leader" vs "leader computers": a whole-word prefix, not a substring, so
  // "ace" never matches "space".
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 4 && long.startsWith(`${short} `);
}

export function normaliseCode(code: string | null | undefined): string {
  return (code ?? "").replace(/\s+/g, "").toLowerCase();
}

export function normaliseAccount(code: string | null | undefined): string {
  return (code ?? "").replace(/\s+/g, "").toLowerCase();
}

export interface SupplierRow { id: number; name: string; accountNumber: string | null; creditAccountNumber?: string | null }

export function matchSupplier(
  suppliers: SupplierRow[],
  invoice: { name: string; accountCode?: string | null },
): { id: number; name: string; matchedBy: "account" | "name" } | null {
  const acct = normaliseAccount(invoice.accountCode);
  if (acct) {
    const byAcct = suppliers.find((s) =>
      normaliseAccount(s.accountNumber) === acct || normaliseAccount(s.creditAccountNumber) === acct);
    if (byAcct) return { id: byAcct.id, name: byAcct.name, matchedBy: "account" };
  }
  const byName = suppliers.filter((s) => supplierNamesMatch(s.name, invoice.name));
  // Two suppliers that both look like this name: don't guess.
  if (byName.length === 1) return { id: byName[0]!.id, name: byName[0]!.name, matchedBy: "name" };
  return null;
}

export interface ProductRow { id: number; name: string; sku: string | null; supplierCode: string | null; price: number; isActive: boolean }

export type ProductMatch = { productId: number; name: string; sku: string | null; price: number; matchedBy: "sku" | "supplierCode" | "manufCode" };

/**
 * One lookup over the catalogue, then each line matched by the first rule
 * that finds exactly one product — an ambiguous code (two products sharing a
 * SKU) matches nothing rather than the wrong one. Active products win over
 * archived ones sharing a code.
 */
export function matchProducts(
  products: ProductRow[],
  lines: Array<{ stockCode: string; manufCode?: string | null }>,
): Array<ProductMatch | null> {
  const index = (key: (p: ProductRow) => string | null) => {
    const m = new Map<string, ProductRow[]>();
    for (const p of products) {
      const k = normaliseCode(key(p));
      if (!k) continue;
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m;
  };
  const bySku = index((p) => p.sku);
  const bySupplierCode = index((p) => p.supplierCode);

  const pick = (rows: ProductRow[] | undefined): ProductRow | null => {
    if (!rows?.length) return null;
    const active = rows.filter((r) => r.isActive);
    const pool = active.length ? active : rows;
    return pool.length === 1 ? pool[0]! : null;
  };

  return lines.map((l) => {
    const stock = normaliseCode(l.stockCode);
    const manuf = normaliseCode(l.manufCode);
    const tries: Array<[ProductMatch["matchedBy"], ProductRow[] | undefined]> = [
      ["sku", stock ? bySku.get(stock) : undefined],
      ["supplierCode", stock ? bySupplierCode.get(stock) : undefined],
      ["manufCode", manuf ? bySku.get(manuf) : undefined],
    ];
    for (const [matchedBy, rows] of tries) {
      const p = pick(rows);
      if (p) return { productId: p.id, name: p.name, sku: p.sku, price: p.price, matchedBy };
    }
    return null;
  });
}

/** Serial numbers worth keeping on a PO line, deduplicated, in invoice order. */
export function cleanSerials(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const s of raw) {
    if (typeof s !== "string") continue;
    const t = s.trim();
    if (t && !out.includes(t)) out.push(t.slice(0, 120));
  }
  return out;
}

/** "SN: a, b" for the PO line's notes — what a warranty claim to the supplier asks for. */
export function serialsNote(serials: string[]): string | null {
  return serials.length ? `SN: ${serials.join(", ")}` : null;
}
