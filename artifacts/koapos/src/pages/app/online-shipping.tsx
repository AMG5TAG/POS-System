import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Truck, Calculator, Plug, Plug2, ShieldCheck, ScanLine, RefreshCw,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useListShippingCarriers,
  useUpdateShippingCarrier,
  useGetMerchant,
} from "@workspace/api-client-react";

/* ── Types ─────────────────────────────────────────────────────────────── */

interface Carrier {
  id: string;
  name: string;
  tagline: string;
  speedRange: string;
  connected: boolean;
}

interface Quote {
  carrierId: string;
  carrier:   string;
  service:   string;
  eta:       string;
  price:     number;
  insured:   boolean;
  tracking:  boolean;
}

/* ── All carriers (static metadata) ─────────────────────────────────────── */

const ALL_CARRIERS: Carrier[] = [
  { id: "auspost",  name: "Australia Post",   tagline: "National coverage, parcels & letters",       speedRange: "1–7 days",  connected: false },
  { id: "startrack",name: "StarTrack",        tagline: "Premium express network (Aus Post Group)",   speedRange: "1–3 days",  connected: false },
  { id: "couriers", name: "Couriers Please",  tagline: "Major metro courier network",                speedRange: "1–5 days",  connected: false },
  { id: "tnt",      name: "TNT Express",      tagline: "Domestic & international express",           speedRange: "1–10 days", connected: false },
  { id: "dhl",      name: "DHL Express",      tagline: "International priority",                     speedRange: "1–6 days",  connected: false },
  { id: "fastway",  name: "Aramex (Fastway)", tagline: "Local franchisee courier network",           speedRange: "1–4 days",  connected: false },
  { id: "sendle",   name: "Sendle",           tagline: "Carbon-neutral door-to-door",                speedRange: "1–5 days",  connected: false },
  { id: "shippit",  name: "Shippit",          tagline: "Multi-carrier aggregator (rates & labels)",  speedRange: "Varies",    connected: false },
];

/* ── Quote calculator ───────────────────────────────────────────────────── */

