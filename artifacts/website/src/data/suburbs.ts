import serviceArea from "./service-area.json";

/**
 * Suburb pages — the hub towns within 20 km of the Mannering Park workshop.
 *
 * Only these keep a page. Every other suburb is `retired` in service-area.json:
 * a locality inside 20 km 301s to its nearest hub (`to`), which names it under
 * "Also covering"; one beyond 20 km 301s to its region page (`region`), which
 * lists it.
 * The list used to hold all 241 suburbs on one template, which read to Google
 * as doorway pages; a hub page earns its place with unique copy written in
 * suburb-content.ts.
 *
 * Adding a hub: add it here AND to `hubs` in service-area.json (coordinates),
 * then point the retired suburbs that are nearer to it at it. The build
 * scripts parse the quoted names in `rawSuburbs`, so keep it a plain literal.
 */

function sortAlpha(arr: string[]): string[] {
  return [...arr].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

const rawSuburbs: Record<string, string[]> = {
  B: ["Belmont", "Blue Haven", "Bonnells Bay", "Budgewoi", "Buff Point"],
  C: ["Catherine Hill Bay", "Caves Beach", "Chain Valley Bay", "Charmhaven", "Cooranbong"],
  D: ["Dora Creek", "Doyalson"],
  G: ["Gorokan", "Gwandalan"],
  H: ["Hamlyn Terrace"],
  K: ["Kanwal"],
  L: ["Lake Haven", "Lake Munmorah"],
  M: ["Mannering Park", "Morisset"],
  N: ["Norah Head"],
  R: ["Rathmines"],
  S: ["San Remo", "Summerland Point", "Swansea"],
  T: ["Toronto", "Toukley"],
  W: ["Wadalba", "Wangi Wangi", "Warnervale", "Woongarrah", "Wyee", "Wyong"],
};

export const suburbs: Record<string, string[]> = Object.fromEntries(
  Object.entries(rawSuburbs).map(([letter, names]) => [letter, sortAlpha(names)]),
);

export function toSuburbSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const slugToName: Record<string, string> = {};
for (const names of Object.values(suburbs)) {
  for (const name of names) {
    slugToName[toSuburbSlug(name)] = name;
  }
}

export function findSuburbBySlug(slug: string): string | undefined {
  return slugToName[slug.toLowerCase()];
}

export function suburbPath(name: string): string {
  const slug = toSuburbSlug(name);
  const r = retired[slug];
  return r ? retiredPath(r) : `/computer-repairs/${slug}`;
}

type RetiredSuburb =
  | { name: string; km: number; to: string; region?: undefined }
  | { name: string; km: number; region: "central-coast" | "lake-macquarie"; to?: undefined };

function retiredPath(r: RetiredSuburb): string {
  return r.to ? `/computer-repairs/${toSuburbSlug(r.to)}` : `/computer-repairs/${r.region}`;
}
const retired = serviceArea.retired as Record<string, RetiredSuburb>;
const hubs = serviceArea.hubs as Record<string, { lat: number; lon: number; km: number }>;

/** Where a retired suburb slug now redirects (hub or region page), or null. */
export function retiredSuburbTarget(slug: string): string | null {
  const r = retired[slug.toLowerCase()];
  return r ? retiredPath(r) : null;
}

/** Retired suburbs inside the 20 km radius that a hub page covers. */
export function alsoCovering(hub: string): string[] {
  return sortAlpha(Object.values(retired).filter((r) => r.to === hub).map((r) => r.name));
}

export function isSuburbPage(name: string): boolean {
  return name in hubs;
}

/** Straight-line km from the workshop and compass bearing, for a hub. */
export function suburbDistance(name: string): { km: number; direction: string } | null {
  const h = hubs[name];
  if (!h) return null;
  const { lat, lon } = serviceArea.workshop;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const y = Math.sin(toRad(h.lon - lon)) * Math.cos(toRad(h.lat));
  const x = Math.cos(toRad(lat)) * Math.sin(toRad(h.lat)) - Math.sin(toRad(lat)) * Math.cos(toRad(h.lat)) * Math.cos(toRad(h.lon - lon));
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  const dirs = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  return { km: h.km, direction: dirs[Math.round(((bearing + 360) % 360) / 45) % 8] };
}

/** The other hub pages nearest this one, closest first. */
export function nearbySuburbs(name: string, count = 6): string[] {
  const h = hubs[name];
  if (!h) return [];
  const d = (o: { lat: number; lon: number }) => Math.hypot(o.lat - h.lat, (o.lon - h.lon) * Math.cos((h.lat * Math.PI) / 180));
  return Object.entries(hubs).filter(([n]) => n !== name).sort((a, b) => d(a[1]) - d(b[1])).slice(0, count).map(([n]) => n);
}
