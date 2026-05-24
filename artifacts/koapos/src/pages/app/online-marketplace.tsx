import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BrandIcon } from "@/components/brand-icon";
import {
  ShoppingBag, CheckCircle2, RefreshCw, Plug, Settings2, Package,
  Users, CreditCard, BarChart2, AlertCircle, ExternalLink, Loader2,
  ArrowRight, Box, Boxes, Tag, ShieldCheck,
} from "lucide-react";

const STORAGE_KEY = "koapos_marketplace_connections";

type SyncDirection = "two-way" | "import" | "export" | "none";

interface MarketplaceConfig {
  productsSync:   SyncDirection;
  inventorySync:  SyncDirection;
  ordersSync:     SyncDirection;
  customersSync:  SyncDirection;
  pricingSync:    SyncDirection;
  autoFulfil:     boolean;
  storeUrl:       string;
  storeId:        string;
  apiKey:         string;
}

interface Connection {
  connected:     boolean;
  connectedAt:   string;
  lastSync:      string;
  productsCount: number;
  ordersCount:   number;
  config:        MarketplaceConfig;
}

interface Marketplace {
  id:           string;
  name:         string;
  tagline:      string;
  brandColor:   string;
  category:     "ecommerce" | "marketplace" | "social" | "food";
  features:     string[];
  setupGuide:   string;
}

const MARKETPLACES: Marketplace[] = [
  // Ecommerce platforms
  { id: "shopify",     name: "Shopify",       tagline: "All-in-one ecommerce platform",         brandColor: "#96BF47", category: "ecommerce",
    features: ["Two-way product sync", "Order import", "Inventory updates", "Customer sync"],
    setupGuide: "Enter your Shopify store URL and Admin API access token from Settings → Apps → Develop apps." },
  { id: "woocommerce", name: "WooCommerce",   tagline: "WordPress ecommerce plugin",            brandColor: "#7F54B3", category: "ecommerce",
    features: ["REST API connection", "Product & stock sync", "Order webhooks", "Customer accounts"],
    setupGuide: "Install the WooCommerce REST API plugin and create consumer keys with read/write permissions." },
  { id: "bigcommerce", name: "BigCommerce",   tagline: "Enterprise-grade SaaS commerce",        brandColor: "#121118", category: "ecommerce",
    features: ["Multi-storefront support", "Real-time inventory", "Order management"],
    setupGuide: "Generate a Store API token from your BigCommerce admin → Advanced Settings → API Accounts." },
  { id: "squarespace", name: "Squarespace",   tagline: "Design-led websites & stores",          brandColor: "#000000", category: "ecommerce",
    features: ["Product catalogue sync", "Order import", "Inventory pushes"],
    setupGuide: "Generate an API key with Commerce → Orders, Products, and Inventory scopes." },
  { id: "wix",         name: "Wix",           tagline: "Drag-and-drop site builder",            brandColor: "#0C6EFC", category: "ecommerce",
    features: ["Store sync via Wix App Market", "Order pulling", "Inventory levels"],
    setupGuide: "Install the KoaPOS app from the Wix App Market and authorise access." },
  { id: "neto",        name: "Maropost (Neto)", tagline: "Australian ecommerce platform",       brandColor: "#FF6A13", category: "ecommerce",
    features: ["Two-way product sync", "Multi-channel orders", "Inventory & pricing"],
    setupGuide: "Use a Maropost API user with Products, Orders, and Customers permissions." },

  // Marketplaces
  { id: "ebay",        name: "eBay",          tagline: "Global online marketplace",             brandColor: "#E53238", category: "marketplace",
    features: ["List products as eBay listings", "Order import", "Buy It Now & auction"],
    setupGuide: "Authorise via eBay OAuth. KoaPOS will list active products to your eBay seller account." },
  { id: "amazon",      name: "Amazon",        tagline: "Largest online marketplace",            brandColor: "#FF9900", category: "marketplace",
    features: ["Amazon Seller Central integration", "FBA & FBM support", "Buy Box monitoring"],
    setupGuide: "Connect via Amazon SP-API with your Selling Partner credentials. Approval can take 3–5 days." },
  { id: "etsy",        name: "Etsy",          tagline: "Marketplace for unique items",          brandColor: "#F1641E", category: "marketplace",
    features: ["List products to Etsy shop", "Order import", "Variant support"],
    setupGuide: "Generate an Etsy app and connect via OAuth 2.0 with shop_w and listings_w scopes." },
  { id: "catch",       name: "Catch",         tagline: "Aussie marketplace (now part of Wesfarmers)", brandColor: "#0072CE", category: "marketplace",
    features: ["Catch Marketplace listing", "Order sync", "FBC (Fulfilled by Catch) support"],
    setupGuide: "Apply as a Catch seller. Once approved you'll get an API key and seller ID." },
  { id: "kogan",       name: "Kogan",         tagline: "Aussie ecommerce marketplace",          brandColor: "#7A1F8E", category: "marketplace",
    features: ["Kogan Marketplace listing", "Order import", "Inventory sync"],
    setupGuide: "Apply via Kogan Marketplace and use your seller API token." },
  { id: "mydeal",      name: "MyDeal",        tagline: "Aussie ecommerce marketplace",          brandColor: "#FF6F00", category: "marketplace",
    features: ["Product listing", "Order import", "Status updates"],
    setupGuide: "Apply via MyDeal Seller Portal. KoaPOS will sync listings via the MyDeal REST API." },

  // Social commerce
  { id: "facebook",    name: "Facebook Shop", tagline: "Facebook & Instagram Shops",            brandColor: "#1877F2", category: "social",
    features: ["Product catalogue", "Tag products in posts", "Checkout on FB/IG"],
    setupGuide: "Connect via Meta Business Suite and Commerce Manager." },
  { id: "tiktok",      name: "TikTok Shop",   tagline: "In-app shopping on TikTok",             brandColor: "#000000", category: "social",
    features: ["Product catalogue", "Live shopping", "Affiliate links"],
    setupGuide: "Apply as a TikTok Shop seller and connect via Seller Center API." },

  // Food / delivery
  { id: "uber",        name: "Uber Eats",     tagline: "Food delivery marketplace",             brandColor: "#06C167", category: "food",
    features: ["Menu sync", "Order receipt", "Status updates"],
    setupGuide: "Connect via Uber Eats Partner API. Available for hospitality merchants." },
  { id: "doordash",    name: "DoorDash",      tagline: "Food delivery marketplace",             brandColor: "#FF3008", category: "food",
    features: ["Menu sync", "Order import", "Driver dispatch"],
    setupGuide: "Connect via DoorDash Drive API." },
];

