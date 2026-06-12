import { describe, it, expect } from "vitest";
import { getDeleteOrderedTables, getInsertOrderedTables } from "../lib/backup-tables";

describe("backup-tables merchant-scoped discovery", () => {
  it("includes partner_referrals owned via referrerMerchantId", () => {
    const tables = getInsertOrderedTables();
    const pr = tables.find((t) => t.name === "partner_referrals");
    expect(pr, "partner_referrals should be a scoped table").toBeTruthy();
    expect(pr?.merchantColKey).toBe("referrerMerchantId");
  });

  it("excludes backup bookkeeping tables", () => {
    const names = getInsertOrderedTables().map((t) => t.name);
    expect(names).not.toContain("merchant_backups");
    expect(names).not.toContain("merchant_backup_configs");
  });

  it("every scoped table exposes a merchantColKey; merchantId is the common case", () => {
    const tables = getInsertOrderedTables();
    expect(tables.every((t) => typeof t.merchantColKey === "string" && t.merchantColKey.length > 0)).toBe(true);
    // Only non-merchantId owner in the current schema is partner_referrals.
    const odd = tables.filter((t) => t.merchantColKey !== "merchantId").map((t) => t.name);
    expect(odd).toEqual(["partner_referrals"]);
  });

  it("delete order is the reverse of insert order", () => {
    const ins = getInsertOrderedTables().map((t) => t.name);
    const del = getDeleteOrderedTables().map((t) => t.name);
    expect(del).toEqual([...ins].reverse());
  });
});
