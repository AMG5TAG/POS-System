import { useEffect, useState, type FormEvent } from "react";
import { useSearch } from "wouter";
import { FileText, Search, ShoppingCart } from "lucide-react";
import { loadSiteIndex, searchPages, searchProducts, type ProductHit, type SitePage } from "@workspace/site-nav/search";
import SiteFooter from "@/components/SiteFooter";
import { useSeo } from "@/lib/useSeo";
import { trackEvent } from "@/lib/analytics";

const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

/* The header search's full results (Enter, or "See all results"): every
   matching page of the website, then the shop's matching products. The
   private web search (DuckDuckGo) is a different page, /search. */
export default function SiteSearchPage() {
  useSeo({
    title: "Search | Koastal Kollective",
    description: "Search the Koastal Kollective website and shop.",
    // Results for whatever was typed: nothing here for a search engine.
    noindex: true,
  });

  const params = new URLSearchParams(useSearch());
  const query = (params.get("q") ?? "").trim();
  const [draft, setDraft] = useState(query);
  const [index, setIndex] = useState<SitePage[] | null>(null);
  const [products, setProducts] = useState<{ total: number; items: ProductHit[] } | null>(null);

  useEffect(() => { loadSiteIndex().then(setIndex); }, []);
  useEffect(() => {
    setDraft(query);
    setProducts(null);
    if (!query) return;
    trackEvent("search", { search_term: query });
    let live = true;
    searchProducts(query, 12).then((r) => live && setProducts(r));
    return () => { live = false; };
  }, [query]);

  const pages = index && query ? searchPages(index, query, 30) : [];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (draft.trim()) window.location.assign(`/site-search?q=${encodeURIComponent(draft.trim())}`);
  };
  const loading = query && (index === null || products === null);

  return (
    <div className="bg-white text-gray-900">
      <section className="bg-gray-50 border-b border-gray-100 py-10">
        <div className="max-w-4xl mx-auto px-4">
          <h1 className="text-2xl md:text-3xl font-bold mb-4">
            {query ? <>Results for &ldquo;{query}&rdquo;</> : "Search the site"}
          </h1>
          <form onSubmit={submit} role="search" className="relative">
            <Search className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={draft} onChange={(e) => setDraft(e.target.value)} type="search" autoFocus
              placeholder="Search the site, services and products" aria-label="Search the site"
              className="w-full h-12 rounded-full border border-gray-300 bg-white pl-12 pr-4 outline-none focus:border-[#007b7d]" />
          </form>
        </div>
      </section>

      <section className="py-10">
        <div className="max-w-4xl mx-auto px-4 space-y-10">
          {loading && <p className="text-gray-500">Searching…</p>}

          {query && index !== null && (
            <div>
              <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-[#007b7d] mb-3">
                Pages {pages.length > 0 && <span className="text-gray-400">({pages.length})</span>}
              </h2>
              {pages.length === 0 ? (
                <p className="text-sm text-gray-500">No pages on the site match &ldquo;{query}&rdquo;.</p>
              ) : (
                <ul className="divide-y divide-gray-100 border-y border-gray-100">
                  {pages.map((p) => (
                    <li key={p.path}>
                      <a href={p.path} className="flex gap-3 py-4 group">
                        <FileText className="w-5 h-5 mt-0.5 shrink-0 text-[#007b7d]" />
                        <span className="min-w-0">
                          <span className="block font-bold group-hover:text-[#007b7d] group-hover:underline">{p.title}</span>
                          <span className="block text-xs text-gray-400 mb-1">koastal.com.au{p.path === "/" ? "" : p.path}</span>
                          {p.snippet && <span className="block text-sm text-gray-600 leading-relaxed">{p.snippet}</span>}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {query && products !== null && products.items.length > 0 && (
            <div>
              <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-[#007b7d] mb-3">
                Shop <span className="text-gray-400">({products.total})</span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {products.items.map((p) => (
                  <a key={p.id} href={`/shop/product/${p.id}`} className="border border-gray-200 rounded-xl overflow-hidden hover:border-[#007b7d] transition-colors">
                    <div className="aspect-square bg-gray-50 flex items-center justify-center">
                      {p.imageUrl
                        ? <img src={p.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                        : <ShoppingCart className="w-8 h-8 text-gray-300" />}
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-semibold line-clamp-2">{p.name}</p>
                      <p className="text-sm font-bold text-[#007b7d] mt-1">{aud(p.price)}</p>
                    </div>
                  </a>
                ))}
              </div>
              {products.total > products.items.length && (
                <a href={`/shop/products?search=${encodeURIComponent(query)}`}
                  className="inline-block mt-4 text-sm font-bold text-[#007b7d] hover:underline">
                  See all {products.total} products in the shop &rarr;
                </a>
              )}
            </div>
          )}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
