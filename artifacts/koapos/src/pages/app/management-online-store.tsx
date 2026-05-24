import { useState, useEffect, useMemo } from "react";
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
import {
  Globe, Store, Wrench, Plus, Trash2, Eye, EyeOff, GripVertical,
  Type as TypeIcon, Image as ImageIcon, Layout, ShoppingBag, CreditCard,
  Gift, Users, QrCode, MapPin, Star, Mail, ChevronRight, CheckCircle2,
  Settings2, Palette, Upload, ExternalLink, FileText, Package,
  Code2, Sparkles, Phone, Clock, ArrowUp, ArrowDown, Layers, Wand2,
} from "lucide-react";

const STORAGE_KEY      = "koapos_online_store";
const THIRDPARTY_KEY   = "koapos_online_store_thirdparty";

type StoreMode = "builder" | "thirdparty";

interface ThemeSettings {
  primary:   string;
  accent:    string;
  bg:        string;
  text:      string;
  font:      "sans" | "serif" | "mono";
  radius:    "none" | "sm" | "md" | "lg";
}

interface SiteSettings {
  mode:           StoreMode;
  storeName:      string;
  tagline:        string;
  logoUrl:        string;
  faviconUrl:     string;
  domain:         string;
  published:      boolean;
  theme:          ThemeSettings;
  payments:       { stripe: boolean; paypal: boolean; afterpay: boolean; applePay: boolean };
  features:       { loyalty: boolean; customers: boolean; checkout: boolean; quickCodes: boolean; reviews: boolean; newsletter: boolean };
  pages:          Page[];
  quickCodes:     QuickCode[];
}

interface Page {
  id:      string;
  name:    string;
  slug:    string;
  visible: boolean;
  blocks:  Block[];
}

interface Block {
  id:      string;
  type:    BlockType;
  data:    Record<string, string | number | boolean>;
}

type BlockType =
  | "hero"
  | "heading"
  | "text"
  | "image"
  | "product-grid"
  | "featured-product"
  | "gallery"
  | "cta"
  | "newsletter"
  | "contact"
  | "spacer"
  | "loyalty-banner"
  | "quick-code";

interface QuickCode {
  id:    string;
  code:  string;
  label: string;
  url:   string;
}

interface BlockMeta {
  type:        BlockType;
  label:       string;
  icon:        React.ComponentType<{ className?: string }>;
  description: string;
  defaultData: Record<string, string | number | boolean>;
}

const BLOCK_LIBRARY: BlockMeta[] = [
  { type: "hero",            label: "Hero Banner",       icon: Layout,      description: "Full-width header with image, headline and CTA",          defaultData: { headline: "Welcome to our store", subhead: "Discover what we have to offer", cta: "Shop now", ctaLink: "/shop", imageUrl: "" } },
  { type: "heading",         label: "Heading",           icon: TypeIcon,    description: "Section title",                                            defaultData: { text: "Section Heading", size: "lg", align: "left" } },
  { type: "text",            label: "Text Block",        icon: FileText,    description: "Paragraph copy",                                           defaultData: { text: "Add your content here. Tell your customers what makes your store special." } },
  { type: "image",           label: "Image",             icon: ImageIcon,   description: "Single image",                                              defaultData: { url: "", alt: "Image", caption: "" } },
  { type: "product-grid",    label: "Product Grid",      icon: Package,     description: "Grid of products from your catalogue",                     defaultData: { columns: 4, count: 8, category: "all" } },
  { type: "featured-product",label: "Featured Product",  icon: Star,        description: "Highlight a single product",                               defaultData: { productSku: "", layout: "right" } },
  { type: "gallery",         label: "Image Gallery",     icon: Layers,      description: "Grid of images",                                            defaultData: { columns: 3 } },
  { type: "cta",             label: "Call to Action",    icon: ChevronRight,description: "Banner with button",                                       defaultData: { headline: "Ready to start?", text: "Take the next step", buttonText: "Get started", buttonLink: "/contact" } },
  { type: "newsletter",      label: "Newsletter",        icon: Mail,        description: "Email signup form",                                         defaultData: { headline: "Stay in the loop", text: "Sign up for new arrivals and special offers" } },
  { type: "contact",         label: "Contact Info",      icon: Phone,       description: "Business contact details",                                  defaultData: { phone: "", email: "", address: "", hours: "" } },
  { type: "spacer",          label: "Spacer",            icon: GripVertical,description: "Vertical spacing",                                          defaultData: { height: 48 } },
  { type: "loyalty-banner",  label: "Loyalty Promo",     icon: Gift,        description: "Promote your loyalty program",                              defaultData: { headline: "Join our rewards program", text: "Earn points on every purchase", points: 100 } },
  { type: "quick-code",      label: "Quick Code",        icon: QrCode,      description: "Embed a QR code or short URL",                              defaultData: { code: "" } },
];

const FONT_OPTIONS = [
  { value: "sans",  label: "Sans Serif (Modern)" },
  { value: "serif", label: "Serif (Elegant)" },
  { value: "mono",  label: "Monospace (Tech)" },
] as const;

