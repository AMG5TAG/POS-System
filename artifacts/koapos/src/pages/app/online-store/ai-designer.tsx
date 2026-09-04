/**
 * Online Store › Design › "Design with AI".
 *
 * The merchant describes the shop they want; the server returns a draft of
 * theme + pages built from the same block catalogue the editor uses, and this
 * dialog previews it before anything is saved.
 *
 * The important property is that generating changes nothing. The server writes
 * no record, and this component holds the draft in local state until the
 * merchant picks how to apply it. Two ways out, and the safe one is the
 * default: **Add as new pages** leaves every existing page untouched, while
 * **Replace everything** is spelled out in full and confirmed separately,
 * because it discards pages the merchant may have spent hours on.
 */
import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Sparkles, Loader2, AlertTriangle, FileText, Palette, RotateCcw, Plug } from "lucide-react";
import {
  useGenerateOnlineStoreDesign,
  type OnlineStoreAiDraft,
} from "@workspace/api-client-react";
import { BLOCK_LIBRARY, type Block, type Page, type ThemeSettings } from "./shared";
import type { BlockType, BlockData } from "@workspace/online-store-blocks";

export type ApplyMode = "append" | "replace";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pages already in the store — shown so "replace" states what is at stake. */
  existingPages: Page[];
  /** False until the merchant connects their own AI account. */
  available: boolean;
  onApply: (pages: Page[], theme: ThemeSettings | null, mode: ApplyMode) => void;
}

/** Ideas that give the model something concrete to work from. */
const EXAMPLE_BRIEFS = [
  "A warm, welcoming café site — menu, our story, and where to find us.",
  "A clean electronics shop that puts the product range front and centre.",
  "A boutique with a strong homepage hero, an about page, and a contact page.",
];

/** The draft's blocks arrive typed as the API's loose shape; the catalogue has
 *  already been enforced server-side, so this is a cast, not a validation. */
function toBlocks(draftBlocks: OnlineStoreAiDraft["pages"][number]["blocks"]): Block[] {
  return draftBlocks.map((b) => ({
    id: b.id,
    type: b.type as BlockType,
    data: b.data as BlockData,
  }));
}

function draftToPages(draft: OnlineStoreAiDraft): Page[] {
  return draft.pages.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    visible: p.visible,
    ...(p.seoTitle ? { seoTitle: p.seoTitle } : {}),
    ...(p.seoDescription ? { seoDescription: p.seoDescription } : {}),
    blocks: toBlocks(p.blocks),
  }));
}

function blockLabel(type: string): string {
  return BLOCK_LIBRARY.find((b) => b.type === type)?.label ?? type;
}

