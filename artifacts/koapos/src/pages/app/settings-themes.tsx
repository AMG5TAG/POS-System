import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Palette, Type, Search, Eye, EyeOff, Save, Trash2, Check, RotateCcw, Sparkles, ExternalLink, Moon, Sun, Monitor, Accessibility } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import {
  useAppTheme,
  DEFAULT_APP_THEME,
  type AppThemeSettings,
  type SearchBarLayout,
} from "@/lib/app-theme";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { useAccessibility, type FontSize, type ContrastMode } from "@/lib/accessibility";
import { useBusinessProfile } from "@/lib/business-profile";

/* ── Theme templates: named snapshots of the full look-and-feel ───────────── */

interface ThemeTemplate {
  id: string;
  name: string;
  app: AppThemeSettings;
  mode: ThemeMode;
  fontSize: FontSize;
  contrast: ContrastMode;
}

const TEMPLATES_KEY = "koapos-theme-templates";

const MODE_LABELS: Record<ThemeMode, string> = { light: "Day", dark: "Night", system: "System" };

function loadTemplates(): ThemeTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    return raw ? (JSON.parse(raw) as ThemeTemplate[]) : [];
  } catch {
    return [];
  }
}

function saveTemplates(list: ThemeTemplate[]) {
  try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(list)); } catch {}
}

/* Built-in preset themes — a quick way to restyle the app. Applying one turns
 * off "use brand colours" and sets the primary colour (and light/dark mode). */
const THEME_PRESETS: { name: string; primary: string; mode: ThemeMode }[] = [
  { name: "Koastal Gold",  primary: "#efbf04", mode: "light" },
  { name: "Ocean Blue",    primary: "#0ea5e9", mode: "light" },
  { name: "Forest Green",  primary: "#10b981", mode: "light" },
  { name: "Royal Purple",  primary: "#8b5cf6", mode: "light" },
  { name: "Sunset Orange", primary: "#f97316", mode: "light" },
  { name: "Rose Pink",     primary: "#ec4899", mode: "light" },
  { name: "Crimson",       primary: "#ef4444", mode: "light" },
  { name: "Teal",          primary: "#14b8a6", mode: "light" },
  { name: "Slate",         primary: "#475569", mode: "light" },
  { name: "Midnight Indigo", primary: "#6366f1", mode: "dark" },
  { name: "Amber Night",   primary: "#f59e0b", mode: "dark" },
  { name: "Emerald Night", primary: "#34d399", mode: "dark" },
];

const SEARCH_LAYOUTS: { value: SearchBarLayout; label: string; hint: string }[] = [
  { value: "expanded", label: "Expanded", hint: "Full-width bar that fills the header" },
  { value: "compact",  label: "Compact",  hint: "Fixed narrow search field" },
  { value: "icon",     label: "Icon only", hint: "Collapses to an icon; expands on click" },
];

