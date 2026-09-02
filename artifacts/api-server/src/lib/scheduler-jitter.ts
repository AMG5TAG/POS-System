/** Run a scheduler's initial tick after a small random delay so the heavy
 *  schedulers that all start in the same boot instant don't hit the database
 *  simultaneously. The recurring `trackedInterval` is unaffected — only the
 *  immediate-on-boot run is staggered. Use for digest/report/backup schedulers;
 *  leave time-sensitive sweeps (e.g. payment-attempt expiry) running immediately. */
export function jitteredStart(run: () => void, maxDelayMs = 45_000): void {
  const t = setTimeout(run, Math.floor(Math.random() * maxDelayMs));
  // Don't let the one-shot startup timer keep the process alive on shutdown.
  t.unref?.();
}
