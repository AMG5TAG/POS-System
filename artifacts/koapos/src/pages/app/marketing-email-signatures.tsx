import { useState, useMemo, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Mail, Copy, Download, Code2, Wand2, RotateCcw, Save, Trash2, Check,
  ExternalLink, PenLine, Palette, Contact, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useBusinessProfile } from "@/lib/business-profile";
import { useGetMerchant } from "@workspace/api-client-react";

/* ── Data model ──────────────────────────────────────────────────────────── */

interface SignatureData {
  fullName: string;
  jobTitle: string;
  businessName: string;
  phone: string;
  mobile: string;
  email: string;
  website: string;
  address: string;
  tagline: string;
  logoUrl: string;
  disclaimer: string;
  socials: {
    facebook: string;
    instagram: string;
    linkedin: string;
    twitter: string;
    youtube: string;
    tiktok: string;
  };
}

interface SignatureStyle {
  template: TemplateId;
  accent: string;
  textColor: string;
  font: FontId;
  logoSize: number;
  showLogo: boolean;
  showSocials: boolean;
  showDividers: boolean;
}

type TemplateId = "classic" | "modern" | "compact" | "bold" | "minimal";
type FontId = keyof typeof FONT_STACKS;

const FONT_STACKS = {
  arial:    "Arial, Helvetica, sans-serif",
  verdana:  "Verdana, Geneva, sans-serif",
  tahoma:   "Tahoma, Geneva, sans-serif",
  trebuchet:"'Trebuchet MS', Helvetica, sans-serif",
  georgia:  "Georgia, 'Times New Roman', serif",
  times:    "'Times New Roman', Times, serif",
  courier:  "'Courier New', Courier, monospace",
} as const;

const FONT_LABELS: Record<FontId, string> = {
  arial: "Arial", verdana: "Verdana", tahoma: "Tahoma", trebuchet: "Trebuchet MS",
  georgia: "Georgia", times: "Times New Roman", courier: "Courier New",
};

const TEMPLATES: { id: TemplateId; name: string; blurb: string }[] = [
  { id: "classic", name: "Classic",  blurb: "Logo beside a vertical divider and stacked contact details." },
  { id: "modern",  name: "Modern",   blurb: "Coloured accent bar with the name highlighted." },
  { id: "bold",    name: "Bold",     blurb: "Accent header block with name & title reversed out." },
  { id: "compact", name: "Compact",  blurb: "Tight single-block layout — great for replies." },
  { id: "minimal", name: "Minimal",  blurb: "Text only, no logo — maximum client compatibility." },
];

const DEFAULT_DATA: SignatureData = {
  fullName: "Alex Taylor",
  jobTitle: "Store Manager",
  businessName: "Your Business",
  phone: "(02) 5555 1234",
  mobile: "0400 000 000",
  email: "hello@yourbusiness.com.au",
  website: "www.yourbusiness.com.au",
  address: "123 Main Street, Sydney NSW 2000",
  tagline: "Quality you can count on.",
  logoUrl: "",
  disclaimer: "",
  socials: { facebook: "", instagram: "", linkedin: "", twitter: "", youtube: "", tiktok: "" },
};

const DEFAULT_STYLE: SignatureStyle = {
  template: "classic",
  accent: "#13b5ea",
  textColor: "#1f2937",
  font: "arial",
  logoSize: 72,
  showLogo: true,
  showSocials: true,
  showDividers: true,
};

const STORAGE_KEY = "koapos_email_signatures";

/* ── HTML generation (email-client-safe, table-based, inline styles) ─────────
   Rules: table layout with role=presentation, cellpadding/spacing 0, every
   style inline, web-safe font stacks, no external CSS. This survives Outlook
   (Word engine), Outlook Web, Gmail, Apple Mail and Thunderbird. */

const esc = (s: string): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;");

/** Normalise a user-entered URL into a safe absolute href (blocks javascript: etc.). */
const safeUrl = (raw: string): string => {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  if (/^(https?:|mailto:|tel:)/i.test(v)) return /^\s*javascript:/i.test(v) ? "" : v;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return ""; // reject other schemes
  return "https://" + v;
};

