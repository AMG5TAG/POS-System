import { describe, it, expect } from "vitest";
import { parseStoredOffset, scrollDeltaToReveal } from "../use-persistent-scroll";

/**
 * The two decisions behind the sidebar keeping its place across a navigation.
 * The hook itself is DOM work; these are the parts that can be got wrong
 * silently, so they are pulled out and pinned here.
 */

describe("parseStoredOffset", () => {
  it("reads a stored offset back", () => {
    expect(parseStoredOffset("420")).toBe(420);
    expect(parseStoredOffset("0")).toBe(0);
  });

  it("treats nothing stored as nothing stored", () => {
    expect(parseStoredOffset(null)).toBeNull();
  });

  it("rejects anything that is not a sane offset", () => {
    // A stale or hand-edited entry must not turn into scrollTop = NaN, which
    // silently resets the container to the top — the exact bug being fixed.
    expect(parseStoredOffset("")).toBeNull();
    expect(parseStoredOffset("abc")).toBeNull();
    expect(parseStoredOffset("-40")).toBeNull();
    expect(parseStoredOffset("Infinity")).toBeNull();
  });
});

describe("scrollDeltaToReveal", () => {
  const container = { top: 100, bottom: 500 };

  it("leaves an item that is already visible alone", () => {
    // This is what stops the reveal fighting a restored offset: after an
    // ordinary navigation the item clicked is exactly where it was left.
    expect(scrollDeltaToReveal(container, { top: 200, bottom: 232 })).toBe(0);
    expect(scrollDeltaToReveal(container, { top: 100, bottom: 500 })).toBe(0);
  });

  it("scrolls up to reach an item above the fold", () => {
    expect(scrollDeltaToReveal(container, { top: 60, bottom: 92 })).toBe(-48); // 40 + 8 pad
  });

  it("scrolls down to reach an item below the fold", () => {
    expect(scrollDeltaToReveal(container, { top: 520, bottom: 552 })).toBe(60); // 52 + 8 pad
  });

  it("aligns the top of an item taller than the container", () => {
    // Both bounds are breached; showing the start of the label beats the end.
    expect(scrollDeltaToReveal(container, { top: 50, bottom: 900 })).toBeLessThan(0);
  });

  it("honours a custom pad", () => {
    expect(scrollDeltaToReveal(container, { top: 520, bottom: 552 }, 0)).toBe(52);
  });
});
