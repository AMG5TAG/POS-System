import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Film, ImageOff, Play } from "lucide-react";
import type { MediaItem } from "@/lib/shop";

/* Product page gallery. Desktop: a vertical thumbnail strip beside the main
   image (arrows scroll it when there are more than fit); the main image zooms
   under the cursor, and prev/next arrows step through. Phones: the main image
   swipes, with the thumbnails in a row beneath. Videos — uploaded files or
   YouTube/Vimeo — play in place and are marked with a play badge. */

export function ProductGallery({ items, alt, children }: { items: MediaItem[]; alt: string; children?: React.ReactNode }) {
  const [index, setIndex] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const swipe = useRef<HTMLDivElement>(null);
  const count = items.length;
  const key = items.map((m) => m.url).join("|");

  useEffect(() => { setIndex(0); swipe.current?.scrollTo({ left: 0 }); }, [key]);
  const go = (i: number) => {
    const next = (i + count) % count;
    setIndex(next);
    // keep the thumbnail in view and the phone swiper in step
    strip.current?.querySelector<HTMLElement>(`[data-thumb="${next}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    const s = swipe.current;
    if (s && Math.round(s.scrollLeft / s.clientWidth) !== next) s.scrollTo({ left: next * s.clientWidth, behavior: "smooth" });
  };

  if (count === 0) {
    return (
      <div className="relative aspect-square rounded-2xl bg-white border border-stone-200 flex items-center justify-center text-stone-300">
        <ImageOff className="w-10 h-10" />{children}
      </div>
    );
  }

  const current = items[index] ?? items[0]!;
  const scrollStrip = (d: 1 | -1) => strip.current?.scrollBy({ top: d * 240, behavior: "smooth" });

  return (
    <div className="min-w-0 flex flex-col md:flex-row-reverse gap-3">
      {/* Main stage — desktop */}
      <div className="relative flex-1 min-w-0 hidden md:block">
        <div className="relative aspect-square rounded-2xl bg-white border border-stone-200 overflow-hidden">
          <Stage item={current} alt={alt} />
          {count > 1 && (
            <>
              <Arrow side="left" onClick={() => go(index - 1)} />
              <Arrow side="right" onClick={() => go(index + 1)} />
              <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 text-white text-xs px-2.5 py-1 tabular-nums">{index + 1} / {count}</span>
            </>
          )}
          {children}
        </div>
      </div>

      {/* Main stage — phones: swipe */}
      <div className="md:hidden relative">
        <div ref={swipe} onScroll={(e) => { const el = e.currentTarget; const i = Math.round(el.scrollLeft / el.clientWidth); if (i !== index) setIndex(i); }}
          className="flex overflow-x-auto snap-x snap-mandatory rounded-2xl border border-stone-200 bg-white [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((m, i) => (
            <div key={m.url} className="relative shrink-0 w-full aspect-square snap-center">
              <Stage item={m} alt={alt} active={i === index} zoom={false} />
            </div>
          ))}
        </div>
        {count > 1 && <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 text-white text-xs px-2.5 py-1 tabular-nums">{index + 1} / {count}</span>}
        {children}
      </div>

      {/* Thumbnails: vertical strip on desktop, a row on phones */}
      {count > 1 && (
        <div className="relative md:w-[76px] shrink-0 md:self-stretch">
          {count > 5 && <button onClick={() => scrollStrip(-1)} aria-label="Scroll thumbnails up" className="hidden md:flex absolute -top-1 inset-x-0 z-10 h-7 items-center justify-center bg-gradient-to-b from-stone-50 to-transparent text-stone-500 hover:text-ink"><ChevronUp className="w-5 h-5" /></button>}
          <div ref={strip} className={`flex md:flex-col gap-2 overflow-auto md:absolute md:inset-0 ${count > 5 ? "md:py-7" : ""} [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
            {items.map((m, i) => (
              <button key={m.url} data-thumb={i} onClick={() => go(i)} onMouseEnter={() => { if (m.type === "image") go(i); }}
                aria-label={`${m.type === "video" ? "Video" : "Image"} ${i + 1} of ${count}`} aria-current={i === index}
                className={`relative shrink-0 w-16 h-16 md:w-[76px] md:h-[76px] rounded-lg bg-white border-2 overflow-hidden transition ${i === index ? "border-brand" : "border-stone-200 hover:border-stone-400"}`}>
                <Thumb item={m} />
              </button>
            ))}
          </div>
          {count > 5 && <button onClick={() => scrollStrip(1)} aria-label="Scroll thumbnails down" className="hidden md:flex absolute -bottom-1 inset-x-0 z-10 h-7 items-center justify-center bg-gradient-to-t from-stone-50 to-transparent text-stone-500 hover:text-ink"><ChevronDown className="w-5 h-5" /></button>}
        </div>
      )}
    </div>
  );
}

function Arrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button onClick={onClick} aria-label={side === "left" ? "Previous" : "Next"}
      className={`absolute top-1/2 -translate-y-1/2 ${side === "left" ? "left-3" : "right-3"} z-10 w-10 h-10 rounded-full bg-white/90 shadow border border-stone-200 flex items-center justify-center hover:bg-white`}>
      <Icon className="w-5 h-5" />
    </button>
  );
}

function Thumb({ item }: { item: MediaItem }) {
  if (item.type === "image") return <img src={item.url} alt="" loading="lazy" className="kk-photo w-full h-full object-contain p-1" />;
  return (
    <>
      {item.thumbnail
        ? <img src={item.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover" />
        : item.provider === "file"
          ? <video src={`${item.url}#t=0.5`} preload="metadata" muted playsInline className="w-full h-full object-cover" />
          : <span className="w-full h-full flex items-center justify-center bg-stone-100 text-stone-400"><Film className="w-6 h-6" /></span>}
      <span className="absolute inset-0 flex items-center justify-center"><span className="w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center"><Play className="w-3.5 h-3.5 fill-white ml-0.5" /></span></span>
    </>
  );
}

/* One item on the main stage. Images zoom 2× under the cursor on desktop. */
function Stage({ item, alt, active = true, zoom = true }: { item: MediaItem; alt: string; active?: boolean; zoom?: boolean }) {
  const [origin, setOrigin] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); setOrigin(null); }, [item.url]);

  if (item.type === "video") {
    if (item.provider !== "file" && item.embedUrl) {
      // Mounted only while showing, so a video stops when you move on.
      return active
        ? <iframe src={item.embedUrl} title={`${alt} video`} className="absolute inset-0 w-full h-full" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        : <Thumb item={item} />;
    }
    return active
      ? <video key={item.url} src={item.url} controls playsInline preload="metadata" className="absolute inset-0 w-full h-full bg-black object-contain" />
      : <Thumb item={item} />;
  }
  if (failed) return <div className="absolute inset-0 flex items-center justify-center text-stone-300"><ImageOff className="w-10 h-10" /></div>;
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`);
  };
  return (
    <div className={`absolute inset-0 p-6 ${zoom ? "cursor-zoom-in" : ""}`} onMouseMove={zoom ? onMove : undefined} onMouseLeave={() => setOrigin(null)}>
      <img src={item.url} alt={alt} onError={() => setFailed(true)}
        className="kk-photo w-full h-full object-contain transition-transform duration-150 ease-out"
        style={zoom && origin ? { transform: "scale(2)", transformOrigin: origin } : undefined} />
    </div>
  );
}
