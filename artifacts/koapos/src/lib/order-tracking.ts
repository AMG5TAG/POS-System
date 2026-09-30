/* Online › Orders: order statuses and carrier tracking links.
   Carrier ids match Online › Shipping's list. */

export const ORDER_STATUSES = [
  { value: "new",        label: "New",              tone: "bg-blue-100 text-blue-800" },
  { value: "processing", label: "Processing",       tone: "bg-amber-100 text-amber-800" },
  { value: "ready",      label: "Ready for pickup", tone: "bg-violet-100 text-violet-800" },
  { value: "shipped",    label: "Shipped",          tone: "bg-sky-100 text-sky-800" },
  { value: "delivered",  label: "Delivered",        tone: "bg-emerald-100 text-emerald-800" },
  { value: "cancelled",  label: "Cancelled",        tone: "bg-stone-200 text-stone-700" },
] as const;

/** Orders still needing someone to do something. */
export const OPEN_ORDER_STATUSES = new Set(["new", "processing", "ready", "shipped"]);

/** An unknown status (older rows) shows as itself rather than being hidden. */
export function orderStatusMeta(status: string) {
  return ORDER_STATUSES.find((s) => s.value === status)
    ?? { value: status, label: status ? status.replace(/_/g, " ") : "Unknown", tone: "bg-muted text-muted-foreground" };
}

export const CARRIERS: { id: string; name: string; url?: (n: string) => string }[] = [
  { id: "auspost",   name: "Australia Post",   url: (n) => `https://auspost.com.au/mypost/track/details/${n}` },
  { id: "startrack", name: "StarTrack",        url: (n) => `https://startrack.com.au/track/details/${n}` },
  { id: "couriers",  name: "Couriers Please",  url: (n) => `https://www.couriersplease.com.au/tools-track/no/${n}` },
  { id: "fastway",   name: "Aramex (Fastway)", url: (n) => `https://www.aramex.com.au/tools/track?l=${n}` },
  { id: "tnt",       name: "TNT Express",      url: (n) => `https://www.tnt.com/express/en_au/site/shipping-tools/tracking.html?searchType=con&cons=${n}` },
  { id: "dhl",       name: "DHL Express",      url: (n) => `https://www.dhl.com/au-en/home/tracking/tracking-express.html?submit=1&tracking-id=${n}` },
  { id: "fedex",     name: "FedEx",            url: (n) => `https://www.fedex.com/fedextrack/?trknbr=${n}` },
  { id: "sendle",    name: "Sendle",           url: (n) => `https://track.sendle.com/tracking?ref=${n}` },
  { id: "other",     name: "Other" },
];

export function carrierName(id: string): string {
  return CARRIERS.find((c) => c.id === id)?.name ?? id;
}

/** The carrier's public tracking page for a consignment, or null when there is
 *  no number or the carrier has no known tracking page. */
export function trackingUrl(carrierId: string, trackingNumber: string): string | null {
  const n = trackingNumber.trim();
  const c = CARRIERS.find((x) => x.id === carrierId);
  return n && c?.url ? c.url(encodeURIComponent(n)) : null;
}
