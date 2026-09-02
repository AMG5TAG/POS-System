import { useEffect } from "react";

/**
 * Lets the Left / Right arrow keys move between tabs while a tabbed dialog
 * ("lightbox") is open. Ignored while the user is typing in a field so it never
 * fights with caret movement.
 *
 * Call this unconditionally (before any early return) and gate it with `active`,
 * which should be true only while the dialog is open.
 */
export function useTabArrowKeys(
  active: boolean,
  goPrev: () => void,
  goNext: () => void,
) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el) {
        const tag = el.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) return;
      }
      e.preventDefault();
      if (e.key === "ArrowLeft") goPrev();
      else goNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, goPrev, goNext]);
}
