import { useEffect, useState } from "react";

/**
 * The business username for a staff app page. The older addresses carry it
 * (/b/:username/t/techapp); the current short ones don't (/a/tech, /a/mobile),
 * so it is read from the server — this install runs exactly one business.
 * Returns "" until known.
 */
export function useBusinessUsername(fromRoute: string | undefined): string {
  const [fetched, setFetched] = useState("");
  useEffect(() => {
    if (fromRoute) return;
    let active = true;
    void fetch("/api/public/business")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { username?: string } | null) => { if (active && d?.username) setFetched(d.username); })
      .catch(() => {});
    return () => { active = false; };
  }, [fromRoute]);
  return fromRoute || fetched;
}
