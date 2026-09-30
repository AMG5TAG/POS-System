import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useAuth } from "./auth";
import type { ProductSummary } from "./shop";

type WishlistData = { ids: number[]; items: ProductSummary[] };
export const WISHLIST_KEY = ["shop-wishlist"];

/* The signed-in shopper's wishlist. Nothing is fetched for a guest, and
   `enabled` is false, so hearts never render for them. Toggling updates the
   hearts immediately and rolls back if the server refuses. */
export function useWishlist() {
  const { customer } = useAuth();
  const qc = useQueryClient();
  const enabled = !!customer;
  const { data } = useQuery({
    queryKey: [...WISHLIST_KEY, customer?.id],
    queryFn: () => api<WishlistData>("/shop/wishlist"),
    enabled,
    staleTime: 60_000,
  });
  const key = [...WISHLIST_KEY, customer?.id];

  const toggle = useMutation({
    mutationFn: ({ productId, save }: { productId: number; save: boolean }) =>
      api(`/shop/wishlist/${productId}`, { method: save ? "PUT" : "DELETE" }),
    onMutate: async ({ productId, save }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<WishlistData>(key);
      qc.setQueryData<WishlistData>(key, (old) => {
        const ids = (old?.ids ?? []).filter((id) => id !== productId);
        return { ids: save ? [productId, ...ids] : ids, items: save ? old?.items ?? [] : (old?.items ?? []).filter((p) => p.id !== productId) };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); },
    onSettled: () => { void qc.invalidateQueries({ queryKey: key }); },
  });

  const ids = new Set(data?.ids ?? []);
  return {
    enabled,
    items: data?.items ?? [],
    count: data?.ids.length ?? 0,
    has: (productId: number) => ids.has(productId),
    toggle: (productId: number) => toggle.mutate({ productId, save: !ids.has(productId) }),
  };
}