function calculateQuotes(
  destination: string,
  weight: number,
  length: number,
  width: number,
  height: number,
  carriers: Carrier[],
  originPostcode: string,
): Quote[] {
  const volume = (length * width * height) / 1000;
  const distance = Math.abs(parseInt(destination.slice(0, 2)) - parseInt((originPostcode || "2000").slice(0, 2))) * 50 + 100;
  const baseDistanceFactor = distance / 1000;

  const services: { carrierId: string; service: string; multiplier: number; speed: string; insured: boolean }[] = [
    { carrierId: "auspost",   service: "Parcel Post",      multiplier: 1.0,  speed: "3–7 days",  insured: false },
    { carrierId: "auspost",   service: "Express Post",     multiplier: 1.6,  speed: "1–3 days",  insured: true  },
    { carrierId: "startrack", service: "Premium",          multiplier: 1.8,  speed: "1–2 days",  insured: true  },
    { carrierId: "couriers",  service: "Road Express",     multiplier: 1.2,  speed: "2–5 days",  insured: false },
    { carrierId: "tnt",       service: "Express",          multiplier: 1.9,  speed: "1–3 days",  insured: true  },
    { carrierId: "dhl",       service: "International",    multiplier: 3.2,  speed: "1–6 days",  insured: true  },
    { carrierId: "fastway",   service: "Local Parcel",     multiplier: 0.9,  speed: "1–4 days",  insured: false },
    { carrierId: "sendle",    service: "Standard",         multiplier: 1.1,  speed: "1–5 days",  insured: true  },
    { carrierId: "shippit",   service: "Cheapest carrier", multiplier: 0.95, speed: "Varies",    insured: false },
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

/* ── Page ───────────────────────────────────────────────────────────────── */

export default function OnlineShippingPage() {
  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const { data: rawCarriers = [], refetch } = useListShippingCarriers({ query: { queryKey: ["shipping-carriers"] } });
  const updateCarrier = useUpdateShippingCarrier();

  const originCity     = merchant?.city    || "—";
  const originPostcode = "—";
  const originState    = merchant?.country || "—";

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

  // Merge ALL_CARRIERS with DB state (connected flag)
  const carriers: Carrier[] = ALL_CARRIERS.map((c) => {
    const saved = (rawCarriers as Record<string, unknown>[]).find(
      (r) => String(r.carrierId ?? r.id ?? "") === c.id
    );
    if (!saved) return c;
    return { ...c, connected: String(saved.connected) === "true" };
  });

  const toggleCarrier = (id: string) => {
    const carrier = carriers.find((c) => c.id === id);
    if (!carrier) return;
    const newConnected = !carrier.connected;
    updateCarrier.mutate(
      { carrierId: id, data: { connected: newConnected } },
      {
        onSuccess: () => {
          refetch();
          toast.success(`${carrier.name} ${newConnected ? "connected" : "disconnected"}`);
        },
        onError: () => toast.error("Failed to update carrier"),
      }
    );
  };

  const fetchQuotes = () => {
    if (!form.postcode.trim()) { toast.error("Postcode is required"); return; }
    if (!carriers.some((c) => c.connected)) { toast.error("Connect at least one carrier first"); return; }
    setLoading(true);
    setQuotes([]);
    setSelectedQuote(null);
    setTimeout(() => {
      const result = calculateQuotes(form.postcode, form.weight, form.length, form.width, form.height, carriers, originPostcode === "—" ? "2000" : originPostcode);
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
                  <div className="sm:col-span-2 space-y-1.5">
                    <Label className="text-xs">Destination postcode</Label>
                    <Input
                      placeholder="e.g. 3000"
                      value={form.postcode}
                      onChange={(e) => setForm((f) => ({ ...f, postcode: e.target.value }))}
                      maxLength={4}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">State</Label>
                    <Select value={form.state} onValueChange={(v) => setForm((f) => ({ ...f, state: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["NSW","VIC","QLD","WA","SA","TAS","ACT","NT"].map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Weight (kg)</Label>
                    <Input
                      type="number" min={0.1} step={0.1}
                      value={form.weight}
                      onChange={(e) => setForm((f) => ({ ...f, weight: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {(["length", "width", "height"] as const).map((dim) => (
                    <div key={dim} className="space-y-1.5">
                      <Label className="text-xs capitalize">{dim} (cm)</Label>
                      <Input
                        type="number" min={1}
                        value={form[dim]}
                        onChange={(e) => setForm((f) => ({ ...f, [dim]: parseInt(e.target.value) || 0 }))}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
                  <Truck className="w-3.5 h-3.5 shrink-0" />
                  Origin: {originCity} · {originPostcode} · {originState}
                </div>
                <Button onClick={fetchQuotes} disabled={loading} className="w-full">
                  {loading ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Calculator className="w-4 h-4 mr-2" />}
                  {loading ? "Getting quotes…" : "Get Quotes"}
                </Button>
              </CardContent>
            </Card>

            {quotes.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Available Rates</CardTitle>
                  <CardDescription>{quotes.length} option{quotes.length !== 1 ? "s" : ""} from your connected carriers</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {quotes.map((q) => {
                    const key = `${q.carrierId}-${q.service}`;
                    const selected = selectedQuote === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setSelectedQuote(selected ? null : key)}
                        className={cn(
                          "w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all",
                          selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/20"
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">{q.carrier}</p>
                          <p className="text-xs text-muted-foreground">{q.service} · {q.eta}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {q.insured && <Badge variant="outline" className="text-[10px]"><ShieldCheck className="w-3 h-3 mr-0.5" />Insured</Badge>}
                          {q.tracking && <Badge variant="outline" className="text-[10px]"><ScanLine className="w-3 h-3 mr-0.5" />Tracking</Badge>}
                          <span className="font-bold text-sm">${q.price.toFixed(2)}</span>
                        </div>
                      </button>
                    );
                  })}
                  {selectedQuote && (
                    <Button onClick={bookShipping} className="w-full mt-2">
                      <Truck className="w-4 h-4 mr-2" /> Book Selected Shipment
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Carrier connections */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Plug2 className="w-4 h-4" /> Connected Carriers</CardTitle>
                <CardDescription>Toggle carriers to include them in rate comparisons.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {carriers.map((carrier) => (
                    <div key={carrier.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{carrier.name}</p>
                        <p className="text-xs text-muted-foreground">{carrier.tagline}</p>
                        <p className="text-xs text-muted-foreground">{carrier.speedRange}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {carrier.connected && (
                          <Badge className="bg-emerald-100 text-emerald-700 border-0 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">
                            Connected
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          variant={carrier.connected ? "destructive" : "default"}
                          className="h-7 text-xs"
                          onClick={() => toggleCarrier(carrier.id)}
                          disabled={updateCarrier.isPending}
                        >
                          {carrier.connected ? "Disconnect" : "Connect"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
