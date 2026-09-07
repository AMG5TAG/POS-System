/* Interval registry for graceful shutdown.
 *
 * The background schedulers each start a `setInterval` and discard the handle,
 * so on SIGTERM there was no way to stop them. `trackedInterval` is a drop-in
 * replacement for `setInterval` (identical signature) that also records the
 * handle; `clearScheduledIntervals` clears them all during shutdown so no
 * scheduler fires while the process is winding down. */

const intervals: NodeJS.Timeout[] = [];

/** Like `setInterval`, but the handle is registered so it can be cleared on
 *  shutdown. Schedulers call this instead of `setInterval`. */
export function trackedInterval(...args: Parameters<typeof setInterval>): NodeJS.Timeout {
  const handle = setInterval(...args);
  intervals.push(handle);
  return handle;
}

/** Clear every interval started via `trackedInterval`. Idempotent. */
export function clearScheduledIntervals(): void {
  for (const handle of intervals) clearInterval(handle);
  intervals.length = 0;
}
