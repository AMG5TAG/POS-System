import { useEffect, useState } from "react";

/** Returns `value` delayed by `delayMs`: the result only updates once the input
 *  has been stable for that long. Feed a search box's raw value in and key the
 *  data query on the returned value so it fires once the user pauses typing
 *  rather than on every keystroke. */
export function useDebounce<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
