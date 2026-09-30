import { Star } from "lucide-react";

/** Read-only star rating; `value` may be fractional (average), shown to the nearest half. */
export function Stars({ value, className = "w-4 h-4" }: { value: number; className?: string }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = rounded >= n ? "full" : rounded >= n - 0.5 ? "half" : "none";
        return (
          <span key={n} className="relative inline-block">
            <Star className={`${className} text-stone-300`} />
            {fill !== "none" && (
              <span className="absolute inset-0 overflow-hidden" style={{ width: fill === "half" ? "50%" : "100%" }}>
                <Star className={`${className} text-amber-400 fill-amber-400`} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
