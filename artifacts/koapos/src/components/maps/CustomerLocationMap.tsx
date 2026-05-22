import { useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useListCustomers, type Customer } from "@workspace/api-client-react";
import { Users, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Australian city → [lat, lng] lookup ────────────────────────────────── */

const AU_CITIES: Record<string, [number, number]> = {
  /* NSW — major */
  "sydney": [-33.8688, 151.2093], "parramatta": [-33.8148, 151.0017],
  "newcastle": [-32.9283, 151.7817], "wollongong": [-34.4278, 150.8931],
  "maitland": [-32.7333, 151.5500], "cessnock": [-32.8333, 151.3500],
  "albury": [-36.0737, 146.9135], "wagga wagga": [-35.1082, 147.3598],
  "tamworth": [-31.0927, 150.9320], "orange": [-33.2837, 149.1001],
  "dubbo": [-32.2569, 148.6011], "bathurst": [-33.4200, 149.5769],
  "gosford": [-33.4253, 151.3418], "penrith": [-33.7511, 150.6942],
  "liverpool": [-33.9200, 150.9200], "campbelltown": [-34.0647, 150.8131],
  "coffs harbour": [-30.2963, 153.1155], "port macquarie": [-31.4333, 152.9000],
  "manly": [-33.7969, 151.2867], "bondi": [-33.8914, 151.2753],
  "surry hills": [-33.8873, 151.2108], "redfern": [-33.8938, 151.2034],
  "chatswood": [-33.7981, 151.1819], "hornsby": [-33.7022, 151.0993],
  "blacktown": [-33.7688, 150.9073], "ryde": [-33.8210, 151.1020],
  "kogarah": [-33.9632, 151.1340], "hurstville": [-33.9667, 151.1000],
  "fairfield": [-33.8717, 150.9547], "bankstown": [-33.9167, 151.0333],
  /* NSW — Lake Macquarie / Central Coast */
  "gwandalan": [-33.1757, 151.5576], "summerland point": [-33.1900, 151.5200],
  "mannering park": [-33.1667, 151.5167], "chain valley bay": [-33.1833, 151.5300],
  "toukley": [-33.2549, 151.5631], "lake munmorah": [-33.2167, 151.5667],
  "gorokan": [-33.2500, 151.5500], "noraville": [-33.2500, 151.5900],
  "budgewoi": [-33.2333, 151.5833], "woongarrah": [-33.2333, 151.5167],
  "lake haven": [-33.2490, 151.5052], "blue haven": [-33.2457, 151.5211],
  "san remo": [-33.2167, 151.5700], "norah head": [-33.2833, 151.5903],
  "wyong": [-33.2833, 151.4217], "hamlyn terrace": [-33.2333, 151.5100],
  "the entrance": [-33.3333, 151.5000], "kanwal": [-33.2667, 151.5033],
  "buff point": [-33.2167, 151.5800], "wyee point": [-33.1000, 151.5500],
  "charmhaven": [-33.2167, 151.5333], "canton beach": [-33.2833, 151.5867],
  "nords wharf": [-33.1333, 151.5800], "wyee": [-33.1333, 151.5033],
  "avoca beach": [-33.4833, 151.4333], "morisset": [-33.1167, 151.5017],
  "valentine": [-33.0167, 151.6200], "kincumber": [-33.4667, 151.4333],
  "wadalba": [-33.2500, 151.5000], "bateau bay": [-33.3833, 151.5033],
  "doyalson": [-33.2167, 151.5367], "halekulani": [-33.2167, 151.5900],
  "bonnells Bay": [-33.1500, 151.5533], "crangan bay": [-33.1500, 151.5700],
  "tuggerah": [-33.2833, 151.4333], "murrays beach": [-33.0333, 151.5867],
  "copacabana": [-33.5000, 151.4500], "west wallsend": [-32.9667, 151.6167],
  "north gosford": [-33.4000, 151.3333], "toukey": [-33.2549, 151.5631],
  "bonnells bay": [-33.1500, 151.5533],
  /* VIC */
  "melbourne": [-37.8136, 144.9631], "geelong": [-38.1499, 144.3617],
  "ballarat": [-37.5622, 143.8503], "bendigo": [-36.7570, 144.2794],
  "shepparton": [-36.3823, 145.3992], "latrobe valley": [-38.2000, 146.4167],
  "warrnambool": [-38.3834, 142.4879], "mildura": [-34.1889, 142.1589],
  "wodonga": [-36.1217, 146.8882], "frankston": [-38.1442, 145.1240],
  "dandenong": [-37.9880, 145.2160], "ringwood": [-37.8164, 145.2292],
  "footscray": [-37.8007, 144.8996], "st kilda": [-37.8676, 144.9820],
  "fitzroy": [-37.7969, 144.9783], "richmond": [-37.8144, 145.0003],
  "prahran": [-37.8494, 144.9921], "north melbourne": [-37.7954, 144.9473],
  "box hill": [-37.8196, 145.1239], "doncaster": [-37.7833, 145.1264],
  "brighton": [-37.9063, 145.0007], "hawthorn": [-37.8196, 145.0367],
  "south yarra": [-37.8387, 144.9932], "collingwood": [-37.8038, 144.9882],
  /* QLD */
  "brisbane": [-27.4698, 153.0251], "gold coast": [-28.0167, 153.4000],
  "sunshine coast": [-26.6500, 153.0667], "townsville": [-19.2590, 146.8169],
  "cairns": [-16.9186, 145.7781], "toowoomba": [-27.5598, 151.9507],
  "rockhampton": [-23.3792, 150.5100], "mackay": [-21.1411, 149.1861],
  "bundaberg": [-24.8661, 152.3489], "hervey bay": [-25.2881, 152.8360],
  "gladstone": [-23.8427, 151.2565], "mount isa": [-20.7256, 139.4927],
  "ipswich": [-27.6166, 152.7537], "logan": [-27.6394, 153.1075],
  "redland": [-27.7258, 153.2561], "moreton bay": [-27.0350, 152.9550],
  "southport": [-27.9627, 153.3929], "surfers paradise": [-28.0024, 153.4307],
  "fortitude valley": [-27.4574, 153.0381], "new farm": [-27.4695, 153.0530],
  "west end": [-27.4803, 153.0107], "spring hill": [-27.4574, 153.0197],
  /* WA */
  "perth": [-31.9505, 115.8605], "fremantle": [-32.0569, 115.7439],
  "mandurah": [-32.5269, 115.7225], "bunbury": [-33.3271, 115.6371],
  "geraldton": [-28.7741, 114.6083], "kalgoorlie": [-30.7490, 121.4660],
  "albany": [-35.0269, 117.8836], "rockingham": [-32.2778, 115.7297],
  "joondalup": [-31.7443, 115.7658], "armadale": [-32.1522, 116.0147],
  "midland": [-31.8893, 116.0141], "cannington": [-31.9924, 115.9397],
  "subiaco": [-31.9513, 115.8243], "cottesloe": [-31.9968, 115.7600],
  "claremont": [-31.9797, 115.7819], "scarborough": [-31.8954, 115.7634],
  /* SA */
  "adelaide": [-34.9285, 138.6007], "mount gambier": [-37.8311, 140.7757],
  "whyalla": [-33.0258, 137.5561], "port augusta": [-32.4928, 137.7677],
  "port lincoln": [-34.7249, 135.8589], "murray bridge": [-35.1197, 139.2739],
  "gawler": [-34.5997, 138.7444], "victor harbor": [-35.5561, 138.6178],
  "elizabeth": [-34.7127, 138.6685], "salisbury": [-34.7643, 138.6459],
  "port pirie": [-33.1864, 138.0169], "mount barker": [-35.0676, 138.8628],
  "norwood": [-34.9214, 138.6367], "unley": [-34.9453, 138.6003],
  "burnside": [-34.9273, 138.6648], "prospect": [-34.8888, 138.5983],
  /* TAS */
  "hobart": [-42.8826, 147.3257], "launceston": [-41.4332, 147.1441],
  "devonport": [-41.1784, 146.3507], "burnie": [-41.0543, 145.9022],
  "queenstown": [-42.0769, 145.5518], "ulverstone": [-41.1568, 146.1676],
  /* NT */
  "darwin": [-12.4634, 130.8456], "alice springs": [-23.6980, 133.8807],
  "katherine": [-14.4655, 132.2630], "nhulunbuy": [-12.1808, 136.7745],
  "palmerston": [-12.4878, 130.9800], "tennant creek": [-19.6500, 134.1833],
  /* ACT */
  "canberra": [-35.2809, 149.1300], "belconnen": [-35.2362, 149.0672],
  "tuggeranong": [-35.4200, 149.0611], "woden": [-35.3502, 149.0875],
  "gungahlin": [-35.1833, 149.1333], "queanbeyan": [-35.3537, 149.2338],
};

const STATE_CENTRES: Record<string, [number, number]> = {
  nsw: [-33.8688, 151.2093], "new south wales": [-33.8688, 151.2093],
  vic: [-37.8136, 144.9631], victoria: [-37.8136, 144.9631],
  qld: [-27.4698, 153.0251], queensland: [-27.4698, 153.0251],
  wa: [-31.9505, 115.8605], "western australia": [-31.9505, 115.8605],
  sa: [-34.9285, 138.6007], "south australia": [-34.9285, 138.6007],
  tas: [-42.8826, 147.3257], tasmania: [-42.8826, 147.3257],
  nt: [-12.4634, 130.8456], "northern territory": [-12.4634, 130.8456],
  act: [-35.2809, 149.1300], "australian capital territory": [-35.2809, 149.1300],
};

function resolveCoords(
  city?: string | null,
  state?: string | null,
): [number, number] | null {
  if (city) {
    const key = city.toLowerCase().trim();
    if (AU_CITIES[key]) return AU_CITIES[key];
    /* partial match */
    for (const [k, v] of Object.entries(AU_CITIES)) {
      if (key.includes(k) || k.includes(key)) return v;
    }
  }
  if (state) {
    const key = state.toLowerCase().trim();
    if (STATE_CENTRES[key]) return STATE_CENTRES[key];
  }
  return null;
}

/* ── Auto-fit map bounds ────────────────────────────────────────────────── */

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useMemo(() => {
    if (positions.length === 0) return;
    if (positions.length === 1) {
      map.setView(positions[0], 10);
    } else {
      const lats = positions.map((p) => p[0]);
      const lngs = positions.map((p) => p[1]);
      map.fitBounds(
        [[Math.min(...lats) - 0.5, Math.min(...lngs) - 0.5],
         [Math.max(...lats) + 0.5, Math.max(...lngs) + 0.5]],
        { padding: [30, 30] },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions.length]);
  return null;
}

/* ── Component ──────────────────────────────────────────────────────────── */

export function CustomerLocationMap() {
  const { data, isLoading } = useListCustomers();
  const customers: Customer[] = (data as { items?: Customer[] } | undefined)?.items ?? [];

  /* resolve positions */
  const pins = useMemo(() => {
    return customers
      .map((c) => {
        const coords = resolveCoords(c.billingCity, c.billingState);
        if (!coords) return null;
        /* slight random jitter so overlapping pins don't stack */
        const jitter = () => (Math.random() - 0.5) * 0.04;
        return {
          id: c.id,
          name: [c.firstName, c.lastName].filter(Boolean).join(" ") || "Customer",
          city: c.billingCity ?? c.billingState ?? "Unknown",
          totalSpent: c.totalSpent ?? 0,
          loyaltyPoints: c.loyaltyPoints ?? 0,
          pos: [coords[0] + jitter(), coords[1] + jitter()] as [number, number],
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);
  }, [customers]);

  /* suburb breakdown */
  const suburbCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    customers.forEach((c) => {
      const key = c.billingCity?.trim() || c.billingState?.trim() || null;
      if (key) counts[key] = (counts[key] ?? 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [customers]);

  const located   = pins.length;
  const unlocated = customers.length - located;

  if (isLoading) {
    return (
      <div className="h-64 rounded-2xl border bg-muted/30 flex items-center justify-center">
        <p className="text-sm text-muted-foreground animate-pulse">Loading customer map…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_1fr] gap-4 items-stretch">

        {/* Map */}
        <div className="rounded-2xl border overflow-hidden min-h-[320px]">
          <MapContainer
            center={[-25.2744, 133.7751]}
            zoom={4}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom={false}
            attributionControl={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {pins.map((pin) => (
              <CircleMarker
                key={pin.id}
                center={pin.pos}
                radius={10}
                pathOptions={{
                  fillColor: "hsl(var(--primary))",
                  fillOpacity: 0.85,
                  color: "white",
                  weight: 2,
                }}
              >
                <Popup>
                  <div className="text-sm space-y-0.5 min-w-[140px]">
                    <p className="font-semibold">{pin.name}</p>
                    <p className="text-muted-foreground text-xs flex items-center gap-1">
                      <MapPin className="w-3 h-3 inline" /> {pin.city}
                    </p>
                    <p className="text-xs mt-1">
                      Spent: <strong>${pin.totalSpent.toFixed(2)}</strong>
                    </p>
                    <p className="text-xs">
                      Points: <strong>{pin.loyaltyPoints}</strong>
                    </p>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
            <FitBounds positions={pins.map((p) => p.pos)} />
          </MapContainer>
        </div>

        {/* Side panel */}
        <div className="space-y-3">
          {/* Stats */}
          <div className="rounded-2xl border bg-card p-4 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Location Summary</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-primary/5 border border-primary/10 p-3 text-center">
                <p className="text-2xl font-bold text-primary">{located}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Mapped</p>
              </div>
              <div className="rounded-xl bg-muted/50 border p-3 text-center">
                <p className="text-2xl font-bold text-muted-foreground">{unlocated}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">No address</p>
              </div>
            </div>
            {unlocated > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Add a billing city to {unlocated === 1 ? "1 customer" : `${unlocated} customers`} to place {unlocated === 1 ? "them" : "them"} on the map.
              </p>
            )}
          </div>

          {/* Suburb breakdown */}
          {suburbCounts.length > 0 ? (
            <div className="rounded-2xl border bg-card p-4 space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Top Locations</p>
              <div className="space-y-2">
                {suburbCounts.map(([suburb, count], i) => {
                  const max = suburbCounts[0][1];
                  return (
                    <div key={suburb} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className={cn("font-medium", i === 0 && "text-primary")}>{suburb}</span>
                        <span className="text-muted-foreground">{count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", i === 0 ? "bg-primary" : "bg-primary/40")}
                          style={{ width: `${(count / max) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border bg-card p-4 text-center space-y-2">
              <Users className="w-8 h-8 text-muted-foreground/40 mx-auto" />
              <p className="text-sm font-medium">No location data</p>
              <p className="text-[11px] text-muted-foreground">
                Add billing cities to your customers to see a suburb breakdown here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
