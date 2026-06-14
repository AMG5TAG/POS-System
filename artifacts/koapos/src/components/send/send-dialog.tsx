import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Send, Printer, Mail, MessageSquare, Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/*
 * Shared "Send" dialog — the single, site-wide popup that replaces every
 * separate Print / Email / SMS button group. A document (receipt, invoice,
 * quote, purchase order, service job, …) is "sent" by reprinting it, emailing
 * it, or texting it. Each page wires the methods it actually supports by
 * supplying the matching handler; cards only render for handlers that exist.
 *
 * Trigger it with <SendButton …/> (a paper-plane "Send" button that manages its
 * own open state) or drive <SendDialog open … /> directly.
 */

export type SendMethodKey = "reprint" | "email" | "sms";

export interface SendDialogConfig {
  /** Heading next to the paper-plane icon. Defaults to "Send". */
  title?: string;
  /** Reference shown muted after the title, e.g. a receipt / invoice number. */
  documentLabel?: string;
  /** Pre-select a method when the dialog opens. */
  initialMethod?: SendMethodKey | null;

  /** Reprint / print handler. Card hidden when omitted. */
  onReprint?: () => void | Promise<void>;
  reprintLabel?: string;
  reprintSub?: string;
  /** Body shown in the reprint panel before the Print button. */
  reprintHint?: React.ReactNode;
  reprintButtonLabel?: string;
  /** Extra print buttons shown below the primary one (e.g. "Print as quote",
   *  "Print sticker"). Each runs through the same busy/close handling. */
  reprintExtraActions?: { label: string; onClick: () => void | Promise<void> }[];

  /** Email handler — receives the entered address. Card hidden when omitted. */
  onEmail?: (email: string) => void | Promise<void>;
  defaultEmail?: string;
  emailSub?: string;
  /** Helper line under the email input. */
  emailHint?: React.ReactNode;
  /** Extra content in the email panel (e.g. a subject field), rendered below
   *  the address input. The handler reads its value from caller-owned state. */
  emailExtra?: React.ReactNode;
  /** Show the recipient as fixed/read-only — for flows that always send to the
   *  contact on file rather than a typed-in address. */
  emailReadonly?: boolean;

  /** SMS handler — receives the entered number. Card hidden when omitted. */
  onSms?: (phone: string) => void | Promise<void>;
  defaultPhone?: string;
  smsSub?: string;
  /** Helper line under the SMS input. */
  smsHint?: React.ReactNode;
  /** Show the number as fixed/read-only — see {@link emailReadonly}. */
  smsReadonly?: boolean;
}

