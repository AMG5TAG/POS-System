import { Link } from "wouter";
import { ArrowRight, Wrench, Truck, Store } from "lucide-react";
import { useCategories, useProducts, useShopInfo } from "@/lib/shop";
import { ProductCard } from "@/components/ProductCard";

export default function Home() {
  const { data: info } = useShopInfo();
  const { data: cats } = useCategories();
  const { data: latest } = useProducts({ sort: "newest", pageSize: 8 });
  const topCats = (cats ?? []).filter((c) => c.parentId == null);

  return (
    <div>
      <section className="bg-gradient-to-br from-brand-50 via-white to-brand-light/25 border-b border-stone-200">
        <div className="mx-auto max-w-7xl px-4 py-14 md:py-20 grid md:grid-cols-2 gap-10 items-center">
          <div className="space-y-5">
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">{info?.businessName ?? "Welcome"}</h1>
            <p className="text-lg text-stone-600 max-w-prose">{info?.tagline || info?.description || "Shop online and pick up in store or get it delivered."}</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/products" className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-brand text-white font-medium hover:bg-brand-dark">Shop now <ArrowRight className="w-4 h-4" /></Link>
              <Link href="/account" className="inline-flex items-center h-11 px-6 rounded-full border border-stone-300 font-medium hover:bg-stone-50">My account</Link>
            </div>
          </div>
          {info?.logoUrl && <img src={info.logoUrl} alt="" className="w-56 h-56 md:w-72 md:h-72 mx-auto object-contain" />}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 grid sm:grid-cols-3 gap-4 -mt-6">
        {[
          { icon: Store, title: "Click & collect", text: "Order online, pick up in store." },
          { icon: Truck, title: "Delivered", text: "Shipped Australia-wide." },
          { icon: Wrench, title: "Repairs & services", text: "Track your repairs in your account." },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-2xl bg-white border border-stone-200 p-5 flex gap-4 items-start shadow-sm">
            <Icon className="w-6 h-6 text-brand shrink-0" />
            <div><p className="font-semibold">{title}</p><p className="text-sm text-stone-600">{text}</p></div>
          </div>
        ))}
      </section>

      {topCats.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 mt-14">
          <h2 className="text-2xl font-bold mb-5">Shop by category</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {topCats.map((c) => (
              <Link key={c.id} href={`/products?category=${c.id}`}
                className="rounded-xl border border-stone-200 bg-white px-4 py-5 text-center font-medium hover:border-brand hover:shadow-sm transition"
                style={c.color ? { borderTopColor: c.color, borderTopWidth: 3 } : undefined}>
                {c.name}
                <span className="block text-xs text-stone-500 font-normal mt-1">{c.productCount} item{c.productCount === 1 ? "" : "s"}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {(latest?.items.length ?? 0) > 0 && (
        <section className="mx-auto max-w-7xl px-4 mt-14">
          <div className="flex items-end justify-between mb-5">
            <h2 className="text-2xl font-bold">New in</h2>
            <Link href="/products?sort=newest" className="text-sm font-medium text-brand hover:underline">View all</Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {latest!.items.map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
        </section>
      )}
    </div>
  );
}