const RADIUS_OPTIONS = [
  { value: "none", label: "Square" },
  { value: "sm",   label: "Subtle" },
  { value: "md",   label: "Rounded" },
  { value: "lg",   label: "Pill" },
] as const;

const COLOUR_PRESETS = [
  { name: "Coastal",   primary: "#0EA5E9", accent: "#06B6D4", bg: "#F8FAFC", text: "#0F172A" },
  { name: "Outback",   primary: "#D97706", accent: "#92400E", bg: "#FFFBEB", text: "#1F2937" },
  { name: "Eucalypt",  primary: "#10B981", accent: "#059669", bg: "#F0FDF4", text: "#111827" },
  { name: "Galah",     primary: "#EC4899", accent: "#BE185D", bg: "#FDF2F8", text: "#1F2937" },
  { name: "Midnight",  primary: "#6366F1", accent: "#4338CA", bg: "#0F172A", text: "#F8FAFC" },
  { name: "Pearl",     primary: "#111827", accent: "#374151", bg: "#FFFFFF", text: "#0F172A" },
];

const DEFAULT_SITE: SiteSettings = {
  mode:       "builder",
  storeName:  "My Online Store",
  tagline:    "Shop our full range online",
  logoUrl:    "",
  faviconUrl: "",
  domain:     "mystore.koapos.shop",
  published:  false,
  theme: {
    primary: "#0EA5E9",
    accent:  "#06B6D4",
    bg:      "#F8FAFC",
    text:    "#0F172A",
    font:    "sans",
    radius:  "md",
  },
  payments: { stripe: true, paypal: false, afterpay: false, applePay: true },
  features: { loyalty: true, customers: true, checkout: true, quickCodes: true, reviews: false, newsletter: true },
  pages: [
    {
      id: "p1", name: "Home", slug: "/", visible: true,
      blocks: [
        { id: "b1", type: "hero",         data: { headline: "Welcome to our store", subhead: "Quality products, delivered fast", cta: "Shop now", ctaLink: "/shop", imageUrl: "" } },
        { id: "b2", type: "product-grid", data: { columns: 4, count: 8, category: "all" } },
        { id: "b3", type: "loyalty-banner", data: { headline: "Join our rewards program", text: "Earn 1 point per $1 spent", points: 100 } },
        { id: "b4", type: "newsletter",   data: { headline: "Stay in the loop", text: "Sign up for new arrivals and offers" } },
      ],
    },
    {
      id: "p2", name: "Shop", slug: "/shop", visible: true,
      blocks: [
        { id: "b5", type: "heading",      data: { text: "All Products", size: "xl", align: "left" } },
        { id: "b6", type: "product-grid", data: { columns: 4, count: 24, category: "all" } },
      ],
    },
    {
      id: "p3", name: "About", slug: "/about", visible: true,
      blocks: [
        { id: "b7", type: "heading", data: { text: "About Us", size: "xl", align: "center" } },
        { id: "b8", type: "text",    data: { text: "Tell your story. What makes your brand unique?" } },
      ],
    },
    {
      id: "p4", name: "Contact", slug: "/contact", visible: true,
      blocks: [
        { id: "b9",  type: "heading", data: { text: "Get in touch", size: "xl", align: "center" } },
        { id: "b10", type: "contact", data: { phone: "(02) 1234 5678", email: "hello@store.com", address: "123 Shop St, Sydney", hours: "Mon–Sat 9–5" } },
      ],
    },
  ],
  quickCodes: [
    { id: "qc1", code: "SUMMER25", label: "Summer 25% off", url: "/shop?promo=SUMMER25" },
    { id: "qc2", code: "WELCOME10", label: "Welcome 10% off", url: "/shop?promo=WELCOME10" },
  ],
};

const THIRDPARTY_PROVIDERS = [
  { id: "shopify",      name: "Shopify",       tagline: "All-in-one ecommerce",          color: "#96BF47", logo: "🛒" },
  { id: "woocommerce",  name: "WooCommerce",   tagline: "WordPress ecommerce plugin",    color: "#7F54B3", logo: "🟣" },
  { id: "bigcommerce",  name: "BigCommerce",   tagline: "Enterprise-grade ecommerce",    color: "#121118", logo: "🅱️" },
  { id: "squarespace",  name: "Squarespace",   tagline: "Design-led websites & stores",  color: "#000000", logo: "⬛" },
  { id: "wix",          name: "Wix",           tagline: "Drag-and-drop site builder",    color: "#0C6EFC", logo: "🟦" },
  { id: "neto",         name: "Maropost (Neto)", tagline: "Australian ecommerce platform", color: "#FF6A13", logo: "🦘" },
];

interface ThirdParty {
  providerId: string;
  storeUrl:   string;
  apiKey:     string;
  connected:  boolean;
  connectedAt:string;
}

function loadSite(): SiteSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SITE;
    const parsed = JSON.parse(raw) as Partial<SiteSettings>;
    return {
      ...DEFAULT_SITE,
      ...parsed,
      theme:    { ...DEFAULT_SITE.theme, ...(parsed.theme    ?? {}) },
      payments: { ...DEFAULT_SITE.payments, ...(parsed.payments ?? {}) },
      features: { ...DEFAULT_SITE.features, ...(parsed.features ?? {}) },
      pages:      parsed.pages      ?? DEFAULT_SITE.pages,
      quickCodes: parsed.quickCodes ?? DEFAULT_SITE.quickCodes,
    };
  } catch { return DEFAULT_SITE; }
}

