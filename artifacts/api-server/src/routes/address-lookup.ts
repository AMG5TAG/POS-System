import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";

/**
 * Address autocomplete proxy — a cheaper alternative to Google Places Autocomplete.
 *
 * Backed by **Addressr** (https://github.com/mountain-pass/addressr) over the free
 * Geoscape **G-NAF** dataset — either the hosted service on RapidAPI or a
 * self-hosted instance. Keeping the lookup server-side hides the key from the
 * browser and avoids CORS.
 *
 * Env (feature disabled — endpoints report `enabled:false` — when neither is set):
 *   ADDRESSR_RAPIDAPI_KEY  hosted Addressr on RapidAPI; the base URL defaults to
 *                          https://addressr.p.rapidapi.com
 *   ADDRESSR_BASE_URL      a self-hosted instance, e.g. https://addressr.internal
 *   ADDRESSR_API_KEY       optional bearer token if that instance is protected
 *
 * The normalisation in mapSearch/mapDetail targets a standard Addressr (HAL+JSON)
 * build. If your instance's JSON differs, adjust those two functions only.
 */
const RAPIDAPI_KEY = process.env.ADDRESSR_RAPIDAPI_KEY ?? "";
const BASE = (process.env.ADDRESSR_BASE_URL || (RAPIDAPI_KEY ? "https://addressr.p.rapidapi.com" : "")).replace(/\/$/, "");
const isEnabled = (): boolean => BASE.length > 0;

/** A lookup runs while someone is typing; a slow provider must not hang the request. */
const LOOKUP_TIMEOUT_MS = 5000;

function authHeaders(): Record<string, string> {
  if (RAPIDAPI_KEY) {
    return { Accept: "application/json", "X-RapidAPI-Key": RAPIDAPI_KEY, "X-RapidAPI-Host": new URL(BASE).host };
  }
  const key = process.env.ADDRESSR_API_KEY;
  return { Accept: "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) };
}

/* Two response shapes are in the wild. Older Addressr builds wrap search results
   in HAL (`_embedded.addresses`, id in `_links.self.href`); the hosted RapidAPI
   service returns a bare array with the id as `pid`. Accept both — reading only
   the HAL shape is what left the hosted lookup silently returning no results. */
interface AddressrHit { sla?: string; pid?: string; _links?: { self?: { href?: string } } }
type AddressrSearch = AddressrHit[] | { _embedded?: { addresses?: AddressrHit[] } };

/* `street.type` and `state` likewise come as a plain string or as a
   `{code, name}` object depending on the build. */
type Coded = string | { code?: string; name?: string };
interface AddressrDetail {
  sla?: string;
  smla?: string[];
  structured?: {
    number?: unknown;
    flat?: { number?: unknown };
    street?: { name?: string; type?: Coded };
    locality?: { name?: string };
    state?: { abbreviation?: string; name?: string };
    postcode?: string | number;
  };
}

function codedName(v: Coded | undefined): string {
  return typeof v === "string" ? v : v?.name ?? "";
}

function numberOf(v: unknown): string {
  if (typeof v === "object" && v !== null) return String((v as { number?: unknown }).number ?? "");
  return v == null ? "" : String(v);
}

export function mapSearch(data: AddressrSearch): { id: string; label: string }[] {
  const list = Array.isArray(data) ? data : data?._embedded?.addresses ?? [];
  return list
    .slice(0, 8)
    .map((a) => ({
      id: a?.pid ?? (a?._links?.self?.href ?? "").split("?")[0].split("/").filter(Boolean).pop() ?? "",
      label: a?.sla ?? "",
    }))
    .filter((x) => x.id && x.label);
}

export function mapDetail(d: AddressrDetail): { street: string; city: string; state: string; postcode: string } {
  const s = d?.structured ?? {};
  const num = numberOf(s.number);
  const flat = numberOf(s.flat?.number);
  const streetName = [s.street?.name, codedName(s.street?.type)].filter(Boolean).join(" ").trim();
  /* The short multi-line address's first line is already "1/200 GEORGE ST" —
     unit included, which the structured parts would otherwise lose. */
  const street = d?.smla?.[0]?.trim()
    || [[flat, num].filter(Boolean).join("/"), streetName].filter(Boolean).join(" ").trim();
  return {
    street: street || (d?.sla ?? "").split(",")[0].trim(),
    city: s.locality?.name ?? "",
    state: s.state?.abbreviation ?? s.state?.name ?? "",
    postcode: String(s.postcode ?? ""),
  };
}

const router: IRouter = Router();

/** Feature detection so the frontend only shows autocomplete when a provider exists. */
router.get("/address/status", requireAuth, (_req, res): void => {
  res.json({ enabled: isEnabled() });
});

router.get("/address/search", requireAuth, async (req, res): Promise<void> => {
  if (!isEnabled()) { res.json({ enabled: false, results: [] }); return; }
  const q = String(req.query.q ?? "").trim();
  if (q.length < 3) { res.json({ enabled: true, results: [] }); return; }
  try {
    const r = await fetch(`${BASE}/addresses?q=${encodeURIComponent(q)}`, { headers: authHeaders(), signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
    if (!r.ok) { res.status(502).json({ enabled: true, results: [], error: "lookup_failed" }); return; }
    res.json({ enabled: true, results: mapSearch(await r.json() as AddressrSearch) });
  } catch {
    res.status(502).json({ enabled: true, results: [], error: "lookup_failed" });
  }
});

router.get("/address/detail", requireAuth, async (req, res): Promise<void> => {
  if (!isEnabled()) { res.status(404).json({ error: "disabled" }); return; }
  const id = String(req.query.id ?? "").trim();
  if (!id) { res.status(400).json({ error: "missing id" }); return; }
  try {
    const r = await fetch(`${BASE}/addresses/${encodeURIComponent(id)}`, { headers: authHeaders(), signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
    if (!r.ok) { res.status(502).json({ error: "lookup_failed" }); return; }
    res.json(mapDetail(await r.json() as AddressrDetail));
  } catch {
    res.status(502).json({ error: "lookup_failed" });
  }
});

export default router;
