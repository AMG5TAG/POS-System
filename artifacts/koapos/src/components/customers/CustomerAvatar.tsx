import { useState } from "react";
import { cn } from "@/lib/utils";
import { useCustomerSettings } from "@/lib/customer-settings";

interface CustomerAvatarProps {
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  /** The customer's own photo. When empty, the merchant's default customer image is used. */
  photoUrl?: string | null;
  /** Sizing (and any layout) classes for the avatar container, e.g. "w-9 h-9". */
  className?: string;
  /** Text-size class applied to the initials fallback, e.g. "text-xs". */
  textClassName?: string;
  variant?: "default" | "warning";
  /** Override the initials fallback text (e.g. "?"). */
  fallbackText?: string;
}

/**
 * Customer avatar with a three-step fallback: the customer's own `photoUrl`,
 * then the merchant's configured default customer image
 * (Management → Customers → Defaults), then their initials.
 */
export function CustomerAvatar({
  firstName,
  lastName,
  company,
  photoUrl,
  className,
  textClassName,
  variant = "default",
  fallbackText,
}: CustomerAvatarProps) {
  const { settings } = useCustomerSettings();
  // Track the specific src that failed so a later src change re-attempts the image.
  const [erroredSrc, setErroredSrc] = useState<string | null>(null);

  const src = photoUrl?.trim() || settings.defaultCustomerImageUrl?.trim() || "";
  const initials =
    fallbackText ??
    (((firstName?.[0] ?? "") + (lastName?.[0] ?? "")) || company?.[0] || "?").toUpperCase();

  if (src && erroredSrc !== src) {
    return (
      <div className={cn("rounded-full overflow-hidden bg-muted shrink-0", className)}>
        <img
          src={src}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setErroredSrc(src)}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-bold shrink-0",
        variant === "warning" ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary",
        className,
        textClassName,
      )}
    >
      {initials}
    </div>
  );
}
