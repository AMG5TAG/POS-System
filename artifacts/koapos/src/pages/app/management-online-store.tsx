import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BrandIcon } from "@/components/brand-icon";
import {
  Globe, Store, Wrench, Plus, Trash2, Eye, EyeOff, GripVertical,
  Type as TypeIcon, Image as ImageIcon, Layout, ShoppingBag, CreditCard,
  Gift, Users, QrCode, MapPin, Star, Mail, ChevronRight, CheckCircle2,
  Settings2, Palette, Upload, ExternalLink, FileText, Package,
  Code2, Sparkles, Phone, Clock, ArrowUp, ArrowDown, Layers, Wand2, Building2,
  Link2, Copy, Check, Maximize2, Minimize2,
  Play, MessageSquare, HelpCircle, Columns3, Timer, Share2, Map as MapIcon, DollarSign, CopyPlus,
} from "lucide-react";
import {
  useGetOnlineStoreSettings,
  useUpsertOnlineStoreSettings,
  useGetOnlineStoreThirdparty,
  useUpsertOnlineStoreThirdparty,
  useGetMerchant,
} from "@workspace/api-client-react";
import { useBusinessProfile } from "@/lib/business-profile";
import { useStoreSlug, slugifyStorePath } from "@/lib/online-store-slug";

/* ─── Types ──────────────────────────────────────────────────────────────── */

type StoreMode = "builder" | "thirdparty";

interface ThemeSettings {
  primary: string; accent: string; bg: string; text: string;
  font: "sans" | "serif" | "mono"; radius: "none" | "sm" | "md" | "lg";
}

interface SiteSettings {
  mode: StoreMode; storeName: string; tagline: string; logoUrl: string;
  faviconUrl: string; domain: string; published: boolean;
  theme: ThemeSettings;
  payments: { stripe: boolean; paypal: boolean; afterpay: boolean; applePay: boolean };
  features: { loyalty: boolean; customers: boolean; checkout: boolean; quickCodes: boolean; reviews: boolean; newsletter: boolean };
  pages: Page[]; quickCodes: QuickCode[];
}

interface Page {
  id: string; name: string; slug: string; visible: boolean; blocks: Block[];
  /* SEO & page settings (optional — round-tripped inside the pages JSON blob). */
  seoTitle?: string; seoDescription?: string; shareImage?: string; publishAt?: string;
}

interface Block {
  id: string; type: BlockType; data: Record<string, string | number | boolean>;
}

type BlockType =
  | "hero" | "heading" | "text" | "image" | "product-grid" | "featured-product"
  | "gallery" | "cta" | "newsletter" | "contact" | "spacer" | "loyalty-banner" | "quick-code"
  | "video" | "testimonials" | "faq" | "columns" | "countdown" | "social" | "map" | "pricing";

interface QuickCode { id: string; code: string; label: string; url: string; }

interface BlockMeta {
  type: BlockType; label: string; icon: React.ComponentType<{ className?: string }>;
  description: string; defaultData: Record<string, string | number | boolean>;
}

interface ThirdParty {
  providerId: string; storeUrl: string; apiKey: string; connected: boolean; connectedAt: string;
}

/* ─── Constants ──────────────────────────────────────────────────────────── */

const BLOCK_LIBRARY: BlockMeta[] = [
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
];

const FONT_OPTIONS = [
  { value: "sans",  label: "Sans Serif (Modern)" },
  { value: "serif", label: "Serif (Elegant)" },
  { value: "mono",  label: "Monospace (Tech)" },
] as const;

/* The store theme only supports three font families, while Business Details
 * stores a specific brand font name. Classify the brand font into the closest
 * category so "Import from Business" can carry the font across. */
function brandFontToCategory(name: string): "sans" | "serif" | "mono" {
  const f = name.toLowerCase();
  if (/mono|courier|code|consol/.test(f)) return "mono";
  if (!/sans/.test(f) && /serif|times|georgia|merriweather|playfair|lora|garamond|slab|baskerville/.test(f)) return "serif";
  return "sans";
}

const RADIUS_OPTIONS = [
  { value: "none", label: "Square" },
  { value: "sm",   label: "Subtle" },
  { value: "md",   label: "Rounded" },
  { value: "lg",   label: "Pill" },
] as const;

const COLOUR_PRESETS = [
  { name: "Coastal",  primary: "#0EA5E9", accent: "#06B6D4", bg: "#F8FAFC", text: "#0F172A" },
  { name: "Outback",  primary: "#D97706", accent: "#92400E", bg: "#FFFBEB", text: "#1F2937" },
  { name: "Eucalypt", primary: "#10B981", accent: "#059669", bg: "#F0FDF4", text: "#111827" },
  { name: "Galah",    primary: "#EC4899", accent: "#BE185D", bg: "#FDF2F8", text: "#1F2937" },
  { name: "Midnight", primary: "#6366F1", accent: "#4338CA", bg: "#0F172A", text: "#F8FAFC" },
  { name: "Pearl",    primary: "#111827", accent: "#374151", bg: "#FFFFFF", text: "#0F172A" },
];

const DEFAULT_SITE: SiteSettings = {
  mode: "builder", storeName: "", tagline: "", logoUrl: "", faviconUrl: "", domain: "", published: false,
  theme: { primary: "#0EA5E9", accent: "#06B6D4", bg: "#F8FAFC", text: "#0F172A", font: "sans", radius: "md" },
  payments: { stripe: false, paypal: false, afterpay: false, applePay: false },
  features: { loyalty: false, customers: false, checkout: true, quickCodes: false, reviews: false, newsletter: false },
  pages: [{ id: "p-home", name: "Home", slug: "/", visible: true, blocks: [] }],
  quickCodes: [],
};

