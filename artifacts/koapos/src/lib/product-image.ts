import { useGetInventorySettings } from "@workspace/api-client-react";

/**
 * The fallback image configured in Management › Inventory › Default Product
 * Image, used anywhere a product has no image of its own. Returns "" when none
 * is set.
 */
export function useDefaultProductImage(): string {
  const { data } = useGetInventorySettings();
  return data?.defaultImageUrl ?? "";
}

/**
 * Resolve the image src to display for a product: its own image if present,
 * otherwise the configured default. Returns "" when neither exists (callers
 * then render their letter / icon placeholder).
 */
export function productImageSrc(
  imageUrl: string | null | undefined,
  defaultImageUrl: string | null | undefined,
): string {
  return (imageUrl && imageUrl.trim()) || (defaultImageUrl && defaultImageUrl.trim()) || "";
}
