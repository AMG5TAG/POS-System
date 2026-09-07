/**
 * Online Store › Storefront — which kind of store the merchant runs, and the
 * identity of a KoaPOS-built one (name, tagline, logo, favicon).
 *
 * The mode switch lives here because it decides what the other three pages can
 * do: a third-party store owns its own design, features and domain.
 */
import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BrandIcon } from "@/components/brand-icon";
import {
  Store, Wrench, Settings2, Building2, Upload, ExternalLink, CheckCircle2,
  Image as ImageIcon, Package, ShoppingBag, Users, CreditCard, Sparkles, KeyRound, Boxes,
} from "lucide-react";
import { useGetMerchant, useGetOnlineStoreThirdparty, useUpsertOnlineStoreThirdparty } from "@workspace/api-client-react";
import { useBusinessProfile } from "@/lib/business-profile";
import { resizeImageFile } from "@/lib/image-resize";
import {
  useOnlineStore, StoreHeader, Field, THIRDPARTY_PROVIDERS, apiToThirdParty,
  brandFontToCategory, type ThirdParty,
} from "./shared";

export default function OnlineStoreStorefrontPage() {
  const { site, mutateSite, updateSite, togglePublish } = useOnlineStore();
  const [, navigate] = useLocation();

  const { data: rawThirdParty } = useGetOnlineStoreThirdparty({ query: { queryKey: ["online-store-thirdparty"] } });
  const upsertThirdParty = useUpsertOnlineStoreThirdparty();
  const [thirdParty, setThirdParty] = useState<ThirdParty | null>(null);
  const [connectProvider, setConnectProvider] = useState<string | null>(null);
  const [connectForm, setConnectForm] = useState({ url: "", apiKey: "" });

  useEffect(() => {
    if (rawThirdParty) setThirdParty(apiToThirdParty(rawThirdParty as unknown as Record<string, unknown>));
  }, [rawThirdParty]);

  /* Branding source: Business Details (management > business) */
  const { profile: businessProfile } = useBusinessProfile();
  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const logoFileRef = useRef<HTMLInputElement>(null);
  const faviconFileRef = useRef<HTMLInputElement>(null);

  /* Pull name, tagline, logo, favicon and brand colours from Business Details. */
  const importFromBusiness = () => {
    const bp = businessProfile;
    const [primary, accent] = bp.brandColors ?? [];
    mutateSite((s) => ({
      ...s,
      storeName:  merchant?.businessName || s.storeName,
      tagline:    bp.tagline || s.tagline,
      logoUrl:    bp.logo || s.logoUrl,
      faviconUrl: bp.logo || s.faviconUrl,
      theme: {
        ...s.theme,
        primary: primary || s.theme.primary,
        accent:  accent || s.theme.accent,
        bg:      (bp.bgColors ?? [])[0]   || s.theme.bg,
        text:    (bp.textColors ?? [])[0] || s.theme.text,
        font:    bp.brandFont ? brandFontToCategory(bp.brandFont) : s.theme.font,
      },
    }));
    toast.success("Imported branding from Business Details");
  };

  /* Read an uploaded image file, downscale large uploads, and store it on the site. */
  const handleImageFile = async (file: File | undefined, field: "logoUrl" | "faviconUrl") => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image file"); return; }
    try {
      const { dataUrl, resized, width, height } = await resizeImageFile(file, { maxDim: field === "faviconUrl" ? 128 : 512 });
      updateSite({ [field]: dataUrl });
      if (resized) toast.success(`Image resized to ${width}\u00d7${height}`);
    } catch {
      toast.error("Failed to read image file");
    }
  };

  /* Reuse the store logo as the favicon. */
  const useLogoAsFavicon = () => {
    if (!site.logoUrl) { toast.error("Add a logo first"); return; }
    updateSite({ faviconUrl: site.logoUrl });
    toast.success("Logo set as favicon");
  };

  const isHeadless = thirdParty?.providerId === "headless";

  const connectThirdParty = () => {
    if (!connectProvider) return;
    // The Data API has no platform to point at, so it is the one provider that
    // does not need a store URL — the merchant may not have built the site yet.
    const providerKind = THIRDPARTY_PROVIDERS.find((p) => p.id === connectProvider)?.kind;
    if (providerKind !== "api" && !connectForm.url.trim()) { toast.error("Store URL is required"); return; }
    const tp: ThirdParty = {
      providerId:  connectProvider,
      storeUrl:    connectForm.url.trim(),
      apiKey:      connectForm.apiKey.trim(),
      connected:   true,
      connectedAt: new Date().toISOString(),
    };
    setThirdParty(tp);
    upsertThirdParty.mutate({ data: { providerId: tp.providerId, storeUrl: tp.storeUrl, apiKey: tp.apiKey, connected: "true", connectedAt: tp.connectedAt } }, {
      onError: () => toast.error("Failed to save connection"),
    });
    setConnectProvider(null);
    setConnectForm({ url: "", apiKey: "" });
    toast.success("Connected to third-party store");
  };

  const disconnectThirdParty = () => {
    setThirdParty(null);
    upsertThirdParty.mutate({ data: { providerId: "", storeUrl: "", apiKey: "", connected: "false", connectedAt: "" } }, {
      onError: () => toast.error("Failed to disconnect"),
    });
    toast.success("Disconnected");
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <StoreHeader
          icon={Store} title="Storefront" site={site} onTogglePublish={togglePublish}
          description="Choose how your store is built, and set the name and branding customers see."
        />

        <Card>
          <CardContent className="p-2">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => updateSite({ mode: "builder" })}
                className={cn("flex items-start gap-3 rounded-lg border p-4 text-left transition-all", site.mode === "builder" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/40")}>
                <Wrench className="w-5 h-5 mt-0.5 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-sm">KoaPOS Website Builder</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Full-featured drag-and-drop site with built-in checkout, loyalty, and customer sync.</p>
                </div>
              </button>
              <button onClick={() => updateSite({ mode: "thirdparty" })}
                className={cn("flex items-start gap-3 rounded-lg border p-4 text-left transition-all", site.mode === "thirdparty" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/40")}>
                <Store className="w-5 h-5 mt-0.5 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-sm">Connect Third-Party Store</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Sync with Shopify, WooCommerce, BigCommerce and others.</p>
                </div>
              </button>
            </div>
          </CardContent>
        </Card>

        {site.mode === "thirdparty" ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Available Platforms</CardTitle><CardDescription>Choose a platform to connect to your store</CardDescription></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {THIRDPARTY_PROVIDERS.map((p) => {
                    const isConnected = thirdParty?.providerId === p.id && thirdParty?.connected;
                    return (
                      <button key={p.id} onClick={() => { setConnectProvider(p.id); setConnectForm({ url: thirdParty?.storeUrl || "", apiKey: "" }); }}
                        className={cn("flex items-center gap-3 rounded-lg border p-3 text-left transition-all",
                          isConnected ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800"
                            : p.kind === "api" ? "border-primary/40 bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/40")}>
                        {p.kind === "api"
                          ? <Sparkles className="w-7 h-7 shrink-0 text-primary" />
                          : <BrandIcon name={p.id} size={28} className="shrink-0" />}
                        <div className="min-w-0 flex-1"><p className="text-sm font-semibold truncate">{p.name}</p><p className="text-[11px] text-muted-foreground truncate">{p.tagline}</p></div>
                        {isConnected && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Connection Status</CardTitle><CardDescription>Your active third-party integration</CardDescription></CardHeader>
              <CardContent>
                {thirdParty?.connected ? (
                  <div className="space-y-4">
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <p className="text-sm font-semibold">{THIRDPARTY_PROVIDERS.find((p) => p.id === thirdParty.providerId)?.name}</p>
                        <Badge variant="secondary" className="ml-auto text-[10px]">Connected</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground break-all">{thirdParty.storeUrl || (isHeadless ? "Your own website, wherever it is hosted" : "")}</p>
                      <p className="text-[11px] text-muted-foreground">Connected {new Date(thirdParty.connectedAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
                    </div>
                    <div className="flex gap-2">
                      {isHeadless ? (
                        <Button size="sm" className="flex-1 gap-1.5" asChild>
                          <Link href="/management/online-store/data-api"><KeyRound className="w-3.5 h-3.5" /> Manage API keys</Link>
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" className="flex-1 gap-1.5" asChild>
                          <a href={thirdParty.storeUrl.startsWith("http") ? thirdParty.storeUrl : `https://${thirdParty.storeUrl}`} target="_blank" rel="noreferrer">
                            <ExternalLink className="w-3.5 h-3.5" /> Open store
                          </a>
                        </Button>
                      )}
                      <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-destructive hover:text-destructive" onClick={disconnectThirdParty}>Disconnect</Button>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">{isHeadless ? "What your site can read" : "What syncs"}</p>
                      {(isHeadless
                        ? [{ icon: Package, label: "Products, categories & brands" }, { icon: Boxes, label: "Stock levels" }, { icon: Users, label: "Customers (if you allow it)" }, { icon: ShoppingBag, label: "Sales (if you allow it)" }]
                        : [{ icon: Package, label: "Products & inventory" }, { icon: ShoppingBag, label: "Orders (read & fulfil)" }, { icon: Users, label: "Customers" }, { icon: CreditCard, label: "Payments & refunds" }]
                      ).map(({ icon: Icon, label }) => (
                        <div key={label} className="flex items-center gap-2 text-xs"><Icon className="w-3.5 h-3.5 text-muted-foreground" /><span>{label}</span><Badge variant="secondary" className="ml-auto text-[10px]">{isHeadless ? "Read-only" : "Active"}</Badge></div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <Store className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    No third-party store connected yet. Choose a platform on the left — or <strong>Build your own (AI)</strong> to
                    get a read-only Data API key for a site you build yourself.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <>
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base flex items-center gap-2"><Settings2 className="w-4 h-4" /> Site Basics</CardTitle>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={importFromBusiness}
                  title="Import name, tagline, logo, favicon, brand colours and font from Business Details">
                  <Building2 className="w-3.5 h-3.5" /> Import from Business
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Store name"><Input value={site.storeName} onChange={(e) => updateSite({ storeName: e.target.value })} /></Field>
                  <Field label="Tagline">   <Input value={site.tagline}   onChange={(e) => updateSite({ tagline:   e.target.value })} /></Field>
                  <Field label="Logo URL"><Input value={site.logoUrl} onChange={(e) => updateSite({ logoUrl: e.target.value })} placeholder="https://…" /></Field>
                  <Field label="Favicon URL"><Input value={site.faviconUrl} onChange={(e) => updateSite({ faviconUrl: e.target.value })} placeholder="https://…" /></Field>
                </div>

                {/* Logo / favicon previews */}
                {(site.logoUrl || site.faviconUrl) && (
                  <div className="flex items-center gap-6">
                    {site.logoUrl && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Logo</span>
                        <img src={site.logoUrl} alt="Logo preview" className="h-9 max-w-[120px] object-contain rounded border bg-muted/30" />
                      </div>
                    )}
                    {site.faviconUrl && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Favicon</span>
                        <img src={site.faviconUrl} alt="Favicon preview" className="h-6 w-6 object-contain rounded border bg-muted/30" />
                      </div>
                    )}
                  </div>
                )}

                <input ref={logoFileRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { handleImageFile(e.target.files?.[0], "logoUrl"); e.target.value = ""; }} />
                <input ref={faviconFileRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { handleImageFile(e.target.files?.[0], "faviconUrl"); e.target.value = ""; }} />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => logoFileRef.current?.click()}>
                    <Upload className="w-3.5 h-3.5" /> Upload logo
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => faviconFileRef.current?.click()}>
                    <Upload className="w-3.5 h-3.5" /> Upload favicon
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={useLogoAsFavicon} disabled={!site.logoUrl}
                    title="Use the store logo as the favicon">
                    <ImageIcon className="w-3.5 h-3.5" /> Use logo as favicon
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Dialog open={!!connectProvider} onOpenChange={(o) => { if (!o) setConnectProvider(null); }}>
        <DialogContent className="max-w-md">
          {connectProvider && (() => {
            const provider = THIRDPARTY_PROVIDERS.find((p) => p.id === connectProvider);
            if (!provider) return null;
            if (provider.kind === "api") {
              return (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" />Build your own store</DialogTitle>
                    <DialogDescription>
                      Nothing to connect to here — you build the site, and KoaPOS gives it read-only access to your data.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1.5">
                      <p>On the next page you create an <strong className="text-foreground">API key</strong> and download a
                        <strong className="text-foreground"> connection file</strong> — one document that tells an AI coding tool
                        (or a developer) everything it needs to read your products, stock, and — if you allow it — your
                        customers and sales.</p>
                      <p>The access is <strong className="text-foreground">read-only</strong>: a key can never change anything in KoaPOS.</p>
                    </div>
                    <Field label="Your website address (optional)">
                      <Input value={connectForm.url} onChange={(e) => setConnectForm((f) => ({ ...f, url: e.target.value }))} placeholder="yourstore.com.au" />
                    </Field>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setConnectProvider(null)}>Cancel</Button>
                    <Button onClick={() => { connectThirdParty(); navigate("/management/online-store/data-api"); }} className="gap-1.5">
                      <KeyRound className="w-3.5 h-3.5" /> Continue to Data API
                    </Button>
                  </DialogFooter>
                </>
              );
            }
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><BrandIcon name={provider.id} size={32} />Connect {provider.name}</DialogTitle>
                  <DialogDescription>{provider.tagline}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <Field label="Store URL"><Input value={connectForm.url} onChange={(e) => setConnectForm((f) => ({ ...f, url: e.target.value }))} placeholder={`yourstore.${provider.id}.com`} /></Field>
                  <Field label="API key / token (optional)"><Input value={connectForm.apiKey} onChange={(e) => setConnectForm((f) => ({ ...f, apiKey: e.target.value }))} type="password" placeholder="••••••••" /></Field>
                  <p className="text-[11px] text-muted-foreground">KoaPOS will sync products, orders, customers and inventory two-ways with your {provider.name} store.</p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setConnectProvider(null)}>Cancel</Button>
                  <Button onClick={connectThirdParty}>Connect</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
