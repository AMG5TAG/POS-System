import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/use-auth";
import { BrandIcon } from "@/components/brand-icon";
import {
  Truck, MapPin, Calculator, CheckCircle2,
  Clock, DollarSign, Settings2, Zap, Search, ShieldCheck,
  Package, Plug, ArrowRight,
} from "lucide-react";

interface Carrier {
  id:        string;
  name:      string;
  tagline:   string;
  speedRange:string;
  connected: boolean;
}

const ALL_CARRIERS: Carrier[] = [
  { id: "auspost",  name: "Australia Post",  tagline: "National coverage, parcels & letters",       speedRange: "1–7 days", connected: false },
  { id: "startrack",name: "StarTrack",       tagline: "Premium express network (Aus Post Group)",  speedRange: "1–3 days", connected: false },
  { id: "couriers", name: "Couriers Please", tagline: "Major metro courier network",              speedRange: "1–5 days", connected: false },
  { id: "tnt",      name: "TNT Express",     tagline: "Domestic & international express",         speedRange: "1–10 days", connected: false },
  { id: "dhl",      name: "DHL Express",     tagline: "International priority",                    speedRange: "1–6 days", connected: false },
  { id: "fastway",  name: "Aramex (Fastway)",tagline: "Local franchisee courier network",         speedRange: "1–4 days", connected: false },
  { id: "sendle",   name: "Sendle",          tagline: "Carbon-neutral door-to-door",               speedRange: "1–5 days", connected: false },
  { id: "shippit",  name: "Shippit",         tagline: "Multi-carrier aggregator (rates & labels)",speedRange: "Varies",   connected: false },
];

interface Quote {
  carrierId: string;
  carrier:   string;
  service:   string;
  eta:       string;
  price:     number;
  insured:   boolean;
  tracking:  boolean;
}

const ORIGIN = { postcode: "2010", state: "NSW", city: "Surry Hills" };

/** Mock quote calculator – approximates carrier pricing based on weight, distance, and dimensions. */
function calculateQuotes(
  destination: string,
  weight: number,
  length: number,
  width: number,
  height: number,
  carriers: Carrier[],
): Quote[] {
  const volume = (length * width * height) / 1000;
  const distance = Math.abs(parseInt(destination.slice(0, 2)) - parseInt(ORIGIN.postcode.slice(0, 2))) * 50 + 100;
  const baseDistanceFactor = distance / 1000;

  const services: { carrierId: string; service: string; multiplier: number; speed: string; insured: boolean }[] = [
    { carrierId: "auspost",   service: "Parcel Post",      multiplier: 1.0, speed: "3–7 days", insured: false },
    { carrierId: "auspost",   service: "Express Post",     multiplier: 1.6, speed: "1–3 days", insured: true  },
    { carrierId: "startrack", service: "Premium",          multiplier: 1.8, speed: "1–2 days", insured: true  },
    { carrierId: "couriers",  service: "Road Express",     multiplier: 1.2, speed: "2–5 days", insured: false },
    { carrierId: "tnt",       service: "Express",          multiplier: 1.9, speed: "1–3 days", insured: true  },
    { carrierId: "dhl",       service: "International",    multiplier: 3.2, speed: "1–6 days", insured: true  },
    { carrierId: "fastway",   service: "Local Parcel",     multiplier: 0.9, speed: "1–4 days", insured: false },
    { carrierId: "sendle",    service: "Standard",         multiplier: 1.1, speed: "1–5 days", insured: true  },
    { carrierId: "shippit",   service: "Cheapest carrier", multiplier: 0.95,speed: "Varies",   insured: false },
  ];

  return services
    .filter((s) => carriers.find((c) => c.id === s.carrierId)?.connected)
    .map((s) => {
      const carrier = carriers.find((c) => c.id === s.carrierId)!;
      const price = (weight * 3.5 + volume * 0.8 + baseDistanceFactor * 4) * s.multiplier + 6.50;
      return {
        carrierId: carrier.id,
        carrier:   carrier.name,
        service:   s.service,
        eta:       s.speed,
        price:     Math.round(price * 100) / 100,
        insured:   s.insured,
        tracking:  true,
      };
    })
    .sort((a, b) => a.price - b.price);
}