const SOCIAL_LABELS: Record<keyof SignatureData["socials"], string> = {
  facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn",
  twitter: "X", youtube: "YouTube", tiktok: "TikTok",
};

function socialsRow(data: SignatureData, style: SignatureStyle): string {
  if (!style.showSocials) return "";
  const entries = (Object.keys(data.socials) as (keyof SignatureData["socials"])[])
    .filter((k) => data.socials[k].trim());
  if (!entries.length) return "";
  const links = entries.map((k) =>
    `<a href="${esc(safeUrl(data.socials[k]))}" style="color:${esc(style.accent)};text-decoration:none;font-weight:bold;">${esc(SOCIAL_LABELS[k])}</a>`
  ).join(`<span style="color:#d1d5db;"> &nbsp;•&nbsp; </span>`);
  return `<div style="margin-top:8px;font-size:12px;">${links}</div>`;
}

function contactLines(data: SignatureData, style: SignatureStyle, fs: string): string {
  const muted = "#6b7280";
  const line = (label: string, valueHtml: string) =>
    valueHtml
      ? `<div style="font-size:13px;line-height:20px;color:${esc(style.textColor)};font-family:${fs};">
           <span style="color:${esc(style.accent)};font-weight:bold;">${label}</span>&nbsp;${valueHtml}</div>`
      : "";
  const tel = (v: string) => v ? `<a href="tel:${esc(v.replace(/[^\d+]/g, ""))}" style="color:${esc(style.textColor)};text-decoration:none;">${esc(v)}</a>` : "";
  const mail = data.email ? `<a href="mailto:${esc(data.email)}" style="color:${esc(style.accent)};text-decoration:none;">${esc(data.email)}</a>` : "";
  const web = data.website ? `<a href="${esc(safeUrl(data.website))}" style="color:${esc(style.accent)};text-decoration:none;">${esc(data.website.replace(/^https?:\/\//, ""))}</a>` : "";
  return [
    line("P", tel(data.phone)),
    line("M", tel(data.mobile)),
    line("E", mail),
    line("W", web),
    data.address ? `<div style="font-size:13px;line-height:20px;color:${esc(muted)};font-family:${fs};">${esc(data.address)}</div>` : "",
  ].join("");
}

function nameBlock(data: SignatureData, style: SignatureStyle, fs: string): string {
  const parts: string[] = [];
  parts.push(`<div style="font-size:17px;font-weight:bold;color:${esc(style.textColor)};font-family:${fs};line-height:22px;">${esc(data.fullName)}</div>`);
  if (data.jobTitle || data.businessName) {
    const jt = data.jobTitle ? esc(data.jobTitle) : "";
    const bn = data.businessName ? `<span style="color:${esc(style.accent)};font-weight:bold;">${esc(data.businessName)}</span>` : "";
    const sep = data.jobTitle && data.businessName ? " · " : "";
    parts.push(`<div style="font-size:13px;color:#6b7280;font-family:${fs};line-height:19px;">${jt}${sep}${bn}</div>`);
  }
  return parts.join("");
}

function logoCell(data: SignatureData, style: SignatureStyle): string {
  if (!style.showLogo || !data.logoUrl.trim()) return "";
  return `<img src="${esc(safeUrl(data.logoUrl))}" width="${style.logoSize}" alt="${esc(data.businessName)}" style="display:block;border:0;outline:none;max-width:${style.logoSize}px;height:auto;" />`;
}

function taglineBlock(data: SignatureData, style: SignatureStyle, fs: string): string {
  return data.tagline
    ? `<div style="margin-top:6px;font-size:12px;font-style:italic;color:#9ca3af;font-family:${fs};">${esc(data.tagline)}</div>`
    : "";
}

function disclaimerBlock(data: SignatureData, fs: string): string {
  return data.disclaimer
    ? `<div style="margin-top:10px;font-size:10px;line-height:14px;color:#9ca3af;font-family:${fs};max-width:520px;">${esc(data.disclaimer)}</div>`
    : "";
}

