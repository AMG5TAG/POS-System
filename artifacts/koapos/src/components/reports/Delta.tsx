import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/* A green/red change chip comparing a current value to a previous one, with an
   optional percent. Shared by the Overview and Sales Overview reports. */
export function Delta({ current, previous, prefix = "" }: { current: number; previous: number; prefix?: string }) {
  if (previous === 0 && current === 0) return <span className="text-muted-foreground font-medium">—</span>;
  const diff = current - previous;
  const pct = previous > 0 ? Math.abs((diff / previous) * 100).toFixed(0) : null;
  if (diff === 0) return (
    <span className="inline-flex items-center gap-0.5 text-muted-foreground font-medium">
      <Minus className="w-3 h-3" /> no change
    </span>
  );
  const positive = diff > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium", positive ? "text-emerald-600" : "text-red-500")}>
      {positive ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      {prefix}{Math.abs(diff).toLocaleString()}
      {pct && <span className="text-[10px] opacity-70 ml-0.5">({pct}%)</span>}
    </span>
  );
}
