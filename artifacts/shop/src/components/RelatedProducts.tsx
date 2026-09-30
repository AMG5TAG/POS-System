import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRelatedProducts } from "@/lib/shop";
import { ProductCard } from "./ProductCard";

/* "Related products" carousel under the product page: a scroll-snapping row
   that swipes on touch, with arrow buttons on wider screens. Hidden when the
   product has nothing related. */
export function RelatedProducts({ productId }: { productId: number }) {
  const { data } = useRelatedProducts(productId);
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const items = data?.items ?? [];

  const measure = () => {
    const el = track.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  };
  useEffect(() => {
    measure();
    track.current?.scrollTo({ left: 0 });
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [items.length, productId]);

  if (items.length === 0) return null;
  const page = (dir: 1 | -1) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
  };

  return (
    <section className="mt-14" aria-label="Related products">
      <div className="flex items-end justify-between mb-4">
        <h2 className="text-2xl font-bold">Related products</h2>
        <div className="hidden sm:flex gap-2">
          <button onClick={() => page(-1)} disabled={edges.start} aria-label="Previous" className="w-10 h-10 rounded-full border border-stone-300 flex items-center justify-center hover:border-brand disabled:opacity-30"><ChevronLeft className="w-5 h-5" /></button>
          <button onClick={() => page(1)} disabled={edges.end} aria-label="Next" className="w-10 h-10 rounded-full border border-stone-300 flex items-center justify-center hover:border-brand disabled:opacity-30"><ChevronRight className="w-5 h-5" /></button>
        </div>
      </div>
      <div ref={track} onScroll={measure} className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth scroll-px-4 pb-2 -mx-4 px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((p) => (
          <div key={p.id} className="snap-start shrink-0 w-[46%] sm:w-[31%] lg:w-[23%] xl:w-[18.5%] flex">
            <div className="w-full flex"><ProductCard p={p} /></div>
          </div>
        ))}
      </div>
    </section>
  );
}