export interface SendDialogProps extends SendDialogConfig {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULTS = {
  reprintLabel: "Reprint",
  reprintSub: "Print to receipt printer",
  reprintButtonLabel: "Print",
  emailSub: "Send to email address",
  smsSub: "Send via text message",
};

export function SendDialog(props: SendDialogProps) {
  const {
    open, onOpenChange,
    title = "Send", documentLabel, initialMethod = null,
    onReprint, reprintLabel = DEFAULTS.reprintLabel, reprintSub = DEFAULTS.reprintSub,
    reprintHint, reprintButtonLabel = DEFAULTS.reprintButtonLabel, reprintExtraActions,
    onEmail, defaultEmail, emailSub = DEFAULTS.emailSub, emailHint, emailExtra, emailReadonly,
    onSms, defaultPhone, smsSub = DEFAULTS.smsSub, smsHint, smsReadonly,
  } = props;

  const methods = ([
    onReprint && { key: "reprint" as const, icon: Printer,      label: reprintLabel, sub: reprintSub },
    onEmail   && { key: "email" as const,   icon: Mail,          label: "Email",      sub: emailSub },
    onSms     && { key: "sms" as const,     icon: MessageSquare, label: "SMS",        sub: smsSub },
  ].filter(Boolean)) as { key: SendMethodKey; icon: typeof Printer; label: string; sub: string }[];

  const [mode, setMode] = useState<SendMethodKey | null>(initialMethod);
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  // Re-seed local state whenever the dialog (re)opens for a new document.
  useEffect(() => {
    if (open) {
      setMode(initialMethod ?? (methods.length === 1 ? methods[0].key : null));
      setEmail(defaultEmail ?? "");
      setPhone(defaultPhone ?? "");
      setBusy(false);
      setSent(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultEmail, defaultPhone, initialMethod]);

  function close() {
    onOpenChange(false);
  }

  async function run(action: () => void | Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      setSent(true);
      setTimeout(close, 800);
    } catch (err) {
      // Handlers are expected to surface their own errors; this is a backstop.
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  function submitReprint() {
    if (!onReprint) return;
    run(onReprint);
  }
  function submitEmail() {
    if (!onEmail) return;
    if (!email.trim() || !email.includes("@")) { toast.error("Please enter a valid email address"); return; }
    run(() => onEmail(email.trim()));
  }
  function submitSms() {
    if (!onSms) return;
    if (!phone.trim() || phone.replace(/\D/g, "").length < 8) { toast.error("Please enter a valid phone number"); return; }
    run(() => onSms(phone.trim()));
  }

  if (methods.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Send className="w-4 h-4 text-primary" />
            {title}
            {documentLabel && (
              <span className="text-muted-foreground font-normal text-sm ml-1">
                {documentLabel}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div
            className={cn(
              "grid gap-2",
              methods.length === 1 ? "grid-cols-1" : methods.length === 2 ? "grid-cols-2" : "grid-cols-3"
            )}
          >
            {methods.map(({ key, icon: Icon, label, sub }) => (
              <button
                key={key}
                type="button"
                onClick={() => { setMode(key); setSent(false); }}
                className={cn(
                  "flex flex-col items-center gap-1.5 px-3 py-4 rounded-xl border text-center transition-colors",
                  mode === key
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="text-sm font-medium leading-tight">{label}</span>
                <span className="text-[10px] leading-tight opacity-70">{sub}</span>
              </button>
            ))}
          </div>

          {mode === "reprint" && onReprint && (
            <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
              <div className="text-sm text-muted-foreground">
                {reprintHint ?? (
                  <>This will open a print preview{documentLabel ? <> for <strong>{documentLabel}</strong></> : null}.</>
                )}
              </div>
              <Button className="w-full gap-2" onClick={submitReprint} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                {reprintButtonLabel}
              </Button>
              {reprintExtraActions?.map((action, i) => (
                <Button
                  key={i}
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => run(action.onClick)}
                  disabled={busy}
                >
                  <Printer className="w-4 h-4" /> {action.label}
                </Button>
              ))}
            </div>
          )}

          {mode === "email" && onEmail && (
            <div className="space-y-1.5">
              <Label>Email Address</Label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="customer@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    readOnly={emailReadonly}
                    className={cn("pl-9", emailReadonly && "bg-muted/40")}
                    onKeyDown={(e) => e.key === "Enter" && submitEmail()}
                    autoFocus={!emailReadonly}
                  />
                </div>
                <Button className="gap-1.5 shrink-0" onClick={submitEmail} disabled={busy}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : sent ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                  {sent ? "Sent!" : "Send"}
                </Button>
              </div>
              {emailExtra}
              {emailHint && <p className="text-xs text-muted-foreground">{emailHint}</p>}
            </div>
          )}

          {mode === "sms" && onSms && (
            <div className="space-y-1.5">
              <Label>Mobile Number</Label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    type="tel"
                    placeholder="04XX XXX XXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    readOnly={smsReadonly}
                    className={cn("pl-9", smsReadonly && "bg-muted/40")}
                    onKeyDown={(e) => e.key === "Enter" && submitSms()}
                    autoFocus={!smsReadonly}
                  />
                </div>
                <Button className="gap-1.5 shrink-0" onClick={submitSms} disabled={busy}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : sent ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                  {sent ? "Sent!" : "Send"}
                </Button>
              </div>
              {smsHint && <p className="text-xs text-muted-foreground">{smsHint}</p>}
            </div>
          )}

          {!mode && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Select a delivery method above
            </p>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <Button variant="outline" size="sm" onClick={close}>
            <X className="w-3.5 h-3.5 mr-1.5" /> Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── SendButton ──────────────────────────────────────────────────────────
 * The single paper-plane "Send" button that replaces a Print/Email/SMS group.
 * Owns its own open state and renders the dialog. Pass the same config props as
 * SendDialog. `children` overrides the default icon+label content; `iconOnly`
 * renders just the icon (for tight table-row action clusters).
 */
import type { ButtonProps } from "@/components/ui/button";

export interface SendButtonProps extends SendDialogConfig {
  /** Button variant/size — forwarded to the underlying Button. */
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  disabled?: boolean;
  /** Render only the paper-plane icon (no "Send" text). */
  iconOnly?: boolean;
  /** Tooltip/title attribute; defaults to the dialog title or "Send". */
  buttonTitle?: string;
  /** Custom button content; overrides the default icon + label. */
  children?: React.ReactNode;
}

export function SendButton({
  variant = "outline", size, className, disabled, iconOnly, buttonTitle, children,
  ...config
}: SendButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size ?? (iconOnly ? "icon" : undefined)}
        className={className}
        disabled={disabled}
        title={buttonTitle ?? config.title ?? "Send"}
        onClick={() => setOpen(true)}
      >
        {children ?? (
          <>
            <Send className={cn("w-4 h-4", !iconOnly && "mr-1.5")} />
            {!iconOnly && "Send"}
          </>
        )}
      </Button>
      <SendDialog open={open} onOpenChange={setOpen} {...config} />
    </>
  );
}
