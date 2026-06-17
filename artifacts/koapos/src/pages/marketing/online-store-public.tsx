import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Store } from "lucide-react";
import {
  apiToSite, BlockPreview, blockWrapperStyle, blockColSpan, type SiteSettings,
} from "@/pages/app/management-online-store";
import { cn } from "@/lib/utils";

/*
 * Public, unauthenticated storefront for the KoaPOS website builder.
 * URL: https://koapos.com.au/b/:businessUsername/o/:storeSlug
 *
 * Renders the merchant's published store using the same block renderer as the
 * builder. Data comes from a public endpoint (mirrors the public landing-page
 * endpoint) so anonymous visitors can load it without a session.
 */
export default function OnlineStorePublicView() {
  const params = useParams<{ businessUsername?: string; storeSlug?: string }>();
  const username = params.businessUsername ?? "";
  const slug = params.storeSlug ?? "";

  const { data, isLoading, isError } = useQuery<SiteSettings | null>({
    queryKey: ["online-store-public", username, slug],
    enabled: !!username,
    retry: false,
    queryFn: async () => {
      const r = await fetch(
        `/api/online-store/public/b/${encodeURIComponent(username)}/o/${encodeURIComponent(slug)}`,
        { credentials: "omit" },
      );
      if (!r.ok) throw new Error("not found");
      const row = await r.json();
      return apiToSite(row as Record<string, unknown>);
    },
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

  return (
    <div className="min-h-screen" style={{ backgroundColor: data.theme.bg, fontFamily }}>
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: `${data.theme.text}15` }}>
        <div className="flex items-center gap-2">
          {data.logoUrl
            ? <img src={data.logoUrl} alt={data.storeName} className="h-8 w-auto object-contain" />
            : <Store className="w-5 h-5" style={{ color: data.theme.primary }} />}
          <span className="font-bold" style={{ color: data.theme.text }}>{data.storeName || "Store"}</span>
        </div>
        <nav className="flex gap-4 text-sm">
          {data.pages.filter((p) => p.visible).slice(0, 6).map((p) => (
            <span key={p.id} className={p.id === page?.id ? "font-semibold" : "opacity-70"} style={{ color: data.theme.text }}>{p.name}</span>
          ))}
        </nav>
      </header>

      {/* Page blocks */}
      <main className="max-w-5xl mx-auto p-4 sm:p-6">
        {page?.blocks.length
          ? (
            <div className="grid grid-cols-12 gap-4 items-start">
              {page.blocks.map((b) => (
                <div key={b.id} className={cn(blockColSpan(b.data))} style={blockWrapperStyle(b.data)}>
                  <BlockPreview block={b} theme={data.theme} />
                </div>
              ))}
            </div>
          )
          : <p className="text-center text-sm opacity-60 py-16" style={{ color: data.theme.text }}>This page has no content yet.</p>}
      </main>
    </div>
  );
}
