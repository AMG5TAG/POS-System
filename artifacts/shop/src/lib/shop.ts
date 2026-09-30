import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export interface ShopInfo {
  businessName: string; logoUrl: string | null; tagline: string; description: string;
  phone: string | null; email: string | null; address: string | null; abn: string | null;
  openingHours: Record<string, unknown>; socialLinks: Record<string, string>;
}
export interface Category { id: number; name: string; parentId: number | null; color: string | null; imageUrl: string | null; productCount: number }
export interface ProductSummary {
  id: number; name: string; price: number; imageUrl: string | null; categoryId: number | null;
  brand: string | null; inStock: boolean; refurbished: boolean; isService: boolean;
}
export interface ProductDetail extends Omit<ProductSummary, "categoryId"> {
  description: string; sku: string | null;
  category: { id: number; name: string } | null;
  warranty: { duration: number; unit: string } | null;
  technicalSpecs: string;
  weightKg: number | null;
  dimensionsCm: { length: number | null; width: number | null; height: number | null } | null;
  rating: Rating;
  variants: { id: number; name: string; price: number; imageUrl: string | null; attributes: Record<string, string>; inStock: boolean }[];
}
export interface Rating { average: number | null; count: number }
export interface Review { id: number; author: string; rating: number; title: string; body: string; verified: boolean; createdAt: string }
export interface ReviewsResponse {
  rating: Rating;
  reviews: Review[];
  viewer: { signedIn: boolean; canReview: boolean; myReview: { rating: number; title: string; body: string } | null };
}
export interface ProductPage { total: number; page: number; pageSize: number; items: ProductSummary[] }

export const useShopInfo = () =>
  useQuery({ queryKey: ["shop-info"], queryFn: () => api<ShopInfo>("/shop/info"), staleTime: 5 * 60_000 });

export const useCategories = () =>
  useQuery({ queryKey: ["shop-categories"], queryFn: () => api<Category[]>("/shop/categories"), staleTime: 60_000 });

export interface ProductQuery { category?: number; search?: string; sort?: string; inStock?: boolean; page?: number; pageSize?: number }

export const useProducts = (q: ProductQuery) => {
  const params = new URLSearchParams();
  if (q.category) params.set("category", String(q.category));
  if (q.search) params.set("search", q.search);
  if (q.sort) params.set("sort", q.sort);
  if (q.inStock) params.set("inStock", "true");
  if (q.page) params.set("page", String(q.page));
  if (q.pageSize) params.set("pageSize", String(q.pageSize));
  return useQuery({
    queryKey: ["shop-products", params.toString()],
    queryFn: () => api<ProductPage>(`/shop/products?${params}`),
    placeholderData: (prev) => prev,
  });
};

export const useProduct = (id: number) =>
  useQuery({ queryKey: ["shop-product", id], queryFn: () => api<ProductDetail>(`/shop/products/${id}`), enabled: id > 0 });

export const useRelatedProducts = (id: number) =>
  useQuery({ queryKey: ["shop-related", id], queryFn: () => api<{ items: ProductSummary[] }>(`/shop/products/${id}/related`), enabled: id > 0 });

export const reviewsKey = (id: number) => ["shop-reviews", id];
export const useReviews = (id: number) =>
  useQuery({ queryKey: reviewsKey(id), queryFn: () => api<ReviewsResponse>(`/shop/products/${id}/reviews`), enabled: id > 0 });
