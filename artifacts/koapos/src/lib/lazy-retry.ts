import { lazy, type ComponentType } from "react";

const RELOAD_FLAG = "koapos:chunk-reload";

/**
 * sessionStorage throws (not returns null) when storage is blocked — iOS Safari
 * with "Prevent Cross-Site Tracking" in an embedded/private context is the
 * common case, and that is exactly the environment where stale chunks bite. An
 * unguarded read here would turn a recoverable chunk failure into a hard crash.
 */
function readReloadFlag(): string | null {
  try {
    return window.sessionStorage.getItem(RELOAD_FLAG);
  } catch {
    return null;
  }
}

function writeReloadFlag(): void {
  try {
    window.sessionStorage.setItem(RELOAD_FLAG, "1");
  } catch {
    /* storage blocked — the in-memory guard below still prevents a loop */
  }
}

function clearReloadFlag(): void {
  try {
    window.sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* noop */
  }
}

/**
 * A reload started in *this* page instance. `window.location.reload()` is
 * asynchronous, so the app keeps rendering for a beat afterwards; without this
 * we would tear down to an error screen in the gap before the navigation lands.
 */
let reloadInFlight = false;

/**
 * Force a single full-page reload to recover from a stale code-split chunk,
 * guarding against an infinite reload loop.
 *
 * After a deploy, Vite emits each chunk with a new content-hash filename
 * (e.g. `dashboard-DDg1lgjt.js` / `phone-BrbYyAKK.js`). A browser still holding
 * the previous `index.html` — an already-open tab, or a cached shell — requests
 * an OLD chunk URL that no longer exists on the server, so the dynamic import
 * (or Vite's preload of a transitive dependency chunk) rejects. A reload pulls
 * the fresh `index.html`, and therefore the current chunk hashes.
 *
 * Returns `true` if a reload is under way (just kicked off, or already kicked
 * off by an earlier failure on this page), `false` if it already reloaded once
 * this session — in which case the failure is a genuine network/asset problem,
 * not a stale hash, and the caller should let the real error surface instead of
 * looping. The flag is cleared on the next successful chunk load.
 */
function reloadOnceForStaleChunk(): boolean {
  if (reloadInFlight) return true;
  if (readReloadFlag() !== null) return false;
  writeReloadFlag();
  reloadInFlight = true;
  window.location.reload();
  return true;
}

/**
 * Drop-in replacement for React.lazy that self-heals a failed dynamic import
 * instead of surfacing "error loading dynamically imported module" as a red
 * error on screen. See {@link reloadOnceForStaleChunk} for the why.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      // Vite's `__vitePreload` wrapper swallows a chunk failure and RESOLVES
      // with `undefined` whenever a `vite:preloadError` listener called
      // preventDefault() (it does `baseModule().catch(handlePreloadError)`, and
      // a prevented handler returns instead of rethrowing). React.lazy then
      // reads `.default` off that undefined module and blows up with
      // "undefined is not an object (evaluating '_._result.default')". Treat a
      // nullish module as the chunk failure it actually is.
      if (mod == null) {
        throw new Error(
          "Failed to load dynamically imported module (empty module record)",
        );
      }
      // Loaded cleanly — drop any guard left over from a prior self-heal.
      clearReloadFlag();
      return mod;
    } catch (error) {
      // First failure this session is almost certainly a stale chunk from a
      // deploy that landed while the page was open: reload once and keep the
      // Suspense fallback up during the imminent reload.
      if (reloadOnceForStaleChunk()) {
        return new Promise<{ default: T }>(() => {});
      }
      // Failed again after a reload — not a stale hash. Surface the real error.
      clearReloadFlag();
      throw error;
    }
  });
}

/**
 * Install a global safety net for stale-chunk failures that don't flow through
 * {@link lazyWithRetry} — e.g. Vite's preload of a transitive dependency chunk,
 * or the bare `import()` calls for heavy on-demand libs (xlsx, jspdf, pdfjs…).
 *
 * Vite dispatches a cancelable `vite:preloadError` event when it fails to load a
 * dynamically imported module or one of its preloaded deps; we also catch the
 * matching `unhandledrejection`. Either way we trigger the same reload-once
 * recovery. Call once at app startup.
 */
export function installStaleChunkReload(): void {
  window.addEventListener("vite:preloadError", (event) => {
    // Only swallow the error when we are actually recovering from it. Calling
    // preventDefault() unconditionally makes Vite resolve the import with
    // `undefined` instead of rejecting, which strands every caller — including
    // React.lazy — with a module record that has no `.default`.
    if (reloadOnceForStaleChunk()) {
      event.preventDefault();
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    const message = String(
      (event.reason as { message?: unknown } | null)?.message ?? event.reason ?? "",
    );
    // Browser/Vite wording for a dynamic-import chunk that failed to load.
    if (
      /dynamically imported module/i.test(message) ||
      /Importing a module script failed/i.test(message)
    ) {
      reloadOnceForStaleChunk();
    }
  });
}