function saveSite(s: SiteSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function loadThirdParty(): ThirdParty | null {
  try {
    const raw = localStorage.getItem(THIRDPARTY_KEY);
    return raw ? JSON.parse(raw) as ThirdParty : null;
  } catch { return null; }
}

function saveThirdParty(t: ThirdParty | null) {
  if (t) localStorage.setItem(THIRDPARTY_KEY, JSON.stringify(t));
  else   localStorage.removeItem(THIRDPARTY_KEY);
}

/* ─── Block preview ──────────────────────────────────────────────────────── */

function BlockPreview({ block, theme }: { block: Block; theme: ThemeSettings }) {
  const radiusClass = { none: "rounded-none", sm: "rounded", md: "rounded-lg", lg: "rounded-full" }[theme.radius];

  switch (block.type) {
    case "hero":
      return (
        <div
          className="p-6 md:p-10 flex flex-col items-start gap-3"
          style={{ background: `linear-gradient(135deg, ${theme.primary}22, ${theme.accent}22)` }}
        >
          <h2 className="text-2xl md:text-3xl font-bold" style={{ color: theme.text }}>{String(block.data.headline)}</h2>
          <p className="text-sm md:text-base opacity-80" style={{ color: theme.text }}>{String(block.data.subhead)}</p>
          <button
            className={cn("px-4 py-2 text-sm font-semibold text-white", radiusClass)}
            style={{ backgroundColor: theme.primary }}
          >
            {String(block.data.cta)}
          </button>
        </div>
      );
    case "heading":
      return (
        <div className={cn("py-2", block.data.align === "center" ? "text-center" : block.data.align === "right" ? "text-right" : "text-left")}>
          <h3 className={cn("font-bold", block.data.size === "xl" ? "text-2xl" : block.data.size === "lg" ? "text-xl" : "text-base")} style={{ color: theme.text }}>
            {String(block.data.text)}
          </h3>
        </div>
      );
    case "text":
      return <p className="text-sm leading-relaxed" style={{ color: theme.text }}>{String(block.data.text)}</p>;
    case "image":
      return (
        <div className={cn("bg-muted aspect-video flex items-center justify-center overflow-hidden", radiusClass)}>
          {block.data.url ? (
            <img src={String(block.data.url)} alt={String(block.data.alt || "")} className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="w-10 h-10 text-muted-foreground/40" />
          )}
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
          <div className={cn("w-24 h-24 bg-muted flex items-center justify-center shrink-0", radiusClass)}>
            <Package className="w-8 h-8 text-muted-foreground/40" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">Featured Product</p>
            <p className="text-xs text-muted-foreground mt-1">Highlighted item from your catalogue</p>
            <button className={cn("mt-2 px-3 py-1 text-xs font-semibold text-white", radiusClass)} style={{ backgroundColor: theme.primary }}>
              View product
            </button>
          </div>
        </div>
      );
    case "gallery": {
      const cols = Number(block.data.columns) || 3;
      return (
        <div className={cn("grid gap-1.5", cols === 2 ? "grid-cols-2" : cols === 4 ? "grid-cols-4" : "grid-cols-3")}>
          {Array.from({ length: cols * 2 }).map((_, i) => (
            <div key={i} className={cn("aspect-square bg-muted/60 flex items-center justify-center", radiusClass)}>
              <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
            </div>
          ))}
        </div>
      );
    }
    case "cta":
      return (
        <div
          className={cn("p-6 flex flex-col items-center gap-2 text-center", radiusClass)}
          style={{ backgroundColor: `${theme.primary}15` }}
        >
          <h3 className="text-lg font-bold" style={{ color: theme.text }}>{String(block.data.headline)}</h3>
          <p className="text-sm opacity-70" style={{ color: theme.text }}>{String(block.data.text)}</p>
          <button className={cn("px-4 py-2 text-sm font-semibold text-white mt-1", radiusClass)} style={{ backgroundColor: theme.primary }}>
            {String(block.data.buttonText)}
          </button>
        </div>
      );
    case "newsletter":
      return (
        <div className={cn("p-5 text-center", radiusClass)} style={{ backgroundColor: `${theme.accent}15` }}>
          <h3 className="text-base font-semibold" style={{ color: theme.text }}>{String(block.data.headline)}</h3>
          <p className="text-xs opacity-70 mt-1 mb-3" style={{ color: theme.text }}>{String(block.data.text)}</p>
          <div className="flex gap-2 max-w-sm mx-auto">
            <input placeholder="you@email.com" className={cn("flex-1 px-3 py-1.5 text-sm border bg-background", radiusClass)} />
            <button className={cn("px-3 py-1.5 text-xs font-semibold text-white", radiusClass)} style={{ backgroundColor: theme.primary }}>
              Subscribe
            </button>
          </div>
        </div>
      );
    case "contact":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm" style={{ color: theme.text }}>
          {block.data.phone   ? <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 opacity-60" />{String(block.data.phone)}</div> : null}
          {block.data.email   ? <div className="flex items-center gap-2"><Mail  className="w-3.5 h-3.5 opacity-60" />{String(block.data.email)}</div> : null}
          {block.data.address ? <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 opacity-60" />{String(block.data.address)}</div> : null}
          {block.data.hours   ? <div className="flex items-center gap-2"><Clock  className="w-3.5 h-3.5 opacity-60" />{String(block.data.hours)}</div> : null}
        </div>
      );
    case "spacer":
      return <div style={{ height: Number(block.data.height) || 48 }} className="border-l-2 border-dashed border-muted/40 ml-2" />;
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
  }
}

/* ─── Block editor ───────────────────────────────────────────────────────── */

function BlockEditor({ block, onChange }: { block: Block; onChange: (b: Block) => void }) {
  const set = (patch: Record<string, string | number | boolean>) =>
    onChange({ ...block, data: { ...block.data, ...patch } });

  const meta = BLOCK_LIBRARY.find((m) => m.type === block.type);
  if (!meta) return null;

  switch (block.type) {
    case "hero":
      return (
        <div className="space-y-3">
          <Field label="Headline">       <Input value={String(block.data.headline ?? "")} onChange={(e) => set({ headline: e.target.value })} /></Field>
          <Field label="Sub-headline">   <Input value={String(block.data.subhead ?? "")}  onChange={(e) => set({ subhead:  e.target.value })} /></Field>
          <Field label="Button label">   <Input value={String(block.data.cta ?? "")}      onChange={(e) => set({ cta:      e.target.value })} /></Field>
          <Field label="Button link">    <Input value={String(block.data.ctaLink ?? "")}  onChange={(e) => set({ ctaLink:  e.target.value })} /></Field>
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
                <SelectContent>
                  <SelectItem value="base">Small</SelectItem>
                  <SelectItem value="lg">Medium</SelectItem>
                  <SelectItem value="xl">Large</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Alignment">
              <Select value={String(block.data.align)} onValueChange={(v) => set({ align: v })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>
      );
    case "text":
      return <Field label="Text"><Textarea rows={5} value={String(block.data.text ?? "")} onChange={(e) => set({ text: e.target.value })} /></Field>;
    case "image":
      return (
        <div className="space-y-3">
          <Field label="Image URL"><Input value={String(block.data.url ?? "")} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" /></Field>
          <Field label="Alt text">  <Input value={String(block.data.alt ?? "")} onChange={(e) => set({ alt: e.target.value })} /></Field>
          <Field label="Caption">   <Input value={String(block.data.caption ?? "")} onChange={(e) => set({ caption: e.target.value })} /></Field>
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
              <SelectContent>
                <SelectItem value="left">Image left</SelectItem>
                <SelectItem value="right">Image right</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      );
    case "gallery":
      return <Field label="Columns"><Input type="number" min={2} max={4} value={Number(block.data.columns)} onChange={(e) => set({ columns: parseInt(e.target.value) || 3 })} /></Field>;
    case "cta":
      return (
        <div className="space-y-3">
          <Field label="Headline">   <Input value={String(block.data.headline ?? "")} onChange={(e) => set({ headline: e.target.value })} /></Field>
          <Field label="Sub-text">   <Input value={String(block.data.text ?? "")} onChange={(e) => set({ text: e.target.value })} /></Field>
          <Field label="Button text"><Input value={String(block.data.buttonText ?? "")} onChange={(e) => set({ buttonText: e.target.value })} /></Field>
          <Field label="Button link"><Input value={String(block.data.buttonLink ?? "")} onChange={(e) => set({ buttonLink: e.target.value })} /></Field>
        </div>
      );
    case "newsletter":
      return (
        <div className="space-y-3">
          <Field label="Headline"><Input value={String(block.data.headline ?? "")} onChange={(e) => set({ headline: e.target.value })} /></Field>
          <Field label="Sub-text"><Input value={String(block.data.text ?? "")} onChange={(e) => set({ text: e.target.value })} /></Field>
        </div>
      );
    case "contact":
      return (
        <div className="space-y-3">
          <Field label="Phone">  <Input value={String(block.data.phone ?? "")}   onChange={(e) => set({ phone:   e.target.value })} /></Field>
          <Field label="Email">  <Input value={String(block.data.email ?? "")}   onChange={(e) => set({ email:   e.target.value })} /></Field>
          <Field label="Address"><Input value={String(block.data.address ?? "")} onChange={(e) => set({ address: e.target.value })} /></Field>
          <Field label="Hours">  <Input value={String(block.data.hours ?? "")}   onChange={(e) => set({ hours:   e.target.value })} /></Field>
        </div>
      );
    case "spacer":
      return <Field label="Height (px)"><Input type="number" min={8} max={400} value={Number(block.data.height)} onChange={(e) => set({ height: parseInt(e.target.value) || 48 })} /></Field>;
    case "loyalty-banner":
      return (
        <div className="space-y-3">
          <Field label="Headline"><Input value={String(block.data.headline ?? "")} onChange={(e) => set({ headline: e.target.value })} /></Field>
          <Field label="Body">    <Input value={String(block.data.text ?? "")}     onChange={(e) => set({ text: e.target.value })} /></Field>
          <Field label="Points">  <Input type="number" value={Number(block.data.points)} onChange={(e) => set({ points: parseInt(e.target.value) || 0 })} /></Field>
        </div>
      );
    case "quick-code":
      return <Field label="Quick code"><Input value={String(block.data.code ?? "")} onChange={(e) => set({ code: e.target.value })} placeholder="SUMMER25" /></Field>;
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default function ManagementOnlineStorePage() {
  const [site, setSite] = useState<SiteSettings>(() => loadSite());
  const [thirdParty, setThirdParty] = useState<ThirdParty | null>(() => loadThirdParty());
  const [activePageId, setActivePageId] = useState<string>(() => loadSite().pages[0]?.id ?? "");
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [previewWidth, setPreviewWidth] = useState<"sm" | "md" | "lg">("lg");
  const [addPageOpen, setAddPageOpen] = useState(false);
  const [newPage, setNewPage] = useState({ name: "", slug: "" });
  const [connectProvider, setConnectProvider] = useState<string | null>(null);
  const [connectForm, setConnectForm] = useState({ url: "", apiKey: "" });

  useEffect(() => { saveSite(site); }, [site]);
  useEffect(() => { saveThirdParty(thirdParty); }, [thirdParty]);

  const activePage = useMemo(() => site.pages.find((p) => p.id === activePageId) ?? site.pages[0], [site.pages, activePageId]);
  const activeBlock = useMemo(() => activePage?.blocks.find((b) => b.id === activeBlockId) ?? null, [activePage, activeBlockId]);

  /* ─── Site mutators ──────────────────────────────────────────────── */
  const updateSite = (patch: Partial<SiteSettings>) => setSite((s) => ({ ...s, ...patch }));
  const updateTheme = (patch: Partial<ThemeSettings>) => setSite((s) => ({ ...s, theme: { ...s.theme, ...patch } }));
  const togglePayment = (k: keyof SiteSettings["payments"]) => setSite((s) => ({ ...s, payments: { ...s.payments, [k]: !s.payments[k] } }));
  const toggleFeature = (k: keyof SiteSettings["features"]) => setSite((s) => ({ ...s, features: { ...s.features, [k]: !s.features[k] } }));

  /* ─── Page mutators ──────────────────────────────────────────────── */
  const addPage = () => {
    if (!newPage.name.trim()) return;
    const slug = (newPage.slug.trim() || "/" + newPage.name.toLowerCase().replace(/\s+/g, "-")).replace(/^\/+/, "/");
    const id = `p${Date.now()}`;
    setSite((s) => ({ ...s, pages: [...s.pages, { id, name: newPage.name.trim(), slug, visible: true, blocks: [] }] }));
    setActivePageId(id);
    setAddPageOpen(false);
    setNewPage({ name: "", slug: "" });
    toast.success("Page added");
  };

  const deletePage = (id: string) => {
    if (site.pages.length <= 1) { toast.error("You need at least one page"); return; }
    setSite((s) => ({ ...s, pages: s.pages.filter((p) => p.id !== id) }));
    if (activePageId === id) setActivePageId(site.pages[0].id);
    toast.success("Page deleted");
  };

  const togglePageVisibility = (id: string) =>
    setSite((s) => ({ ...s, pages: s.pages.map((p) => p.id === id ? { ...p, visible: !p.visible } : p) }));

  /* ─── Block mutators ─────────────────────────────────────────────── */
  const addBlock = (meta: BlockMeta) => {
    if (!activePage) return;
    const id = `b${Date.now()}`;
    const newBlock: Block = { id, type: meta.type, data: { ...meta.defaultData } };
    setSite((s) => ({
      ...s,
      pages: s.pages.map((p) => p.id === activePage.id ? { ...p, blocks: [...p.blocks, newBlock] } : p),
    }));
    setActiveBlockId(id);
  };

  const updateBlock = (b: Block) => {
    if (!activePage) return;
    setSite((s) => ({
      ...s,
      pages: s.pages.map((p) => p.id === activePage.id ? { ...p, blocks: p.blocks.map((x) => x.id === b.id ? b : x) } : p),
    }));
  };

  const deleteBlock = (id: string) => {
    if (!activePage) return;
    setSite((s) => ({
      ...s,
      pages: s.pages.map((p) => p.id === activePage.id ? { ...p, blocks: p.blocks.filter((b) => b.id !== id) } : p),
    }));
    if (activeBlockId === id) setActiveBlockId(null);
  };

  const moveBlock = (id: string, dir: -1 | 1) => {
    if (!activePage) return;
    setSite((s) => ({
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

  /* ─── Quick codes ────────────────────────────────────────────────── */
  const addQuickCode = () => {
    const id = `qc${Date.now()}`;
    setSite((s) => ({ ...s, quickCodes: [...s.quickCodes, { id, code: "NEWCODE", label: "New promo", url: "/" }] }));
  };
  const updateQuickCode = (id: string, patch: Partial<QuickCode>) =>
    setSite((s) => ({ ...s, quickCodes: s.quickCodes.map((q) => q.id === id ? { ...q, ...patch } : q) }));
  const deleteQuickCode = (id: string) =>
    setSite((s) => ({ ...s, quickCodes: s.quickCodes.filter((q) => q.id !== id) }));

  /* ─── Third party ────────────────────────────────────────────────── */
  const connectThirdParty = () => {
    if (!connectProvider) return;
    if (!connectForm.url.trim()) { toast.error("Store URL is required"); return; }
    setThirdParty({
      providerId:  connectProvider,
      storeUrl:    connectForm.url.trim(),
      apiKey:      connectForm.apiKey.trim(),
      connected:   true,
      connectedAt: new Date().toISOString(),
    });
    setConnectProvider(null);
    setConnectForm({ url: "", apiKey: "" });
    toast.success("Connected to third-party store");
  };
  const disconnectThirdParty = () => { setThirdParty(null); toast.success("Disconnected"); };

  /* ─── Publish ────────────────────────────────────────────────────── */
  const togglePublish = () => {
    setSite((s) => ({ ...s, published: !s.published }));
    toast.success(site.published ? "Site unpublished" : "Site published");
  };

  const previewWidthClass = previewWidth === "sm" ? "max-w-sm" : previewWidth === "md" ? "max-w-2xl" : "max-w-full";

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Globe className="w-6 h-6 text-primary" />
              Online Store
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Build a full ecommerce website with a drag-and-drop block editor, or connect a third-party platform.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {site.mode === "builder" && (
              <>
                <Badge variant="secondary" className={cn("gap-1.5", site.published && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0")}>
                  {site.published ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                  {site.published ? "Live" : "Draft"}
                </Badge>
                <Button size="sm" variant={site.published ? "outline" : "default"} onClick={togglePublish} className="gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  {site.published ? "Unpublish" : "Publish"}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Mode switcher */}
        <Card>
          <CardContent className="p-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => updateSite({ mode: "builder" })}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-4 text-left transition-all",
                  site.mode === "builder"
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:bg-muted/40",
                )}
              >
                <Wrench className="w-5 h-5 mt-0.5 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-sm">KoaPOS Website Builder</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Full-featured drag-and-drop site with built-in checkout, loyalty, and customer sync.</p>
                </div>
              </button>
              <button
                onClick={() => updateSite({ mode: "thirdparty" })}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-4 text-left transition-all",
                  site.mode === "thirdparty"
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border hover:bg-muted/40",
                )}
              >
                <Store className="w-5 h-5 mt-0.5 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold text-sm">Connect Third-Party Store</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Sync with Shopify, WooCommerce, BigCommerce and others. Use KoaPOS as your POS and inventory backend.</p>
                </div>
              </button>
            </div>
          </CardContent>
        </Card>

        {site.mode === "thirdparty" ? (
          /* ───── Third-party connection UI ────────────────────────── */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Available Platforms</CardTitle>
                <CardDescription>Choose a platform to connect to your store</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {THIRDPARTY_PROVIDERS.map((p) => {
                    const isConnected = thirdParty?.providerId === p.id && thirdParty?.connected;
                    return (
                      <button
                        key={p.id}
                        onClick={() => { setConnectProvider(p.id); setConnectForm({ url: thirdParty?.storeUrl || "", apiKey: "" }); }}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border p-3 text-left transition-all",
                          isConnected ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800" : "hover:bg-muted/40",
                        )}
                      >
                        <span className="text-2xl shrink-0">{p.logo}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate">{p.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{p.tagline}</p>
                        </div>
                        {isConnected && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Connection Status</CardTitle>
                <CardDescription>Your active third-party integration</CardDescription>
              </CardHeader>
              <CardContent>
                {thirdParty?.connected ? (
                  <div className="space-y-4">
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <p className="text-sm font-semibold">
                          {THIRDPARTY_PROVIDERS.find((p) => p.id === thirdParty.providerId)?.name}
                        </p>
                        <Badge variant="secondary" className="ml-auto text-[10px]">Connected</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground break-all">{thirdParty.storeUrl}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Connected {new Date(thirdParty.connectedAt).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 gap-1.5" asChild>
                        <a href={thirdParty.storeUrl.startsWith("http") ? thirdParty.storeUrl : `https://${thirdParty.storeUrl}`} target="_blank" rel="noreferrer">
                          <ExternalLink className="w-3.5 h-3.5" /> Open store
                        </a>
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-destructive hover:text-destructive" onClick={disconnectThirdParty}>
                        Disconnect
                      </Button>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">What syncs</p>
                      {[
                        { icon: Package,       label: "Products & inventory" },
                        { icon: ShoppingBag,   label: "Orders (read & fulfil)" },
                        { icon: Users,         label: "Customers" },
                        { icon: CreditCard,    label: "Payments & refunds" },
                      ].map(({ icon: Icon, label }) => (
                        <div key={label} className="flex items-center gap-2 text-xs">
                          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>{label}</span>
                          <Badge variant="secondary" className="ml-auto text-[10px]">Active</Badge>
                        </div>
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
          /* ───── Builder UI ────────────────────────────────────────── */
          <>
            {/* Site basics */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Settings2 className="w-4 h-4" /> Site Basics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Store name"><Input value={site.storeName} onChange={(e) => updateSite({ storeName: e.target.value })} /></Field>
                  <Field label="Tagline">   <Input value={site.tagline}   onChange={(e) => updateSite({ tagline: e.target.value })} /></Field>
                  <Field label="Domain"><Input value={site.domain} onChange={(e) => updateSite({ domain: e.target.value })} placeholder="mystore.koapos.shop" /></Field>
                  <Field label="Logo URL"><Input value={site.logoUrl} onChange={(e) => updateSite({ logoUrl: e.target.value })} placeholder="https://… or upload" /></Field>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5"><Upload className="w-3.5 h-3.5" /> Upload logo</Button>
                  <Button variant="outline" size="sm" className="gap-1.5"><Upload className="w-3.5 h-3.5" /> Upload favicon</Button>
                </div>
              </CardContent>
            </Card>

            {/* Theme */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Palette className="w-4 h-4" /> Theme & Branding</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs mb-2 block">Colour presets</Label>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                    {COLOUR_PRESETS.map((p) => (
                      <button
                        key={p.name}
                        onClick={() => updateTheme({ primary: p.primary, accent: p.accent, bg: p.bg, text: p.text })}
                        className="rounded-lg border p-2 hover:ring-2 hover:ring-primary transition-all text-left"
                      >
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

            {/* Builder: pages + blocks + preview */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2"><Wand2 className="w-4 h-4" /> Page Builder</CardTitle>
                    <CardDescription>Drag-style block editor for your pages</CardDescription>
                  </div>
                  <div className="flex gap-1 bg-muted rounded-lg p-1">
                    {(["sm", "md", "lg"] as const).map((w) => (
                      <button
                        key={w}
                        onClick={() => setPreviewWidth(w)}
                        className={cn("px-2 py-1 text-[10px] font-semibold uppercase rounded transition-all", previewWidth === w ? "bg-background shadow-sm" : "text-muted-foreground")}
                      >
                        {w === "sm" ? "Mobile" : w === "md" ? "Tablet" : "Desktop"}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_280px] border-t min-h-[600px]">
                  {/* Pages list */}
                  <div className="border-r p-3 space-y-2 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Pages</p>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setAddPageOpen(true)} title="Add page"><Plus className="w-3 h-3" /></Button>
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
                            <button onClick={() => deletePage(p.id)} className="p-0.5 hover:text-destructive text-muted-foreground" title="Delete page">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <Separator className="my-3" />

                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Add block</p>
                    <div className="space-y-1 max-h-72 overflow-auto pr-1">
                      {BLOCK_LIBRARY.map((b) => {
                        const Icon = b.icon;
                        return (
                          <button
                            key={b.type}
                            onClick={() => addBlock(b)}
                            className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted text-left"
                            title={b.description}
                          >
                            <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                            {b.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="bg-muted/30 p-4 overflow-auto">
                    {activePage && (
                      <div
                        className={cn("mx-auto rounded-lg shadow-sm overflow-hidden transition-all", previewWidthClass)}
                        style={{ backgroundColor: site.theme.bg, fontFamily: site.theme.font === "serif" ? "serif" : site.theme.font === "mono" ? "monospace" : "system-ui" }}
                      >
                        {/* Mock browser chrome */}
                        <div className="flex items-center gap-1.5 border-b px-3 py-2 bg-background/60">
                          <div className="w-2 h-2 rounded-full bg-red-400" />
                          <div className="w-2 h-2 rounded-full bg-yellow-400" />
                          <div className="w-2 h-2 rounded-full bg-green-400" />
                          <p className="text-[10px] text-muted-foreground ml-2 truncate">{site.domain}{activePage.slug}</p>
                        </div>
                        {/* Mock header */}
                        <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: `${site.theme.text}15` }}>
                          <p className="font-bold text-sm" style={{ color: site.theme.text }}>{site.storeName}</p>
                          <div className="flex gap-3 text-xs" style={{ color: site.theme.text }}>
                            {site.pages.filter((p) => p.visible).slice(0, 4).map((p) => (
                              <span key={p.id} className={p.id === activePage.id ? "font-semibold" : "opacity-70"}>{p.name}</span>
                            ))}
                          </div>
                        </div>
                        {/* Page blocks */}
                        <div className="p-4 space-y-3">
                          {activePage.blocks.length === 0 ? (
                            <div className="py-12 text-center text-sm text-muted-foreground">
                              <Layout className="w-8 h-8 mx-auto mb-2 opacity-30" />
                              No blocks yet. Add one from the left.
                            </div>
                          ) : activePage.blocks.map((b) => (
                            <div
                              key={b.id}
                              onClick={() => setActiveBlockId(b.id)}
                              className={cn(
                                "relative rounded cursor-pointer transition-all",
                                activeBlockId === b.id ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-muted-foreground/30",
                              )}
                            >
                              {activeBlockId === b.id && (
                                <div className="absolute -top-2 -right-2 flex gap-1 z-10">
                                  <button onClick={(e) => { e.stopPropagation(); moveBlock(b.id, -1); }} className="w-6 h-6 rounded bg-background border shadow-sm flex items-center justify-center hover:bg-muted" title="Move up"><ArrowUp className="w-3 h-3" /></button>
                                  <button onClick={(e) => { e.stopPropagation(); moveBlock(b.id, 1); }}  className="w-6 h-6 rounded bg-background border shadow-sm flex items-center justify-center hover:bg-muted" title="Move down"><ArrowDown className="w-3 h-3" /></button>
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

                  {/* Block inspector */}
                  <div className="border-l p-4 bg-background overflow-auto">
                    {activeBlock ? (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {BLOCK_LIBRARY.find((m) => m.type === activeBlock.type)?.label}
                          </p>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => deleteBlock(activeBlock.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        <BlockEditor block={activeBlock} onChange={updateBlock} />
                      </>
                    ) : (
                      <div className="text-center text-xs text-muted-foreground py-12">
                        <Wand2 className="w-7 h-7 mx-auto mb-2 opacity-40" />
                        Click a block in the preview to edit it, or add a new one from the left panel.
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Features + payments + quick codes */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><Layers className="w-4 h-4" /> Features</CardTitle>
                  <CardDescription>Toggle storefront features</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { key: "checkout"   as const, icon: ShoppingBag, label: "Online checkout",      desc: "Allow purchases from your website" },
                    { key: "loyalty"    as const, icon: Gift,        label: "Loyalty integration",  desc: "Customers earn points on online purchases" },
                    { key: "customers"  as const, icon: Users,       label: "Customer accounts",    desc: "Sign-in, order history, saved details" },
                    { key: "quickCodes" as const, icon: QrCode,      label: "Quick codes & QR",     desc: "Promo codes redeemable in-store & online" },
                    { key: "reviews"    as const, icon: Star,        label: "Product reviews",      desc: "Let customers leave ratings" },
                    { key: "newsletter" as const, icon: Mail,        label: "Newsletter",           desc: "Collect email subscribers" },
                  ].map(({ key, icon: Icon, label, desc }) => (
                    <div key={key} className="flex items-center gap-3">
                      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-[11px] text-muted-foreground">{desc}</p>
                      </div>
                      <Switch checked={site.features[key]} onCheckedChange={() => toggleFeature(key)} />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2"><CreditCard className="w-4 h-4" /> Payments</CardTitle>
                  <CardDescription>Choose accepted payment methods</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { key: "stripe"   as const, label: "Stripe",   desc: "Credit/debit cards via Stripe" },
                    { key: "paypal"   as const, label: "PayPal",   desc: "PayPal balance and cards" },
                    { key: "afterpay" as const, label: "Afterpay", desc: "Buy now, pay later in 4" },
                    { key: "applePay" as const, label: "Apple Pay & Google Pay", desc: "One-tap mobile checkout" },
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="flex items-center gap-3">
                      <CreditCard className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-[11px] text-muted-foreground">{desc}</p>
                      </div>
                      <Switch checked={site.payments[key]} onCheckedChange={() => togglePayment(key)} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Quick codes */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2"><Code2 className="w-4 h-4" /> Quick Codes</CardTitle>
                    <CardDescription>Promo codes and short URLs redeemable on your store</CardDescription>
                  </div>
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
                        <Input value={q.code}  onChange={(e) => updateQuickCode(q.id, { code: e.target.value })}  className="h-8 font-mono text-xs" />
                        <Input value={q.label} onChange={(e) => updateQuickCode(q.id, { label: e.target.value })} className="h-8 text-xs" placeholder="Label" />
                        <Input value={q.url}   onChange={(e) => updateQuickCode(q.id, { url: e.target.value })}   className="h-8 text-xs" placeholder="/shop?promo=…" />
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteQuickCode(q.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Add page dialog */}
      <Dialog open={addPageOpen} onOpenChange={setAddPageOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New page</DialogTitle>
            <DialogDescription>Add a new page to your site.</DialogDescription>
          </DialogHeader>
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

      {/* Connect third-party dialog */}
      <Dialog open={!!connectProvider} onOpenChange={(o) => { if (!o) setConnectProvider(null); }}>
        <DialogContent className="max-w-md">
          {connectProvider && (() => {
            const provider = THIRDPARTY_PROVIDERS.find((p) => p.id === connectProvider);
            if (!provider) return null;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span className="text-2xl">{provider.logo}</span>
                    Connect {provider.name}
                  </DialogTitle>
                  <DialogDescription>{provider.tagline}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <Field label="Store URL"><Input value={connectForm.url} onChange={(e) => setConnectForm((f) => ({ ...f, url: e.target.value }))} placeholder={`yourstore.${provider.id}.com`} /></Field>
                  <Field label="API key / token (optional)"><Input value={connectForm.apiKey} onChange={(e) => setConnectForm((f) => ({ ...f, apiKey: e.target.value }))} type="password" placeholder="••••••••" /></Field>
                  <p className="text-[11px] text-muted-foreground">
                    KoaPOS will sync products, orders, customers and inventory two-ways with your {provider.name} store.
                  </p>
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
