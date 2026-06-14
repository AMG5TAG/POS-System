import { describe, it, expect } from "vitest";
import { diffSchema } from "../services/schemaDriftCheck";

const m = (o: Record<string, string[]>) =>
  new Map(Object.entries(o).map(([t, cols]) => [t, new Set(cols)]));

describe("diffSchema — schema-drift detection", () => {
  it("reports no drift when the DB has everything the schema expects", () => {
    const expected = m({ service_jobs: ["id", "status"], quotes: ["id"] });
    const actual = m({ service_jobs: ["id", "status", "extra_col"], quotes: ["id"], extra_table: ["x"] });
    expect(diffSchema(expected, actual)).toEqual({ missingTables: [], missingColumns: [] });
  });

  it("detects a missing column (the dashboard-calendar failure mode)", () => {
    const expected = m({ service_jobs: ["id", "deposit_paid", "estimate_approved_at"] });
    const actual = m({ service_jobs: ["id"] });
    expect(diffSchema(expected, actual)).toEqual({
      missingTables: [],
      missingColumns: ["service_jobs.deposit_paid", "service_jobs.estimate_approved_at"],
    });
  });

  it("detects a missing table and doesn't double-report its columns", () => {
    const expected = m({ locations: ["id", "name"], quotes: ["id"] });
    const actual = m({ quotes: ["id"] });
    expect(diffSchema(expected, actual)).toEqual({ missingTables: ["locations"], missingColumns: [] });
  });

  it("ignores extra columns/tables present only in the DB", () => {
    const expected = m({ quotes: ["id"] });
    const actual = m({ quotes: ["id", "legacy_col"], orphan_table: ["a"] });
    const diff = diffSchema(expected, actual);
    expect(diff.missingTables).toEqual([]);
    expect(diff.missingColumns).toEqual([]);
  });

  it("returns sorted, stable output across tables", () => {
    const expected = m({ b_table: ["z", "a"], a_table: ["id"] });
    const actual = m({});
    const diff = diffSchema(expected, actual);
    expect(diff.missingTables).toEqual(["a_table", "b_table"]);
  });
});
