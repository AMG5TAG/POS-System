import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";

/**
 * Address autocomplete proxy — a cheaper alternative to Google Places Autocomplete.
 *
 * Backed by a self-hosted **Addressr** instance (https://github.com/mountain-pass/addressr)
 * over the free Geoscape **G-NAF** dataset. Keeping the lookup server-side hides the
 * Addressr host/key from the browser and avoids CORS.
 *
 * Env (feature disabled — endpoints report `enabled:false` — when unset):
 *   ADDRESSR_BASE_URL   e.g. https://addressr.internal
 *   ADDRESSR_API_KEY    optional bearer token if your instance is protected
 *
 * The normalisation in mapSearch/mapDetail targets a standard Addressr (HAL+JSON)
 * build. If your instance's JSON differs, adjust those two functions only.
 */
const BASE = (process.env.ADDRESSR_BASE_URL ?? "").replace(/\/$/, "");
const isEnabled = (): boolean => BASE.length > 0;

function authHeaders(): Record<string, string> {
  const key = process.env.ADDRESSR_API_KEY;
  return { Accept: "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) };
}

interface AddressrSearch {
  _embedded?: { addresses?: { sla?: string; _links?: { self?: { href?: string } } }[] };
}
interface AddressrDetail {
  sla?: string;
  structured?: {
    number?: unknown;
    street?: { name?: string; type?: string };
    locality?: { name?: string };
    state?: { abbreviation?: string; name?: string };
    postcode?: string | number;
  };
}

function mapSearch(data: AddressrSearch): { id: string; label: string }[] {
  const list = data?._embedded?.addresses ?? [];
  return list
    .slice(0, 8)
    .map((a) => ({
      id: (a?._links?.self?.href ?? "").split("?")[0].split("/").filter(Boolean).pop() ?? "",
      label: a?.sla ?? "",
    }))
    .filter((x) => x.id && x.label);
}

function mapDetail(d: AddressrDetail): { street: string; city: string; state: string; postcode: string } {
  const s = d?.structured ?? {};
  const numRaw = s.number as unknown;
  const num = typeof numRaw === "object" && numRaw !== null
    ? String((numRaw as { number?: unknown }).number ?? "")
    : String(numRaw ?? "");
  const streetName = [s.street?.name, s.street?.type].filter(Boolean).join(" ").trim();
  const street = [num, streetName].filter(Boolean).join(" ").trim();
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
    const r = await fetch(`${BASE}/addresses/?q=${encodeURIComponent(q)}`, { headers: authHeaders() });
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
    const r = await fetch(`${BASE}/addresses/${encodeURIComponent(id)}`, { headers: authHeaders() });
    if (!r.ok) { res.status(502).json({ error: "lookup_failed" }); return; }
    res.json(mapDetail(await r.json() as AddressrDetail));
  } catch {
    res.status(502).json({ error: "lookup_failed" });
  }
});

export default router;
