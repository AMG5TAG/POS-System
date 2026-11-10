/**
 * Fetch a URL a staff member typed in, without letting it reach our own network.
 *
 * Every hop is checked: the host must resolve only to public addresses
 * (`isBlockedAddress`, shared with the Nextcloud guard), redirects are followed
 * by hand so each new host is checked too, and the body is capped. Same DNS
 * rebinding caveat as `assertSafeNextcloudUrl` — accepted because the caller is
 * a signed-in staff member, not an anonymous visitor.
 */
import { lookup } from "dns/promises";
import net from "net";
import { isBlockedAddress } from "./nextcloud";

export class SafeFetchError extends Error {}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new SafeFetchError("That isn't a valid web address"); }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new SafeFetchError("Only http and https links can be imported");
  if (url.username || url.password) throw new SafeFetchError("Links with a username or password can't be imported");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw new SafeFetchError("That address is not reachable");
    return url;
  }
  if (/^localhost$|\.local$|\.internal$/i.test(host)) throw new SafeFetchError("That address is not reachable");
  let addrs: { address: string }[];
  try { addrs = await lookup(host, { all: true }); } catch { throw new SafeFetchError(`Couldn't find the site "${host}"`); }
  if (!addrs.length || addrs.some((a) => isBlockedAddress(a.address))) throw new SafeFetchError("That address is not reachable");
  return url;
}

export interface SafeFetchResult { url: string; status: number; contentType: string; body: Buffer }

export async function safeFetch(
  raw: string,
  opts: { maxBytes: number; timeoutMs?: number; accept?: string; maxRedirects?: number },
): Promise<SafeFetchResult> {
  let current = raw;
  const deadline = AbortSignal.timeout(opts.timeoutMs ?? 15000);
  for (let hop = 0; hop <= (opts.maxRedirects ?? 5); hop++) {
    const url = await assertPublicUrl(current);
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: deadline,
        headers: {
          // Many shops refuse an obviously-robotic agent; this is a plain browser string.
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
          accept: opts.accept ?? "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-AU,en;q=0.9",
        },
      });
    } catch (err) {
      throw new SafeFetchError((err as Error)?.name === "TimeoutError" ? "The site took too long to answer" : "Couldn't reach that site");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, url).toString();
      await res.body?.cancel().catch(() => {});
      continue;
    }
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > opts.maxBytes) { await res.body?.cancel().catch(() => {}); throw new SafeFetchError("That page is too large to import"); }
    const chunks: Buffer[] = [];
    let size = 0;
    if (res.body) {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > opts.maxBytes) { await reader.cancel().catch(() => {}); throw new SafeFetchError("That page is too large to import"); }
        chunks.push(Buffer.from(value));
      }
    }
    return { url: url.toString(), status: res.status, contentType: res.headers.get("content-type") ?? "", body: Buffer.concat(chunks) };
  }
  throw new SafeFetchError("That link redirects too many times");
}
