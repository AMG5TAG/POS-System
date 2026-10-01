import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTheme } from "@/lib/theme";
import { BarChart3, Eye, Users, Globe, Radio, Loader2 } from "lucide-react";
import { onlineStoreFetch } from "./management-online-store-overview";

/* Management › Online Store › Statistics — what shoppers do on the online
   shop (api-server routes/shop-stats.ts; the shop reports it from lib/track.ts).
   Visitors are browsers; unique IPs are connections, counted from a keyed hash
   — no IP address is stored. */

interface Live {
  allTime: Counts; today: Counts; onlineNow: number; since: string | null;
}
interface Counts { pageViews: number; visitors: number; uniqueIps: number }
interface Stats {
  days: number;
  bucket: "hour" | "day";
  summary: {
    pageViews: number; visitors: number; uniqueIps: number; productViews: number; addToCarts: number;
    searches: number; linkClicks: number; pagesPerVisitor: number; cartRate: number;
    orders: number; orderRevenue: number; conversionRate: number;
  };
  series: ({ bucket: string } & Counts)[];
  mostViewed: { id: number; name: string; views: number; visitors: number; addToCarts: number; cartRate: number }[];
  mostAddedToCart: { id: number; name: string; addToCarts: number }[];
  mostClicked: { target: string; label: string | null; clicks: number }[];
  topPages: { path: string; views: number; visitors: number }[];
  topSearches: { term: string; searches: number }[];
  referrers: { host: string; visitors: number }[];
  devices: { device: string; visitors: number }[];
  bestSellersOnline: { id: number; name: string; units: number; revenue: number }[];
  bestSellersInStore: { id: number; name: string; units: number; revenue: number }[];
  mostWishlisted: { id: number; name: string; wishlists: number }[];
  reviews: { count: number; average: number | null };
}

const PERIODS = [
  { days: 1, label: "Last 24 hours" },
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 365, label: "Last 12 months" },
];

/* Two series, validated with the dataviz palette check (categorical slots 1–2,
   each stepped for its surface). */
const SERIES = {
  light: { visitors: "#2a78d6", uniqueIps: "#eb6834" },
  dark:  { visitors: "#3987e5", uniqueIps: "#d95926" },
};

const num = (n: number) => n.toLocaleString("en-AU");
const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

