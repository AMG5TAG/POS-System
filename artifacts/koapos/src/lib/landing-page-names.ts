import { useEffect, useState } from "react";

/*
 * Internal, identifying names for Landing Pages. These are an admin-side label
 * to tell pages apart in the list — distinct from the public-facing `title`.
 * The server LandingPage schema has no spare field, so they're stored per
 * browser in localStorage, keyed by the page's stable id.
 */

const KEY = "koapos-landing-page-names";
const CHANGE_EVENT = "koapos-landing-page-names-changed";

type NameMap = Record<string, string>;

function readMap(): NameMap {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") as NameMap; } catch { return {}; }
}

function writeMap(map: NameMap): void {
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* ignore */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function getLandingPageName(pageId: string): string {
  if (!pageId) return "";
  return readMap()[pageId] ?? "";
}

export function setLandingPageName(pageId: string, name: string): void {
  if (!pageId) return;
  const map = readMap();
  const trimmed = name.trim();
  if (trimmed) map[pageId] = trimmed;
  else delete map[pageId];
  writeMap(map);
}

/** Reactive read of the whole name map; re-renders when any name changes. */
export function useLandingPageNames(): NameMap {
  const [map, setMap] = useState<NameMap>(readMap);
  useEffect(() => {
    const sync = () => setMap(readMap());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return map;
}
