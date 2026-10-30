import { describe, it, expect, vi } from "vitest";

/* Custom service-job notes (routes/service-settings.ts). The stored config can
 * be partial, hand-edited or still carry the old Service Options toggles, so
 * the cleaner is what decides what the Notes section is offered. */

vi.mock("@workspace/db", () => ({ db: {}, serviceSettingsTable: {} }));

const { cleanCustomNotes } = await import("../routes/service-settings");

describe("cleanCustomNotes", () => {
  it("returns [] for anything that is not a list", () => {
    expect(cleanCustomNotes(undefined)).toEqual([]);
    expect(cleanCustomNotes({ showNotes: true })).toEqual([]);
  });

  it("trims, keeps order, and drops blanks, junk and duplicate ids", () => {
    expect(cleanCustomNotes([
      { id: "a", text: "  Waiting on parts  " },
      { id: "b", text: "   " },
      { id: "", text: "no id" },
      null,
      "string",
      { id: "a", text: "duplicate" },
      { id: "c", text: "Backup taken" },
    ])).toEqual([
      { id: "a", text: "Waiting on parts" },
      { id: "c", text: "Backup taken" },
    ]);
  });

  it("caps the list and each note's length", () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ id: `n${i}`, text: "x".repeat(3000) }));
    const out = cleanCustomNotes(many);
    expect(out).toHaveLength(100);
    expect(out[0].text).toHaveLength(2000);
  });
});