const THIRDPARTY_PROVIDERS = [
  { id: "shopify",     name: "Shopify",          tagline: "All-in-one ecommerce",          color: "#96BF47" },
  { id: "woocommerce", name: "WooCommerce",       tagline: "WordPress ecommerce plugin",    color: "#7F54B3" },
  { id: "bigcommerce", name: "BigCommerce",       tagline: "Enterprise-grade ecommerce",    color: "#121118" },
  { id: "squarespace", name: "Squarespace",       tagline: "Design-led websites & stores",  color: "#000000" },
  { id: "wix",         name: "Wix",              tagline: "Drag-and-drop site builder",    color: "#0C6EFC" },
  { id: "neto",        name: "Maropost (Neto)",  tagline: "Australian ecommerce platform", color: "#FF6A13" },
];

/* ─── API converters ─────────────────────────────────────────────────────── */

function apiToSite(r: Record<string, unknown>): SiteSettings {
  let pages: Page[] = DEFAULT_SITE.pages;
  let theme: ThemeSettings = { ...DEFAULT_SITE.theme };
  let payments = { ...DEFAULT_SITE.payments };
  let features = { ...DEFAULT_SITE.features };
  let quickCodes: QuickCode[] = [];
  try { if (r.pages)      pages      = JSON.parse(r.pages as string);                                    } catch { /* ignore */ }
  try { if (r.theme)      theme      = { ...DEFAULT_SITE.theme, ...JSON.parse(r.theme as string) };      } catch { /* ignore */ }
  try { if (r.payments)   payments   = { ...DEFAULT_SITE.payments, ...JSON.parse(r.payments as string) };} catch { /* ignore */ }
  try { if (r.features)   features   = { ...DEFAULT_SITE.features, ...JSON.parse(r.features as string) };} catch { /* ignore */ }
  try { if (r.quickCodes) quickCodes = JSON.parse(r.quickCodes as string);                               } catch { /* ignore */ }
  return {
    mode:       (String(r.mode      ?? "builder")) as StoreMode,
    storeName:  String(r.storeName  ?? ""),
    tagline:    String(r.tagline    ?? ""),
    logoUrl:    String(r.logoUrl    ?? ""),
    faviconUrl: String(r.faviconUrl ?? ""),
    domain:     String(r.domain     ?? ""),
    published:  String(r.published) === "true",
    theme, payments, features, pages, quickCodes,
  };
}

function siteToApi(s: SiteSettings): Record<string, unknown> {
  return {
    mode: s.mode, storeName: s.storeName, tagline: s.tagline,
    logoUrl: s.logoUrl, faviconUrl: s.faviconUrl, domain: s.domain,
    published: s.published ? "true" : "false",
    theme:      JSON.stringify(s.theme),
    payments:   JSON.stringify(s.payments),
    features:   JSON.stringify(s.features),
    pages:      JSON.stringify(s.pages),
    quickCodes: JSON.stringify(s.quickCodes),
  };
}

function apiToThirdParty(r: Record<string, unknown>): ThirdParty | null {
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

function BlockPreview({ block, theme }: { block: Block; theme: ThemeSettings }) {
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
  }
}

/* ─── Block editor ───────────────────────────────────────────────────────── */

