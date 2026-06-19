import { lazy, type ComponentType } from "react";

const RELOAD_FLAG = "koapos:chunk-reload";

/**
 * Drop-in replacement for React.lazy that self-heals a failed dynamic import
 * instead of surfacing "Failed to fetch dynamically imported module" as a red
 * error on screen.
 *
 * After a deploy, Vite emits each code-split chunk with a new content-hash
 * filename (e.g. `dashboard-DDg1lgjt.js` becomes some other hash). A browser
 * that still holds the previous `index.html` — an already-open tab, or a cached
 * shell — requests the OLD chunk URL, which no longer exists on the server, so
 * the dynamic import rejects. The reliable fix is a single full-page reload: it
 * pulls the fresh `index.html` and therefore the current chunk hashes.
 *
 * A sessionStorage flag guards against an infinite reload loop. If the import
 * still fails immediately after we reloaded once, the cause is a genuine
 * network/asset problem rather than a stale hash, so we clear the flag and let
 * the error propagate to the Suspense error boundary — the user sees a real
 * failure instead of an endless refresh.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      // Loaded cleanly — drop any guard left over from a prior self-heal.
      window.sessionStorage.removeItem(RELOAD_FLAG);
      return mod;
    } catch (error) {
      const alreadyReloaded =
        window.sessionStorage.getItem(RELOAD_FLAG) !== null;
      if (!alreadyReloaded) {
        // First failure on this session — almost certainly a stale chunk from a
        // deploy that landed while the page was open. Reload once to fetch the
        // current index.html and chunk hashes.
        window.sessionStorage.setItem(RELOAD_FLAG, "1");
        window.location.reload();
        // Keep the Suspense fallback up during the imminent reload rather than
        // flashing the error boundary: resolve to nothing.
        return new Promise<{ default: T }>(() => {});
      }
      // Failed again after a reload — not a stale hash. Surface the real error.
      window.sessionStorage.removeItem(RELOAD_FLAG);
      throw error;
    }
  });
}
