import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Copy, ExternalLink, Loader2, RefreshCw, ShoppingBag, AlertTriangle } from "lucide-react";
import { onlineStoreFetch } from "./management-online-store-overview";

interface FeedStatus {
  enabled: boolean;
  url: string | null;
  included: number;
  skipped: { service: number; giftCard: number; noPrice: number; noImage: number };
}

/* Every channel below reads the same Google-format feed (api-server
   lib/product-feed.ts), so adding one is a row here, not new server code. */
const CHANNELS: { name: string; reaches: string; setup: string; steps: string[] }[] = [
  {
    name: "Google Shopping",
    reaches: "Google Search, the Shopping tab, Images, Maps and YouTube",
    setup: "https://merchants.google.com",
    steps: [
      "Sign in to Google Merchant Center and verify koastal.com.au as your website.",
      "Products › Add products › Add products from a file › Enter a link to your file.",
      "Paste the feed link and choose a daily fetch.",
    ],
  },
  {
    name: "Facebook & Instagram",
    reaches: "Facebook Shop, Instagram Shopping and product tags, Meta ads",
    setup: "https://business.facebook.com/commerce",
    steps: [
      "Open Commerce Manager and create (or open) a catalogue.",
      "Data sources › Add items › Data feed › Use a URL.",
      "Paste the feed link, currency AUD, and schedule daily updates.",
    ],
  },
  {
    name: "Pinterest",
    reaches: "Shoppable product Pins and Pinterest shopping ads",
    setup: "https://www.pinterest.com.au/business/catalogs/",
    steps: [
      "Claim koastal.com.au on your Pinterest business account.",
      "Ads › Catalogues › Add data source.",
      "Paste the feed link, format XML, currency AUD.",
    ],
  },
  {
    name: "TikTok",
    reaches: "TikTok catalogue and shopping ads",
    setup: "https://ads.tiktok.com/i18n/catalog",
    steps: [
      "In TikTok Ads Manager open Assets › Catalogues and create a catalogue.",
      "Add products › Data feed › Scheduled feed.",
      "Paste the feed link and choose a daily update.",
    ],
  },
  {
    name: "Microsoft Bing",
    reaches: "Bing Shopping and Microsoft Shopping ads",
    setup: "https://ads.microsoft.com",
    steps: [
      "In Microsoft Advertising open Tools › Microsoft Merchant Center and create a store for koastal.com.au.",
      "Catalogue management › Feeds › Create feed › Scheduled download.",
      "Paste the feed link. (You can also import straight from Google Merchant Center.)",
    ],
  },
];

/* Management › Online Store › Shopping Channels — the product feed that lists
   the shop's products on Google, Meta, Pinterest, TikTok and Bing. */
export default function ManagementOnlineStoreChannelsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["online-store", "feed"],
    queryFn: () => onlineStoreFetch<FeedStatus>("/feed"),
  });
  const [saving, setSaving] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);

  const save = async (enabled: boolean, newLink = false) => {
    setSaving(true);
    try {
      await onlineStoreFetch("/feed", { method: "PUT", body: JSON.stringify({ enabled, newLink }) });
      await qc.invalidateQueries({ queryKey: ["online-store", "feed"] });
      toast.success(!enabled ? "Product feed turned off" : newLink ? "New feed link created — update it on every channel" : "Product feed is on");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
      setConfirmNew(false);
    }
  };

  const copy = async () => {
    if (!data?.url) return;
    try { await navigator.clipboard.writeText(data.url); toast.success("Feed link copied"); }
    catch { toast.error("Couldn't copy — select the link and copy it instead"); }
  };

  const skippedTotal = data ? Object.values(data.skipped).reduce((a, b) => a + b, 0) : 0;
  const skippedLines = data ? ([
    ["noImage", "have no photo uploaded"],
    ["noPrice", "have a $0 price"],
    ["service", "are services (channels don't allow them)"],
    ["giftCard", "are gift cards or ePay"],
  ] as const).filter(([k]) => data.skipped[k] > 0).map(([k, label]) => `${data.skipped[k]} ${label}`) : [];

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ShoppingBag className="w-6 h-6 text-primary" /> Shopping Channels</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            List your online shop's products on Google, Facebook & Instagram, Pinterest, TikTok and Bing. Each channel reads one product feed link, which always shows your current prices, photos and stock.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Product feed</CardTitle>
              <CardDescription>The link every channel fetches. It carries the products your shop lists — set those under Online Store › Products.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading || !data ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">Publish a product feed</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Turning it off stops every channel receiving updates; they will drop your products after their next fetch.</p>
                    </div>
                    <Switch checked={data.enabled} disabled={saving} onCheckedChange={(v) => void save(v)} />
                  </div>

                  {data.enabled && data.url && (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input readOnly value={data.url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
                        <Button variant="outline" size="icon" onClick={() => void copy()} title="Copy link"><Copy className="w-4 h-4" /></Button>
                        <a href={data.url} target="_blank" rel="noreferrer"><Button variant="outline" size="icon" title="Open feed"><ExternalLink className="w-4 h-4" /></Button></a>
                      </div>
                      {confirmNew ? (
                        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs space-y-2">
                          <p>The current link will stop working straight away. Every channel using it must be given the new one, or it will stop updating.</p>
                          <div className="flex gap-2">
                            <Button size="sm" variant="destructive" disabled={saving} onClick={() => void save(true, true)}>Replace link</Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmNew(false)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setConfirmNew(true)}>
                          <RefreshCw className="w-3.5 h-3.5" /> Replace link
                        </Button>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="rounded-lg border p-3"><p className="text-2xl font-bold">{data.included}</p><p className="text-xs text-muted-foreground">Items in the feed</p></div>
                    <div className="rounded-lg border p-3"><p className="text-2xl font-bold">{skippedTotal}</p><p className="text-xs text-muted-foreground">Listed products left out</p></div>
                  </div>
                  {skippedLines.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Left out because they {skippedLines.join("; ")}. Channels reject these, and rejected items count against the whole account.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Variants are sent as separate items. A barcode is sent as the GTIN when it's a valid EAN/UPC — products with one are approved faster.
                  </p>

                  <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p>Channels check that each product link opens a page showing the product and its price. While the shop is still behind its "coming soon" page, they will reject the products — submit the feed once the shop has launched.</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Connect a channel</CardTitle>
              <CardDescription>Each one takes a few minutes in its own business account. Paste the feed link where it asks for a feed URL.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {CHANNELS.map((c) => (
                <div key={c.name} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.reaches}</p>
                    </div>
                    <a href={c.setup} target="_blank" rel="noreferrer">
                      <Button variant="outline" size="sm" className="gap-1.5 shrink-0">Open <ExternalLink className="w-3.5 h-3.5" /></Button>
                    </a>
                  </div>
                  <ol className="list-decimal pl-5 text-xs text-muted-foreground space-y-0.5">
                    {c.steps.map((s) => <li key={s}>{s}</li>)}
                  </ol>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