function buildSignatureHtml(data: SignatureData, style: SignatureStyle): string {
  const fs = FONT_STACKS[style.font];
  const logo = logoCell(data, style);
  const details = `${nameBlock(data, style, fs)}${contactLines(data, style, fs)}${socialsRow(data, style)}${taglineBlock(data, style, fs)}`;
  const dividerCell = style.showDividers
    ? `<td style="border-left:2px solid ${esc(style.accent)};padding:0 0 0 16px;" valign="top">`
    : `<td style="padding:0;" valign="top">`;

  let inner = "";
  switch (style.template) {
    case "classic":
      inner = `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        ${logo ? `<td valign="top" style="padding:0 16px 0 0;">${logo}</td>` : ""}
        ${dividerCell}${details}</td>
      </tr></table>`;
      break;
    case "modern":
      inner = `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="top" style="width:6px;background:${esc(style.accent)};border-radius:3px;">&nbsp;</td>
        <td valign="top" style="padding:0 0 0 14px;">
          ${logo ? `<div style="margin-bottom:8px;">${logo}</div>` : ""}
          ${details}
        </td>
      </tr></table>`;
      break;
    case "bold":
      inner = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-radius:6px;overflow:hidden;">
        <tr><td style="background:${esc(style.accent)};padding:12px 16px;" valign="middle">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            ${logo ? `<td valign="middle" style="padding-right:12px;">${logo}</td>` : ""}
            <td valign="middle">
              <div style="font-size:17px;font-weight:bold;color:#ffffff;font-family:${fs};line-height:22px;">${esc(data.fullName)}</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.9);font-family:${fs};">${esc([data.jobTitle, data.businessName].filter(Boolean).join(" · "))}</div>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:12px 16px;background:#f9fafb;">
          ${contactLines(data, style, fs)}${socialsRow(data, style)}${taglineBlock(data, style, fs)}
        </td></tr>
      </table>`;
      break;
    case "compact":
      inner = `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        ${logo ? `<td valign="middle" style="padding-right:12px;">${logo}</td>` : ""}
        <td valign="middle">
          <span style="font-size:15px;font-weight:bold;color:${esc(style.textColor)};font-family:${fs};">${esc(data.fullName)}</span>
          ${data.jobTitle ? `<span style="font-size:12px;color:#6b7280;font-family:${fs};"> — ${esc(data.jobTitle)}</span>` : ""}
          <div style="font-size:12px;color:#6b7280;font-family:${fs};margin-top:2px;">
            ${[data.phone && esc(data.phone), data.email && `<a href="mailto:${esc(data.email)}" style="color:${esc(style.accent)};text-decoration:none;">${esc(data.email)}</a>`, data.website && `<a href="${esc(safeUrl(data.website))}" style="color:${esc(style.accent)};text-decoration:none;">${esc(data.website.replace(/^https?:\/\//, ""))}</a>`].filter(Boolean).join(`<span style="color:#d1d5db;"> | </span>`)}
          </div>
          ${socialsRow(data, style)}
        </td>
      </tr></table>`;
      break;
    case "minimal":
      inner = `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td valign="top">
        ${nameBlock(data, style, fs)}
        <div style="margin-top:4px;">${contactLines(data, style, fs)}</div>
        ${socialsRow(data, style)}${taglineBlock(data, style, fs)}
      </td></tr></table>`;
      break;
  }

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:${fs};"><tr><td style="font-family:${fs};color:${esc(style.textColor)};">
    ${inner}
    ${disclaimerBlock(data, fs)}
  </td></tr></table>`;
}

/* ── Saved signatures (localStorage) ─────────────────────────────────────── */

interface SavedSignature { id: string; name: string; data: SignatureData; style: SignatureStyle; }

