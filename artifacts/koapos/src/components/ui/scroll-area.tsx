import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"

import { cn } from "@/lib/utils"

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={cn("relative overflow-hidden", className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
))
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" &&
        "h-full w-2.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" &&
        "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      className
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

/**
 * Radix gives the viewport's content wrapper `display:table; min-width:100%`.
 * A table box sizes to its content, and `truncate` (white-space:nowrap) makes a
 * row's min-content width the FULL untruncated string — so rows grow wider than
 * the ScrollArea, text never truncates, and anything pinned to the right of the
 * row (a badge, a total, a button) is pushed out and clipped.
 *
 * Add this to any ScrollArea whose children rely on `truncate` to fit. Forcing
 * the wrapper back to `block` makes rows respect the container width again.
 *
 * Do NOT add it to a deliberately horizontal scroller (e.g. a `flex w-max`
 * strip) — those need the wrapper to exceed the container.
 *
 * It is opt-in rather than the component default because the two usages that
 * must not have it (a horizontal strip, and a real `<table>` whose column
 * layout would change) would each need an escape hatch.
 */
export const SCROLL_AREA_TRUNCATE_FIX =
  "[&_[data-radix-scroll-area-viewport]>div]:!block"

export { ScrollArea, ScrollBar }
