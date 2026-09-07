import * as React from "react"

import { cn } from "@/lib/utils"
import { shouldAutoCapitalize, applyCapitalizeFirst, applyCapitalizeName } from "@/lib/auto-capitalize"
import { isPhoneField, applyPhoneFormat } from "@/lib/phone-format"

export interface InputProps extends React.ComponentProps<"input"> {
  /** Opt out of the app-wide auto-capitalise-first-letter behaviour. */
  noAutoCapitalize?: boolean
  /** Opt out of the app-wide "add the country code to a phone number" behaviour. */
  noPhoneFormat?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, noAutoCapitalize, noPhoneFormat, onChange, onBlur, ...props }, ref) => {
    const hints = {
      name: props.name,
      id: props.id,
      autoComplete: props.autoComplete,
      inputMode: props.inputMode,
      placeholder: props.placeholder,
    }

    const autoCap = !noAutoCapitalize && shouldAutoCapitalize(type, hints)

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

    // Phone numbers gain their country code when the field is left, not while it
    // is being typed: rewriting "04" to "+614" under the operator's cursor after
    // two characters would fight them for the rest of the number.
    const formatPhone = !noPhoneFormat && isPhoneField(type, hints)

    const handleBlur = formatPhone
      ? (e: React.FocusEvent<HTMLInputElement>) => {
          applyPhoneFormat(e.currentTarget)
          onBlur?.(e)
        }
      : onBlur

    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        onChange={handleChange}
        onBlur={handleBlur}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