export default function ManagementOnlineStoreStatisticsPage() {
  const [days, setDays] = useState(30);
  const { theme } = useTheme();
  const colours = SERIES[theme === "dark" ? "dark" : "light"];

  // The running counters refresh on their own; the report follows the period.
  const live = useQuery({
    queryKey: ["online-store", "stats-live"],
    queryFn: () => onlineStoreFetch<Live>("/stats/live"),
    refetchInterval: 15_000,
  });
  const { data, isLoading } = useQuery({
    queryKey: ["online-store", "stats", days],
    queryFn: () => onlineStoreFetch<Stats>(`/stats?days=${days}`),
    refetchInterval: 60_000,
  });

  const s = data?.summary;
  const label = (b: string) => {
    if (data?.bucket === "hour") return `${b.slice(11, 13)}:00`;
    const d = new Date(`${b}T00:00:00`);
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart3 className="w-6 h-6 text-primary" /> Online Store Statistics</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Visitors, what they look at, click, search for and buy on the online shop. Visitors are browsers; unique IPs are internet connections (no IP address is stored).
            </p>
          </div>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODS.map((p) => <SelectItem key={p.days} value={String(p.days)}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        {/* Running counters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-600" /> Live counters
              <span className="text-xs font-normal text-muted-foreground">updates every 15 seconds</span>
            </CardTitle>
            {live.data?.since && <CardDescription>Counting since {new Date(live.data.since).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</CardDescription>}
          </CardHeader>
          <CardContent>
            {!live.data ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                <Counter icon={<Radio className="w-4 h-4" />} label="On the shop now" value={live.data.onlineNow} hint="active in the last 5 minutes" />
                <Counter icon={<Users className="w-4 h-4" />} label="Visitors — all time" value={live.data.allTime.visitors} />
                <Counter icon={<Globe className="w-4 h-4" />} label="Unique IPs — all time" value={live.data.allTime.uniqueIps} />
                <Counter icon={<Eye className="w-4 h-4" />} label="Page views — all time" value={live.data.allTime.pageViews} />
                <Counter icon={<Users className="w-4 h-4" />} label="Visitors today" value={live.data.today.visitors} />
                <Counter icon={<Globe className="w-4 h-4" />} label="Unique IPs today" value={live.data.today.uniqueIps} />
              </div>
            )}
          </CardContent>
        </Card>

        {isLoading || !data || !s ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
              <Tile label="Visitors" value={num(s.visitors)} />
              <Tile label="Unique IPs" value={num(s.uniqueIps)} />
              <Tile label="Page views" value={num(s.pageViews)} sub={`${s.pagesPerVisitor} per visitor`} />
              <Tile label="Product views" value={num(s.productViews)} />
              <Tile label="Added to cart" value={num(s.addToCarts)} sub={`${s.cartRate}% of visitors`} />
              <Tile label="Searches" value={num(s.searches)} />
              <Tile label="Link clicks" value={num(s.linkClicks)} />
              <Tile label="Online orders" value={num(s.orders)} sub={`${s.conversionRate}% of visitors`} />
              <Tile label="Paid online revenue" value={aud(s.orderRevenue)} />
              <Tile label="New reviews" value={num(data.reviews.count)} sub={data.reviews.average != null ? `average ${data.reviews.average} ★` : undefined} />
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Visitors and unique IPs</CardTitle>
                <CardDescription>{data.bucket === "hour" ? "Per hour" : "Per day"}, Sydney time.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.series} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="bucket" tickFormatter={label} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} minTickGap={24} />
                      <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip
                        labelFormatter={(b) => label(String(b))}
                        contentStyle={{ backgroundColor: "hsl(var(--popover))", borderColor: "hsl(var(--border))", borderRadius: "var(--radius)" }}
                        itemStyle={{ color: "hsl(var(--foreground))" }}
                        cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "3 3" }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="visitors" name="Visitors" stroke={colours.visitors} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                      <Line type="monotone" dataKey="uniqueIps" name="Unique IPs" stroke={colours.uniqueIps} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <Ranked title="Most viewed products" empty="No product views yet."
                head={["Product", "Views", "Visitors", "To cart"]}
                rows={data.mostViewed.map((p) => [p.name, num(p.views), num(p.visitors), `${num(p.addToCarts)} (${p.cartRate}%)`])} />
              <Ranked title="Best sellers online" description="From the shop's orders (not cancelled)." empty="No online orders yet."
                head={["Product", "Units", "Revenue"]}
                rows={data.bestSellersOnline.map((p) => [p.name, num(p.units), aud(p.revenue)])} />
              <Ranked title="Best sellers in store" description="Till sales of products the shop lists." empty="No in-store sales of listed products in this period."
                head={["Product", "Units", "Revenue"]}
                rows={data.bestSellersInStore.map((p) => [p.name, num(p.units), aud(p.revenue)])} />
              <Ranked title="Most added to cart" empty="Nothing added to a cart yet."
                head={["Product", "Adds"]}
                rows={data.mostAddedToCart.map((p) => [p.name, num(p.addToCarts)])} />
              <Ranked title="Most clicked links" empty="No link clicks yet."
                head={["Link", "Clicks"]}
                rows={data.mostClicked.map((l) => [<LinkCell key={l.target} target={l.target} label={l.label} />, num(l.clicks)])} />
              <Ranked title="Top pages" empty="No page views yet."
                head={["Page", "Views", "Visitors"]}
                rows={data.topPages.map((p) => [<span key={p.path} className="font-mono text-xs break-all">/shop{p.path === "/" ? "" : p.path}</span>, num(p.views), num(p.visitors)])} />
              <Ranked title="Top searches" empty="No searches yet."
                head={["Search", "Times"]}
                rows={data.topSearches.map((t) => [t.term, num(t.searches)])} />
              <Ranked title="Where visitors came from" description="The site a visitor arrived from. Visits typed in or from a bookmark aren't listed." empty="No referrals yet."
                head={["Site", "Visitors"]}
                rows={data.referrers.map((r) => [r.host, num(r.visitors)])} />
              <Ranked title="Devices" empty="No visitors yet."
                head={["Device", "Visitors", "Share"]}
                rows={data.devices.map((d) => [d.device[0].toUpperCase() + d.device.slice(1), num(d.visitors), `${s.visitors ? Math.round((d.visitors / s.visitors) * 100) : 0}%`])} />
              <Ranked title="Most wishlisted" description="All time." empty="No wishlisted products yet."
                head={["Product", "Wishlists"]}
                rows={data.mostWishlisted.map((p) => [p.name, num(p.wishlists)])} />
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function Counter({ icon, label, value, hint }: { icon: ReactNode; label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">{icon}{label}</p>
      <p className="text-2xl font-bold tabular-nums mt-1">{num(value)}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tabular-nums mt-0.5">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function LinkCell({ target, label }: { target: string; label: string | null }) {
  const shown = /^https?:/.test(target) ? target : `/shop${target === "/" ? "" : target}`;
  return (
    <span className="block min-w-0">
      {label && <span className="block truncate">{label}</span>}
      <span className="block font-mono text-[11px] text-muted-foreground break-all">{target === "tel" ? "Phone call link" : target === "mailto" ? "Email link" : shown}</span>
    </span>
  );
}

function Ranked({ title, description, head, rows, empty }: {
  title: string; description?: string; head: string[]; rows: ReactNode[][]; empty: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left font-medium py-1.5 w-6">#</th>
                  {head.map((h, i) => <th key={h} className={`font-medium py-1.5 ${i === 0 ? "text-left" : "text-right pl-3"}`}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, n) => (
                  <tr key={n} className="border-b last:border-0">
                    <td className="py-1.5 text-muted-foreground tabular-nums align-top">{n + 1}</td>
                    {r.map((c, i) => <td key={i} className={`py-1.5 align-top ${i === 0 ? "min-w-0" : "text-right pl-3 tabular-nums whitespace-nowrap"}`}>{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
