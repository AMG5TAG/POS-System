/**
 * Shared internals of the Online Store hub.
 *
 * The hub is four pages — Storefront, Design, Features, Domain — that all edit
 * one `online_store_settings` record. Everything they have in common lives
 * here: the settings shape and its API converters, the block library and its
 * preview/editor, and `useOnlineStore`, which owns the record itself (load,
 * local edits, debounced save) so a page never has to. Each page mounts its own
 * copy of the hook — only one is on screen at a time.
 *
 * The public storefront (`pages/marketing/online-store-public`) renders saved
 * blocks with the same `BlockPreview` and types, which is why they are exported
 * rather than kept private to the editor.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Store, Gift, QrCode, MapPin, Star, Mail, ChevronRight, CheckCircle2,
  Palette, FileText, Package, Sparkles, Phone, Clock, Layers, Trash2,
  Type as TypeIcon, Image as ImageIcon, Layout, ShoppingBag, Eye, EyeOff, GripVertical,
  Play, MessageSquare, HelpCircle, Columns3, Timer, Share2, Map as MapIcon, DollarSign,
  AppWindow, Menu as MenuIcon, Code2,
} from "lucide-react";
import {
  useGetOnlineStoreSettings,
  useUpsertOnlineStoreSettings,
} from "@workspace/api-client-react";
import DOMPurify from "dompurify";
import { useQueryClient } from "@tanstack/react-query";

/* ─── Types ──────────────────────────────────────────────────────────────── */

export type StoreMode = "builder" | "thirdparty";

export interface ThemeSettings {
  primary: string; accent: string; bg: string; text: string;
  font: "sans" | "serif" | "mono"; radius: "none" | "sm" | "md" | "lg";
  /** Default layout applied to every product page when a customer views a product. */
  productLayout?: "standard" | "gallery" | "compact";
}

export const PRODUCT_LAYOUTS = [
  { value: "standard", label: "Standard", hint: "Image left, details right" },
  { value: "gallery",  label: "Gallery",  hint: "Large image on top, details below" },
  { value: "compact",  label: "Compact",  hint: "Small image, condensed details" },
] as const;

export interface FooterSettings {
  enabled: boolean;
  text: string;        // free blurb / copyright line
  linksRaw: string;    // one "Label | /url" per line
  email: string;
  phone: string;
  facebook: string;
  instagram: string;
  twitter: string;
}

export const DEFAULT_FOOTER: FooterSettings = {
  enabled: false, text: "", linksRaw: "", email: "", phone: "", facebook: "", instagram: "", twitter: "",
};

export interface SiteSettings {
  mode: StoreMode; storeName: string; tagline: string; logoUrl: string;
  faviconUrl: string; domain: string; published: boolean;
  theme: ThemeSettings;
  payments: { stripe: boolean; paypal: boolean; afterpay: boolean; applePay: boolean };
  features: { loyalty: boolean; customers: boolean; checkout: boolean; quickCodes: boolean; reviews: boolean; newsletter: boolean };
  pages: Page[]; quickCodes: QuickCode[];
  footer: FooterSettings;
}

export interface Page {
  id: string; name: string; slug: string; visible: boolean; blocks: Block[];
  /* SEO & page settings (optional — round-tripped inside the pages JSON blob). */
  seoTitle?: string; seoDescription?: string; shareImage?: string; publishAt?: string;
}

export interface Block {
  id: string; type: BlockType; data: Record<string, string | number | boolean>;
}

export type BlockType =
  | "hero" | "heading" | "text" | "image" | "product-grid" | "featured-product"
  | "gallery" | "cta" | "newsletter" | "contact" | "spacer" | "loyalty-banner" | "quick-code"
  | "video" | "testimonials" | "faq" | "columns" | "countdown" | "social" | "map" | "pricing"
  | "html" | "iframe" | "similar-products" | "menu" | "product-category";

export interface QuickCode { id: string; code: string; label: string; url: string; }

export interface BlockMeta {
  type: BlockType; label: string; icon: React.ComponentType<{ className?: string }>;
  description: string; defaultData: Record<string, string | number | boolean>;
}

export interface ThirdParty {
  providerId: string; storeUrl: string; apiKey: string; connected: boolean; connectedAt: string;
}

/* ─── Constants ──────────────────────────────────────────────────────────── */

export const BLOCK_LIBRARY: BlockMeta[] = [
  { type: "hero",             label: "Hero Banner",       icon: Layout,       description: "Full-width header with image, headline and CTA",          defaultData: { headline: "Welcome to our store", subhead: "Discover what we have to offer", cta: "Shop now", ctaLink: "/shop", imageUrl: "" } },
  { type: "heading",          label: "Heading",           icon: TypeIcon,     description: "Section title",                                            defaultData: { text: "Section Heading", size: "lg", align: "left" } },
  { type: "text",             label: "Text Block",        icon: FileText,     description: "Paragraph copy",                                           defaultData: { text: "Add your content here. Tell your customers what makes your store special." } },
  { type: "image",            label: "Image",             icon: ImageIcon,    description: "Single image",                                              defaultData: { url: "", alt: "Image", caption: "" } },
  { type: "product-grid",     label: "Product Grid",      icon: Package,      description: "Grid of products from your catalogue",                     defaultData: { columns: 4, count: 8, category: "all" } },
  { type: "featured-product", label: "Featured Product",  icon: Star,         description: "Highlight a single product",                               defaultData: { productSku: "", layout: "right" } },
  { type: "gallery",          label: "Image Gallery",     icon: Layers,       description: "Grid of images",                                            defaultData: { columns: 3 } },
  { type: "cta",              label: "Call to Action",    icon: ChevronRight, description: "Banner with button",                                       defaultData: { headline: "Ready to start?", text: "Take the next step", buttonText: "Get started", buttonLink: "/contact" } },
  { type: "newsletter",       label: "Newsletter",        icon: Mail,         description: "Email signup form",                                         defaultData: { headline: "Stay in the loop", text: "Sign up for new arrivals and special offers" } },
  { type: "contact",          label: "Contact Info",      icon: Phone,        description: "Business contact details",                                  defaultData: { phone: "", email: "", address: "", hours: "" } },
  { type: "spacer",           label: "Spacer",            icon: GripVertical, description: "Vertical spacing",                                          defaultData: { height: 48 } },
  { type: "loyalty-banner",   label: "Loyalty Promo",     icon: Gift,         description: "Promote your loyalty program",                              defaultData: { headline: "Join our rewards program", text: "Earn points on every purchase", points: 100 } },
  { type: "quick-code",       label: "Quick Code",        icon: QrCode,       description: "Embed a QR code or short URL",                              defaultData: { code: "" } },
  { type: "video",            label: "Video",             icon: Play,         description: "Embed a YouTube or Vimeo video",                           defaultData: { url: "", caption: "" } },
  { type: "testimonials",     label: "Testimonials",      icon: MessageSquare,description: "Customer quotes / reviews",                                defaultData: { quote1: "Fantastic service and quality!", author1: "Happy Customer", quote2: "I'll definitely be back.", author2: "Local Regular", quote3: "", author3: "" } },
  { type: "faq",              label: "FAQ / Accordion",   icon: HelpCircle,   description: "Expandable question & answer list",                        defaultData: { q1: "What are your hours?", a1: "We're open 9–5, Mon–Sat.", q2: "Do you offer delivery?", a2: "Yes, within the local area.", q3: "", a3: "" } },
  { type: "columns",          label: "Columns",           icon: Columns3,     description: "Multi-column text layout",                                 defaultData: { columns: 3, col1: "Quality first", col2: "Fast service", col3: "Local & trusted", col4: "" } },
  { type: "countdown",        label: "Countdown Timer",   icon: Timer,        description: "Count down to a date (e.g. a sale)",                        defaultData: { headline: "Sale ends in", target: "" } },
  { type: "social",           label: "Social Icons",      icon: Share2,       description: "Links to your social profiles",                            defaultData: { facebook: "", instagram: "", twitter: "", tiktok: "", youtube: "" } },
  { type: "map",              label: "Map",               icon: MapIcon,      description: "Embedded map of your location",                            defaultData: { address: "", zoom: 14 } },
  { type: "pricing",          label: "Pricing Table",     icon: DollarSign,   description: "Compare plans or packages",                                defaultData: { name1: "Basic", price1: "$9", features1: "Feature A, Feature B", name2: "Pro", price2: "$29", features2: "Everything in Basic, Feature C, Feature D", name3: "", price3: "", features3: "" } },
  { type: "html",             label: "Custom HTML",       icon: Code2,        description: "Paste your own raw HTML",                                  defaultData: { html: "<div style=\"padding:24px;text-align:center;font-weight:600\">Your custom HTML here</div>" } },
  { type: "iframe",           label: "iFrame Embed",      icon: AppWindow,    description: "Embed an external page or widget by URL",                  defaultData: { url: "", height: 400, title: "Embedded content" } },
  { type: "similar-products", label: "Similar Products",  icon: ShoppingBag,  description: "Show products related to one item",                        defaultData: { headline: "You may also like", productSku: "", count: 4 } },
  { type: "menu",             label: "Menu",              icon: MenuIcon,     description: "A food / service menu list with prices",                   defaultData: { headline: "Menu", items: "Flat White | $4.50\nMuffin | $5.00\nToasted Sandwich | $9.00" } },
  { type: "product-category", label: "Product Category",  icon: Layers,       description: "Grid of products from a chosen category",                  defaultData: { headline: "Shop the range", category: "all", columns: 4, count: 8 } },
];

