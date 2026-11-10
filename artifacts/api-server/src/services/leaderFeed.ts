/**
 * Leader Computers' dealer datafeed, downloaded on demand and cached in memory.
 *
 * The feed (LEADER_DATAFEED_URL, ~18 MB CSV, ~14k products) updates overnight,
 * so a copy is kept for CACHE_MS and only one download runs at a time. A
 * failed download keeps serving the previous copy if there is one. Rows are
 * mapped by lib/leader-feed.ts.
 */
import { parseCsvBuffer } from "../lib/parseCsv";
import { trackedInterval } from "../lib/shutdown";
import { feedRowToProduct, normaliseStockCode, type FeedProduct } from "../lib/leader-feed";

const CACHE_MS = 6 * 3600 * 1000;
const TIMEOUT_MS = 120_000;

let cache: { at: number; byCode: Map<string, FeedProduct> } | null = null;
let inflight: Promise<Map<string, FeedProduct>> | null = null;

export function leaderFeedConfigured(): boolean {
  return !!process.env.LEADER_DATAFEED_URL?.trim();
}

async function download(): Promise<Map<string, FeedProduct>> {
  const url = process.env.LEADER_DATAFEED_URL!.trim();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`Leader datafeed answered ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    // Strip a UTF-8 BOM so the first header reads "STOCK CODE".
    const rows = parseCsvBuffer(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? buf.subarray(3) : buf);
    const byCode = new Map<string, FeedProduct>();
    for (const r of rows) {
      const p = feedRowToProduct(r);
      if (p) byCode.set(normaliseStockCode(p.stockCode), p);
    }
    if (!byCode.size) throw new Error("Leader datafeed had no products in it");
    return byCode;
  } finally {
    clearTimeout(timer);
  }
}

function startDownload(log?: { warn: (o: unknown, m: string) => void }): Promise<Map<string, FeedProduct>> {
  inflight ??= download()
    .then((byCode) => { cache = { at: Date.now(), byCode }; return byCode; })
    .catch((err) => { log?.warn({ err }, "Leader datafeed download failed"); throw err; })
    .finally(() => { inflight = null; });
  return inflight;
}

/**
 * The feed by normalised stock code; null when it isn't configured or can't
 * be read. A stale copy is served at once while a fresh one downloads — only
 * a server with no copy at all waits for Leader.
 */
export async function getLeaderFeed(log?: { warn: (o: unknown, m: string) => void }): Promise<Map<string, FeedProduct> | null> {
  if (!leaderFeedConfigured()) return null;
  if (cache) {
    if (Date.now() - cache.at >= CACHE_MS) startDownload(log).catch(() => {});
    return cache.byCode;
  }
  try {
    return await startDownload(log);
  } catch {
    return null;
  }
}

export async function lookupLeaderProducts(codes: string[], log?: { warn: (o: unknown, m: string) => void }): Promise<Array<FeedProduct | null>> {
  const feed = await getLeaderFeed(log);
  return codes.map((c) => (feed && c ? feed.get(normaliseStockCode(c)) ?? null : null));
}

/**
 * Leader builds the file on request and takes ~35s, so it is fetched in the
 * background at boot and every CACHE_MS, before anyone is waiting on an
 * import. Does nothing when LEADER_DATAFEED_URL isn't set.
 */
export function scheduleLeaderFeedRefresh(log: { info: (o: unknown, m: string) => void; warn: (o: unknown, m: string) => void }): void {
  if (!leaderFeedConfigured()) return;
  const refresh = () => {
    startDownload(log).then((m) => log.info({ products: m.size }, "Leader datafeed cached")).catch(() => {});
  };
  setTimeout(refresh, 15_000).unref?.();
  trackedInterval(refresh, CACHE_MS).unref?.();
}

/** For tests. */
export function __setLeaderFeedForTests(byCode: Map<string, FeedProduct> | null): void {
  cache = byCode ? { at: Date.now(), byCode } : null;
}
