/**
 * Smart retry predicate for React Query.
 *
 * The frontend (Vite) comes up almost instantly, but the API server boots
 * behind it (in dev it runs `build && start`, and `bootstrap()` runs a schema
 * drift check before `app.listen`). On a cold load the SPA therefore fires its
 * first queries — `/api/me`, the app-layout queries, the dashboard — while port
 * 8080 is not yet accepting connections, so they fail with a network error or a
 * 5xx from the gateway. With `retry: false` that surfaced as a visible error
 * that only a manual refresh (by which time the API is up) cleared.
 *
 * Retrying transient failures a few times with backoff lets those first-load
 * queries self-heal within a second or two — no refresh needed. We deliberately
 * do NOT retry 4xx responses: a 401 is a definitive "not signed in" answer that
 * should fail fast and redirect to /login, and other 4xx (403/404/422) are
 * stable client errors that won't change on retry.
 */
export function shouldRetryRequest(failureCount: number, error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  // Definitive client answer (401/403/404/422/…) — don't retry.
  if (typeof status === "number" && status >= 400 && status < 500) return false;
  // Transient network error or 5xx (cold-start race, brief blip) — retry.
  return failureCount < 3;
}

/** Exponential backoff capped at 5s: ~1s, 2s, 4s between the 3 retries. */
export function retryBackoff(attemptIndex: number): number {
  return Math.min(1000 * 2 ** attemptIndex, 5000);
}