function loadSaved(): SavedSignature[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function MarketingEmailSignaturesPage() {
  const [data, setData] = useState<SignatureData>(DEFAULT_DATA);
  const [style, setStyle] = useState<SignatureStyle>(DEFAULT_STYLE);
  const [saved, setSaved] = useState<SavedSignature[]>(() => loadSaved());
  const [saveName, setSaveName] = useState("");
  const [copiedKind, setCopiedKind] = useState<string | null>(null);

  const { profile } = useBusinessProfile();
  const { data: merchant } = useGetMerchant({ query: { queryKey: ["merchant"] } });

  const html = useMemo(() => buildSignatureHtml(data, style), [data, style]);

  const set = <K extends keyof SignatureData>(key: K, value: SignatureData[K]) =>
    setData((d) => ({ ...d, [key]: value }));
  const setSocial = (key: keyof SignatureData["socials"], value: string) =>
    setData((d) => ({ ...d, socials: { ...d.socials, [key]: value } }));
  const setSty = <K extends keyof SignatureStyle>(key: K, value: SignatureStyle[K]) =>
    setStyle((s) => ({ ...s, [key]: value }));

  const importBusinessData = useCallback(() => {
    const m = merchant as { businessName?: string; phone?: string; address?: string; city?: string; email?: string } | undefined;
    const addressParts = [m?.address, m?.city, profile.state, profile.postcode].filter(Boolean);
    setData((d) => ({
      ...d,
      businessName: m?.businessName || d.businessName,
      phone:        m?.phone || d.phone,
      email:        profile.contactEmail || m?.email || d.email,
      website:      profile.website || d.website,
      address:      addressParts.length ? addressParts.join(", ") : d.address,
      tagline:      profile.tagline || d.tagline,
      logoUrl:      profile.logo || d.logoUrl,
      socials: {
        facebook:  profile.socialLinks.facebook  || d.socials.facebook,
        instagram: profile.socialLinks.instagram || d.socials.instagram,
        linkedin:  profile.socialLinks.linkedin  || d.socials.linkedin,
        twitter:   profile.socialLinks.twitter   || d.socials.twitter,
        youtube:   profile.socialLinks.youtube   || d.socials.youtube,
        tiktok:    profile.socialLinks.tiktok    || d.socials.tiktok,
      },
    }));
    if (profile.brandColors?.[0]) setStyle((s) => ({ ...s, accent: profile.brandColors[0] }));
    toast.success("Imported details from Business Details");
  }, [merchant, profile]);

  const persist = (next: SavedSignature[]) => {
    setSaved(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* quota */ }
  };

  const saveCurrent = () => {
    const name = saveName.trim() || data.fullName || "Untitled signature";
    const entry: SavedSignature = { id: String(Date.now()), name, data, style };
    persist([entry, ...saved]);
    setSaveName("");
    toast.success(`Saved "${name}"`);
  };

  const flashCopied = (kind: string) => { setCopiedKind(kind); setTimeout(() => setCopiedKind((k) => (k === kind ? null : k)), 1500); };

  const copyRich = async () => {
    try {
      const blobHtml = new Blob([html], { type: "text/html" });
      const blobText = new Blob([data.fullName], { type: "text/plain" });
      await navigator.clipboard.write([new ClipboardItem({ "text/html": blobHtml, "text/plain": blobText })]);
      flashCopied("rich");
      toast.success("Signature copied — paste into Gmail, Outlook Web or your reply window");
    } catch {
      toast.error("Copy failed — use “Copy HTML source” or download the .htm file instead");
    }
  };

  const copySource = async () => {
    try { await navigator.clipboard.writeText(html); flashCopied("source"); toast.success("HTML source copied"); }
    catch { toast.error("Copy failed"); }
  };

  const downloadHtm = () => {
    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
    const blob = new Blob([doc], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(data.fullName || "signature").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-signature.htm`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success("Downloaded signature.htm");
  };

  return (
    <AppLayout>
      <div className="w-full space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[#13b5ea]/10 p-2.5"><Mail className="w-6 h-6 text-[#13b5ea]" /></div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Email Signatures</h1>
              <p className="text-sm text-muted-foreground">Design a professional signature for Outlook, Gmail / Web and Thunderbird.</p>
            </div>
          </div>
          <Button variant="outline" onClick={importBusinessData} className="gap-2">
            <Wand2 className="w-4 h-4" /> Import from Business Details
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* ── Editor ── */}
          <div className="space-y-6">
            {/* Template picker */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Sparkles className="w-4 h-4" /> Template</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSty("template", t.id)}
                      title={t.blurb}
                      className={cn(
                        "rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                        style.template === t.id ? "border-[#13b5ea] bg-[#13b5ea]/5 ring-1 ring-[#13b5ea]" : "hover:border-muted-foreground/40",
                      )}
                    >
                      <div className="font-medium flex items-center gap-1.5">{t.name}{style.template === t.id && <Check className="w-3.5 h-3.5 text-[#13b5ea]" />}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{t.blurb}</div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Details */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Contact className="w-4 h-4" /> Your details</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Full name"     value={data.fullName}     onChange={(v) => set("fullName", v)} />
                <Field label="Job title"      value={data.jobTitle}     onChange={(v) => set("jobTitle", v)} />
                <Field label="Business name"  value={data.businessName} onChange={(v) => set("businessName", v)} />
                <Field label="Phone"          value={data.phone}        onChange={(v) => set("phone", v)} />
                <Field label="Mobile"         value={data.mobile}       onChange={(v) => set("mobile", v)} />
                <Field label="Email"          value={data.email}        onChange={(v) => set("email", v)} />
                <Field label="Website"        value={data.website}      onChange={(v) => set("website", v)} />
                <Field label="Logo image URL" value={data.logoUrl}      onChange={(v) => set("logoUrl", v)} placeholder="https://…/logo.png" />
                <div className="sm:col-span-2"><Field label="Address" value={data.address} onChange={(v) => set("address", v)} /></div>
                <div className="sm:col-span-2"><Field label="Tagline" value={data.tagline} onChange={(v) => set("tagline", v)} /></div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">Legal disclaimer (optional)</Label>
                  <Textarea value={data.disclaimer} onChange={(e) => set("disclaimer", e.target.value)} rows={2} className="mt-1 text-sm" placeholder="Confidentiality notice…" />
                </div>
              </CardContent>
            </Card>

            {/* Socials */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><PenLine className="w-4 h-4" /> Social links</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(Object.keys(SOCIAL_LABELS) as (keyof SignatureData["socials"])[]).map((k) => (
                  <Field key={k} label={SOCIAL_LABELS[k]} value={data.socials[k]} onChange={(v) => setSocial(k, v)} placeholder="https://…" />
                ))}
              </CardContent>
            </Card>

            {/* Design */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Palette className="w-4 h-4" /> Design</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Accent colour</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <input type="color" value={style.accent} onChange={(e) => setSty("accent", e.target.value)} className="h-9 w-12 rounded border cursor-pointer" />
                      <Input value={style.accent} onChange={(e) => setSty("accent", e.target.value)} className="text-sm font-mono" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Text colour</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <input type="color" value={style.textColor} onChange={(e) => setSty("textColor", e.target.value)} className="h-9 w-12 rounded border cursor-pointer" />
                      <Input value={style.textColor} onChange={(e) => setSty("textColor", e.target.value)} className="text-sm font-mono" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Font</Label>
                    <Select value={style.font} onValueChange={(v) => setSty("font", v as FontId)}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(FONT_LABELS) as FontId[]).map((f) => (
                          <SelectItem key={f} value={f} style={{ fontFamily: FONT_STACKS[f] }}>{FONT_LABELS[f]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Logo size ({style.logoSize}px)</Label>
                    <input type="range" min={40} max={140} value={style.logoSize} onChange={(e) => setSty("logoSize", Number(e.target.value))} className="w-full mt-3 accent-[#13b5ea]" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
                  <Toggle label="Show logo"     checked={style.showLogo}     onChange={(v) => setSty("showLogo", v)} />
                  <Toggle label="Show socials"  checked={style.showSocials}  onChange={(v) => setSty("showSocials", v)} />
                  <Toggle label="Divider"       checked={style.showDividers} onChange={(v) => setSty("showDividers", v)} />
                </div>
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => { setData(DEFAULT_DATA); setStyle(DEFAULT_STYLE); }}>
                  <RotateCcw className="w-3.5 h-3.5" /> Reset to defaults
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* ── Preview + export ── */}
          <div className="space-y-6 lg:sticky lg:top-4">
            <Card>
              <CardHeader className="pb-3 flex-row items-center justify-between">
                <CardTitle className="text-base">Live preview</CardTitle>
                <Badge variant="secondary" className="text-[10px]">WYSIWYG</Badge>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border bg-white p-5 overflow-x-auto">
                  {/* Rendered exactly as it will appear in the email client */}
                  <div dangerouslySetInnerHTML={{ __html: html }} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
                  <Button onClick={copyRich} className="gap-2 bg-[#13b5ea] hover:bg-[#0d8fb8] text-white">
                    {copiedKind === "rich" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copy signature
                  </Button>
                  <Button variant="outline" onClick={downloadHtm} className="gap-2"><Download className="w-4 h-4" /> Download .htm</Button>
                  <Button variant="outline" onClick={copySource} className="gap-2">
                    {copiedKind === "source" ? <Check className="w-4 h-4" /> : <Code2 className="w-4 h-4" />} Copy HTML
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Install instructions */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">How to install</CardTitle></CardHeader>
              <CardContent>
                <Tabs defaultValue="outlook-desktop" className="w-full">
                  <TabsList className="grid grid-cols-2 sm:grid-cols-4 h-auto">
                    <TabsTrigger value="outlook-desktop" className="text-xs">Outlook</TabsTrigger>
                    <TabsTrigger value="outlook-web" className="text-xs">Outlook Web</TabsTrigger>
                    <TabsTrigger value="web" className="text-xs">Gmail / Web</TabsTrigger>
                    <TabsTrigger value="thunderbird" className="text-xs">Thunderbird</TabsTrigger>
                  </TabsList>
                  <TabsContent value="outlook-desktop" className="text-sm text-muted-foreground space-y-1 mt-3">
                    <p>1. Click <strong>Download .htm</strong> above.</p>
                    <p>2. In Outlook: <strong>File → Options → Mail → Signatures</strong>.</p>
                    <p>3. Create a new signature, then paste (from <strong>Copy signature</strong>). Or drop the .htm into <code>%APPDATA%\Microsoft\Signatures</code> and pick it there.</p>
                  </TabsContent>
                  <TabsContent value="outlook-web" className="text-sm text-muted-foreground space-y-1 mt-3">
                    <p>1. Click <strong>Copy signature</strong>.</p>
                    <p>2. <strong>Settings → Mail → Compose and reply</strong>.</p>
                    <p>3. Paste into the signature box and Save.</p>
                  </TabsContent>
                  <TabsContent value="web" className="text-sm text-muted-foreground space-y-1 mt-3">
                    <p>1. Click <strong>Copy signature</strong>.</p>
                    <p>2. Gmail: <strong>Settings → See all settings → General → Signature</strong>.</p>
                    <p>3. Paste into the box and <strong>Save Changes</strong>.</p>
                  </TabsContent>
                  <TabsContent value="thunderbird" className="text-sm text-muted-foreground space-y-1 mt-3">
                    <p>1. Click <strong>Download .htm</strong>.</p>
                    <p>2. <strong>Account Settings</strong> → your account.</p>
                    <p>3. Tick <strong>“Attach the signature from a file”</strong> and choose the .htm — or paste HTML with <em>“Use HTML”</em> enabled.</p>
                  </TabsContent>
                </Tabs>
                <p className="text-[11px] text-muted-foreground mt-3">
                  Tip: for the logo to show in every client, use a hosted image URL (https://…). Data-URL logos may be stripped by Outlook desktop.
                </p>
              </CardContent>
            </Card>

            {/* Save / library */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Save className="w-4 h-4" /> Saved signatures</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Name this signature…" className="text-sm" />
                  <Button onClick={saveCurrent} className="gap-1.5 shrink-0"><Save className="w-4 h-4" /> Save</Button>
                </div>
                {saved.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No saved signatures yet. Save a version to reuse it later (stored in this browser).</p>
                ) : (
                  <div className="space-y-1.5">
                    {saved.map((s) => (
                      <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                        <button className="text-sm font-medium text-left hover:text-[#13b5ea] truncate" onClick={() => { setData(s.data); setStyle(s.style); toast.success(`Loaded "${s.name}"`); }}>
                          {s.name}
                        </button>
                        <button className="text-muted-foreground hover:text-destructive shrink-0" onClick={() => persist(saved.filter((x) => x.id !== s.id))} title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <a href="/management/settings-integrations/business-details" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <ExternalLink className="w-3.5 h-3.5" /> Edit your Business Details
            </a>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

/* ── Small field helpers ─────────────────────────────────────────────────── */

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-1 text-sm" />
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <Switch checked={checked} onCheckedChange={onChange} /> {label}
    </label>
  );
}