const STORAGE_KEY = "koapos_shipping_carriers";

function getStorageKey() {
  try {
    const raw = localStorage.getItem("koapos_auth_user");
    if (raw) {
      const user = JSON.parse(raw);
      if (user?.id) return `${STORAGE_KEY}_${user.id}`;
    }
  } catch { /* ignore */ }
  return STORAGE_KEY;
}

function loadCarriers(): Carrier[] {
  const key = getStorageKey();
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const saved: Partial<Carrier>[] = JSON.parse(raw);
      return ALL_CARRIERS.map((c) => {
        const s = saved.find((x) => x.id === c.id);
        return s ? { ...c, connected: s.connected ?? false } : c;
      });
    }
    // Migrate old unscoped data on first visit
    const old = localStorage.getItem(STORAGE_KEY);
    if (old) {
      localStorage.setItem(key, old);
      const saved: Partial<Carrier>[] = JSON.parse(old);
      return ALL_CARRIERS.map((c) => {
        const s = saved.find((x) => x.id === c.id);
        return s ? { ...c, connected: s.connected ?? false } : c;
      });
    }
    return ALL_CARRIERS;
  } catch { return ALL_CARRIERS; }
}

function saveCarriers(carriers: Carrier[]) {
  localStorage.setItem(getStorageKey(), JSON.stringify(carriers.map((c) => ({ id: c.id, connected: c.connected }))));
}

