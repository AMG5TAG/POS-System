import * as React from "react"

import { cn } from "@/lib/utils"
import { applyCapitalizeFirst } from "@/lib/auto-capitalize"

export interface TextareaProps extends React.ComponentProps<"textarea"> {
  /** Opt out of the app-wide auto-capitalise-first-letter behaviour. */
  noAutoCapitalize?: boolean
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, noAutoCapitalize, onChange, ...props }, ref) => {
    const handleChange = noAutoCapitalize
      ? onChange
      : (e: React.ChangeEvent<HTMLTextAreaElement>) => {
          applyCapitalizeFirst(e.currentTarget)
          onChange?.(e)
        }

    return (
      <textarea
        className={cn(
          "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        onChange={handleChange}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
