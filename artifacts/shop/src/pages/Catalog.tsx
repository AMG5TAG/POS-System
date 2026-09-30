import { useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { ChevronDown, Loader2 } from "lucide-react";
import { useCategories, useProducts } from "@/lib/shop";
import { ProductCard } from "@/components/ProductCard";

const SORTS = [
  { value: "name", label: "Name" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
];
const PAGE_SIZE = 24;
const COLLAPSED_KEY = "shop.catalog.collapsedCategories";

export default function Catalog() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const category = Number(params.get("category")) || undefined;
  const q = params.get("search") ?? "";
  const sort = params.get("sort") ?? "name";
  const inStock = params.get("inStock") === "true";
  const page = Math.max(1, Number(params.get("page")) || 1);

  const { data: cats } = useCategories();
  const { data, isLoading, isFetching } = useProducts({ category, search: q, sort, inStock, page, pageSize: PAGE_SIZE });

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== "page") next.delete("page");
    navigate(`/products${next.toString() ? `?${next}` : ""}`);
  };

  const current = cats?.find((c) => c.id === category);
  const parents = (cats ?? []).filter((c) => c.parentId == null);
  const childrenOf = (id: number) => (cats ?? []).filter((c) => c.parentId === id);
  // Every level below a top-level category, flattened in order: the sidebar
  // shows them as one plain list under their bold parent, not as a tree.
  const descendantsOf = (id: number): typeof parents =>
    childrenOf(id).flatMap((k) => [k, ...descendantsOf(k.id)]);
  const rootOf = (id: number | undefined) => {
    let c = cats?.find((x) => x.id === id);
    while (c?.parentId != null) c = cats?.find((x) => x.id === c!.parentId);
    return c?.id;
  };
  const [collapsed, setCollapsed] = useState<Set<number>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]")); } catch { return new Set(); }
  });
  const toggle = (id: number) => setCollapsed((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...n])); } catch { /* per-browser nicety only */ }
    return n;
  });
  // The group holding the category being viewed is always shown open.
  const activeRoot = rootOf(category);
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 grid lg:grid-cols-[240px_1fr] gap-8">
      <aside className="space-y-1 text-sm">
        <p className="font-semibold mb-2">Categories</p>
        <button onClick={() => setParam("category", null)} className={`block w-full text-left px-3 py-1.5 rounded-lg ${!category ? "bg-brand-50 font-medium" : "hover:bg-stone-100"}`}>All products</button>
        {parents.map((c) => {
          const subs = descendantsOf(c.id);
          const open = subs.length > 0 && (!collapsed.has(c.id) || activeRoot === c.id);
          return (
            <div key={c.id}>
              <div className="flex items-center">
                <button onClick={() => setParam("category", String(c.id))} className={`flex-1 min-w-0 text-left px-3 py-1.5 rounded-lg font-semibold ${category === c.id ? "bg-brand-50" : "hover:bg-stone-100"}`}>
                  {c.name} <span className="font-normal text-stone-400">({c.productCount})</span>
                </button>
                {subs.length > 0 && (
                  <button onClick={() => toggle(c.id)} aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} ${c.name} subcategories`} className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100">
                    <ChevronDown className={`w-4 h-4 transition-transform ${open ? "" : "-rotate-90"}`} />
                  </button>
                )}
              </div>
              {open && subs.map((k) => (
                <button key={k.id} onClick={() => setParam("category", String(k.id))} className={`block w-full text-left pl-6 pr-3 py-1 rounded-lg ${category === k.id ? "bg-brand-50 font-medium text-ink" : "text-stone-600 hover:bg-stone-100"}`}>
                  {k.name}
                </button>
              ))}
            </div>
          );
        })}
      </aside>

      <div>
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <h1 className="text-2xl font-bold mr-auto flex items-center gap-3">
            {!q && current?.imageUrl && <img src={current.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover border border-stone-200" />}
            {q ? `Results for “${q}”` : current?.name ?? "All products"}
          </h1>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={inStock} onChange={(e) => setParam("inStock", e.target.checked ? "true" : null)} className="accent-brand" />
            In stock only
          </label>
          <select value={sort} onChange={(e) => setParam("sort", e.target.value)} className="h-9 rounded-lg border border-stone-300 bg-white px-2 text-sm">
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          {isFetching && <Loader2 className="w-4 h-4 animate-spin text-stone-400" />}
        </div>

        {isLoading ? (
          <div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>
        ) : !data || data.items.length === 0 ? (
          <div className="py-24 text-center text-stone-500">
            Nothing found. <Link href="/products" className="text-brand underline">See all products</Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-stone-500 mb-3">{data.total} item{data.total === 1 ? "" : "s"}</p>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {data.items.map((p) => <ProductCard key={p.id} p={p} />)}
            </div>
            {pages > 1 && (
              <div className="flex justify-center gap-2 mt-8">
                <button disabled={page <= 1} onClick={() => setParam("page", String(page - 1))} className="h-9 px-4 rounded-full border border-stone-300 disabled:opacity-40">Previous</button>
                <span className="h-9 px-3 flex items-center text-sm">Page {page} of {pages}</span>
                <button disabled={page >= pages} onClick={() => setParam("page", String(page + 1))} className="h-9 px-4 rounded-full border border-stone-300 disabled:opacity-40">Next</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