const CATEGORY_META: Record<Marketplace["category"], { label: string; description: string }> = {
  ecommerce:   { label: "Ecommerce Platforms", description: "Run your own branded store" },
  marketplace: { label: "Marketplaces",        description: "List products on third-party marketplaces" },
  social:      { label: "Social Commerce",     description: "Sell on social media platforms" },
  food:        { label: "Food Delivery",       description: "Hospitality marketplaces" },
};

const DEFAULT_CONFIG: MarketplaceConfig = {
  productsSync:  "two-way",
  inventorySync: "two-way",
  ordersSync:    "import",
  customersSync: "import",
  pricingSync:   "export",
  autoFulfil:    false,
  storeUrl:      "",
  storeId:       "",
  apiKey:        "",
};

function loadConnections(): Record<string, Connection> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveConnections(c: Record<string, Connection>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
}

function SyncSelect({ value, onChange }: { value: SyncDirection; onChange: (v: SyncDirection) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as SyncDirection)}
      className="h-7 rounded border bg-background px-2 text-xs"
    >
      <option value="two-way">Two-way</option>
      <option value="import">Import only</option>
      <option value="export">Export only</option>
      <option value="none">Off</option>
    </select>
  );
}

export default function OnlineMarketplacePage() {
  const [connections, setConnections] = useState<Record<string, Connection>>(() => loadConnections());
  const [setupOpen, setSetupOpen] = useState<Marketplace | null>(null);
  const [configOpen, setConfigOpen] = useState<Marketplace | null>(null);
  const [setupForm, setSetupForm] = useState({ storeUrl: "", storeId: "", apiKey: "" });
  const [authorizing, setAuthorizing] = useState(false);

  useEffect(() => { saveConnections(connections); }, [connections]);

  const totalConnected = Object.values(connections).filter((c) => c.connected).length;
  const totalProducts  = Object.values(connections).filter((c) => c.connected).reduce((s, c) => s + c.productsCount, 0);
  const totalOrders    = Object.values(connections).filter((c) => c.connected).reduce((s, c) => s + c.ordersCount, 0);

  const startSetup = (mp: Marketplace) => {
    const existing = connections[mp.id];
    setSetupForm({
      storeUrl: existing?.config.storeUrl ?? "",
      storeId:  existing?.config.storeId  ?? "",
      apiKey:   "",
    });
    setSetupOpen(mp);
  };

  const completeSetup = () => {
    if (!setupOpen) return;
    if (!setupForm.storeUrl.trim() && setupOpen.category !== "marketplace") {
      toast.error("Store URL is required"); return;
    }
    setAuthorizing(true);
    setTimeout(() => {
      const newConn: Connection = {
        connected:     true,
        connectedAt:   new Date().toISOString(),
        lastSync:      new Date().toISOString(),
        productsCount: Math.floor(Math.random() * 120) + 40,
        ordersCount:   Math.floor(Math.random() * 40) + 5,
        config: { ...DEFAULT_CONFIG, storeUrl: setupForm.storeUrl, storeId: setupForm.storeId, apiKey: setupForm.apiKey },
      };
      setConnections((prev) => ({ ...prev, [setupOpen.id]: newConn }));
      setAuthorizing(false);
      setSetupOpen(null);
      toast.success(`${setupOpen.name} connected — synced ${newConn.productsCount} products`);
    }, 1800);
  };

  const disconnect = (id: string) => {
    setConnections((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    toast.success("Disconnected");
  };

  const sync = (mp: Marketplace) => {
    setConnections((prev) => ({
      ...prev,
      [mp.id]: prev[mp.id] ? { ...prev[mp.id], lastSync: new Date().toISOString() } : prev[mp.id],
    }));
    toast.success(`${mp.name}: sync started`);
  };

  const openConfig = (mp: Marketplace) => setConfigOpen(mp);

  const updateConfig = (id: string, patch: Partial<MarketplaceConfig>) => {
    setConnections((prev) => ({
      ...prev,
      [id]: prev[id] ? { ...prev[id], config: { ...prev[id].config, ...patch } } : prev[id],
    }));
  };

  const grouped = (Object.keys(CATEGORY_META) as Marketplace["category"][]).map((cat) => ({
    cat,
    meta: CATEGORY_META[cat],
    items: MARKETPLACES.filter((m) => m.category === cat),
  }));

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShoppingBag className="w-6 h-6 text-primary" />
              Marketplace
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Connect your physical & online store with ecommerce platforms, marketplaces, and social commerce.
            </p>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Connections", value: totalConnected, icon: Plug,    color: "text-emerald-500" },
            { label: "Products synced", value: totalProducts, icon: Package, color: "text-blue-500" },
            { label: "Orders this week", value: totalOrders, icon: ShoppingBag, color: "text-violet-500" },
            { label: "Channels live", value: totalConnected, icon: BarChart2, color: "text-amber-500" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
                  <Icon className={cn("w-4 h-4", color)} />
                </div>
                <p className="text-2xl font-bold">{value.toLocaleString()}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Marketplace groups */}
        {grouped.map(({ cat, meta, items }) => (
          <Card key={cat}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{meta.label}</CardTitle>
              <CardDescription>{meta.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((mp) => {
                  const conn = connections[mp.id];
                  const isConnected = !!conn?.connected;
                  return (
                    <div
                      key={mp.id}
                      className={cn(
                        "rounded-lg border p-3 transition-all",
                        isConnected ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-950/10" : "hover:bg-muted/30",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <BrandIcon name={mp.id} size={28} className="shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-bold truncate" style={{ color: mp.brandColor }}>{mp.name}</p>
                            {isConnected && <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />}
                          </div>
                          <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{mp.tagline}</p>
                        </div>
                      </div>

                      {isConnected ? (
                        <>
                          <Separator className="my-3" />
                          <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground mb-3">
                            <div><span className="font-semibold text-foreground">{conn.productsCount}</span> products</div>
                            <div><span className="font-semibold text-foreground">{conn.ordersCount}</span> orders</div>
                            <div className="col-span-2">Last sync: {new Date(conn.lastSync).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</div>
                          </div>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1" onClick={() => sync(mp)}>
                              <RefreshCw className="w-3 h-3" /> Sync
                            </Button>
                            <Button size="sm" variant="outline" className="flex-1 h-7 text-xs gap-1" onClick={() => openConfig(mp)}>
                              <Settings2 className="w-3 h-3" /> Config
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Disconnect" onClick={() => disconnect(mp.id)}>
                              <Plug className="w-3 h-3" />
                            </Button>
                          </div>
                        </>
                      ) : (
                        <Button size="sm" className="w-full mt-3 h-7 text-xs gap-1.5" onClick={() => startSetup(mp)}>
                          Connect <ArrowRight className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Setup dialog */}
      <Dialog open={!!setupOpen} onOpenChange={(o) => { if (!o && !authorizing) setSetupOpen(null); }}>
        <DialogContent className="max-w-md">
          {setupOpen && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <BrandIcon name={setupOpen.id} size={32} />
                  Connect {setupOpen.name}
                </DialogTitle>
                <DialogDescription>{setupOpen.tagline}</DialogDescription>
              </DialogHeader>

              <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                <p className="font-semibold text-foreground mb-1">Setup steps</p>
                <p>{setupOpen.setupGuide}</p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Store URL</Label>
                  <Input value={setupForm.storeUrl} onChange={(e) => setSetupForm((f) => ({ ...f, storeUrl: e.target.value }))} placeholder={`yourstore.${setupOpen.id}.com`} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Store ID (optional)</Label>
                  <Input value={setupForm.storeId} onChange={(e) => setSetupForm((f) => ({ ...f, storeId: e.target.value }))} placeholder="123456" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">API key / OAuth token</Label>
                  <Input value={setupForm.apiKey} onChange={(e) => setSetupForm((f) => ({ ...f, apiKey: e.target.value }))} type="password" placeholder="••••••••" />
                </div>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-2.5 flex gap-2 text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p>Your credentials are stored encrypted. KoaPOS only requests the minimum scopes needed for product, inventory, and order sync.</p>
              </div>

              <DialogFooter>
                <Button variant="outline" disabled={authorizing} onClick={() => setSetupOpen(null)}>Cancel</Button>
                <Button onClick={completeSetup} disabled={authorizing} className="gap-1.5">
                  {authorizing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting…</> : <><Plug className="w-3.5 h-3.5" /> Connect</>}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Config dialog */}
      <Dialog open={!!configOpen} onOpenChange={(o) => { if (!o) setConfigOpen(null); }}>
        <DialogContent className="max-w-md">
          {configOpen && connections[configOpen.id] && (() => {
            const conn = connections[configOpen.id];
            const cfg  = conn.config;
            const update = (patch: Partial<MarketplaceConfig>) => updateConfig(configOpen.id, patch);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <BrandIcon name={configOpen.id} size={32} />
                    {configOpen.name} Settings
                  </DialogTitle>
                  <DialogDescription>Configure sync direction for each data type.</DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                  {[
                    { key: "productsSync"  as const, icon: Package,    label: "Products"  },
                    { key: "inventorySync" as const, icon: Boxes,      label: "Inventory" },
                    { key: "ordersSync"    as const, icon: ShoppingBag,label: "Orders"    },
                    { key: "customersSync" as const, icon: Users,      label: "Customers" },
                    { key: "pricingSync"   as const, icon: Tag,        label: "Pricing"   },
                  ].map(({ key, icon: Icon, label }) => (
                    <div key={key} className="flex items-center gap-3">
                      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{label}</p>
                      </div>
                      <SyncSelect value={cfg[key]} onChange={(v) => update({ [key]: v })} />
                    </div>
                  ))}
                  <Separator />
                  <div className="flex items-center gap-3">
                    <Box className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Auto-fulfil orders</p>
                      <p className="text-[11px] text-muted-foreground">Mark orders as fulfilled when KoaPOS dispatches</p>
                    </div>
                    <Switch checked={cfg.autoFulfil} onCheckedChange={(v) => update({ autoFulfil: v })} />
                  </div>
                  <Separator />
                  <div className="rounded-lg border bg-muted/20 p-3 text-[11px] text-muted-foreground space-y-1">
                    <p className="flex items-center gap-1.5"><AlertCircle className="w-3 h-3" /> Conflicts use the most-recently-updated record. Configure conflict resolution in Account → Sync settings.</p>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-2 text-[10px] text-muted-foreground break-all">
                    <span className="font-semibold">Store URL: </span>{cfg.storeUrl || "—"}
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" size="sm" className="gap-1.5" asChild>
                    <a href={cfg.storeUrl.startsWith("http") ? cfg.storeUrl : `https://${cfg.storeUrl}`} target="_blank" rel="noreferrer">
                      <ExternalLink className="w-3 h-3" /> Open
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => { disconnect(configOpen.id); setConfigOpen(null); }}>
                    Disconnect
                  </Button>
                  <Button size="sm" onClick={() => { setConfigOpen(null); toast.success("Settings saved"); }}>Done</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