export const FONT_OPTIONS = [
  { value: "sans",  label: "Sans Serif (Modern)" },
  { value: "serif", label: "Serif (Elegant)" },
  { value: "mono",  label: "Monospace (Tech)" },
] as const;

/* The store theme only supports three font families, while Business Details
 * stores a specific brand font name. Classify the brand font into the closest
 * category so "Import from Business" can carry the font across. */
export function brandFontToCategory(name: string): "sans" | "serif" | "mono" {
  const f = name.toLowerCase();
  if (/mono|courier|code|consol/.test(f)) return "mono";
  if (!/sans/.test(f) && /serif|times|georgia|merriweather|playfair|lora|garamond|slab|baskerville/.test(f)) return "serif";
  return "sans";
}

export const RADIUS_OPTIONS = [
  { value: "none", label: "Square" },
  { value: "sm",   label: "Subtle" },
  { value: "md",   label: "Rounded" },
  { value: "lg",   label: "Pill" },
] as const;

export const COLOUR_PRESETS = [
  { name: "Coastal",  primary: "#0EA5E9", accent: "#06B6D4", bg: "#F8FAFC", text: "#0F172A" },
  { name: "Outback",  primary: "#D97706", accent: "#92400E", bg: "#FFFBEB", text: "#1F2937" },
  { name: "Eucalypt", primary: "#10B981", accent: "#059669", bg: "#F0FDF4", text: "#111827" },
  { name: "Galah",    primary: "#EC4899", accent: "#BE185D", bg: "#FDF2F8", text: "#1F2937" },
  { name: "Midnight", primary: "#6366F1", accent: "#4338CA", bg: "#0F172A", text: "#F8FAFC" },
  { name: "Pearl",    primary: "#111827", accent: "#374151", bg: "#FFFFFF", text: "#0F172A" },
];

export const DEFAULT_SITE: SiteSettings = {
  mode: "builder", storeName: "", tagline: "", logoUrl: "", faviconUrl: "", domain: "", published: false,
  theme: { primary: "#0EA5E9", accent: "#06B6D4", bg: "#F8FAFC", text: "#0F172A", font: "sans", radius: "md", productLayout: "standard" },
  payments: { stripe: false, paypal: false, afterpay: false, applePay: false },
  features: { loyalty: false, customers: false, checkout: true, quickCodes: false, reviews: false, newsletter: false },
  pages: [{ id: "p-home", name: "Home", slug: "/", visible: true, blocks: [] }],
  quickCodes: [],
  footer: { ...DEFAULT_FOOTER },
};

export const THIRDPARTY_PROVIDERS = [
  { id: "shopify",     name: "Shopify",          tagline: "All-in-one ecommerce",          color: "#96BF47" },
  { id: "woocommerce", name: "WooCommerce",       tagline: "WordPress ecommerce plugin",    color: "#7F54B3" },
  { id: "bigcommerce", name: "BigCommerce",       tagline: "Enterprise-grade ecommerce",    color: "#121118" },
  { id: "squarespace", name: "Squarespace",       tagline: "Design-led websites & stores",  color: "#000000" },
  { id: "wix",         name: "Wix",              tagline: "Drag-and-drop site builder",    color: "#0C6EFC" },
  { id: "neto",        name: "Maropost (Neto)",  tagline: "Australian ecommerce platform", color: "#FF6A13" },
];

/* ─── API converters ─────────────────────────────────────────────────────── */

export function apiToSite(r: Record<string, unknown>): SiteSettings {
  let pages: Page[] = DEFAULT_SITE.pages;
  let theme: ThemeSettings = { ...DEFAULT_SITE.theme };
  let payments = { ...DEFAULT_SITE.payments };
  let features = { ...DEFAULT_SITE.features };
  let quickCodes: QuickCode[] = [];
  let footer: FooterSettings = { ...DEFAULT_FOOTER };
  try { if (r.pages)      pages      = JSON.parse(r.pages as string);                                    } catch { /* ignore */ }
  try { if (r.theme)      theme      = { ...DEFAULT_SITE.theme, ...JSON.parse(r.theme as string) };      } catch { /* ignore */ }
  try { if (r.payments)   payments   = { ...DEFAULT_SITE.payments, ...JSON.parse(r.payments as string) };} catch { /* ignore */ }
  try { if (r.features)   features   = { ...DEFAULT_SITE.features, ...JSON.parse(r.features as string) };} catch { /* ignore */ }
  try { if (r.quickCodes) quickCodes = JSON.parse(r.quickCodes as string);                               } catch { /* ignore */ }
  try { if (r.footer)     footer     = { ...DEFAULT_FOOTER, ...JSON.parse(r.footer as string) };         } catch { /* ignore */ }
  return {
    mode:       (String(r.mode      ?? "builder")) as StoreMode,
    storeName:  String(r.storeName  ?? ""),
    tagline:    String(r.tagline    ?? ""),
    logoUrl:    String(r.logoUrl    ?? ""),
    faviconUrl: String(r.faviconUrl ?? ""),
    domain:     String(r.domain     ?? ""),
    published:  String(r.published) === "true",
    theme, payments, features, pages, quickCodes, footer,
  };
}

export function siteToApi(s: SiteSettings): Record<string, unknown> {
  return {
    mode: s.mode, storeName: s.storeName, tagline: s.tagline,
    logoUrl: s.logoUrl, faviconUrl: s.faviconUrl, domain: s.domain,
    published: s.published ? "true" : "false",
    theme:      JSON.stringify(s.theme),
    payments:   JSON.stringify(s.payments),
    features:   JSON.stringify(s.features),
    pages:      JSON.stringify(s.pages),
    quickCodes: JSON.stringify(s.quickCodes),
    footer:     JSON.stringify(s.footer),
  };
}

