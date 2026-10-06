import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/lib/theme";
import {
  Globe, Search, BarChart3, MapPin, Star, Loader2, AlertTriangle, ExternalLink, RefreshCw, Phone, Navigation,
  MousePointerClick, MessageSquare, Radio, CheckCircle2, Clock,
} from "lucide-react";

/* Marketing › Google — the business's Google Search Console, Google Analytics
   and Google Business Profile (Maps) figures, and its Google reviews, read with
   the owner's Google sign-in (api-server routes/google-insights.ts). Nothing
   here is stored by KoaPOS except which site, property and listing to show. */

type Code = "not_connected" | "scope_missing" | "api_disabled" | "access_pending" | "no_permission" | "rate_limited" | "google_error";
class GoogleError extends Error {
  constructor(message: string, public code: Code, public activationUrl?: string) { super(message); }
}

async function gFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api/google-insights${path}`, {
    credentials: "include",
    ...init,
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const b = body as { error?: string; code?: Code; activationUrl?: string };
    throw new GoogleError(b.error ?? `Request failed (${r.status})`, b.code ?? "google_error", b.activationUrl);
  }
  return body as T;
}

interface Selection {
  searchConsoleSite?: string; ga4Property?: string; ga4PropertyName?: string;
  gbpAccount?: string; gbpLocation?: string; gbpLocationTitle?: string;
}
interface Status {
  configured: boolean; connected: boolean; account: string | null;
  products: { searchConsole: boolean; analytics: boolean; business: boolean };
  selection: Selection;
}
interface OptionList<T> { items: T[]; error?: { code: Code; message: string; activationUrl?: string } }
interface Options {
  sites: OptionList<{ id: string; name: string }>;
  properties: OptionList<{ id: string; name: string }>;
  locations: OptionList<{ id: string; account: string; name: string }>;
}
interface SearchRow { key: string; clicks: number; impressions: number; ctr: number; position: number }
interface SearchData {
  site: string; start: string; end: string;
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  series: { date: string; clicks: number; impressions: number }[];
  queries: SearchRow[]; pages: SearchRow[]; devices: SearchRow[];
  sitemaps: { path: string; lastSubmitted: string | null; lastDownloaded: string | null; pending: boolean; errors: number; warnings: number; submitted: number }[];
}
interface AnalyticsData {
  start: string; end: string; activeNow: number | null;
  totals: { users: number; newUsers: number; sessions: number; views: number; engagementRate: number; avgSessionSeconds: number };
  series: { date: string; users: number; sessions: number; views: number }[];
  channels: { name: string; sessions: number; users: number }[];
  pages: { path: string; views: number; users: number }[];
  devices: { name: string; users: number }[];
  cities: { name: string; users: number }[];
  sources: { name: string; sessions: number }[];
}
interface MapsDay { searchViews: number; mapsViews: number; calls: number; directions: number; websiteClicks: number; messages: number; bookings: number }
interface MapsData {
  title: string | null; start: string; end: string;
  series: ({ date: string } & MapsDay)[]; totals: MapsDay;
  keywords: { keyword: string; count: number | null; under: number | null }[];
  keywordMonths: { start: { year: number; month: number }; end: { year: number; month: number } };
}
interface Review {
  id: string; reviewer: string; photo: string | null; rating: number | null; comment: string;
  createdAt: string | null; updatedAt: string | null; reply: { comment: string; updatedAt: string | null } | null;
}
interface ReviewsData { averageRating: number | null; totalReviewCount: number; reviews: Review[]; nextPageToken: string | null }

const PERIODS = [
  { days: 7, label: "Last 7 days" },
  { days: 28, label: "Last 28 days" },
  { days: 90, label: "Last 3 months" },
  { days: 365, label: "Last 12 months" },
];

/* Two series per chart, from the same validated pair the Online Store
   Statistics page uses (categorical slots 1–2, stepped per surface). */
const SERIES = {
  light: { a: "#2a78d6", b: "#eb6834" },
  dark:  { a: "#3987e5", b: "#d95926" },
};

const num = (n: number) => n.toLocaleString("en-AU");
const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
const monthLabel = (m: { year: number; month: number }) => new Date(m.year, m.month - 1, 1).toLocaleDateString("en-AU", { month: "short", year: "numeric" });
const duration = (s: number) => `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
const startConnect = () => { window.location.href = "/api/integrations/oauth/google_insights/start"; };

