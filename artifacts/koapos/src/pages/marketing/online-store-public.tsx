import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Store, Mail, Phone, Facebook, Instagram, Twitter } from "lucide-react";
import {
  apiToSite, BlockPreview, blockWrapperStyle, blockColSpan, isBlockLive, type SiteSettings,
} from "@/pages/app/management-online-store";
import {
  CartProvider, CartButton, CartDrawer, ShoppableProducts, ProductDetailProvider, OrderTracker, isProductBlock, type Catalog,
} from "@/pages/marketing/storefront-commerce";
import { useStorefrontSeo } from "@/pages/marketing/storefront-seo";
import { cn } from "@/lib/utils";

/*
 * Public, unauthenticated storefront for the KoaPOS website builder.
 * URL: https://koapos.com.au/b/:businessUsername/o/:storeSlug
 *
 * Renders the merchant's published store using the same block renderer as the
 * builder, plus a live commerce layer (cart + checkout) sourced from a public
 * catalog endpoint. Display-only blocks fall through to BlockPreview; product
 * blocks become shoppable when the store's checkout feature is enabled.
 */
export default function OnlineStorePublicView() {
  const params = useParams<{ businessUsername?: string; storeSlug?: string }>();
  const username = params.businessUsername ?? "";
  const slug = params.storeSlug ?? "";
  const base = `/api/online-store/public/b/${encodeURIComponent(username)}/o/${encodeURIComponent(slug)}`;

  const { data, isLoading, isError } = useQuery<SiteSettings | null>({
    queryKey: ["online-store-public", username, slug],
    enabled: !!username,
    retry: false,
    queryFn: async () => {
      const r = await fetch(base, { credentials: "omit" });
      if (!r.ok) throw new Error("not found");
      const row = await r.json();
      return apiToSite(row as Record<string, unknown>);
    },
  });

  // Catalog loads once we know the store exists; failure is non-fatal (the store
  // still renders as a brochure, just without shoppable products).
  const { data: catalog } = useQuery<Catalog | null>({
    queryKey: ["online-store-catalog", username, slug],
    enabled: !!username && !!data && data.published !== false,
    retry: false,
    queryFn: async () => {
      const r = await fetch(`${base}/catalog`, { credentials: "omit" });
      if (!r.ok) return null;
      return (await r.json()) as Catalog;
    },
  });

  // SEO must run on every render (before early returns) to keep hook order stable.
  useStorefrontSeo({
    enabled: !!data && data.published !== false,
    storeName: data?.storeName ?? "",
    tagline: data?.tagline ?? "",
    page: data ? (data.pages.find((p) => p.visible) ?? data.pages[0] ?? null) : null,
    logoUrl: data?.logoUrl ?? "",
    catalog: catalog ?? null,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data || data.published === false) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-muted/20 text-center px-4">
        <Store className="w-12 h-12 text-muted-foreground/30" />
        <h1 className="text-xl font-bold">Store not available</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          This store isn’t published yet, or the address is incorrect. Please check the link and try again.
        </p>
      </div>
    );
  }

  // The landing/home page is the first visible page (or the first page).
  const page = data.pages.find((p) => p.visible) ?? data.pages[0];
  const fontFamily = data.theme.font === "serif" ? "Georgia, serif" : data.theme.font === "mono" ? "ui-monospace, monospace" : "system-ui, sans-serif";
  const checkoutEnabled = catalog?.checkoutEnabled ?? false;
  const footer = data.footer;
  const footerLinks = footer.enabled
    ? footer.linksRaw.split("\n").map((line) => {
        const [label, url] = line.split("|").map((s) => s.trim());
        return label ? { label, url: url || "#" } : null;
      }).filter(Boolean) as { label: string; url: string }[]
    : [];

  return (
    <CartProvider storeKey={`${username}/${slug}`} checkoutEnabled={checkoutEnabled}>
      <ProductDetailProvider base={base} reviewsEnabled={catalog?.reviewsEnabled ?? false} theme={data.theme}>
      <div className="min-h-screen" style={{ backgroundColor: data.theme.bg, fontFamily }}>
        {/* Header */}
        <header className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: `${data.theme.text}15` }}>
          <div className="flex items-center gap-2">
            {data.logoUrl
              ? <img src={data.logoUrl} alt={data.storeName} className="h-8 w-auto object-contain" />
              : <Store className="w-5 h-5" style={{ color: data.theme.primary }} />}
            <span className="font-bold" style={{ color: data.theme.text }}>{data.storeName || "Store"}</span>
          </div>
          <div className="flex items-center gap-4">
            <nav className="hidden sm:flex gap-4 text-sm">
              {data.pages.filter((p) => p.visible).slice(0, 6).map((p) => (
                <span key={p.id} className={p.id === page?.id ? "font-semibold" : "opacity-70"} style={{ color: data.theme.text }}>{p.name}</span>
              ))}
            </nav>
            <OrderTracker theme={data.theme} lookupPath={`${base}/order-lookup`} />
            <CartButton theme={data.theme} />
          </div>
        </header>

        {/* Page blocks */}
        <main className="max-w-5xl mx-auto p-4 sm:p-6">
          {(() => {
            const visibleBlocks = (page?.blocks ?? []).filter((b) => isBlockLive(b));
            return visibleBlocks.length
            ? (
              <div className="grid grid-cols-12 gap-4 items-start">
                {visibleBlocks.map((b) => (
                  <div key={b.id} className={cn(blockColSpan(b.data))} style={blockWrapperStyle(b.data)}>
                    {isProductBlock(b) && catalog
                      ? <ShoppableProducts block={b} catalog={catalog} theme={data.theme} />
                      : <BlockPreview block={b} theme={data.theme} />}
                  </div>
                ))}
              </div>
            )
            : <p className="text-center text-sm opacity-60 py-16" style={{ color: data.theme.text }}>This page has no content yet.</p>;
          })()}
        </main>

        {footer.enabled && (
          <footer className="border-t mt-8" style={{ borderColor: `${data.theme.text}15` }}>
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-4 text-sm" style={{ color: data.theme.text }}>
              {footerLinks.length > 0 && (
                <nav className="flex flex-wrap gap-x-5 gap-y-2">
                  {footerLinks.map((l, i) => <a key={i} href={l.url} className="opacity-80 hover:opacity-100">{l.label}</a>)}
                </nav>
              )}
              {(footer.email || footer.phone || footer.facebook || footer.instagram || footer.twitter) && (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs opacity-80">
                  {footer.email && <a href={`mailto:${footer.email}`} className="inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{footer.email}</a>}
                  {footer.phone && <a href={`tel:${footer.phone}`} className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{footer.phone}</a>}
                  <span className="flex items-center gap-3">
                    {footer.facebook && <a href={footer.facebook} target="_blank" rel="noreferrer" aria-label="Facebook"><Facebook className="w-4 h-4" /></a>}
                    {footer.instagram && <a href={footer.instagram} target="_blank" rel="noreferrer" aria-label="Instagram"><Instagram className="w-4 h-4" /></a>}
                    {footer.twitter && <a href={footer.twitter} target="_blank" rel="noreferrer" aria-label="X / Twitter"><Twitter className="w-4 h-4" /></a>}
                  </span>
                </div>
              )}
              {footer.text && <p className="text-xs opacity-60 whitespace-pre-wrap">{footer.text}</p>}
            </div>
          </footer>
        )}

        <CartDrawer theme={data.theme} checkoutPath={`${base}/checkout`} />
      </div>
      </ProductDetailProvider>
    </CartProvider>
  );
}
