import { describe, it, expect } from "vitest";
import { transformSnapshotRow } from "../services/restoreService";
import type { ScopedTable } from "../lib/backup-tables";

// A minimal fake scoped table — transformSnapshotRow only reads the metadata
// fields, never the Drizzle `table` handle.
const numericIdTable = {
  name: "things",
  table: {} as unknown,
  hasId: true,
  merchantColKey: "merchantId",
  fkColKeys: ["parentId"],
  dateColKeys: ["createdAt"],
  selfReferential: true,
} as unknown as ScopedTable;

const uuidIdTable = {
  ...numericIdTable,
  name: "sales_templates",
} as ScopedTable;

describe("transformSnapshotRow", () => {
  it("offset 0 leaves ids untouched but forces the merchant column and revives dates", () => {
    const out = transformSnapshotRow(
      numericIdTable,
      { id: 5, parentId: 3, merchantId: 1, createdAt: "2026-01-01T00:00:00.000Z" },
      9,
      0,
    );
    expect(out.id).toBe(5);
    expect(out.parentId).toBe(3);
    expect(out.merchantId).toBe(9);
    expect(out.createdAt).toBeInstanceOf(Date);
  });

  it("non-zero offset shifts numeric id and scoped FK columns, never the merchant column", () => {
    const out = transformSnapshotRow(
      numericIdTable,
      { id: 5, parentId: 3, merchantId: 1 },
      9,
      1_000_000,
    );
    expect(out.id).toBe(1_000_005);
    expect(out.parentId).toBe(1_000_003);
    // merchant column is set to the target, never offset.
    expect(out.merchantId).toBe(9);
  });

  it("leaves UUID/string primary keys intact even with an offset", () => {
    const out = transformSnapshotRow(
      uuidIdTable,
      { id: "a1b2-uuid", parentId: null, merchantId: 1 },
      9,
      1_000_000,
    );
    expect(out.id).toBe("a1b2-uuid");
    expect(out.parentId).toBeNull();
    expect(out.merchantId).toBe(9);
  });
});