export function AiDesignerDialog({ open, onOpenChange, existingPages, available, onApply }: Props) {
  const [brief, setBrief] = useState("");
  const [draft, setDraft] = useState<OnlineStoreAiDraft | null>(null);
  const [applyTheme, setApplyTheme] = useState(true);
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const generate = useGenerateOnlineStoreDesign();

  const reset = () => {
    setDraft(null);
    setConfirmingReplace(false);
  };

  const close = () => {
    onOpenChange(false);
    // Cleared on close so reopening never silently applies a stale design.
    setTimeout(() => { setBrief(""); reset(); }, 200);
  };

  const run = () => {
    setConfirmingReplace(false);
    generate.mutate(
      { data: brief.trim() ? { brief: brief.trim() } : {} },
      {
        onSuccess: (result) => {
          setDraft(result);
          toast.success(`Designed ${result.pages.length} page${result.pages.length === 1 ? "" : "s"}`);
        },
        onError: () => toast.error("Could not generate a design. Try again in a moment."),
      },
    );
  };

  const apply = (mode: ApplyMode) => {
    if (!draft) return;
    const theme: ThemeSettings | null = applyTheme
      ? {
          primary: draft.theme.primary,
          accent: draft.theme.accent,
          bg: draft.theme.bg,
          text: draft.theme.text,
          font: draft.theme.font,
          radius: draft.theme.radius,
        }
      : null;
    onApply(draftToPages(draft), theme, mode);
    close();
  };

  const pending = generate.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Design with AI
          </DialogTitle>
          <DialogDescription>
            Claude designs a storefront from your business details and product catalogue.
            Nothing is saved until you choose to apply it.
          </DialogDescription>
        </DialogHeader>

        {!available && (
          /* Bring-your-own-key: with no account connected there is nothing to
           * bill, so the dialog explains the one step rather than failing on
           * submit. The button stays visible in the editor precisely so this
           * message is discoverable. */
          <div className="rounded-lg border border-dashed p-5 text-center space-y-3">
            <Plug className="w-6 h-6 mx-auto text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">Connect your Claude account first</p>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                The AI designer runs on your own Anthropic account, so the usage is billed
                to you and nobody else can spend it. Add your API key once and every AI
                feature in KoaPOS turns on.
              </p>
            </div>
            <Button asChild size="sm" className="gap-2">
              <Link href="/management/settings-integrations/integrations#ai">
                <Plug className="w-3.5 h-3.5" /> Go to Integrations
              </Link>
            </Button>
          </div>
        )}

        {available && !draft && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">What kind of store do you want? (optional)</Label>
              <Textarea
                rows={4}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                maxLength={2000}
                disabled={pending}
                placeholder="Leave blank to design from your business details alone, or describe the tone, the pages you want, and anything to highlight."
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_BRIEFS.map((example) => (
                <button
                  key={example}
                  type="button"
                  disabled={pending}
                  onClick={() => setBrief(example)}
                  className="text-[11px] rounded-full border px-2.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {example}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Your product names, categories, prices and contact details are sent to the AI
              so the copy is about your actual business. Images are never generated — add
              your own artwork afterwards.
            </p>
          </div>
        )}

        {draft && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="gap-1">
                <Sparkles className="w-3 h-3" />
                {draft.provider === "claude" ? "Designed by Claude" : "Designed by OpenAI"}
              </Badge>
              <Badge variant="outline">{draft.pages.length} pages</Badge>
              <Badge variant="outline">
                {draft.pages.reduce((n, p) => n + p.blocks.length, 0)} blocks
              </Badge>
              <Button size="sm" variant="ghost" className="gap-1.5 h-7 text-xs ml-auto"
                      onClick={reset} disabled={pending}>
                <RotateCcw className="w-3 h-3" /> Start over
              </Button>
            </div>

            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-muted-foreground" />
                  <Label className="text-xs">Also apply the suggested theme</Label>
                </div>
                <Switch checked={applyTheme} onCheckedChange={setApplyTheme} />
              </div>
              <div className="flex items-center gap-2">
                {(["primary", "accent", "bg", "text"] as const).map((key) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <span
                      className="w-5 h-5 rounded border"
                      style={{ backgroundColor: draft.theme[key] }}
                      aria-hidden
                    />
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {key}
                    </span>
                  </div>
                ))}
                <span className="text-[11px] text-muted-foreground ml-auto">
                  {draft.theme.font} · {draft.theme.radius}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
              {draft.pages.map((page) => (
                <div key={page.id} className="rounded-lg border p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm font-semibold truncate">{page.name}</span>
                    <code className="text-[10px] text-muted-foreground ml-auto">{page.slug}</code>
                  </div>
                  <ol className="space-y-1">
                    {page.blocks.map((block, i) => (
                      <li key={block.id} className="text-[11px] text-muted-foreground flex gap-2">
                        <span className="tabular-nums opacity-50">{i + 1}.</span>
                        <span className="text-foreground/80">{blockLabel(block.type)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>

            {confirmingReplace && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 space-y-2">
                <p className="text-sm font-semibold flex items-center gap-2 text-destructive">
                  <AlertTriangle className="w-4 h-4" /> This permanently discards your current pages
                </p>
                <p className="text-xs text-muted-foreground">
                  Replacing deletes {existingPages.length} existing page
                  {existingPages.length === 1 ? "" : "s"} and every block on
                  {existingPages.length === 1 ? " it" : " them"}
                  {applyTheme ? ", and overwrites your current theme colours and fonts" : ""}.
                  There is no undo. Your products, customers, orders and settings are not affected.
                </p>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  {existingPages.map((p) => (
                    <li key={p.id} className="flex gap-2">
                      <span className="opacity-50">·</span>
                      <span>
                        {p.name} <code className="opacity-60">{p.slug}</code> — {p.blocks.length} block
                        {p.blocks.length === 1 ? "" : "s"}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="destructive" onClick={() => apply("replace")}>
                    Yes, delete my pages and replace them
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setConfirmingReplace(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <Separator />

        <DialogFooter className={cn("gap-2", draft && "sm:justify-between")}>
          {!available ? (
            <Button variant="outline" onClick={close}>Close</Button>
          ) : !draft ? (
            <>
              <Button variant="outline" onClick={close} disabled={pending}>Cancel</Button>
              <Button onClick={run} disabled={pending} className="gap-2">
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {pending ? "Designing…" : "Generate design"}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setConfirmingReplace(true)}
                disabled={confirmingReplace}
              >
                Replace everything…
              </Button>
              <Button onClick={() => apply("append")} className="gap-2">
                <Sparkles className="w-4 h-4" />
                Add as new pages
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
