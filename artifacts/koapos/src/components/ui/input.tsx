import * as React from "react"

import { cn } from "@/lib/utils"
import { shouldAutoCapitalize, applyCapitalizeFirst, applyCapitalizeName } from "@/lib/auto-capitalize"

export interface InputProps extends React.ComponentProps<"input"> {
  /** Opt out of the app-wide auto-capitalise-first-letter behaviour. */
  noAutoCapitalize?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, noAutoCapitalize, onChange, ...props }, ref) => {
    const autoCap = !noAutoCapitalize && shouldAutoCapitalize(type, {
      name: props.name,
      id: props.id,
      autoComplete: props.autoComplete,
      inputMode: props.inputMode,
      placeholder: props.placeholder,
    })

    // `autoCapitalize="words"` is the standard attribute a name field already
    // wants, since it tells a phone or tablet keyboard to capitalise each word.
    // Honouring it here makes the same prop do the same thing on a desktop till.
    const applyCap =
      props.autoCapitalize === "words" ? applyCapitalizeName : applyCapitalizeFirst

    const handleChange = autoCap
      ? (e: React.ChangeEvent<HTMLInputElement>) => {
          applyCap(e.currentTarget)
          onChange?.(e)
        }
      : onChange

    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        onChange={handleChange}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
