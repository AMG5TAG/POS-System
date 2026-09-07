import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Package, Phone, MapPin, CheckCircle2, XCircle, ShieldCheck } from "lucide-react";
import { useStorefrontSeo } from "@/pages/marketing/storefront-seo";
import { telHref } from "@/lib/utils";

/*
 * Public, unauthenticated product page.
 * URL: https://koapos.com.au/b/:businessUsername/p/:productId
 *
 * The page a customer lands on after scanning a product QR code (printed on a
 * sticker or shown in the app). Renders the product's details — image, price,
 * description, availability, warranty — with light business branding, sourced
 * from the public product endpoint. No login required.
 */

interface PublicProduct {
  id: number;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  sku: string;
  barcode: string;
  categoryName: string;
  brandName: string;
  inStock: boolean;
  warranty: string;
  business: { name: string; logoUrl: string; phone: string; city: string };
}

export default function ProductPublicView() {
  const params = useParams<{ businessUsername?: string; productId?: string }>();
  const username = params.businessUsername ?? "";
  const productId = params.productId ?? "";

  const { data, isLoading, isError } = useQuery<PublicProduct>({
    queryKey: ["product-public", username, productId],
    enabled: !!username && !!productId,
    retry: false,
    queryFn: async () => {
      const r = await fetch(
        `/api/public/b/${encodeURIComponent(username)}/products/${encodeURIComponent(productId)}`,
        { credentials: "omit" },
      );
      if (!r.ok) throw new Error("not found");
      return (await r.json()) as PublicProduct;
    },
  });

  // SEO — runs every render (before early returns) to keep hook order stable.
  useStorefrontSeo({
    enabled: !!data,
    storeName: data?.business.name ?? "",
    tagline: data?.name ?? "",
    page: null,
    logoUrl: data?.business.logoUrl ?? "",
    catalog: null,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-muted/20 text-center px-4">
        <Package className="w-12 h-12 text-muted-foreground/30" />
        <h1 className="text-xl font-bold">Product not available</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          This product isn’t available, or the address is incorrect. Please check the link and try again.
        </p>
      </div>
    );
  }

  const priceLabel = data.price.toLocaleString(undefined, { style: "currency", currency: "AUD" });

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Business header */}
      <header className="bg-white border-b">
        <div className="max-w-3xl mx-auto flex items-center gap-2.5 px-4 sm:px-6 py-3">
          {data.business.logoUrl
            ? <img src={data.business.logoUrl} alt={data.business.name} className="h-8 w-auto object-contain" />
            : <Package className="w-5 h-5 text-primary" />}
          <span className="font-bold">{data.business.name || "Store"}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Image */}
          <div className="rounded-2xl border bg-white overflow-hidden flex items-center justify-center aspect-square">
            {data.imageUrl
              ? <img src={data.imageUrl} alt={data.name} className="w-full h-full object-contain" />
              : <Package className="w-16 h-16 text-muted-foreground/20" />}
          </div>

          {/* Details */}
          <div className="flex flex-col gap-3">
            {(data.brandName || data.categoryName) && (
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {[data.brandName, data.categoryName].filter(Boolean).join(" · ")}
              </p>
            )}
            <h1 className="text-2xl font-bold leading-tight">{data.name}</h1>
            <p className="text-3xl font-bold text-primary">{priceLabel}</p>

            <div className="flex flex-wrap items-center gap-2">
              {data.inStock ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> In stock
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-2.5 py-1">
                  <XCircle className="w-3.5 h-3.5" /> Out of stock
                </span>
              )}
              {data.warranty && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 rounded-full px-2.5 py-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> {data.warranty} warranty
                </span>
              )}
            </div>

            {data.description && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed mt-1">
                {data.description}
              </p>
            )}

            <dl className="text-sm border-t pt-3 mt-1 space-y-1.5">
              {data.sku && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">SKU</dt>
                  <dd className="font-medium">{data.sku}</dd>
                </div>
              )}
              {data.barcode && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Barcode</dt>
                  <dd className="font-medium">{data.barcode}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* Business contact footer */}
        {(data.business.phone || data.business.city) && (
          <div className="mt-8 rounded-2xl border bg-white p-4 text-sm flex flex-wrap items-center gap-x-6 gap-y-2 text-muted-foreground">
            {data.business.phone && (
              <a href={telHref(data.business.phone)} className="inline-flex items-center gap-1.5 hover:text-foreground">
                <Phone className="w-4 h-4" /> {data.business.phone}
              </a>
            )}
            {data.business.city && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-4 h-4" /> {data.business.city}
              </span>
            )}
          </div>
        )}

        <p className="text-center text-[11px] text-muted-foreground/60 mt-8">
          Powered by {data.business.name || "KoaPOS"}
        </p>
      </main>
    </div>
  );
}
