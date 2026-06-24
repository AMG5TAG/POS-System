import { useMemo } from "react";
import { useListQrCodes } from "@workspace/api-client-react";

/**
 * Resolve persisted entity-QR values by entryId ("product-<id>",
 * "customer-<id>", "service-<id>") so printed QRs use the single tracked record
 * rather than being regenerated on the fly. Falls back to the caller's computed
 * value when no persisted QR exists yet (e.g. before a backfill).
 */
export function useEntityQrLookup(): (entryId: string, fallback: string) => string {
  const { data } = useListQrCodes();
  const map = useMemo(() => {
    const m = new Map<string, string>();
    for (const q of data?.items ?? []) {
      if (q.entryId && q.url) m.set(q.entryId, q.url);
    }
    return m;
  }, [data]);
  return useMemo(() => (entryId: string, fallback: string) => map.get(entryId) || fallback, [map]);
}