/* ─── Starter templates ──────────────────────────────────────────────────────
 * One-click page layouts. Blocks carry no id; applyTemplate clones them with
 * fresh ids onto the active page. Data keys mirror each block's defaultData. */
export interface PageTemplate { id: string; name: string; description: string; blocks: { type: BlockType; data: Record<string, string | number | boolean> }[]; }

/** A reusable block the merchant saved to their library (localStorage-backed). */
export interface SavedSection { id: string; name: string; block: Block; }

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "tpl-shop-home", name: "Shop Home", description: "Hero, featured products and a full product grid — a classic storefront landing page.",
    blocks: [
      { type: "hero",         data: { headline: "Welcome to our store", subhead: "Quality products, delivered to your door", cta: "Shop now", ctaLink: "#products", imageUrl: "" } },
      { type: "heading",      data: { text: "Featured", size: "lg", align: "center" } },
      { type: "product-grid", data: { columns: 4, count: 4, category: "all", search: false } },
      { type: "heading",      data: { text: "Shop everything", size: "lg", align: "left" } },
      { type: "product-grid", data: { columns: 4, count: 12, category: "all", search: true } },
      { type: "newsletter",   data: { headline: "Stay in the loop", text: "Sign up for new arrivals and special offers" } },
    ],
  },
  {
    id: "tpl-single-product", name: "Single Product", description: "Spotlight one hero product with social proof and FAQs.",
    blocks: [
      { type: "featured-product", data: { productSku: "", layout: "right" } },
      { type: "testimonials",     data: { quote1: "Absolutely love it!", author1: "Verified Buyer", quote2: "Worth every cent.", author2: "Repeat Customer", quote3: "", author3: "" } },
      { type: "faq",              data: { q1: "How long is delivery?", a1: "2–5 business days.", q2: "What's your return policy?", a2: "30-day no-questions returns.", q3: "", a3: "" } },
      { type: "similar-products", data: { headline: "You may also like", productSku: "", count: 4 } },
    ],
  },
  {
    id: "tpl-about", name: "About / Contact", description: "Tell your story and make it easy to get in touch.",
    blocks: [
      { type: "heading", data: { text: "Our story", size: "xl", align: "center" } },
      { type: "text",    data: { text: "Share what makes your business special — your history, your values, and why customers love you." } },
      { type: "columns", data: { columns: 3, col1: "Locally owned", col2: "Quality guaranteed", col3: "Friendly service", col4: "" } },
      { type: "contact", data: { phone: "", email: "", address: "", hours: "Mon–Sat, 9–5" } },
      { type: "map",     data: { address: "", zoom: 14 } },
    ],
  },
  {
    id: "tpl-promo", name: "Promotion / Sale", description: "Drive urgency with a countdown, a CTA and the products on sale.",
    blocks: [
      { type: "hero",         data: { headline: "Big Sale Now On", subhead: "Limited time only — don't miss out", cta: "Shop the sale", ctaLink: "#products", imageUrl: "" } },
      { type: "countdown",    data: { headline: "Sale ends in", target: "" } },
      { type: "product-grid", data: { columns: 4, count: 8, category: "all", search: false } },
      { type: "cta",          data: { headline: "Ready to save?", text: "These prices won't last", buttonText: "Browse deals", buttonLink: "#products" } },
    ],
  },
];

export function apiToThirdParty(r: Record<string, unknown>): ThirdParty | null {
  if (!r || !r.providerId) return null;
  return {
    providerId:  String(r.providerId  ?? ""),
    storeUrl:    String(r.storeUrl    ?? ""),
    apiKey:      String(r.apiKey      ?? ""),
    connected:   String(r.connected)  === "true",
    connectedAt: String(r.connectedAt ?? new Date().toISOString()),
  };
}

/* ─── Block preview ──────────────────────────────────────────────────────── */