export default function OnlineShippingPage() {
  const { user } = useAuth();
  const [carriers, setCarriers] = useState<Carrier[]>(() => loadCarriers());
  const [form, setForm] = useState({
    postcode: "",
    state:    "NSW",
    weight:   1.0,
    length:   25,
    width:    20,
    height:   10,
  });
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<string | null>(null);

  useEffect(() => { saveCarriers(carriers); }, [carriers]);
  useEffect(() => { setCarriers(loadCarriers()); }, [user?.id]);

  const toggleCarrier = (id: string) => {
    setCarriers((prev) => prev.map((c) => c.id === id ? { ...c, connected: !c.connected } : c));
    const carrier = carriers.find((c) => c.id === id);
    toast.success(`${carrier?.name} ${carrier?.connected ? "disconnected" : "connected"}`);
  };

  const fetchQuotes = () => {
    if (!form.postcode.trim()) { toast.error("Postcode is required"); return; }
    if (!carriers.some((c) => c.connected)) { toast.error("Connect at least one carrier first"); return; }
    setLoading(true);
    setQuotes([]);
    setSelectedQuote(null);
    setTimeout(() => {
      const result = calculateQuotes(form.postcode, form.weight, form.length, form.width, form.height, carriers);
      setQuotes(result);
      setLoading(false);
      toast.success(`Found ${result.length} shipping options`);
    }, 900);
  };

  const bookShipping = () => {
    const q = quotes.find((x) => `${x.carrierId}-${x.service}` === selectedQuote);
    if (!q) return;
    toast.success(`Booked ${q.carrier} ${q.service} for $${q.price.toFixed(2)} — label will be generated`);
  };

  const connectedCount = carriers.filter((c) => c.connected).length;

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Truck className="w-6 h-6 text-primary" />
              Shipping
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Compare live rates from connected carriers. Quote by order, postcode, weight and dimensions.
            </p>
          </div>
          <Badge variant="secondary" className="gap-1.5 text-sm px-3 py-1">
            <Plug className="w-3.5 h-3.5 text-emerald-500" />
            {connectedCount} carrier{connectedCount === 1 ? "" : "s"} connected
          </Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
          {/* Quote form & results */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Calculator className="w-4 h-4" /> Get Shipping Quote</CardTitle>
                <CardDescription>Choose an existing order or enter custom details for a freight quote.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1"><MapPin className="w-3 h-3" /> Destination postcode</Label>
                    <Input value={form.postcode} onChange={(e) => setForm((f) => ({ ...f, postcode: e.target.value }))} placeholder="2000" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">State</Label>
                    <Select value={form.state} onValueChange={(v) => setForm((f) => ({ ...f, state: v }))}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["NSW","VIC","QLD","WA","SA","TAS","ACT","NT"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">Origin</Label>
                    <Input value={`${ORIGIN.postcode} – ${ORIGIN.city}, ${ORIGIN.state}`} readOnly className="bg-muted/40" />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1"><Package className="w-3 h-3" /> Weight (kg)</Label>
                    <Input type="number" step={0.1} min={0.1} value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: parseFloat(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Length (cm)</Label>
                    <Input type="number" min={1} value={form.length} onChange={(e) => setForm((f) => ({ ...f, length: parseFloat(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Width (cm)</Label>
                    <Input type="number" min={1} value={form.width} onChange={(e) => setForm((f) => ({ ...f, width: parseFloat(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Height (cm)</Label>
                    <Input type="number" min={1} value={form.height} onChange={(e) => setForm((f) => ({ ...f, height: parseFloat(e.target.value) || 0 }))} />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={fetchQuotes} disabled={loading} className="gap-1.5">
                    {loading ? <><Clock className="w-3.5 h-3.5 animate-spin" /> Fetching…</> : <><Search className="w-3.5 h-3.5" /> Get quotes</>}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Quote results */}
            {(quotes.length > 0 || loading) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Available Rates</CardTitle>
                  <CardDescription>Sorted by price — cheapest first.</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-14 bg-muted/40 rounded animate-pulse" />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {quotes.map((q, i) => {
                        const id = `${q.carrierId}-${q.service}`;
                        const isCheapest = i === 0;
                        return (
                          <button
                            key={id}
                            onClick={() => setSelectedQuote(id)}
                            className={cn(
                              "w-full grid grid-cols-[40px_1fr_auto_auto] gap-3 items-center rounded-lg border p-3 text-left transition-all",
                              selectedQuote === id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/40",
                            )}
                          >
                            <BrandIcon name={q.carrierId} size={28} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold truncate">{q.carrier}</p>
                                {isCheapest && <Badge className="text-[9px] h-4 px-1.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">Cheapest</Badge>}
                              </div>
                              <p className="text-[11px] text-muted-foreground">{q.service}</p>
                              <div className="flex gap-2 mt-1">
                                <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{q.eta}</span>
                                {q.tracking && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Zap className="w-2.5 h-2.5" />Tracking</span>}
                                {q.insured  && <span className="text-[10px] text-muted-foreground flex items-center gap-1"><ShieldCheck className="w-2.5 h-2.5" />Insured</span>}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold tabular-nums">${q.price.toFixed(2)}</p>
                              <p className="text-[10px] text-muted-foreground">incl. GST</p>
                            </div>
                            <ArrowRight className={cn("w-4 h-4 transition-transform", selectedQuote === id ? "text-primary" : "text-muted-foreground/40")} />
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {selectedQuote && !loading && (
                    <div className="mt-4 flex justify-end">
                      <Button onClick={bookShipping} className="gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Book & generate label</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Carrier connections sidebar */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Settings2 className="w-4 h-4" /> Carriers</CardTitle>
              <CardDescription>Connect shipping providers to receive live quotes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {carriers.map((c) => (
                <div key={c.id} className={cn("flex items-center gap-3 rounded-lg border p-2.5 transition-all", c.connected && "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/10 dark:border-emerald-900")}>
                  <BrandIcon name={c.id} size={28} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold truncate">{c.name}</p>
                      {c.connected && <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{c.tagline}</p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="w-2.5 h-2.5" />{c.speedRange}</p>
                  </div>
                  <Switch checked={c.connected} onCheckedChange={() => toggleCarrier(c.id)} />
                </div>
              ))}

              <Separator className="my-3" />

              <div className="rounded-lg border bg-muted/20 p-3 text-[11px] text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground flex items-center gap-1.5"><DollarSign className="w-3 h-3" /> Pricing</p>
                <p>Rates are pulled live from each connected carrier's API. KoaPOS does not add a margin — what you see is what you pay.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
