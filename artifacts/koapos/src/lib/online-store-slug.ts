import { useEffect, useState } from "react";

/*
 * The editable "CUSTOM" segment of the online store's default URL
 * (https://koapos.com.au/b/USERNAME/o/CUSTOM). The server OnlineStoreSettings
 * schema has no field for it, so it's stored per browser in localStorage.
 */

const KEY = "koapos-online-store-slug";
const CHANGE_EVENT = "koapos-online-store-slug-changed";
const DEFAULT_SLUG = "store";

/** Lower-case, hyphenated, URL-safe — no random suffix (the user owns it). */
export function slugifyStorePath(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

export function getStoreSlug(): string {
  try { return localStorage.getItem(KEY) || DEFAULT_SLUG; } catch { return DEFAULT_SLUG; }
}

export function setStoreSlug(value: string): void {
  const clean = slugifyStorePath(value) || DEFAULT_SLUG;
  try { localStorage.setItem(KEY, clean); } catch { /* ignore */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useStoreSlug(): [string, (v: string) => void] {
  const [slug, setSlug] = useState<string>(getStoreSlug);
  useEffect(() => {
    const sync = () => setSlug(getStoreSlug());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  // Keep the raw input responsive; persist the slugified value.
  const set = (v: string) => { setSlug(v); setStoreSlug(v); };
  return [slug, set];
}
