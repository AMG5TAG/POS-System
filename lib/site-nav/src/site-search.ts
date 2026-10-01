/*
 * The header's search: the website's pages and the shop's products together.
 *
 * Pages come from /search-index.json, which the website's build writes from
 * its own pre-rendered HTML (artifacts/website/scripts/build-search-index.mjs).
 * It is fetched once, on first use, and searched in the browser. Products come
 * from the shop API. Either may be missing — the website's dev server has no
 * index, the shop's has no website — and the search just shows what it has.
 */

export type SitePage = {
  path: string;
  title: string;
  description: string;
  headings: string;
  text: string;
  /** A suburb page: matched on its title and description only. */
  area?: boolean;
};
export type PageHit = { path: string; title: string; snippet: string; score: number };
export type ProductHit = { id: number; name: string; price: number; imageUrl: string | null };

/* Little words match every page ("trade in" would find "in" everywhere), so
   they are dropped — unless the query is nothing but. */
const STOP = new Set(["a", "an", "and", "are", "at", "by", "can", "do", "for", "how", "i", "in", "is", "it", "me", "my", "of", "on", "or", "the", "to", "we", "what", "with", "you", "your"]);

/* Words of two or more letters; "a" and "&" find everything. */
export function terms(q: string): string[] {
  const words = [...new Set(q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2))];
  const kept = words.filter((t) => !STOP.has(t));
  return kept.length ? kept : words;
}

function count(hay: string, t: string, cap: number): number {
  let n = 0;
  for (let i = hay.indexOf(t); i >= 0 && n < cap; i = hay.indexOf(t, i + t.length)) n++;
  return n;
}

/* A window of the page's own words around the first match, so a result says
   why it matched. The description wins when it holds a term. */
function snippetOf(p: SitePage, ts: string[], width = 160): string {
  for (const source of [p.description, p.text]) {
    const lower = source.toLowerCase();
    const at = Math.min(...ts.map((t) => lower.indexOf(t)).filter((i) => i >= 0));
    if (!Number.isFinite(at)) continue;
    if (source === p.description) return source.length > width ? `${source.slice(0, width).trimEnd()}…` : source;
    // Start a few words before the match and stop at a word boundary.
    const start = at < 50 ? 0 : source.lastIndexOf(" ", at - 50) + 1;
    let end = Math.min(source.length, start + width);
    if (end < source.length) {
      const space = source.lastIndexOf(" ", end);
      if (space > start) end = space;
    }
    return `${start > 0 ? "…" : ""}${source.slice(start, end)}${end < source.length ? "…" : ""}`;
  }
  return p.description.length > width ? `${p.description.slice(0, width).trimEnd()}…` : p.description;
}

/*
 * Every term must appear somewhere on a page for it to match. A title match is
 * worth far more than one in the body, so "data recovery" leads with the Data
 * Recovery page rather than a page that mentions it in passing, and so is one
 * in the page's address. Suburb pages
 * score lower than service pages for the same title words, unless the query
 * names the suburb.
 */
export function searchPages(pages: SitePage[], q: string, limit = 8): PageHit[] {
  const ts = terms(q);
  if (!ts.length) return [];
  const hits: PageHit[] = [];
  for (const p of pages) {
    const path = p.path.toLowerCase();
    const title = p.title.toLowerCase();
    const desc = p.description.toLowerCase();
    const heads = p.headings.toLowerCase();
    const body = p.text.toLowerCase();
    let score = 0;
    let all = true;
    for (const t of ts) {
      // The address is the strongest signal: /gaming is *the* gaming page.
      const s = (path.includes(t) ? 10 : 0) + (title.includes(t) ? 12 : 0) + (heads.includes(t) ? 5 : 0) + (desc.includes(t) ? 4 : 0) + count(body, t, 5);
      if (!s) { all = false; break; }
      score += s;
    }
    if (!all) continue;
    if (p.area) score *= 0.5;
    if (title.includes(q.trim().toLowerCase())) score += 10; // the whole phrase in the title
    hits.push({ path: p.path, title: p.title, snippet: snippetOf(p, ts), score });
  }
  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
}

/* Never throws: the website's pre-render runs in jsdom, which has no fetch. */
function getJson(url: string): Promise<unknown> {
  if (typeof fetch !== "function") return Promise.resolve(null);
  try {
    return fetch(url, { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

let indexPromise: Promise<SitePage[]> | null = null;
export function loadSiteIndex(): Promise<SitePage[]> {
  indexPromise ??= getJson("/search-index.json").then((d) => {
    const pages = (d as { pages?: unknown } | null)?.pages;
    return Array.isArray(pages) ? (pages as SitePage[]) : [];
  });
  return indexPromise;
}

export async function searchProducts(q: string, limit = 6): Promise<{ total: number; items: ProductHit[] }> {
  const query = q.trim().slice(0, 100);
  if (!query) return { total: 0, items: [] };
  const d = (await getJson(`/api/shop/products?search=${encodeURIComponent(query)}&pageSize=${limit}`)) as
    { total?: number; items?: ProductHit[] } | null;
  return { total: d?.total ?? 0, items: Array.isArray(d?.items) ? d.items : [] };
}
