import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { useButtonStyle } from "@/lib/button-style"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0" +
" hover-elevate active-elevate-2",
  {
    variants: {
      variant: {
        default:
           // @replit: no hover, and add primary border
           "bg-primary text-primary-foreground border border-primary-border",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm border-destructive-border",
        outline:
          // @replit Shows the background color of whatever card / sidebar / accent background it is inside of.
          // Inherits the current text color. Uses shadow-xs. no shadow on active
          // No hover state
          " border [border-color:var(--button-outline)] shadow-xs active:shadow-none ",
        secondary:
          // @replit border, no hover, no shadow, secondary border.
          "border bg-secondary text-secondary-foreground border border-secondary-border ",
        // @replit no hover, transparent border
        ghost: "border border-transparent",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // Minimum 40px height for touch accessibility (WCAG 2.5.5)
        default: "min-h-10 px-4 py-2",
        sm: "min-h-8 rounded-md px-3 text-xs",
        lg: "min-h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const ICON_RE = /\bw-\d|\bw-\[/;

function applyButtonStyle(
  children: React.ReactNode,
  showIcon: boolean,
  showText: boolean,
): React.ReactNode {
  // Fast path: icon_text shows everything unchanged
  if (showIcon && showText) return children;

  // If the button contains no icon elements (e.g. Save / Submit / Cancel buttons),
  // leave it completely unchanged — hiding the text label would make it unusable.
  let hasIcon = false;
  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child)) {
      const cls = String((child.props as Record<string, unknown>).className ?? "");
      if (ICON_RE.test(cls) && /\bh-\d|\bh-\[/.test(cls) && !cls.includes("animate-spin")) {
        hasIcon = true;
      }
    }
  });
  if (!hasIcon) return children;

  return React.Children.map(children, (child) => {
    if (child == null || child === false || child === true) return child;
    // Plain text / number nodes → treat as label text
    if (typeof child === "string" || typeof child === "number") {
      return showText ? child : null;
    }
    if (React.isValidElement(child)) {
      const cls = String((child.props as Record<string, unknown>).className ?? "");
      // Lucide icons always carry both "w-*" and "h-*" sizing classes.
      // Loading spinners add "animate-spin" — always keep them so the user
      // knows the button is working even in text-only mode.
      const looksLikeIcon = ICON_RE.test(cls) && /\bh-\d|\bh-\[/.test(cls);
      if (looksLikeIcon && !cls.includes("animate-spin")) {
        return showIcon ? child : null;
      }
    }
    // Anything else (spans, divs, etc.) passes through untouched
    return child;
  });
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    const { showIcon, showText } = useButtonStyle()
    // Skip transformation for asChild (Slot merges props with a single child element)
    const content = asChild ? children : applyButtonStyle(children, showIcon, showText)
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      >
        {content}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