export default function MarketingGooglePage() {
  const [days, setDays] = useState(28);
  const [tab, setTab] = useState("search");

  // The OAuth callback lands here with ?success= or ?error=.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const ok = p.get("success"), err = p.get("error");
    if (ok === "google_insights") toast.success("Google connected. Choose your site, property and listing below.");
    else if (err?.endsWith("_oauth_denied")) toast.error("Google sign-in was cancelled.");
    else if (err?.endsWith("_oauth_not_configured")) toast.error("Google sign-in isn't set up on the server yet.");
    else if (err) toast.error("Google couldn't be connected. Try again.");
    if (ok || err) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const status = useQuery({ queryKey: ["google-insights", "status"], queryFn: () => gFetch<Status>("/status") });
  const s = status.data;

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Globe className="w-6 h-6 text-primary" /> Google</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              How people find Koastal on Google: Search, website visitors, your Maps listing and reviews.
              {s?.account && <> Connected as <span className="font-medium text-foreground">{s.account}</span>.</>}
            </p>
          </div>
          {s?.connected && (
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>{PERIODS.map((p) => <SelectItem key={p.days} value={String(p.days)}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          )}
        </div>

        {status.isLoading || !s ? (
          status.error ? <ErrorNote error={status.error} /> : <Spinner />
        ) : !s.configured ? (
          <NotConfigured />
        ) : !s.connected ? (
          <ConnectCard />
        ) : (
          <>
            <Choices status={s} />
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="search" className="gap-1.5"><Search className="w-4 h-4" /> Search</TabsTrigger>
                <TabsTrigger value="analytics" className="gap-1.5"><BarChart3 className="w-4 h-4" /> Analytics</TabsTrigger>
                <TabsTrigger value="maps" className="gap-1.5"><MapPin className="w-4 h-4" /> Maps</TabsTrigger>
                <TabsTrigger value="reviews" className="gap-1.5"><Star className="w-4 h-4" /> Reviews</TabsTrigger>
              </TabsList>
              <TabsContent value="search" className="mt-4">{tab === "search" && <SearchTab days={days} enabled={!!s.selection.searchConsoleSite} />}</TabsContent>
              <TabsContent value="analytics" className="mt-4">{tab === "analytics" && <AnalyticsTab days={days} enabled={!!s.selection.ga4Property} />}</TabsContent>
              <TabsContent value="maps" className="mt-4">{tab === "maps" && <MapsTab days={days} enabled={!!s.selection.gbpLocation} />}</TabsContent>
              <TabsContent value="reviews" className="mt-4">{tab === "reviews" && <ReviewsTab enabled={!!s.selection.gbpLocation} />}</TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </AppLayout>
  );
}

/* ── Setup states ──────────────────────────────────────────────────────── */

function NotConfigured() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> Google sign-in isn't set up yet</CardTitle>
        <CardDescription>
          KoaPOS needs its own Google Cloud OAuth client before it can connect. This is a one-off job: create the client in
          Google Cloud, then add <code className="font-mono text-xs">GOOGLE_CLIENT_ID</code> and <code className="font-mono text-xs">GOOGLE_CLIENT_SECRET</code> to
          the app's secrets and republish. Once they're added, a Connect button appears here.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function ConnectCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Connect Google</CardTitle>
        <CardDescription>
          Sign in with the Google account that manages Koastal's Search Console, Google Analytics and Business Profile.
          Leave every box ticked on Google's consent screen. Only the owner can connect.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={startConnect} className="gap-2"><Globe className="w-4 h-4" /> Connect Google</Button>
      </CardContent>
    </Card>
  );
}

/* ── Which site / property / listing ───────────────────────────────────── */

function Choices({ status }: { status: Status }) {
  const qc = useQueryClient();
  const options = useQuery({ queryKey: ["google-insights", "options"], queryFn: () => gFetch<Options>("/options"), staleTime: 10 * 60_000 });
  const save = useMutation({
    mutationFn: (patch: Partial<Selection>) => gFetch<Selection>("/selection", { method: "PUT", body: JSON.stringify(patch) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["google-insights"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const sel = status.selection;
  const o = options.data;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">What to show</CardTitle>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => options.refetch()} disabled={options.isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 ${options.isFetching ? "animate-spin" : ""}`} /> Refresh lists
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {options.isLoading ? <Spinner /> : options.error ? <ErrorNote error={options.error} /> : o && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Picker
              label="Search Console site" granted={status.products.searchConsole} list={o.sites} value={sel.searchConsoleSite}
              onPick={(id) => save.mutate({ searchConsoleSite: id })}
              empty="No verified sites on this Google account."
            />
            <Picker
              label="Google Analytics property" granted={status.products.analytics} list={o.properties} value={sel.ga4Property}
              onPick={(id) => save.mutate({ ga4Property: id, ga4PropertyName: o.properties.items.find((p) => p.id === id)?.name })}
              empty="No GA4 properties on this Google account."
            />
            <Picker
              label="Business Profile listing" granted={status.products.business} list={o.locations} value={sel.gbpLocation}
              onPick={(id) => {
                const l = o.locations.items.find((x) => x.id === id);
                if (l) save.mutate({ gbpAccount: l.account, gbpLocation: l.id, gbpLocationTitle: l.name });
              }}
              empty="No Business Profile listings on this Google account."
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Picker({ label, granted, list, value, onPick, empty }: {
  label: string; granted: boolean; list: OptionList<{ id: string; name: string }>; value?: string; onPick: (id: string) => void; empty: string;
}) {
  return (
    <div className="space-y-1.5 min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {!granted ? (
        <ErrorNote compact error={new GoogleError("Access wasn't granted.", "scope_missing")} />
      ) : list.error ? (
        <ErrorNote compact error={new GoogleError(list.error.message, list.error.code, list.error.activationUrl)} />
      ) : list.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <Select value={value ?? ""} onValueChange={onPick}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Choose…" /></SelectTrigger>
          <SelectContent>{list.items.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
        </Select>
      )}
    </div>
  );
}

/* ── Search Console ────────────────────────────────────────────────────── */

function SearchTab({ days, enabled }: { days: number; enabled: boolean }) {
  const q = useQuery({ queryKey: ["google-insights", "search", days], queryFn: () => gFetch<SearchData>(`/search?days=${days}`), enabled });
  if (!enabled) return <Choose what="a Search Console site" />;
  if (q.error) return <ErrorNote error={q.error} />;
  const d = q.data;
  if (!d) return <Spinner />;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Clicks from Google" value={num(d.totals.clicks)} />
        <Tile label="Times shown in results" value={num(d.totals.impressions)} sub="impressions" />
        <Tile label="Click-through rate" value={`${d.totals.ctr}%`} />
        <Tile label="Average position" value={d.totals.position ? String(d.totals.position) : "—"} sub="1 = top of page one" />
      </div>
      <Chart
        title="Clicks and impressions" description="Per day. The last two or three days are preliminary and fill in as Google catches up."
        data={d.series} a={{ key: "clicks", name: "Clicks" }} b={{ key: "impressions", name: "Impressions", rightAxis: true }}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <Ranked title="What people searched" description="Searches where Koastal showed up." empty="No searches in this period."
          head={["Search", "Clicks", "Shown", "Pos."]}
          rows={d.queries.map((r) => [r.key, num(r.clicks), num(r.impressions), r.position])} />
        <Ranked title="Pages people landed on" empty="No pages in this period."
          head={["Page", "Clicks", "Shown", "Pos."]}
          rows={d.pages.map((r) => [<PathCell key={r.key} url={r.key} />, num(r.clicks), num(r.impressions), r.position])} />
        <Ranked title="Devices" empty="No data."
          head={["Device", "Clicks", "Shown", "CTR"]}
          rows={d.devices.map((r) => [cap(r.key), num(r.clicks), num(r.impressions), `${r.ctr}%`])} />
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sitemaps</CardTitle>
            <CardDescription>What Google has read from the sitemaps submitted in Search Console.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {d.sitemaps.length === 0 ? <p className="text-sm text-muted-foreground">No sitemaps submitted. Submit <span className="font-mono">sitemap.xml</span> in Search Console › Sitemaps.</p> : d.sitemaps.map((m) => (
              <div key={m.path} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs break-all">{m.path}</span>
                  {m.pending ? <Badge variant="secondary" className="gap-1"><Clock className="w-3 h-3" /> Waiting for Google</Badge>
                    : m.errors > 0 ? <Badge variant="destructive">{m.errors} error{m.errors === 1 ? "" : "s"}</Badge>
                    : <Badge variant="secondary" className="gap-1 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="w-3 h-3" /> Read OK</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {num(m.submitted)} pages listed
                  {m.lastDownloaded && <> · last read {new Date(m.lastDownloaded).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</>}
                  {m.warnings > 0 && <> · {m.warnings} warning{m.warnings === 1 ? "" : "s"}</>}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ── Google Analytics ──────────────────────────────────────────────────── */

function AnalyticsTab({ days, enabled }: { days: number; enabled: boolean }) {
  const q = useQuery({ queryKey: ["google-insights", "analytics", days], queryFn: () => gFetch<AnalyticsData>(`/analytics?days=${days}`), enabled, refetchInterval: 60_000 });
  if (!enabled) return <Choose what="a Google Analytics property" />;
  if (q.error) return <ErrorNote error={q.error} />;
  const d = q.data;
  if (!d) return <Spinner />;
  const t = d.totals;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <Tile label="On the site now" value={d.activeNow == null ? "—" : num(d.activeNow)} sub="last 30 minutes" icon={<Radio className="w-3.5 h-3.5 text-emerald-600" />} />
        <Tile label="Visitors" value={num(t.users)} />
        <Tile label="New visitors" value={num(t.newUsers)} />
        <Tile label="Visits" value={num(t.sessions)} sub="sessions" />
        <Tile label="Page views" value={num(t.views)} />
        <Tile label="Engaged visits" value={`${t.engagementRate}%`} />
        <Tile label="Average visit" value={duration(t.avgSessionSeconds)} />
      </div>
      <Chart title="Visitors and visits" description="Per day, website and shop together."
        data={d.series} a={{ key: "users", name: "Visitors" }} b={{ key: "sessions", name: "Visits" }} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <Ranked title="How visitors arrived" empty="No visits in this period."
          head={["Channel", "Visits", "Visitors"]}
          rows={d.channels.map((r) => [r.name, num(r.sessions), num(r.users)])} />
        <Ranked title="Top sources" description="The site or app a visit came from." empty="No visits in this period."
          head={["Source", "Visits"]}
          rows={d.sources.map((r) => [r.name, num(r.sessions)])} />
        <Ranked title="Top pages" empty="No page views in this period."
          head={["Page", "Views", "Visitors"]}
          rows={d.pages.map((r) => [<span key={r.path} className="font-mono text-xs break-all">{r.path}</span>, num(r.views), num(r.users)])} />
        <Ranked title="Where visitors are" description="Town or city, as Google estimates it." empty="No locations in this period."
          head={["Place", "Visitors"]}
          rows={d.cities.map((r) => [r.name, num(r.users)])} />
        <Ranked title="Devices" empty="No visitors in this period."
          head={["Device", "Visitors", "Share"]}
          rows={d.devices.map((r) => [cap(r.name), num(r.users), `${t.users ? Math.round((r.users / t.users) * 100) : 0}%`])} />
      </div>
    </div>
  );
}

/* ── Business Profile (Maps) ───────────────────────────────────────────── */

function MapsTab({ days, enabled }: { days: number; enabled: boolean }) {
  const q = useQuery({ queryKey: ["google-insights", "maps", days], queryFn: () => gFetch<MapsData>(`/maps?days=${days}`), enabled });
  if (!enabled) return <Choose what="a Business Profile listing" />;
  if (q.error) return <ErrorNote error={q.error} />;
  const d = q.data;
  if (!d) return <Spinner />;
  const t = d.totals;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <Tile label="Seen on Google Search" value={num(t.searchViews)} />
        <Tile label="Seen on Google Maps" value={num(t.mapsViews)} />
        <Tile label="Calls" value={num(t.calls)} icon={<Phone className="w-3.5 h-3.5" />} />
        <Tile label="Direction requests" value={num(t.directions)} icon={<Navigation className="w-3.5 h-3.5" />} />
        <Tile label="Website clicks" value={num(t.websiteClicks)} icon={<MousePointerClick className="w-3.5 h-3.5" />} />
        <Tile label="Messages" value={num(t.messages)} icon={<MessageSquare className="w-3.5 h-3.5" />} />
        <Tile label="Bookings" value={num(t.bookings)} />
      </div>
      <Chart title="Listing views" description="Per day. Google publishes these a few days behind, so the latest days read low."
        data={d.series} a={{ key: "searchViews", name: "Search" }} b={{ key: "mapsViews", name: "Maps" }} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <Ranked title="Searches that showed your listing"
          description={`${monthLabel(d.keywordMonths.start)} – ${monthLabel(d.keywordMonths.end)}. Google gives small numbers only as "under N".`}
          empty="No search terms reported yet."
          head={["Search", "Times"]}
          rows={d.keywords.map((k) => [k.keyword, k.count != null ? num(k.count) : `< ${k.under}`])} />
        <Ranked title="Actions by day" description="Busiest days first." empty="No calls, directions or website clicks in this period."
          head={["Day", "Calls", "Directions", "Website"]}
          rows={[...d.series].filter((r) => r.calls + r.directions + r.websiteClicks > 0)
            .sort((a, b) => (b.calls + b.directions + b.websiteClicks) - (a.calls + a.directions + a.websiteClicks)).slice(0, 15)
            .map((r) => [dayLabel(r.date), num(r.calls), num(r.directions), num(r.websiteClicks)])} />
      </div>
    </div>
  );
}

/* ── Reviews ───────────────────────────────────────────────────────────── */

function ReviewsTab({ enabled }: { enabled: boolean }) {
  const [pageToken, setPageToken] = useState<string[]>([]);
  const token = pageToken[pageToken.length - 1] ?? "";
  const q = useQuery({
    queryKey: ["google-insights", "reviews", token],
    queryFn: () => gFetch<ReviewsData>(`/reviews${token ? `?pageToken=${encodeURIComponent(token)}` : ""}`),
    enabled,
  });
  if (!enabled) return <Choose what="a Business Profile listing" />;
  if (q.error) return <ErrorNote error={q.error} />;
  const d = q.data;
  if (!d) return <Spinner />;
  const unanswered = d.reviews.filter((r) => !r.reply).length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Average rating" value={d.averageRating != null ? `${d.averageRating} ★` : "—"} />
        <Tile label="Reviews" value={num(d.totalReviewCount)} />
        <Tile label="Without a reply" value={num(unanswered)} sub={pageToken.length || d.nextPageToken ? "on this page" : undefined} />
      </div>
      <p className="text-xs text-muted-foreground">Replies are posted publicly on Google under the business's name.</p>
      {d.reviews.length === 0 ? <p className="text-sm text-muted-foreground">No reviews yet.</p> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {d.reviews.map((r) => <ReviewCard key={r.id} review={r} />)}
        </div>
      )}
      {(pageToken.length > 0 || d.nextPageToken) && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={pageToken.length === 0} onClick={() => setPageToken((p) => p.slice(0, -1))}>Newer</Button>
          <Button variant="outline" size="sm" disabled={!d.nextPageToken} onClick={() => d.nextPageToken && setPageToken((p) => [...p, d.nextPageToken!])}>Older</Button>
        </div>
      )}
    </div>
  );
}

function ReviewCard({ review: r }: { review: Review }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(r.reply?.comment ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const done = () => { setEditing(false); setConfirmDelete(false); qc.invalidateQueries({ queryKey: ["google-insights", "reviews"] }); };
  const reply = useMutation({
    mutationFn: () => gFetch(`/reviews/${encodeURIComponent(r.id)}/reply`, { method: "PUT", body: JSON.stringify({ comment: text }) }),
    onSuccess: () => { toast.success("Reply posted on Google."); done(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => gFetch(`/reviews/${encodeURIComponent(r.id)}/reply`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Reply removed from Google."); setText(""); done(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card>
      <CardContent className="pt-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {r.photo
              ? <img src={r.photo} alt="" className="w-8 h-8 rounded-full shrink-0" referrerPolicy="no-referrer" />
              : <div className="w-8 h-8 rounded-full bg-muted shrink-0 flex items-center justify-center text-xs font-semibold text-muted-foreground">{r.reviewer.slice(0, 1)}</div>}
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{r.reviewer}</p>
              {r.createdAt && <p className="text-[11px] text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</p>}
            </div>
          </div>
          {r.rating != null && <Stars n={r.rating} />}
        </div>
        {r.comment ? <p className="text-sm whitespace-pre-wrap">{r.comment}</p> : <p className="text-sm text-muted-foreground italic">Rating only, no text.</p>}

        {r.reply && !editing && (
          <div className="rounded-md bg-muted/50 p-3 space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Your reply{r.reply.updatedAt && ` · ${new Date(r.reply.updatedAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`}</p>
            <p className="text-sm whitespace-pre-wrap">{r.reply.comment}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="ghost" onClick={() => { setText(r.reply!.comment); setEditing(true); }}>Edit</Button>
              {confirmDelete ? (
                <>
                  <Button size="sm" variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
                    {remove.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />} Remove from Google
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Keep</Button>
                </>
              ) : <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>Delete</Button>}
            </div>
          </div>
        )}

        {(!r.reply || editing) && (
          editing || text ? (
            <div className="space-y-2">
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={4000} placeholder="Thank the customer, or answer their concern…" />
              <div className="flex gap-2">
                <Button size="sm" disabled={!text.trim() || reply.isPending} onClick={() => reply.mutate()}>
                  {reply.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />} {r.reply ? "Update reply" : "Post reply"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setText(r.reply?.comment ?? ""); }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Reply</Button>
          )
        )}
      </CardContent>
    </Card>
  );
}

function Stars({ n }: { n: number }) {
  return (
    <span className="flex shrink-0" aria-label={`${n} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`w-3.5 h-3.5 ${i <= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />)}
    </span>
  );
}

/* ── Shared bits ───────────────────────────────────────────────────────── */

function Spinner() {
  return <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
}

function Choose({ what }: { what: string }) {
  return <p className="text-sm text-muted-foreground py-6">Choose {what} under “What to show” above.</p>;
}

/* What each failure means, and the one thing to do about it. */
const ADVICE: Record<Code, string> = {
  not_connected: "Reconnect Google to carry on.",
  scope_missing: "Reconnect Google and leave every box ticked on the consent screen.",
  api_disabled: "Enable this API in your Google Cloud project, wait a minute, then refresh.",
  access_pending: "Business Profile figures and reviews appear once Google approves API access for your Cloud project. Google emails you when it does.",
  no_permission: "Make sure the connected Google account is an owner or manager of it.",
  rate_limited: "Wait a minute, then refresh.",
  google_error: "Try again shortly.",
};

function ErrorNote({ error, compact }: { error: unknown; compact?: boolean }) {
  const e = error instanceof GoogleError ? error : new GoogleError(error instanceof Error ? error.message : "Something went wrong.", "google_error");
  const reconnect = e.code === "not_connected" || e.code === "scope_missing";
  return (
    <div className={`rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800/60 ${compact ? "p-2.5" : "p-4"} text-sm space-y-1.5`}>
      <p className="font-medium flex items-start gap-1.5"><AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />{e.message}</p>
      <p className="text-muted-foreground text-xs">{ADVICE[e.code]}</p>
      <div className="flex flex-wrap gap-2">
        {e.activationUrl && (
          <a href={e.activationUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            Enable it in Google Cloud <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {reconnect && <Button size="sm" variant="outline" onClick={startConnect}>Reconnect Google</Button>}
      </div>
    </div>
  );
}

function Tile({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon?: ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground flex items-center gap-1">{icon}{label}</p>
      <p className="text-xl font-bold tabular-nums mt-0.5">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Chart<T extends { date: string }>({ title, description, data, a, b }: {
  title: string; description: string; data: T[];
  a: { key: keyof T & string; name: string }; b: { key: keyof T & string; name: string; rightAxis?: boolean };
}) {
  const { theme } = useTheme();
  const c = SERIES[theme === "dark" ? "dark" : "light"];
  const axis = { stroke: "hsl(var(--muted-foreground))", fontSize: 11, tickLine: false, axisLine: false } as const;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: b.rightAxis ? 0 : 12, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tickFormatter={dayLabel} minTickGap={24} {...axis} />
              <YAxis yAxisId="a" allowDecimals={false} {...axis} />
              {b.rightAxis && <YAxis yAxisId="b" orientation="right" allowDecimals={false} {...axis} />}
              <Tooltip
                labelFormatter={(v) => dayLabel(String(v))}
                contentStyle={{ backgroundColor: "hsl(var(--popover))", borderColor: "hsl(var(--border))", borderRadius: "var(--radius)" }}
                itemStyle={{ color: "hsl(var(--foreground))" }}
                cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "3 3" }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line yAxisId="a" type="monotone" dataKey={a.key} name={a.name} stroke={c.a} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line yAxisId={b.rightAxis ? "b" : "a"} type="monotone" dataKey={b.key} name={b.name} stroke={c.b} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function PathCell({ url }: { url: string }) {
  let shown = url;
  try { const u = new URL(url); shown = u.pathname + u.search; } catch { /* keep as is */ }
  return <a href={url} target="_blank" rel="noreferrer" className="font-mono text-xs break-all hover:underline">{shown}</a>;
}

const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1).toLowerCase() : s);

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