function SectionRow({ icon: Icon, title, desc, children }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex items-start gap-3 min-w-0">
        <Icon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function SettingsThemesPage() {
  const { settings, setSettings, replaceSettings, reset } = useAppTheme();
  const { theme, mode, setMode } = useTheme();
  const { fontSize, setFontSize, contrastMode, setContrastMode } = useAccessibility();
  const { profile } = useBusinessProfile();

  const [templates, setTemplates] = useState<ThemeTemplate[]>(loadTemplates);
  const [templateName, setTemplateName] = useState("");

  const brandColor = profile.brandColors?.[0] || "";
  const brandFont = profile.brandFont || "";

  const persistTemplates = (list: ThemeTemplate[]) => {
    setTemplates(list);
    saveTemplates(list);
  };

  const handleSaveTemplate = () => {
    const name = templateName.trim();
    if (!name) { toast.error("Give your theme a name first"); return; }
    const tpl: ThemeTemplate = {
      id: crypto.randomUUID(),
      name,
      app: settings,
      mode,
      fontSize,
      contrast: contrastMode,
    };
    persistTemplates([...templates.filter((t) => t.name !== name), tpl]);
    setTemplateName("");
    toast.success(`Saved theme "${name}"`);
  };

  const applyPreset = (preset: { name: string; primary: string; mode: ThemeMode }) => {
    setSettings({ useBrandColors: false, primaryColor: preset.primary });
    setMode(preset.mode);
    toast.success(`Applied "${preset.name}" theme`);
  };

  const applyTemplate = (tpl: ThemeTemplate) => {
    replaceSettings(tpl.app);
    setMode(tpl.mode);
    setFontSize(tpl.fontSize);
    setContrastMode(tpl.contrast);
    toast.success(`Applied "${tpl.name}"`);
  };

  const deleteTemplate = (id: string) => {
    persistTemplates(templates.filter((t) => t.id !== id));
  };

  const setAsDefault = (tpl: ThemeTemplate) => {
    // The active theme already persists as the default; applying makes it default.
    applyTemplate(tpl);
    toast.success(`"${tpl.name}" is now the default theme`);
  };

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <Palette className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Themes</h1>
            <p className="text-sm text-muted-foreground">
              Customise how the POS looks — colours, fonts, the universal search bar, and accessibility.
            </p>
          </div>
        </div>

        {/* ── Brand colours & font ───────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="w-4 h-4" /> Brand</CardTitle>
            <CardDescription>
              Use the brand colours and font defined in{" "}
              <Link href="/management/settings-integrations/business-details" className="text-primary inline-flex items-center gap-0.5 hover:underline">
                Business Details <ExternalLink className="w-3 h-3" />
              </Link>.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            <SectionRow icon={Palette} title="Use brand colours" desc={brandColor ? "Apply your brand's primary colour across the app" : "No brand colour set yet — add one in Business Details"}>
              <div className="flex items-center gap-3">
                {brandColor && <span className="w-6 h-6 rounded-md border shrink-0" style={{ background: brandColor }} />}
                <Switch checked={settings.useBrandColors} disabled={!brandColor} onCheckedChange={(v) => setSettings({ useBrandColors: v })} />
              </div>
            </SectionRow>
            <SectionRow icon={Type} title="Use brand font" desc={brandFont ? `Apply "${brandFont}" as the app font` : "No brand font set yet — add one in Business Details"}>
              <Switch checked={settings.useBrandFont} disabled={!brandFont} onCheckedChange={(v) => setSettings({ useBrandFont: v })} />
            </SectionRow>
            {!settings.useBrandColors && (
              <SectionRow icon={Palette} title="Custom primary colour" desc="Override the accent colour without using the brand palette">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settings.primaryColor || "#efbf04"}
                    onChange={(e) => setSettings({ primaryColor: e.target.value })}
                    className="w-9 h-9 rounded-md border cursor-pointer bg-transparent p-0.5"
                    aria-label="Custom primary colour"
                  />
                  <Input
                    noAutoCapitalize
                    value={settings.primaryColor}
                    placeholder="#efbf04"
                    onChange={(e) => setSettings({ primaryColor: e.target.value })}
                    className="w-28 font-mono"
                  />
                  {settings.primaryColor && (
                    <Button variant="ghost" size="sm" onClick={() => setSettings({ primaryColor: "" })}>Clear</Button>
                  )}
                </div>
              </SectionRow>
            )}
          </CardContent>
        </Card>

        {/* ── Preset themes ──────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Palette className="w-4 h-4" /> Preset themes</CardTitle>
            <CardDescription>One-click looks. Applying a preset sets the colour and light/dark mode — you can still fine-tune below.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {THEME_PRESETS.map((preset) => {
                const isActive = !settings.useBrandColors && settings.primaryColor.toLowerCase() === preset.primary.toLowerCase();
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-all hover:shadow-sm",
                      isActive ? "border-primary ring-1 ring-primary" : "hover:border-foreground/30",
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-7 h-7 rounded-lg border shrink-0" style={{ background: preset.primary }} />
                      <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", preset.mode === "dark" ? "bg-slate-800 text-slate-200" : "bg-muted text-muted-foreground")}>
                        {preset.mode === "dark" ? "Night" : "Day"}
                      </span>
                      {isActive && <Check className="w-3.5 h-3.5 text-primary ml-auto" />}
                    </div>
                    <p className="text-xs font-medium truncate">{preset.name}</p>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* ── Universal search bar ───────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Search className="w-4 h-4" /> Universal search bar</CardTitle>
            <CardDescription>Control the layout and visibility of the global search in the header.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            <SectionRow icon={settings.hideSearchBar ? EyeOff : Eye} title="Show search bar" desc="Hide the universal search bar from the header entirely">
              <Switch checked={!settings.hideSearchBar} onCheckedChange={(v) => setSettings({ hideSearchBar: !v })} />
            </SectionRow>
            <div className="py-3">
              <p className="text-sm font-medium mb-2">Search bar layout</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {SEARCH_LAYOUTS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={settings.hideSearchBar}
                    onClick={() => setSettings({ searchBarLayout: opt.value })}
                    className={cn(
                      "text-left rounded-lg border p-3 transition-colors disabled:opacity-40",
                      settings.searchBarLayout === opt.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted",
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {settings.searchBarLayout === opt.value && <Check className="w-3.5 h-3.5 text-primary" />}
                      {opt.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{opt.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Appearance & accessibility ─────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Accessibility className="w-4 h-4" /> Appearance & accessibility</CardTitle>
            <CardDescription>Default light/dark mode and accessibility preferences.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            <SectionRow
              icon={mode === "system" ? Monitor : mode === "dark" ? Moon : Sun}
              title="Colour mode"
              desc={mode === "system" ? `Following your device (currently ${theme})` : "Day, Night, or follow your device"}
            >
              <Select value={mode} onValueChange={(v) => setMode(v as ThemeMode)}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="light"><span className="flex items-center gap-2"><Sun className="w-3.5 h-3.5" /> Day</span></SelectItem>
                  <SelectItem value="dark"><span className="flex items-center gap-2"><Moon className="w-3.5 h-3.5" /> Night</span></SelectItem>
                  <SelectItem value="system"><span className="flex items-center gap-2"><Monitor className="w-3.5 h-3.5" /> System</span></SelectItem>
                </SelectContent>
              </Select>
            </SectionRow>
            <SectionRow icon={Type} title="Text size" desc="Scale text across the whole app">
              <Select value={fontSize} onValueChange={(v) => setFontSize(v as FontSize)}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="large">Large</SelectItem>
                  <SelectItem value="xl">Extra large</SelectItem>
                </SelectContent>
              </Select>
            </SectionRow>
            <SectionRow icon={Accessibility} title="High contrast" desc="Boost contrast for better legibility">
              <Switch checked={contrastMode === "high"} onCheckedChange={(v) => setContrastMode(v ? "high" : "normal")} />
            </SectionRow>
            <SectionRow icon={Sparkles} title="Reduce motion" desc="Minimise animations and transitions">
              <Switch checked={settings.reducedMotion} onCheckedChange={(v) => setSettings({ reducedMotion: v })} />
            </SectionRow>
          </CardContent>
        </Card>

        {/* ── Templates ──────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Save className="w-4 h-4" /> Saved themes</CardTitle>
            <CardDescription>Save the current look as a reusable template, then apply it or set it as the default.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Theme name (e.g. Koastal Default)"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveTemplate(); }}
              />
              <Button onClick={handleSaveTemplate} className="gap-1.5 shrink-0"><Save className="w-4 h-4" /> Save as template</Button>
            </div>

            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No saved themes yet.</p>
            ) : (
              <div className="space-y-2">
                {templates.map((tpl) => (
                  <div key={tpl.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="w-6 h-6 rounded-md border shrink-0"
                        style={{ background: tpl.app.useBrandColors ? brandColor || "#efbf04" : (tpl.app.primaryColor || "#efbf04") }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{tpl.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {MODE_LABELS[tpl.mode] ?? tpl.mode} · {tpl.fontSize} text{tpl.contrast === "high" ? " · high contrast" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => applyTemplate(tpl)} className="gap-1"><Check className="w-3.5 h-3.5" /> Apply</Button>
                      <Button variant="ghost" size="sm" onClick={() => setAsDefault(tpl)}>Set default</Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteTemplate(tpl.id)} aria-label="Delete theme"><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Separator />
            <Button variant="outline" onClick={() => { reset(); toast.success("Reset to default theme"); }} className="gap-1.5">
              <RotateCcw className="w-4 h-4" /> Reset to defaults
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
