import { useLayoutEffect, useRef } from "react";

/**
 * Keeps a scroll container's position across the remounts a route change causes.
 *
 * Every page renders its own `<AppLayout>`, so navigating unmounts the whole
 * layout — sidebar included — and mounts a fresh one. The new DOM node starts at
 * `scrollTop: 0`, which is why clicking a menu item near the bottom of a long
 * menu throws that part of the menu off screen at the exact moment you were
 * using it.
 *
 * The offset therefore cannot live in React state: there is no component alive
 * across the navigation to hold it. It goes in `sessionStorage`, and is restored
 * in a *layout* effect — before the browser paints — so the menu never visibly
 * jumps to the top and back.
 */

const PREFIX = "koapos:scroll:";

/** sessionStorage holds strings, and a stale or hand-edited one must not be
 *  trusted: anything that is not a sane offset means "nothing stored". */
export function parseStoredOffset(raw: string | null): number | null {
  // Number("") and Number("  ") are both 0, so a blank entry has to be rejected
  // before the numeric check or it reads as a perfectly valid "top of the list".
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * How far to move a container's `scrollTop` so `item` sits fully inside it.
 * `0` when it already does, which is what stops this fighting a restored
 * offset — the item the menu is on is normally right where it was left.
 *
 * An item taller than the container can satisfy both bounds; aligning its top
 * wins, because the start of a label is the half worth reading.
 */
export function scrollDeltaToReveal(
  container: { top: number; bottom: number },
  item: { top: number; bottom: number },
  pad = 8,
): number {
  if (item.top < container.top) return -(container.top - item.top + pad);
  if (item.bottom > container.bottom) return item.bottom - container.bottom + pad;
  return 0;
}

/** Reading storage can throw outright (private mode, site data blocked), and a
 *  remembered scroll offset is never worth breaking a page render over. */
function readStored(key: string): number | null {
  try {
    return parseStoredOffset(sessionStorage.getItem(PREFIX + key));
  } catch {
    return null;
  }
}

function writeStored(key: string, value: number): void {
  try {
    sessionStorage.setItem(PREFIX + key, String(Math.round(value)));
  } catch {
    /* ignore — see readStored */
  }
}

export interface PersistentScrollOptions {
  /**
   * CSS selector for the "current" item inside the container. When given, the
   * deepest match is brought into view after the offset is restored — a first
   * visit has nothing stored, and a deep link can land on an item far below the
   * fold.
   */
  activeSelector?: string;
}

export function usePersistentScroll<T extends HTMLElement>(
  key: string,
  { activeSelector }: PersistentScrollOptions = {},
) {
  const ref = useRef<T | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const stored = readStored(key);
    // The browser clamps this on its own if the menu is shorter than it was.
    if (stored !== null) el.scrollTop = stored;

    if (activeSelector) {
      const matches = el.querySelectorAll<HTMLElement>(activeSelector);
      // A section header and the sub-item inside it are both "active"; the last
      // match in DOM order is the leaf, which is the one worth looking at.
      const active = matches[matches.length - 1];
      if (active) {
        // Deliberately not scrollIntoView, which also scrolls every ancestor
        // scroller (the page included) and would yank the main content around
        // on every navigation.
        el.scrollTop += scrollDeltaToReveal(el.getBoundingClientRect(), active.getBoundingClientRect());
      }
    }

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        writeStored(key, el.scrollTop);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
      // A frame scheduled just before the unmount never runs, and the last flick
      // of the wheel before a click is exactly the one that must not be lost.
      // Layout-effect cleanup runs before the node is detached, so this reads a
      // live element.
      writeStored(key, el.scrollTop);
    };
  }, [key, activeSelector]);

  return ref;
}