export function BlockPreview({ block, theme }: { block: Block; theme: ThemeSettings }) {
  const radiusClass = { none: "rounded-none", sm: "rounded", md: "rounded-lg", lg: "rounded-full" }[theme.radius];
  switch (block.type) {
    case "hero":
      return (
        <div className="p-6 md:p-10 flex flex-col items-start gap-3" style={{ background: `linear-gradient(135deg, ${theme.primary}22, ${theme.accent}22)` }}>
          <h2 className="text-2xl md:text-3xl font-bold" style={{ color: theme.text }}>{String(block.data.headline)}</h2>
          <p className="text-sm md:text-base opacity-80" style={{ color: theme.text }}>{String(block.data.subhead)}</p>
          <button className={cn("px-4 py-2 text-sm font-semibold text-white", radiusClass)} style={{ backgroundColor: theme.primary }}>{String(block.data.cta)}</button>
        </div>
      );
    case "heading":
      return (
        <div className={cn("py-2", block.data.align === "center" ? "text-center" : block.data.align === "right" ? "text-right" : "text-left")}>
          <h3 className={cn("font-bold", block.data.size === "xl" ? "text-2xl" : block.data.size === "lg" ? "text-xl" : "text-base")} style={{ color: theme.text }}>{String(block.data.text)}</h3>
        </div>
      );
    case "text": return <p className="text-sm leading-relaxed" style={{ color: theme.text }}>{String(block.data.text)}</p>;
    case "image":
      return (
        <div className={cn("bg-muted aspect-video flex items-center justify-center overflow-hidden", radiusClass)}>
          {block.data.url ? <img src={String(block.data.url)} alt={String(block.data.alt || "")} className="w-full h-full object-cover" /> : <ImageIcon className="w-10 h-10 text-muted-foreground/40" />}
        </div>
      );
    case "product-grid": {
      const cols = Number(block.data.columns) || 4;
      const count = Number(block.data.count) || 8;
      return (
        <div className={cn("grid gap-2", cols === 2 ? "grid-cols-2" : cols === 3 ? "grid-cols-3" : "grid-cols-4")}>
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className={cn("aspect-square bg-muted/60 flex flex-col items-center justify-center p-2", radiusClass)}>
              <Package className="w-5 h-5 text-muted-foreground/50" />
              <span className="text-[10px] mt-1 text-muted-foreground">Product {i + 1}</span>
            </div>
          ))}
        </div>
      );
    }
    case "featured-product":
      return (
        <div className={cn("flex gap-4 p-4 bg-muted/30 items-center", radiusClass)}>
          <div className={cn("w-24 h-24 bg-muted flex items-center justify-center shrink-0", radiusClass)}><Package className="w-8 h-8 text-muted-foreground/40" /></div>
          <div className="flex-1"><p className="font-semibold text-sm">Featured Product</p><p className="text-xs text-muted-foreground mt-1">Highlighted item from your catalogue</p>
            <button className={cn("mt-2 px-3 py-1 text-xs font-semibold text-white", radiusClass)} style={{ backgroundColor: theme.primary }}>View product</button>
          </div>
        </div>
      );
    case "gallery": {
      const cols = Number(block.data.columns) || 3;
      return (
        <div className={cn("grid gap-1.5", cols === 2 ? "grid-cols-2" : cols === 4 ? "grid-cols-4" : "grid-cols-3")}>
          {Array.from({ length: cols * 2 }).map((_, i) => (
            <div key={i} className={cn("aspect-square bg-muted/60 flex items-center justify-center", radiusClass)}><ImageIcon className="w-4 h-4 text-muted-foreground/40" /></div>
          ))}
        </div>
      );
    }
    case "cta":
      return (
        <div className={cn("p-6 flex flex-col items-center gap-2 text-center", radiusClass)} style={{ backgroundColor: `${theme.primary}15` }}>
          <h3 className="text-lg font-bold" style={{ color: theme.text }}>{String(block.data.headline)}</h3>
          <p className="text-sm opacity-70" style={{ color: theme.text }}>{String(block.data.text)}</p>
          <button className={cn("px-4 py-2 text-sm font-semibold text-white mt-1", radiusClass)} style={{ backgroundColor: theme.primary }}>{String(block.data.buttonText)}</button>
        </div>
      );
    case "newsletter":
      return (
        <div className={cn("p-5 text-center", radiusClass)} style={{ backgroundColor: `${theme.accent}15` }}>
          <h3 className="text-base font-semibold" style={{ color: theme.text }}>{String(block.data.headline)}</h3>
          <p className="text-xs opacity-70 mt-1 mb-3" style={{ color: theme.text }}>{String(block.data.text)}</p>
          <div className="flex gap-2 max-w-sm mx-auto">
            <input placeholder="you@email.com" className={cn("flex-1 px-3 py-1.5 text-sm border bg-background", radiusClass)} />
            <button className={cn("px-3 py-1.5 text-xs font-semibold text-white", radiusClass)} style={{ backgroundColor: theme.primary }}>Subscribe</button>
          </div>
        </div>
      );
    case "contact":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm" style={{ color: theme.text }}>
          {block.data.phone   ? <div className="flex items-center gap-2"><Phone  className="w-3.5 h-3.5 opacity-60" />{String(block.data.phone)}</div>   : null}
          {block.data.email   ? <div className="flex items-center gap-2"><Mail   className="w-3.5 h-3.5 opacity-60" />{String(block.data.email)}</div>   : null}
          {block.data.address ? <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 opacity-60" />{String(block.data.address)}</div> : null}
          {block.data.hours   ? <div className="flex items-center gap-2"><Clock  className="w-3.5 h-3.5 opacity-60" />{String(block.data.hours)}</div>   : null}
        </div>
      );
    case "spacer": return <div style={{ height: Number(block.data.height) || 48 }} className="border-l-2 border-dashed border-muted/40 ml-2" />;
    case "loyalty-banner":
      return (
        <div className={cn("p-4 flex items-center gap-3", radiusClass)} style={{ backgroundColor: `${theme.primary}1a` }}>
          <Gift className="w-6 h-6 shrink-0" style={{ color: theme.primary }} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm" style={{ color: theme.text }}>{String(block.data.headline)}</p>
            <p className="text-xs opacity-70 truncate" style={{ color: theme.text }}>{String(block.data.text)}</p>
          </div>
          <Badge className="shrink-0">+{Number(block.data.points)} pts</Badge>
        </div>
      );
    case "quick-code":
      return (
        <div className={cn("inline-flex items-center gap-2 px-3 py-2 bg-muted/40 border", radiusClass)}>
          <QrCode className="w-4 h-4" style={{ color: theme.primary }} />
          <code className="text-xs font-mono">{String(block.data.code) || "SAMPLE"}</code>
        </div>
      );
    case "video":
      return (
        <div className="space-y-1.5">
          <div className={cn("aspect-video bg-muted flex items-center justify-center", radiusClass)}>
            <Play className="w-8 h-8 text-muted-foreground/50" />
          </div>
          {block.data.caption ? <p className="text-xs text-center opacity-60" style={{ color: theme.text }}>{String(block.data.caption)}</p> : null}
        </div>
      );
    case "testimonials": {
      const items = [1, 2, 3].map((n) => ({ quote: String(block.data[`quote${n}`] ?? ""), author: String(block.data[`author${n}`] ?? "") })).filter((t) => t.quote);
      return (
        <div className={cn("grid gap-3", items.length >= 3 ? "sm:grid-cols-3" : items.length === 2 ? "sm:grid-cols-2" : "grid-cols-1")}>
          {items.map((t, i) => (
            <div key={i} className={cn("p-4 bg-muted/40 text-sm", radiusClass)} style={{ color: theme.text }}>
              <p className="italic">“{t.quote}”</p>
              <p className="text-xs font-semibold mt-2 opacity-70">— {t.author}</p>
            </div>
          ))}
        </div>
      );
    }
    case "faq": {
      const items = [1, 2, 3].map((n) => ({ q: String(block.data[`q${n}`] ?? ""), a: String(block.data[`a${n}`] ?? "") })).filter((f) => f.q);
      return (
        <div className="space-y-2">
          {items.map((f, i) => (
            <div key={i} className={cn("border p-3", radiusClass)} style={{ color: theme.text }}>
              <p className="text-sm font-semibold flex items-center justify-between">{f.q}<ChevronRight className="w-3.5 h-3.5 opacity-50" /></p>
              <p className="text-xs opacity-70 mt-1">{f.a}</p>
            </div>
          ))}
        </div>
      );
    }
    case "columns": {
      const n = Math.max(2, Math.min(4, Number(block.data.columns) || 3));
      const cols = [1, 2, 3, 4].slice(0, n).map((k) => String(block.data[`col${k}`] ?? "")).filter(Boolean);
      return (
        <div className={cn("grid gap-3", n === 2 ? "sm:grid-cols-2" : n === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
          {cols.map((c, i) => <div key={i} className="text-sm text-center opacity-80" style={{ color: theme.text }}>{c}</div>)}
        </div>
      );
    }
    case "countdown":
      return (
        <div className={cn("p-5 text-center", radiusClass)} style={{ backgroundColor: `${theme.primary}15` }}>
          <p className="text-sm font-semibold mb-2" style={{ color: theme.text }}>{String(block.data.headline) || "Countdown"}</p>
          <div className="flex justify-center gap-3">
            {["Days", "Hrs", "Min", "Sec"].map((u) => (
              <div key={u} className={cn("px-3 py-2 bg-background border", radiusClass)}>
                <p className="text-lg font-bold tabular-nums" style={{ color: theme.primary }}>00</p>
                <p className="text-[9px] uppercase opacity-60" style={{ color: theme.text }}>{u}</p>
              </div>
            ))}
          </div>
        </div>
      );
    case "social": {
      const links = [
        { k: "facebook", label: "Facebook" }, { k: "instagram", label: "Instagram" },
        { k: "twitter", label: "X" }, { k: "tiktok", label: "TikTok" }, { k: "youtube", label: "YouTube" },
      ].filter((l) => block.data[l.k]);
      return (
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {(links.length ? links : [{ k: "x", label: "Social" }]).map((l) => (
            <div key={l.k} className={cn("w-9 h-9 flex items-center justify-center", radiusClass)} style={{ backgroundColor: `${theme.primary}1a` }}>
              <Share2 className="w-4 h-4" style={{ color: theme.primary }} />
            </div>
          ))}
        </div>
      );
    }
    case "map":
      return (
        <div className={cn("aspect-[16/7] bg-muted flex flex-col items-center justify-center gap-1", radiusClass)} style={{ color: theme.text }}>
          <MapIcon className="w-7 h-7 opacity-40" />
          <p className="text-xs opacity-60">{String(block.data.address) || "Your location"}</p>
        </div>
      );
    case "pricing": {
      const plans = [1, 2, 3].map((n) => ({
        name: String(block.data[`name${n}`] ?? ""), price: String(block.data[`price${n}`] ?? ""),
        features: String(block.data[`features${n}`] ?? "").split(",").map((f) => f.trim()).filter(Boolean),
      })).filter((p) => p.name);
      return (
        <div className={cn("grid gap-3", plans.length >= 3 ? "sm:grid-cols-3" : plans.length === 2 ? "sm:grid-cols-2" : "grid-cols-1")}>
          {plans.map((p, i) => (
            <div key={i} className={cn("border p-4 text-center", radiusClass)} style={{ color: theme.text }}>
              <p className="text-sm font-semibold">{p.name}</p>
              <p className="text-xl font-bold my-1" style={{ color: theme.primary }}>{p.price}</p>
              <ul className="text-xs opacity-70 space-y-0.5">{p.features.map((f, j) => <li key={j}>{f}</li>)}</ul>
            </div>
          ))}
        </div>
      );
    }
    case "html":
      return <div className={cn("overflow-hidden", radiusClass)} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(String(block.data.html ?? "")) }} />;
    case "iframe":
      return block.data.url ? (
        <iframe
          src={String(block.data.url)} title={String(block.data.title ?? "Embedded content")}
          height={Number(block.data.height) || 400}
          className={cn("w-full border-0", radiusClass)} loading="lazy"
        />
      ) : (
        <div className={cn("flex flex-col items-center justify-center gap-1 bg-muted py-10", radiusClass)} style={{ color: theme.text }}>
          <AppWindow className="w-7 h-7 opacity-40" /><p className="text-xs opacity-60">Add an embed URL</p>
        </div>
      );
    case "similar-products": {
      const cols = Math.max(2, Math.min(4, Number(block.data.count) || 4));
      return (
        <div className="space-y-2">
          {block.data.headline ? <p className="text-sm font-semibold" style={{ color: theme.text }}>{String(block.data.headline)}</p> : null}
          <div className={cn("grid gap-2", cols === 2 ? "grid-cols-2" : cols === 3 ? "grid-cols-3" : "grid-cols-4")}>
            {Array.from({ length: cols }).map((_, i) => (
              <div key={i} className={cn("border overflow-hidden", radiusClass)}>
                <div className="aspect-square bg-muted/60 flex items-center justify-center"><ShoppingBag className="w-4 h-4 text-muted-foreground/40" /></div>
                <div className="p-1.5"><div className="h-2 w-3/4 bg-muted rounded mb-1" /><div className="h-2 w-1/3 bg-muted rounded" /></div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "menu": {
      const rows = String(block.data.items ?? "").split("\n").map((l) => l.trim()).filter(Boolean)
        .map((l) => { const [name, price] = l.split("|").map((s) => s.trim()); return { name: name ?? "", price: price ?? "" }; });
      return (
        <div className="space-y-2" style={{ color: theme.text }}>
          {block.data.headline ? <p className="text-base font-bold">{String(block.data.headline)}</p> : null}
          <div className="space-y-1.5">
            {rows.map((r, i) => (
              <div key={i} className="flex items-baseline gap-2 text-sm">
                <span className="font-medium">{r.name}</span>
                <span className="flex-1 border-b border-dotted opacity-30" style={{ borderColor: theme.text }} />
                <span className="font-semibold" style={{ color: theme.primary }}>{r.price}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "product-category": {
      const cols = Math.max(2, Math.min(4, Number(block.data.columns) || 4));
      const n = Math.max(1, Number(block.data.count) || 8);
      return (
        <div className="space-y-2">
          {block.data.headline ? <p className="text-sm font-semibold" style={{ color: theme.text }}>{String(block.data.headline)}</p> : null}
          <div className={cn("grid gap-2", cols === 2 ? "grid-cols-2" : cols === 3 ? "grid-cols-3" : "grid-cols-4")}>
            {Array.from({ length: Math.min(n, cols * 2) }).map((_, i) => (
              <div key={i} className={cn("aspect-square bg-muted/60 flex items-center justify-center", radiusClass)}><Package className="w-4 h-4 text-muted-foreground/40" /></div>
            ))}
          </div>
          {block.data.category && block.data.category !== "all"
            ? <p className="text-[10px] opacity-50" style={{ color: theme.text }}>Category: {String(block.data.category)}</p> : null}
        </div>
      );
    }
  }
}

/* ─── Block editor ───────────────────────────────────────────────────────── */

export function BlockEditor({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  const set = (patch: Record<string, string | number | boolean>) => onChange({ ...block, data: { ...block.data, ...patch } });
  switch (block.type) {
    case "hero":
      return (
        <div className="space-y-3">
          <Field label="Headline">     <Input value={String(block.data.headline ?? "")} onChange={(e) => set({ headline: e.target.value })} /></Field>
          <Field label="Sub-headline"> <Input value={String(block.data.subhead  ?? "")} onChange={(e) => set({ subhead:  e.target.value })} /></Field>
          <Field label="Button label"> <Input value={String(block.data.cta      ?? "")} onChange={(e) => set({ cta:      e.target.value })} /></Field>
          <Field label="Button link">  <Input value={String(block.data.ctaLink  ?? "")} onChange={(e) => set({ ctaLink:  e.target.value })} /></Field>
          <Field label="Background image URL"><Input value={String(block.data.imageUrl ?? "")} onChange={(e) => set({ imageUrl: e.target.value })} placeholder="https://…" /></Field>
        </div>
      );
    case "heading":
      return (
        <div className="space-y-3">
          <Field label="Text"><Input value={String(block.data.text ?? "")} onChange={(e) => set({ text: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Size">
              <Select value={String(block.data.size)} onValueChange={(v) => set({ size: v })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="base">Small</SelectItem><SelectItem value="lg">Medium</SelectItem><SelectItem value="xl">Large</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="Alignment">
              <Select value={String(block.data.align)} onValueChange={(v) => set({ align: v })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="left">Left</SelectItem><SelectItem value="center">Center</SelectItem><SelectItem value="right">Right</SelectItem></SelectContent>
              </Select>
            </Field>
          </div>
        </div>
      );
    case "text": return <Field label="Text"><Textarea rows={5} value={String(block.data.text ?? "")} onChange={(e) => set({ text: e.target.value })} /></Field>;
    case "image":
      return (
        <div className="space-y-3">
          <Field label="Image URL"><Input value={String(block.data.url ?? "")} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" /></Field>
          <Field label="Alt text"> <Input value={String(block.data.alt ?? "")} onChange={(e) => set({ alt: e.target.value })} /></Field>
          <Field label="Caption">  <Input value={String(block.data.caption ?? "")} onChange={(e) => set({ caption: e.target.value })} /></Field>
        </div>
      );
    case "product-grid":
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Columns"><Input type="number" min={2} max={4} value={Number(block.data.columns)} onChange={(e) => set({ columns: parseInt(e.target.value) || 4 })} /></Field>
            <Field label="Product count"><Input type="number" min={1} max={48} value={Number(block.data.count)} onChange={(e) => set({ count: parseInt(e.target.value) || 8 })} /></Field>
          </div>
          <Field label="Category"><Input value={String(block.data.category ?? "all")} onChange={(e) => set({ category: e.target.value })} placeholder="all | beverages | snacks" /></Field>
          <div className="flex items-center justify-between pt-1">
            <Label className="text-xs">Show search &amp; category filter</Label>
            <Switch checked={block.data.search === true} onCheckedChange={(v) => set({ search: v })} />
          </div>
        </div>
      );
    case "featured-product":
      return (
        <div className="space-y-3">
          <Field label="Product SKU"><Input value={String(block.data.productSku ?? "")} onChange={(e) => set({ productSku: e.target.value })} placeholder="SKU-123" /></Field>
          <Field label="Layout">
            <Select value={String(block.data.layout)} onValueChange={(v) => set({ layout: v })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="left">Image left</SelectItem><SelectItem value="right">Image right</SelectItem></SelectContent>
            </Select>
          </Field>
        </div>
      );
    case "gallery": return <Field label="Columns"><Input type="number" min={2} max={4} value={Number(block.data.columns)} onChange={(e) => set({ columns: parseInt(e.target.value) || 3 })} /></Field>;
    case "cta":
      return (
        <div className="space-y-3">
          <Field label="Headline">   <Input value={String(block.data.headline    ?? "")} onChange={(e) => set({ headline:    e.target.value })} /></Field>
          <Field label="Sub-text">   <Input value={String(block.data.text        ?? "")} onChange={(e) => set({ text:        e.target.value })} /></Field>
          <Field label="Button text"><Input value={String(block.data.buttonText  ?? "")} onChange={(e) => set({ buttonText:  e.target.value })} /></Field>
          <Field label="Button link"><Input value={String(block.data.buttonLink  ?? "")} onChange={(e) => set({ buttonLink:  e.target.value })} /></Field>
        </div>
      );
    case "newsletter":
      return (
        <div className="space-y-3">
          <Field label="Headline"><Input value={String(block.data.headline ?? "")} onChange={(e) => set({ headline: e.target.value })} /></Field>
          <Field label="Sub-text"><Input value={String(block.data.text     ?? "")} onChange={(e) => set({ text:     e.target.value })} /></Field>
        </div>
      );
    case "contact":
      return (
        <div className="space-y-3">
          <Field label="Phone">  <Input value={String(block.data.phone   ?? "")} onChange={(e) => set({ phone:   e.target.value })} /></Field>
          <Field label="Email">  <Input value={String(block.data.email   ?? "")} onChange={(e) => set({ email:   e.target.value })} /></Field>
          <Field label="Address"><Input value={String(block.data.address ?? "")} onChange={(e) => set({ address: e.target.value })} /></Field>
          <Field label="Hours">  <Input value={String(block.data.hours   ?? "")} onChange={(e) => set({ hours:   e.target.value })} /></Field>
        </div>
      );
    case "spacer": return <Field label="Height (px)"><Input type="number" min={8} max={400} value={Number(block.data.height)} onChange={(e) => set({ height: parseInt(e.target.value) || 48 })} /></Field>;
    case "loyalty-banner":
      return (
        <div className="space-y-3">
          <Field label="Headline"><Input value={String(block.data.headline ?? "")} onChange={(e) => set({ headline: e.target.value })} /></Field>
          <Field label="Body">    <Input value={String(block.data.text     ?? "")} onChange={(e) => set({ text:     e.target.value })} /></Field>
          <Field label="Points">  <Input type="number" value={Number(block.data.points)} onChange={(e) => set({ points: parseInt(e.target.value) || 0 })} /></Field>
        </div>
      );
    case "quick-code": return <Field label="Quick code"><Input value={String(block.data.code ?? "")} onChange={(e) => set({ code: e.target.value })} placeholder="SUMMER25" /></Field>;
    case "video":
      return (
        <div className="space-y-3">
          <Field label="Video URL"><Input value={String(block.data.url ?? "")} onChange={(e) => set({ url: e.target.value })} placeholder="https://youtube.com/watch?v=…" /></Field>
          <Field label="Caption"><Input value={String(block.data.caption ?? "")} onChange={(e) => set({ caption: e.target.value })} /></Field>
        </div>
      );
    case "testimonials":
      return (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="space-y-1.5 border-t pt-2 first:border-t-0 first:pt-0">
              <Field label={`Quote ${n}`}><Textarea rows={2} value={String(block.data[`quote${n}`] ?? "")} onChange={(e) => set({ [`quote${n}`]: e.target.value })} /></Field>
              <Field label={`Author ${n}`}><Input value={String(block.data[`author${n}`] ?? "")} onChange={(e) => set({ [`author${n}`]: e.target.value })} /></Field>
            </div>
          ))}
        </div>
      );
    case "faq":
      return (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="space-y-1.5 border-t pt-2 first:border-t-0 first:pt-0">
              <Field label={`Question ${n}`}><Input value={String(block.data[`q${n}`] ?? "")} onChange={(e) => set({ [`q${n}`]: e.target.value })} /></Field>
              <Field label={`Answer ${n}`}><Textarea rows={2} value={String(block.data[`a${n}`] ?? "")} onChange={(e) => set({ [`a${n}`]: e.target.value })} /></Field>
            </div>
          ))}
        </div>
      );
    case "columns":
      return (
        <div className="space-y-3">
          <Field label="Number of columns"><Input type="number" min={2} max={4} value={Number(block.data.columns) || 3} onChange={(e) => set({ columns: parseInt(e.target.value) || 3 })} /></Field>
          {[1, 2, 3, 4].map((n) => (
            <Field key={n} label={`Column ${n}`}><Textarea rows={2} value={String(block.data[`col${n}`] ?? "")} onChange={(e) => set({ [`col${n}`]: e.target.value })} /></Field>
          ))}
        </div>
      );
    case "countdown":
      return (
        <div className="space-y-3">
          <Field label="Headline"><Input value={String(block.data.headline ?? "")} onChange={(e) => set({ headline: e.target.value })} /></Field>
          <Field label="Target date & time"><Input type="datetime-local" value={String(block.data.target ?? "")} onChange={(e) => set({ target: e.target.value })} /></Field>
        </div>
      );
    case "social":
      return (
        <div className="space-y-3">
          {(["facebook", "instagram", "twitter", "tiktok", "youtube"] as const).map((k) => (
            <Field key={k} label={k.charAt(0).toUpperCase() + k.slice(1)}><Input value={String(block.data[k] ?? "")} onChange={(e) => set({ [k]: e.target.value })} placeholder="https://…" /></Field>
          ))}
        </div>
      );
    case "map":
      return (
        <div className="space-y-3">
          <Field label="Address"><Input value={String(block.data.address ?? "")} onChange={(e) => set({ address: e.target.value })} placeholder="123 Main St, Sydney" /></Field>
          <Field label="Zoom"><Input type="number" min={1} max={20} value={Number(block.data.zoom) || 14} onChange={(e) => set({ zoom: parseInt(e.target.value) || 14 })} /></Field>
        </div>
      );
    case "pricing":
      return (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="space-y-1.5 border-t pt-2 first:border-t-0 first:pt-0">
              <div className="grid grid-cols-2 gap-2">
                <Field label={`Plan ${n} name`}><Input value={String(block.data[`name${n}`] ?? "")} onChange={(e) => set({ [`name${n}`]: e.target.value })} /></Field>
                <Field label="Price"><Input value={String(block.data[`price${n}`] ?? "")} onChange={(e) => set({ [`price${n}`]: e.target.value })} /></Field>
              </div>
              <Field label="Features (comma-separated)"><Textarea rows={2} value={String(block.data[`features${n}`] ?? "")} onChange={(e) => set({ [`features${n}`]: e.target.value })} /></Field>
            </div>
          ))}
        </div>
      );
    case "html":
      return (
        <Field label="Custom HTML">
          <Textarea rows={8} className="font-mono text-xs" value={String(block.data.html ?? "")} onChange={(e) => set({ html: e.target.value })} placeholder="<div>…</div>" />
        </Field>
      );
    case "iframe":
      return (
        <div className="space-y-3">
          <Field label="Embed URL"><Input value={String(block.data.url ?? "")} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Height (px)"><Input type="number" min={100} max={1200} value={Number(block.data.height) || 400} onChange={(e) => set({ height: parseInt(e.target.value) || 400 })} /></Field>
            <Field label="Title"><Input value={String(block.data.title ?? "")} onChange={(e) => set({ title: e.target.value })} /></Field>
          </div>
        </div>
      );
    case "similar-products":
      return (
        <div className="space-y-3">
          <Field label="Headline"><Input value={String(block.data.headline ?? "")} onChange={(e) => set({ headline: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Based on SKU"><Input value={String(block.data.productSku ?? "")} onChange={(e) => set({ productSku: e.target.value })} placeholder="SKU-123" /></Field>
            <Field label="How many"><Input type="number" min={2} max={4} value={Number(block.data.count) || 4} onChange={(e) => set({ count: parseInt(e.target.value) || 4 })} /></Field>
          </div>
        </div>
      );
    case "menu":
      return (
        <div className="space-y-3">
          <Field label="Headline"><Input value={String(block.data.headline ?? "")} onChange={(e) => set({ headline: e.target.value })} /></Field>
          <Field label="Items (one per line: Name | Price)">
            <Textarea rows={6} value={String(block.data.items ?? "")} onChange={(e) => set({ items: e.target.value })} placeholder={"Flat White | $4.50\nMuffin | $5.00"} />
          </Field>
        </div>
      );
    case "product-category":
      return (
        <div className="space-y-3">
          <Field label="Headline"><Input value={String(block.data.headline ?? "")} onChange={(e) => set({ headline: e.target.value })} /></Field>
          <Field label="Category"><Input value={String(block.data.category ?? "all")} onChange={(e) => set({ category: e.target.value })} placeholder="all | beverages | snacks" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Columns"><Input type="number" min={2} max={4} value={Number(block.data.columns) || 4} onChange={(e) => set({ columns: parseInt(e.target.value) || 4 })} /></Field>
            <Field label="Product count"><Input type="number" min={1} max={48} value={Number(block.data.count) || 8} onChange={(e) => set({ count: parseInt(e.target.value) || 8 })} /></Field>
          </div>
          <div className="flex items-center justify-between pt-1">
            <Label className="text-xs">Show search &amp; category filter</Label>
            <Switch checked={block.data.search === true} onCheckedChange={(v) => set({ search: v })} />
          </div>
        </div>
      );
  }
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}

/* Per-block styling lives in reserved `_`-prefixed keys on block.data so it
 * round-trips with the rest of the block and applies to every block type. */
export function blockWrapperStyle(data: Record<string, string | number | boolean>): React.CSSProperties {
  const s: React.CSSProperties = {};
  if (data._bg) s.backgroundColor = String(data._bg);
  const pad = Number(data._padY);
  if (pad) { s.paddingTop = pad; s.paddingBottom = pad; }
  if (data._align) s.textAlign = data._align as React.CSSProperties["textAlign"];
  return s;
}

/* Column span on a 12-col grid, so blocks can sit side by side at full / half /
 * third / quarter widths. Mobile always stacks full-width. */
export const WIDTH_OPTIONS = [
  { value: "full",    label: "Full width", span: "col-span-12" },
  { value: "half",    label: "Half (½)",   span: "col-span-12 sm:col-span-6" },
  { value: "third",   label: "Third (⅓)",  span: "col-span-12 sm:col-span-4" },
  { value: "quarter", label: "Quarter (¼)", span: "col-span-12 sm:col-span-3" },
] as const;

export function blockColSpan(data: Record<string, string | number | boolean>): string {
  return WIDTH_OPTIONS.find((w) => w.value === data._width)?.span ?? "col-span-12";
}

/* Block-level visibility scheduling. Reserved `_visibleFrom` / `_visibleUntil`
 * (datetime-local strings) gate when a block appears on the live store. The
 * builder always renders scheduled blocks (with a badge); the public renderer
 * hides them outside their window. */
export function blockHasSchedule(block: Block): boolean {
  return !!(block.data._visibleFrom || block.data._visibleUntil);
}

export function isBlockLive(block: Block, now: number = Date.now()): boolean {
  const from = block.data._visibleFrom ? new Date(String(block.data._visibleFrom)).getTime() : NaN;
  const until = block.data._visibleUntil ? new Date(String(block.data._visibleUntil)).getTime() : NaN;
  if (!Number.isNaN(from) && now < from) return false;
  if (!Number.isNaN(until) && now > until) return false;
  return true;
}

/* Live (read-only) product preview for the builder canvas, so product blocks
 * show the merchant's real catalogue instead of grey placeholders. The public
 * storefront uses the interactive ShoppableProducts renderer instead. */
export type CanvasProduct = { id: number; name: string; price: number; imageUrl: string; categoryId: number | null };

export function CanvasProductPreview({ block, products, theme }: { block: Block; products: CanvasProduct[]; theme: ThemeSettings }) {
  const rc = { none: "rounded-none", sm: "rounded", md: "rounded-lg", lg: "rounded-2xl" }[theme.radius] ?? "rounded-lg";
  const isFeatured = block.type === "featured-product";
  const cols = isFeatured ? 1 : (Number(block.data.columns) || 4);
  const count = isFeatured ? 1 : (Number(block.data.count) || 8);
  const category = String(block.data.category ?? "all");
  const base = category !== "all" ? products.filter((p) => String(p.categoryId) === category) : products;
  const items = base.slice(0, count);

  if (items.length === 0) {
    return (
      <div className={cn("p-4 text-center text-[11px] opacity-60 border border-dashed", rc)} style={{ color: theme.text }}>
        <Package className="w-5 h-5 mx-auto mb-1 opacity-40" />
        No products yet — add some to your catalogue.
      </div>
    );
  }
  const gridCols = cols === 2 ? "grid-cols-2" : cols === 3 ? "grid-cols-3" : "grid-cols-4";
  return (
    <div className="space-y-2">
      {block.data.headline ? <p className="font-bold text-sm" style={{ color: theme.text }}>{String(block.data.headline)}</p> : null}
      <div className={cn("grid gap-2", isFeatured ? "grid-cols-1" : gridCols)}>
        {items.map((p) => (
          <div key={p.id} className={cn("flex flex-col overflow-hidden border", rc)} style={{ borderColor: `${theme.text}15` }}>
            <div className="aspect-square bg-muted/40 flex items-center justify-center overflow-hidden">
              {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" /> : <Package className="w-6 h-6 opacity-30" />}
            </div>
            <div className="p-2">
              <p className="text-[11px] font-medium leading-tight line-clamp-2" style={{ color: theme.text }}>{p.name}</p>
              <p className="text-[11px] font-bold mt-0.5" style={{ color: theme.text }}>${p.price.toFixed(2)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BlockStyleSection({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  const set = (patch: Record<string, string | number | boolean>) => onChange({ ...block, data: { ...block.data, ...patch } });
  const clear = (key: string) => { const d = { ...block.data }; delete d[key]; onChange({ ...block, data: d }); };
  return (
    <div className="mt-4 pt-4 border-t space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Palette className="w-3 h-3" /> Block style</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Background">
          <div className="flex items-center gap-1.5">
            <Input type="color" value={String(block.data._bg ?? "#ffffff")} onChange={(e) => set({ _bg: e.target.value })} className="h-8 w-12 p-1" />
            {block.data._bg ? <button onClick={() => clear("_bg")} className="text-[10px] text-muted-foreground hover:text-foreground">Clear</button> : <span className="text-[10px] text-muted-foreground">None</span>}
          </div>
        </Field>
        <Field label="Spacing (px)"><Input type="number" min={0} max={160} value={Number(block.data._padY) || 0} onChange={(e) => set({ _padY: parseInt(e.target.value) || 0 })} className="h-8" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Alignment">
          <Select value={String(block.data._align ?? "left")} onValueChange={(v) => set({ _align: v })}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="left">Left</SelectItem><SelectItem value="center">Center</SelectItem><SelectItem value="right">Right</SelectItem></SelectContent>
          </Select>
        </Field>
        <Field label="Width">
          <Select value={String(block.data._width ?? "full")} onValueChange={(v) => set({ _width: v })}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>{WIDTH_OPTIONS.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </div>
      <div className="pt-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 mb-2"><Clock className="w-3 h-3" /> Visibility schedule</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Show from">
            <div className="flex items-center gap-1.5">
              <Input type="datetime-local" value={String(block.data._visibleFrom ?? "")} onChange={(e) => set({ _visibleFrom: e.target.value })} className="h-8 text-xs" />
              {block.data._visibleFrom ? <button onClick={() => clear("_visibleFrom")} className="text-[10px] text-muted-foreground hover:text-foreground">Clear</button> : null}
            </div>
          </Field>
          <Field label="Hide after">
            <div className="flex items-center gap-1.5">
              <Input type="datetime-local" value={String(block.data._visibleUntil ?? "")} onChange={(e) => set({ _visibleUntil: e.target.value })} className="h-8 text-xs" />
              {block.data._visibleUntil ? <button onClick={() => clear("_visibleUntil")} className="text-[10px] text-muted-foreground hover:text-foreground">Clear</button> : null}
            </div>
          </Field>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">Leave blank to always show. Outside this window the block is hidden on your live store.</p>
      </div>
    </div>
  );
}

/* ─── Reviews moderation ─────────────────────────────────────────────────── */

export interface ModReview {
  id: number; productName: string; authorName: string; authorEmail: string;
  rating: number; title: string; body: string; status: string; verified: boolean; createdAt: string;
}

export function ReviewsModerationCard() {
  const [items, setItems] = useState<ModReview[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/product-reviews", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setItems((d.items ?? []) as ModReview[]))
      .catch(() => { /* leave empty */ })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (id: number, status: "approved" | "hidden") => {
    await fetch(`/api/product-reviews/${id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  };
  const remove = async (id: number) => {
    if (!window.confirm("Delete this review permanently?")) return;
    await fetch(`/api/product-reviews/${id}`, { method: "DELETE", credentials: "include" });
    setItems((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Star className="w-4 h-4" /> Customer Reviews</CardTitle>
        <CardDescription>Moderate reviews submitted from your store. Hidden reviews stay private; enable "Product reviews" in Features to collect them.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reviews yet.</p>
        ) : (
          <div className="divide-y max-h-96 overflow-y-auto">
            {items.map((r) => (
              <div key={r.id} className="py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-amber-500 text-xs tracking-tight" aria-label={`${r.rating} of 5`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                    <span className="text-sm font-medium">{r.authorName}</span>
                    {r.verified && <Badge variant="outline" className="text-[10px]">Verified</Badge>}
                    {r.status === "hidden" && <Badge variant="secondary" className="text-[10px]">Hidden</Badge>}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{r.productName}</p>
                  {r.title && <p className="text-sm font-medium mt-0.5">{r.title}</p>}
                  <p className="text-sm text-muted-foreground mt-0.5 line-clamp-3">{r.body}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {r.status === "approved"
                    ? <Button size="icon" variant="ghost" className="h-7 w-7" title="Hide review" onClick={() => setStatus(r.id, "hidden")}><EyeOff className="w-3.5 h-3.5" /></Button>
                    : <Button size="icon" variant="ghost" className="h-7 w-7" title="Show review" onClick={() => setStatus(r.id, "approved")}><Eye className="w-3.5 h-3.5" /></Button>}
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete review" onClick={() => remove(r.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */


/* ─── Shared store state ─────────────────────────────────────────────────────
 * One settings record, four pages. The hook loads it, keeps local edits, and
 * saves them 800ms after the last keystroke — the same debounce the single-page
 * editor used, so a page can be left mid-edit without losing anything.
 */
export interface OnlineStore {
  /** Raw API row, for fields the UI reads but never writes (e.g. domainStatus). */
  rawSettings: unknown;
  settingsLoading: boolean;
  site: SiteSettings;
  mutateSite: (updater: (prev: SiteSettings) => SiteSettings) => void;
  updateSite: (patch: Partial<SiteSettings>) => void;
  updateTheme: (patch: Partial<ThemeSettings>) => void;
  updateFooter: (patch: Partial<FooterSettings>) => void;
  togglePublish: () => void;
}

export function useOnlineStore(): OnlineStore {
  const { data: rawSettings, isLoading: settingsLoading } = useGetOnlineStoreSettings({ query: { queryKey: ["online-store-settings"] } });
  const upsertSettings = useUpsertOnlineStoreSettings();
  const queryClient = useQueryClient();
  const [site, setSite] = useState<SiteSettings>(DEFAULT_SITE);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (rawSettings && !settingsLoading) setSite(apiToSite(rawSettings as unknown as Record<string, unknown>));
  }, [rawSettings, settingsLoading]);

  const scheduleSave = useCallback((next: SiteSettings) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      upsertSettings.mutate({ data: siteToApi(next) }, {
        onError: () => toast.error("Failed to save settings"),
        // A save writes the WHOLE record, and the next page the merchant opens
        // will do the same from whatever it loaded. Marking the query stale
        // makes that page refetch on mount, so it cannot save an older copy
        // back over this edit. `refetchType: "none"` leaves this page's own
        // query alone — refetching under an open editor would overwrite what
        // the merchant is still typing.
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["online-store-settings"], refetchType: "none" }); },
      });
    }, 800);
  }, [upsertSettings, queryClient]);

  const mutateSite = useCallback((updater: (prev: SiteSettings) => SiteSettings) => {
    setSite((prev) => {
      const next = updater(prev);
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  const updateSite   = useCallback((patch: Partial<SiteSettings>)   => mutateSite((s) => ({ ...s, ...patch })), [mutateSite]);
  const updateTheme  = useCallback((patch: Partial<ThemeSettings>)  => mutateSite((s) => ({ ...s, theme:  { ...s.theme,  ...patch } })), [mutateSite]);
  const updateFooter = useCallback((patch: Partial<FooterSettings>) => mutateSite((s) => ({ ...s, footer: { ...s.footer, ...patch } })), [mutateSite]);

  const togglePublish = useCallback(() => {
    mutateSite((s) => {
      toast.success(s.published ? "Site unpublished" : "Site published");
      return { ...s, published: !s.published };
    });
  }, [mutateSite]);

  return { rawSettings, settingsLoading, site, mutateSite, updateSite, updateTheme, updateFooter, togglePublish };
}

/**
 * Every Online Store page carries the same title row: what the page is, and —
 * for the builder — whether the site is live, with the publish switch. Publish
 * is a property of the whole site, not of one page, so it rides along wherever
 * the merchant happens to be.
 */
export function StoreHeader({ icon: Icon, title, description, site, onTogglePublish }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  site: SiteSettings;
  onTogglePublish: () => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Icon className="w-6 h-6 text-primary" /> {title}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        {site.mode === "builder" && (
          <>
            <Badge variant="secondary" className={cn("gap-1.5", site.published && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0")}>
              {site.published ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
              {site.published ? "Live" : "Draft"}
            </Badge>
            <Button size="sm" variant={site.published ? "outline" : "default"} onClick={onTogglePublish} className="gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />{site.published ? "Unpublish" : "Publish"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Shown in place of the builder settings when the merchant has connected a
 * third-party platform instead — that platform owns the storefront, so these
 * pages have nothing to edit. The single-page editor simply hid these sections;
 * as separate pages they would otherwise look broken.
 */
export function BuilderOnlyNotice() {
  return (
    <Card>
      <CardContent className="p-10 text-center space-y-3">
        <Store className="w-10 h-10 mx-auto opacity-30" />
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Your store is connected to a third-party platform, which owns these settings.
          Switch back to the KoaPOS website builder on{" "}
          <Link href="/management/online-store/storefront" className="text-primary underline underline-offset-2">Storefront</Link>{" "}
          to use them.
        </p>
      </CardContent>
    </Card>
  );
}