function BlockEditor({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
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
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}

/* Per-block styling lives in reserved `_`-prefixed keys on block.data so it
 * round-trips with the rest of the block and applies to every block type. */
function blockWrapperStyle(data: Record<string, string | number | boolean>): React.CSSProperties {
  const s: React.CSSProperties = {};
  if (data._bg) s.backgroundColor = String(data._bg);
  const pad = Number(data._padY);
  if (pad) { s.paddingTop = pad; s.paddingBottom = pad; }
  if (data._align) s.textAlign = data._align as React.CSSProperties["textAlign"];
  return s;
}

function BlockStyleSection({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
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
          <Select value={block.data._fullWidth ? "full" : "contained"} onValueChange={(v) => set({ _fullWidth: v === "full" })}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="contained">Contained</SelectItem><SelectItem value="full">Full width</SelectItem></SelectContent>
          </Select>
        </Field>
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ManagementOnlineStorePage() {
  const { data: rawSettings, isLoading: settingsLoading } = useGetOnlineStoreSettings({ query: { queryKey: ["online-store-settings"] } });
  const { data: rawThirdParty } = useGetOnlineStoreThirdparty({ query: { queryKey: ["online-store-thirdparty"] } });
  const upsertSettings   = useUpsertOnlineStoreSettings();
  const upsertThirdParty = useUpsertOnlineStoreThirdparty();

  const [site, setSite] = useState<SiteSettings>(DEFAULT_SITE);
  const [thirdParty, setThirdParty] = useState<ThirdParty | null>(null);
  const [activePageId, setActivePageId] = useState<string>(DEFAULT_SITE.pages[0]?.id ?? "");
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [previewWidth, setPreviewWidth] = useState<"sm" | "md" | "lg">("lg");
  const [addPageOpen, setAddPageOpen] = useState(false);
  const [newPage, setNewPage] = useState({ name: "", slug: "" });
  const [connectProvider, setConnectProvider] = useState<string | null>(null);
  const [connectForm, setConnectForm] = useState({ url: "", apiKey: "" });
  const [fullScreen, setFullScreen] = useState(false);
  const [clipboardBlock, setClipboardBlock] = useState<Block | null>(null);
  const [dragBlockId, setDragBlockId] = useState<string | null>(null);
  const [pageSettingsOpen, setPageSettingsOpen] = useState(false);

  /* Branding source: Business Details (management > business) */
  const { profile: businessProfile } = useBusinessProfile();
  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });
  const logoFileRef = useRef<HTMLInputElement>(null);
  const faviconFileRef = useRef<HTMLInputElement>(null);

  /* Store URL: default platform URL is https://koapos.com.au/b/USERNAME/o/CUSTOM
   * where CUSTOM (the slug) is editable; `site.domain` is the optional custom
   * DNS domain pointed at the store. */
  const PLATFORM_BASE = "https://koapos.com.au";
  const [storeSlug, setStoreSlug] = useStoreSlug();
  const merchantUsername = (merchant?.username ?? "").toLowerCase();
  const defaultStoreUrl = `${PLATFORM_BASE}/b/${merchantUsername || "your-username"}/o/${storeSlug}`;
  const liveStoreUrl = site.domain.trim() ? `https://${site.domain.trim().replace(/^https?:\/\//, "")}` : defaultStoreUrl;
  const [urlCopied, setUrlCopied] = useState(false);
  const copyStoreUrl = async () => {
    await navigator.clipboard.writeText(liveStoreUrl).catch(() => {});
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  };

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load from API on mount
  useEffect(() => {
    if (rawSettings && !settingsLoading) {
      const loaded = apiToSite(rawSettings as unknown as Record<string, unknown>);
      setSite(loaded);
      if (!activePageId || activePageId === DEFAULT_SITE.pages[0]?.id) {
        setActivePageId(loaded.pages[0]?.id ?? "");
      }
    }
  }, [rawSettings, settingsLoading]);

  useEffect(() => {
    if (rawThirdParty) {
      const tp = apiToThirdParty(rawThirdParty as unknown as Record<string, unknown>);
      setThirdParty(tp);
    }
  }, [rawThirdParty]);

  // Debounced save to API
  const scheduleSave = useCallback((next: SiteSettings) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      upsertSettings.mutate({ data: siteToApi(next) }, {
        onError: () => toast.error("Failed to save settings"),
      });
    }, 800);
  }, [upsertSettings]);

  const mutateSite = useCallback((updater: (prev: SiteSettings) => SiteSettings) => {
    setSite((prev) => {
      const next = updater(prev);
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  const activePage  = useMemo(() => site.pages.find((p) => p.id === activePageId) ?? site.pages[0], [site.pages, activePageId]);
  const activeBlock = useMemo(() => activePage?.blocks.find((b) => b.id === activeBlockId) ?? null, [activePage, activeBlockId]);

  /* ─── Site mutators ──────────────────────────────────────────────── */
  const updateSite  = (patch: Partial<SiteSettings>) => mutateSite((s) => ({ ...s, ...patch }));
  const updateTheme = (patch: Partial<ThemeSettings>) => mutateSite((s) => ({ ...s, theme: { ...s.theme, ...patch } }));

  /* Pull name, tagline, logo, favicon and brand colours from Business Details. */
  const importFromBusiness = () => {
    const bp = businessProfile;
    const [primary, accent] = bp.brandColors ?? [];
    mutateSite((s) => ({
      ...s,
      storeName:  merchant?.businessName || s.storeName,
      tagline:    bp.tagline || s.tagline,
      logoUrl:    bp.logo || s.logoUrl,
      faviconUrl: bp.logo || s.faviconUrl,
      theme: {
        ...s.theme,
        primary: primary || s.theme.primary,
        accent:  accent || s.theme.accent,
        bg:      (bp.bgColors ?? [])[0]   || s.theme.bg,
        text:    (bp.textColors ?? [])[0] || s.theme.text,
        font:    bp.brandFont ? brandFontToCategory(bp.brandFont) : s.theme.font,
      },
    }));
    toast.success("Imported branding from Business Details");
  };

  /* Read an uploaded image file into a data URL and store it on the site. */
  const handleImageFile = (file: File | undefined, field: "logoUrl" | "faviconUrl") => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image file"); return; }
    const reader = new FileReader();
    reader.onload = () => updateSite({ [field]: reader.result as string });
    reader.readAsDataURL(file);
  };

  /* Reuse the store logo as the favicon. */
  const useLogoAsFavicon = () => {
    if (!site.logoUrl) { toast.error("Add a logo first"); return; }
    updateSite({ faviconUrl: site.logoUrl });
    toast.success("Logo set as favicon");
  };
  const togglePayment = (k: keyof SiteSettings["payments"]) => mutateSite((s) => ({ ...s, payments: { ...s.payments, [k]: !s.payments[k] } }));
  const toggleFeature = (k: keyof SiteSettings["features"]) => mutateSite((s) => ({ ...s, features: { ...s.features, [k]: !s.features[k] } }));

  /* ─── Page mutators ──────────────────────────────────────────────── */
  const addPage = () => {
    if (!newPage.name.trim()) return;
    const slug = (newPage.slug.trim() || "/" + newPage.name.toLowerCase().replace(/\s+/g, "-")).replace(/^\/+/, "/");
    const id = `p${Date.now()}`;
    mutateSite((s) => ({ ...s, pages: [...s.pages, { id, name: newPage.name.trim(), slug, visible: true, blocks: [] }] }));
    setActivePageId(id);
    setAddPageOpen(false);
    setNewPage({ name: "", slug: "" });
    toast.success("Page added");
  };

  const deletePage = (id: string) => {
    if (site.pages.length <= 1) { toast.error("You need at least one page"); return; }
    mutateSite((s) => ({ ...s, pages: s.pages.filter((p) => p.id !== id) }));
    if (activePageId === id) setActivePageId(site.pages[0].id);
    toast.success("Page deleted");
  };

  const togglePageVisibility = (id: string) =>
    mutateSite((s) => ({ ...s, pages: s.pages.map((p) => p.id === id ? { ...p, visible: !p.visible } : p) }));

  /* ─── Block mutators ─────────────────────────────────────────────── */
  const addBlock = (meta: BlockMeta) => {
    if (!activePage) return;
    const id = `b${Date.now()}`;
    const newBlock: Block = { id, type: meta.type, data: { ...meta.defaultData } };
    mutateSite((s) => ({ ...s, pages: s.pages.map((p) => p.id === activePage.id ? { ...p, blocks: [...p.blocks, newBlock] } : p) }));
    setActiveBlockId(id);
  };

  const updateBlock = (b: Block) => {
    if (!activePage) return;
    mutateSite((s) => ({ ...s, pages: s.pages.map((p) => p.id === activePage.id ? { ...p, blocks: p.blocks.map((x) => x.id === b.id ? b : x) } : p) }));
  };

  const deleteBlock = (id: string) => {
    if (!activePage) return;
    mutateSite((s) => ({ ...s, pages: s.pages.map((p) => p.id === activePage.id ? { ...p, blocks: p.blocks.filter((b) => b.id !== id) } : p) }));
    if (activeBlockId === id) setActiveBlockId(null);
  };

  const moveBlock = (id: string, dir: -1 | 1) => {
    if (!activePage) return;
    mutateSite((s) => ({
      ...s,
      pages: s.pages.map((p) => {
        if (p.id !== activePage.id) return p;
        const idx = p.blocks.findIndex((b) => b.id === id);
        const newIdx = idx + dir;
        if (idx < 0 || newIdx < 0 || newIdx >= p.blocks.length) return p;
        const arr = [...p.blocks];
        [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
        return { ...p, blocks: arr };
      }),
    }));
  };

  /* Insert a (cloned) block right after `afterId`, or at the end. */
  const insertBlockAfter = (block: Block, afterId: string | null) => {
    if (!activePage) return;
    const fresh: Block = { ...block, id: `b${Date.now()}`, data: { ...block.data } };
    mutateSite((s) => ({
      ...s,
      pages: s.pages.map((p) => {
        if (p.id !== activePage.id) return p;
        const at = afterId ? p.blocks.findIndex((b) => b.id === afterId) + 1 : p.blocks.length;
        const arr = [...p.blocks];
        arr.splice(at > 0 ? at : arr.length, 0, fresh);
        return { ...p, blocks: arr };
      }),
    }));
    setActiveBlockId(fresh.id);
  };

  const duplicateBlock = (id: string) => {
    const b = activePage?.blocks.find((x) => x.id === id);
    if (b) { insertBlockAfter(b, id); toast.success("Block duplicated"); }
  };

  const copyBlock = (id: string) => {
    const b = activePage?.blocks.find((x) => x.id === id);
    if (b) { setClipboardBlock(b); toast.success("Block copied — paste it on any page"); }
  };

  const pasteBlock = () => {
    if (clipboardBlock) { insertBlockAfter(clipboardBlock, activeBlockId); toast.success("Block pasted"); }
  };

  /* Drag-and-drop reorder within the active page. */
  const reorderBlock = (fromId: string, toId: string) => {
    if (!activePage || fromId === toId) return;
    mutateSite((s) => ({
      ...s,
      pages: s.pages.map((p) => {
        if (p.id !== activePage.id) return p;
        const arr = [...p.blocks];
        const from = arr.findIndex((b) => b.id === fromId);
        const to   = arr.findIndex((b) => b.id === toId);
        if (from < 0 || to < 0) return p;
        const [moved] = arr.splice(from, 1);
        arr.splice(to, 0, moved);
        return { ...p, blocks: arr };
      }),
    }));
  };

  const updatePage = (patch: Partial<Page>) => {
    if (!activePage) return;
    mutateSite((s) => ({ ...s, pages: s.pages.map((p) => p.id === activePage.id ? { ...p, ...patch } : p) }));
  };

  /* ─── Quick codes ────────────────────────────────────────────────── */
  const addQuickCode = () => {
    const id = `qc${Date.now()}`;
    mutateSite((s) => ({ ...s, quickCodes: [...s.quickCodes, { id, code: "NEWCODE", label: "New promo", url: "/" }] }));
  };
  const updateQuickCode = (id: string, patch: Partial<QuickCode>) =>
    mutateSite((s) => ({ ...s, quickCodes: s.quickCodes.map((q) => q.id === id ? { ...q, ...patch } : q) }));
  const deleteQuickCode = (id: string) =>
    mutateSite((s) => ({ ...s, quickCodes: s.quickCodes.filter((q) => q.id !== id) }));

  /* ─── Third party ────────────────────────────────────────────────── */
  const connectThirdParty = () => {
    if (!connectProvider) return;
    if (!connectForm.url.trim()) { toast.error("Store URL is required"); return; }
    const tp: ThirdParty = {
      providerId:  connectProvider,
      storeUrl:    connectForm.url.trim(),
      apiKey:      connectForm.apiKey.trim(),
      connected:   true,
      connectedAt: new Date().toISOString(),
    };
    setThirdParty(tp);
    upsertThirdParty.mutate({ data: { providerId: tp.providerId, storeUrl: tp.storeUrl, apiKey: tp.apiKey, connected: "true", connectedAt: tp.connectedAt } }, {
      onError: () => toast.error("Failed to save connection"),
    });
    setConnectProvider(null);
    setConnectForm({ url: "", apiKey: "" });
    toast.success("Connected to third-party store");
  };

  const disconnectThirdParty = () => {
    setThirdParty(null);
    upsertThirdParty.mutate({ data: { providerId: "", storeUrl: "", apiKey: "", connected: "false", connectedAt: "" } }, {
      onError: () => toast.error("Failed to disconnect"),
    });
    toast.success("Disconnected");
  };

  const togglePublish = () => {
    mutateSite((s) => ({ ...s, published: !s.published }));
    toast.success(site.published ? "Site unpublished" : "Site published");
  };

  const previewWidthClass = previewWidth === "sm" ? "max-w-sm" : previewWidth === "md" ? "max-w-2xl" : "max-w-full";

  return (
    <AppLayout>
      <div className={cn("space-y-6", fullScreen ? "fixed inset-0 z-50 bg-background overflow-y-auto p-4 md:p-6" : "p-6 md:p-8")}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Globe className="w-6 h-6 text-primary" /> Online Store
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Build a full ecommerce website with a drag-and-drop block editor, or connect a third-party platform.</p>
          </div>
          <div className="flex items-center gap-2">
            {site.mode === "builder" && (
              <>
                <Badge variant="secondary" className={cn("gap-1.5", site.published && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0")}>
                  {site.published ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                  {site.published ? "Live" : "Draft"}
                </Badge>
                <Button size="sm" variant={site.published ? "outline" : "default"} onClick={togglePublish} className="gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />{site.published ? "Unpublish" : "Publish"}
                </Button>
              </>
            )}
            <Button
              size="sm" variant="outline" className="gap-1.5"
              onClick={() => setFullScreen((v) => !v)}
              title={fullScreen ? "Exit full screen" : "Open builder full screen"}
            >
              {fullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{fullScreen ? "Exit full screen" : "Full screen"}</span>
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-2">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => updateSite({ mode: "builder" })}
                className={cn("flex items-start gap-3 rounded-lg border p-4 text-left transition-all", site.mode === "builder" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/40")}>
                <Wrench className="w-5 h-5 mt-0.5 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-sm">KoaPOS Website Builder</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Full-featured drag-and-drop site with built-in checkout, loyalty, and customer sync.</p>
                </div>
              </button>
              <button onClick={() => updateSite({ mode: "thirdparty" })}
                className={cn("flex items-start gap-3 rounded-lg border p-4 text-left transition-all", site.mode === "thirdparty" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/40")}>
                <Store className="w-5 h-5 mt-0.5 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-sm">Connect Third-Party Store</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Sync with Shopify, WooCommerce, BigCommerce and others.</p>
                </div>
              </button>
            </div>
          </CardContent>
        </Card>

        {site.mode === "thirdparty" ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Available Platforms</CardTitle><CardDescription>Choose a platform to connect to your store</CardDescription></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {THIRDPARTY_PROVIDERS.map((p) => {
                    const isConnected = thirdParty?.providerId === p.id && thirdParty?.connected;
                    return (
                      <button key={p.id} onClick={() => { setConnectProvider(p.id); setConnectForm({ url: thirdParty?.storeUrl || "", apiKey: "" }); }}
                        className={cn("flex items-center gap-3 rounded-lg border p-3 text-left transition-all", isConnected ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800" : "hover:bg-muted/40")}>
                        <BrandIcon name={p.id} size={28} className="shrink-0" />
                        <div className="min-w-0 flex-1"><p className="text-sm font-semibold truncate">{p.name}</p><p className="text-[11px] text-muted-foreground truncate">{p.tagline}</p></div>
                        {isConnected && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Connection Status</CardTitle><CardDescription>Your active third-party integration</CardDescription></CardHeader>
              <CardContent>
                {thirdParty?.connected ? (
                  <div className="space-y-4">
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <p className="text-sm font-semibold">{THIRDPARTY_PROVIDERS.find((p) => p.id === thirdParty.providerId)?.name}</p>
                        <Badge variant="secondary" className="ml-auto text-[10px]">Connected</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground break-all">{thirdParty.storeUrl}</p>
                      <p className="text-[11px] text-muted-foreground">Connected {new Date(thirdParty.connectedAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 gap-1.5" asChild>
                        <a href={thirdParty.storeUrl.startsWith("http") ? thirdParty.storeUrl : `https://${thirdParty.storeUrl}`} target="_blank" rel="noreferrer">
                          <ExternalLink className="w-3.5 h-3.5" /> Open store
                        </a>
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-destructive hover:text-destructive" onClick={disconnectThirdParty}>Disconnect</Button>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">What syncs</p>
                      {[{ icon: Package, label: "Products & inventory" }, { icon: ShoppingBag, label: "Orders (read & fulfil)" }, { icon: Users, label: "Customers" }, { icon: CreditCard, label: "Payments & refunds" }].map(({ icon: Icon, label }) => (
                        <div key={label} className="flex items-center gap-2 text-xs"><Icon className="w-3.5 h-3.5 text-muted-foreground" /><span>{label}</span><Badge variant="secondary" className="ml-auto text-[10px]">Active</Badge></div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <Store className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    No third-party store connected yet. Choose a platform on the left to get started.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <>
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base flex items-center gap-2"><Settings2 className="w-4 h-4" /> Site Basics</CardTitle>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={importFromBusiness}
                  title="Import name, tagline, logo, favicon, brand colours and font from Business Details">
                  <Building2 className="w-3.5 h-3.5" /> Import from Business
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Store name"><Input value={site.storeName} onChange={(e) => updateSite({ storeName: e.target.value })} /></Field>
                  <Field label="Tagline">   <Input value={site.tagline}   onChange={(e) => updateSite({ tagline:   e.target.value })} /></Field>
                  <Field label="Logo URL"><Input value={site.logoUrl} onChange={(e) => updateSite({ logoUrl: e.target.value })} placeholder="https://…" /></Field>
                  <Field label="Favicon URL"><Input value={site.faviconUrl} onChange={(e) => updateSite({ faviconUrl: e.target.value })} placeholder="https://…" /></Field>
                </div>

                {/* Logo / favicon previews */}
                {(site.logoUrl || site.faviconUrl) && (
                  <div className="flex items-center gap-6">
                    {site.logoUrl && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Logo</span>
                        <img src={site.logoUrl} alt="Logo preview" className="h-9 max-w-[120px] object-contain rounded border bg-muted/30" />
                      </div>
                    )}
                    {site.faviconUrl && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Favicon</span>
                        <img src={site.faviconUrl} alt="Favicon preview" className="h-6 w-6 object-contain rounded border bg-muted/30" />
                      </div>
                    )}
                  </div>
                )}

                <input ref={logoFileRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { handleImageFile(e.target.files?.[0], "logoUrl"); e.target.value = ""; }} />
                <input ref={faviconFileRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { handleImageFile(e.target.files?.[0], "faviconUrl"); e.target.value = ""; }} />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => logoFileRef.current?.click()}>
                    <Upload className="w-3.5 h-3.5" /> Upload logo
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => faviconFileRef.current?.click()}>
                    <Upload className="w-3.5 h-3.5" /> Upload favicon
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={useLogoAsFavicon} disabled={!site.logoUrl}
                    title="Use the store logo as the favicon">
                    <ImageIcon className="w-3.5 h-3.5" /> Use logo as favicon
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Link2 className="w-4 h-4" /> Store URL &amp; Domain</CardTitle>
                <CardDescription>Your store is published at the address below. Share it or point your own domain to it.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Default platform URL with editable CUSTOM segment */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Default store URL</Label>
                  <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 flex-wrap">
                    <span className="text-sm text-muted-foreground font-mono whitespace-nowrap">
                      {PLATFORM_BASE}/b/{merchantUsername || "your-username"}/o/
                    </span>
                    <Input
                      value={storeSlug}
                      onChange={(e) => setStoreSlug(e.target.value)}
                      onBlur={(e) => setStoreSlug(slugifyStorePath(e.target.value) || "store")}
                      className="h-7 w-40 font-mono text-sm"
                      placeholder="store"
                    />
                    <button onClick={copyStoreUrl} className="ml-auto shrink-0 text-muted-foreground hover:text-foreground transition-colors" title="Copy store URL">
                      {urlCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                  {!merchantUsername && (
                    <p className="text-xs text-amber-600">Set a username in Business Details to activate your store URL.</p>
                  )}
                </div>

                {/* Custom domain (DNS) */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Custom domain (optional)</Label>
                  <p className="text-xs text-muted-foreground">
                    Point your own domain at your store. Customers will then visit your domain instead of the platform URL.
                  </p>
                  <Input value={site.domain} onChange={(e) => updateSite({ domain: e.target.value })} placeholder="shop.yourbusiness.com.au" className="font-mono text-sm" />
                  {site.domain.trim() && (
                    <p className="text-xs text-emerald-600 flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" /> Live at <span className="font-mono">{liveStoreUrl}</span>
                    </p>
                  )}
                </div>

                {/* DNS setup instructions */}
                <div className="rounded-lg border border-dashed bg-muted/20 p-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">DNS setup</p>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>Log in to your domain registrar (e.g. Crazy Domains, Namecheap, Cloudflare).</li>
                    <li>Add a <span className="font-mono font-medium">CNAME</span> record for your chosen subdomain pointing to:</li>
                  </ol>
                  <div className="flex items-center gap-2 rounded border bg-background px-3 py-1.5 mt-1">
                    <span className="text-xs font-mono flex-1 select-all">koapos.com.au</span>
                    <button onClick={() => { navigator.clipboard.writeText("koapos.com.au").catch(() => {}); toast.success("Copied"); }} className="text-muted-foreground hover:text-foreground transition-colors">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">DNS changes can take up to 24–48 hours to propagate.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Palette className="w-4 h-4" /> Theme & Branding</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs mb-2 block">Colour presets</Label>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                    {COLOUR_PRESETS.map((p) => (
                      <button key={p.name} onClick={() => updateTheme({ primary: p.primary, accent: p.accent, bg: p.bg, text: p.text })}
                        className="rounded-lg border p-2 hover:ring-2 hover:ring-primary transition-all text-left">
                        <div className="flex gap-1 mb-1.5">
                          <div className="w-4 h-4 rounded" style={{ backgroundColor: p.primary }} />
                          <div className="w-4 h-4 rounded" style={{ backgroundColor: p.accent }} />
                          <div className="w-4 h-4 rounded border" style={{ backgroundColor: p.bg }} />
                        </div>
                        <p className="text-[10px] font-medium">{p.name}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Field label="Primary">    <Input type="color" value={site.theme.primary} onChange={(e) => updateTheme({ primary: e.target.value })} className="h-9" /></Field>
                  <Field label="Accent">     <Input type="color" value={site.theme.accent}  onChange={(e) => updateTheme({ accent:  e.target.value })} className="h-9" /></Field>
                  <Field label="Background"> <Input type="color" value={site.theme.bg}      onChange={(e) => updateTheme({ bg:      e.target.value })} className="h-9" /></Field>
                  <Field label="Text">       <Input type="color" value={site.theme.text}    onChange={(e) => updateTheme({ text:    e.target.value })} className="h-9" /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Font">
                    <Select value={site.theme.font} onValueChange={(v) => updateTheme({ font: v as ThemeSettings["font"] })}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>{FONT_OPTIONS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="Corner radius">
                    <Select value={site.theme.radius} onValueChange={(v) => updateTheme({ radius: v as ThemeSettings["radius"] })}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>{RADIUS_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div><CardTitle className="text-base flex items-center gap-2"><Wand2 className="w-4 h-4" /> Page Builder</CardTitle><CardDescription>Drag-style block editor for your pages</CardDescription></div>
                  <div className="flex gap-1 bg-muted rounded-lg p-1">
                    {(["sm", "md", "lg"] as const).map((w) => (
                      <button key={w} onClick={() => setPreviewWidth(w)}
                        className={cn("px-2 py-1 text-[10px] font-semibold uppercase rounded transition-all", previewWidth === w ? "bg-background shadow-sm" : "pill-selector text-muted-foreground")}>
                        {w === "sm" ? "Mobile" : w === "md" ? "Tablet" : "Desktop"}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_280px] border-t min-h-[600px]">
                  <div className="border-r p-3 space-y-2 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pages</p>
                      <div className="flex">
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setPageSettingsOpen(true)} title="Page settings & SEO"><Settings2 className="w-3 h-3" /></Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setAddPageOpen(true)} title="Add page"><Plus className="w-3 h-3" /></Button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {site.pages.map((p) => (
                        <div key={p.id} className={cn("group flex items-center gap-1 rounded px-2 py-1.5 text-sm cursor-pointer transition-colors", activePageId === p.id ? "bg-primary/10 text-primary" : "hover:bg-muted")}>
                          <button onClick={() => { setActivePageId(p.id); setActiveBlockId(null); }} className="flex-1 text-left flex items-center gap-2 min-w-0">
                            <FileText className="w-3 h-3 shrink-0 opacity-60" />
                            <span className="truncate text-xs">{p.name}</span>
                            {!p.visible && <EyeOff className="w-3 h-3 ml-auto text-muted-foreground" />}
                          </button>
                          <div className="opacity-0 group-hover:opacity-100 flex">
                            <button onClick={() => togglePageVisibility(p.id)} className="p-0.5 hover:text-foreground text-muted-foreground" title="Toggle visibility">
                              {p.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                            </button>
                            <button onClick={() => deletePage(p.id)} className="p-0.5 hover:text-destructive text-muted-foreground" title="Delete page"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Separator className="my-3" />
                    {clipboardBlock && (
                      <Button size="sm" variant="outline" className="w-full gap-1.5 mb-2 h-7 text-xs" onClick={pasteBlock} title="Paste copied block onto this page">
                        <Copy className="w-3 h-3" /> Paste block
                      </Button>
                    )}
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Add block</p>
                    <div className="space-y-1 max-h-72 overflow-auto pr-1">
                      {BLOCK_LIBRARY.map((b) => {
                        const Icon = b.icon;
                        return (
                          <button key={b.type} onClick={() => addBlock(b)} className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted text-left" title={b.description}>
                            <Icon className="w-3.5 h-3.5 text-muted-foreground" />{b.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="bg-muted/30 p-4 overflow-auto">
                    {activePage && (
                      <div className={cn("mx-auto rounded-lg shadow-sm overflow-hidden transition-all", previewWidthClass)}
                        style={{ backgroundColor: site.theme.bg, fontFamily: site.theme.font === "serif" ? "serif" : site.theme.font === "mono" ? "monospace" : "system-ui" }}>
                        <div className="flex items-center gap-1.5 border-b px-3 py-2 bg-background/60">
                          <div className="w-2 h-2 rounded-full bg-red-400" /><div className="w-2 h-2 rounded-full bg-yellow-400" /><div className="w-2 h-2 rounded-full bg-green-400" />
                          <p className="text-[10px] text-muted-foreground ml-2 truncate">{(site.domain.trim() || `koapos.com.au/b/${merchantUsername || "your-username"}/o/${storeSlug}`)}{activePage.slug}</p>
                        </div>
                        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: `${site.theme.text}15` }}>
                          <p className="font-bold text-sm" style={{ color: site.theme.text }}>{site.storeName}</p>
                          <div className="flex gap-3 text-xs" style={{ color: site.theme.text }}>
                            {site.pages.filter((p) => p.visible).slice(0, 4).map((p) => (
                              <span key={p.id} className={p.id === activePage.id ? "font-semibold" : "opacity-70"}>{p.name}</span>
                            ))}
                          </div>
                        </div>
                        <div className="p-4 space-y-3">
                          {activePage.blocks.length === 0 ? (
                            <div className="py-12 text-center text-sm text-muted-foreground"><Layout className="w-8 h-8 mx-auto mb-2 opacity-30" />No blocks yet. Add one from the left.</div>
                          ) : activePage.blocks.map((b) => (
                            <div key={b.id}
                              draggable
                              onDragStart={() => setDragBlockId(b.id)}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={(e) => { e.preventDefault(); if (dragBlockId) reorderBlock(dragBlockId, b.id); setDragBlockId(null); }}
                              onDragEnd={() => setDragBlockId(null)}
                              onClick={() => setActiveBlockId(b.id)}
                              style={blockWrapperStyle(b.data)}
                              className={cn("relative rounded cursor-pointer transition-all", b.data._fullWidth && "-mx-4", dragBlockId === b.id && "opacity-50", activeBlockId === b.id ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-muted-foreground/30")}>
                              {activeBlockId === b.id && (
                                <div className="absolute -top-2 -right-2 flex gap-1 z-10">
                                  <button onClick={(e) => { e.stopPropagation(); moveBlock(b.id, -1); }} className="w-6 h-6 rounded bg-background border shadow-sm flex items-center justify-center hover:bg-muted" title="Move up"><ArrowUp className="w-3 h-3" /></button>
                                  <button onClick={(e) => { e.stopPropagation(); moveBlock(b.id, 1); }}  className="w-6 h-6 rounded bg-background border shadow-sm flex items-center justify-center hover:bg-muted" title="Move down"><ArrowDown className="w-3 h-3" /></button>
                                  <button onClick={(e) => { e.stopPropagation(); duplicateBlock(b.id); }} className="w-6 h-6 rounded bg-background border shadow-sm flex items-center justify-center hover:bg-muted" title="Duplicate"><CopyPlus className="w-3 h-3" /></button>
                                  <button onClick={(e) => { e.stopPropagation(); copyBlock(b.id); }} className="w-6 h-6 rounded bg-background border shadow-sm flex items-center justify-center hover:bg-muted" title="Copy"><Copy className="w-3 h-3" /></button>
                                  <button onClick={(e) => { e.stopPropagation(); deleteBlock(b.id); }}  className="w-6 h-6 rounded bg-background border shadow-sm flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground" title="Delete"><Trash2 className="w-3 h-3" /></button>
                                </div>
                              )}
                              <BlockPreview block={b} theme={site.theme} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-l p-4 bg-background overflow-auto">
                    {activeBlock ? (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{BLOCK_LIBRARY.find((m) => m.type === activeBlock.type)?.label}</p>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => deleteBlock(activeBlock.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                        <BlockEditor block={activeBlock} onChange={updateBlock} />
                        <BlockStyleSection block={activeBlock} onChange={updateBlock} />
                      </>
                    ) : (
                      <div className="text-center text-xs text-muted-foreground py-12">
                        <Wand2 className="w-7 h-7 mx-auto mb-2 opacity-40" />Click a block in the preview to edit it, or add a new one from the left panel.
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Layers className="w-4 h-4" /> Features</CardTitle><CardDescription>Toggle storefront features</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { key: "checkout"   as const, icon: ShoppingBag, label: "Online checkout",     desc: "Allow purchases from your website" },
                    { key: "loyalty"    as const, icon: Gift,         label: "Loyalty integration", desc: "Customers earn points on online purchases" },
                    { key: "customers"  as const, icon: Users,        label: "Customer accounts",   desc: "Sign-in, order history, saved details" },
                    { key: "quickCodes" as const, icon: QrCode,       label: "Quick codes & QR",    desc: "Promo codes redeemable in-store & online" },
                    { key: "reviews"    as const, icon: Star,         label: "Product reviews",     desc: "Let customers leave ratings" },
                    { key: "newsletter" as const, icon: Mail,         label: "Newsletter",          desc: "Collect email subscribers" },
                  ].map(({ key, icon: Icon, label, desc }) => (
                    <div key={key} className="flex items-center gap-3">
                      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0"><p className="text-sm font-medium">{label}</p><p className="text-[11px] text-muted-foreground">{desc}</p></div>
                      <Switch checked={site.features[key]} onCheckedChange={() => toggleFeature(key)} />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><CreditCard className="w-4 h-4" /> Payments</CardTitle><CardDescription>Choose accepted payment methods</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { key: "stripe"   as const, label: "Stripe",                  desc: "Credit/debit cards via Stripe" },
                    { key: "paypal"   as const, label: "PayPal",                   desc: "PayPal balance and cards" },
                    { key: "afterpay" as const, label: "Afterpay",                 desc: "Buy now, pay later in 4" },
                    { key: "applePay" as const, label: "Apple Pay & Google Pay",   desc: "One-tap mobile checkout" },
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="flex items-center gap-3">
                      <CreditCard className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0"><p className="text-sm font-medium">{label}</p><p className="text-[11px] text-muted-foreground">{desc}</p></div>
                      <Switch checked={site.payments[key]} onCheckedChange={() => togglePayment(key)} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div><CardTitle className="text-base flex items-center gap-2"><Code2 className="w-4 h-4" /> Quick Codes</CardTitle><CardDescription>Promo codes and short URLs redeemable on your store</CardDescription></div>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={addQuickCode}><Plus className="w-3.5 h-3.5" /> Add code</Button>
                </div>
              </CardHeader>
              <CardContent>
                {site.quickCodes.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-6">No quick codes yet.</div>
                ) : (
                  <div className="space-y-2">
                    {site.quickCodes.map((q) => (
                      <div key={q.id} className="grid grid-cols-1 sm:grid-cols-[160px_1fr_1fr_auto] gap-2 items-center rounded border bg-muted/20 p-2">
                        <Input value={q.code}  onChange={(e) => updateQuickCode(q.id, { code:  e.target.value })} className="h-8 font-mono text-xs" />
                        <Input value={q.label} onChange={(e) => updateQuickCode(q.id, { label: e.target.value })} className="h-8 text-xs" placeholder="Label" />
                        <Input value={q.url}   onChange={(e) => updateQuickCode(q.id, { url:   e.target.value })} className="h-8 text-xs" placeholder="/shop?promo=…" />
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteQuickCode(q.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Dialog open={addPageOpen} onOpenChange={setAddPageOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New page</DialogTitle><DialogDescription>Add a new page to your site.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <Field label="Page name"><Input value={newPage.name} onChange={(e) => setNewPage((p) => ({ ...p, name: e.target.value }))} placeholder="FAQ" /></Field>
            <Field label="Slug (optional)"><Input value={newPage.slug} onChange={(e) => setNewPage((p) => ({ ...p, slug: e.target.value }))} placeholder="/faq" /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddPageOpen(false)}>Cancel</Button>
            <Button onClick={addPage}>Add page</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pageSettingsOpen} onOpenChange={setPageSettingsOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Page settings &amp; SEO</DialogTitle>
            <DialogDescription>Settings for <strong>{activePage?.name}</strong>. Used by search engines and social shares.</DialogDescription>
          </DialogHeader>
          {activePage && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Page name"><Input value={activePage.name} onChange={(e) => updatePage({ name: e.target.value })} /></Field>
                <Field label="Slug"><Input value={activePage.slug} onChange={(e) => updatePage({ slug: e.target.value })} placeholder="/about" /></Field>
              </div>
              <Field label="SEO title"><Input value={activePage.seoTitle ?? ""} onChange={(e) => updatePage({ seoTitle: e.target.value })} placeholder={activePage.name} /></Field>
              <Field label="SEO description"><Textarea rows={3} value={activePage.seoDescription ?? ""} onChange={(e) => updatePage({ seoDescription: e.target.value })} placeholder="A short summary shown in search results (max ~160 characters)." /></Field>
              <Field label="Social share image URL"><Input value={activePage.shareImage ?? ""} onChange={(e) => updatePage({ shareImage: e.target.value })} placeholder="https://…" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Publish date (optional)"><Input type="datetime-local" value={activePage.publishAt ?? ""} onChange={(e) => updatePage({ publishAt: e.target.value })} /></Field>
                <Field label="Visibility">
                  <Select value={activePage.visible ? "visible" : "hidden"} onValueChange={(v) => updatePage({ visible: v === "visible" })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="visible">Visible</SelectItem><SelectItem value="hidden">Hidden</SelectItem></SelectContent>
                  </Select>
                </Field>
              </div>
              {activePage.publishAt && (
                <p className="text-xs text-muted-foreground">
                  Scheduled to go live on {new Date(activePage.publishAt).toLocaleString("en-AU")}. Until then it stays hidden from visitors.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setPageSettingsOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!connectProvider} onOpenChange={(o) => { if (!o) setConnectProvider(null); }}>
        <DialogContent className="max-w-md">
          {connectProvider && (() => {
            const provider = THIRDPARTY_PROVIDERS.find((p) => p.id === connectProvider);
            if (!provider) return null;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><BrandIcon name={provider.id} size={32} />Connect {provider.name}</DialogTitle>
                  <DialogDescription>{provider.tagline}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <Field label="Store URL"><Input value={connectForm.url} onChange={(e) => setConnectForm((f) => ({ ...f, url: e.target.value }))} placeholder={`yourstore.${provider.id}.com`} /></Field>
                  <Field label="API key / token (optional)"><Input value={connectForm.apiKey} onChange={(e) => setConnectForm((f) => ({ ...f, apiKey: e.target.value }))} type="password" placeholder="••••••••" /></Field>
                  <p className="text-[11px] text-muted-foreground">KoaPOS will sync products, orders, customers and inventory two-ways with your {provider.name} store.</p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setConnectProvider(null)}>Cancel</Button>
                  <Button onClick={connectThirdParty}>Connect</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
