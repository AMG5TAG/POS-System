import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy, Mail, MessageSquare, MoreHorizontal, Send, Share2 } from "lucide-react";

/* Share a link by the channel the customer picks. Each target is the service's
   own public share address, so nothing is sent from here and no account is
   needed; "More options" opens the device's share sheet (Messenger,
   Instagram, AirDrop…) where the browser has one. Instagram has no web share
   address, which is why it is only reachable that way. */

type Target = { key: string; label: string; href: (url: string, text: string, subject: string) => string; icon: ReactNode; colour: string };

const enc = encodeURIComponent;
const Glyph = ({ children, bg }: { children: string; bg: string }) => (
  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: bg }} aria-hidden>{children}</span>
);

const TARGETS: Target[] = [
  { key: "email", label: "Email", colour: "#475569", icon: <Mail className="w-5 h-5" />,
    href: (url, text, subject) => `mailto:?subject=${enc(subject)}&body=${enc(`${text}\n\n${url}`)}` },
  // "sms:?&body=" is the form both iOS and Android accept.
  { key: "sms", label: "Text message", colour: "#16a34a", icon: <MessageSquare className="w-5 h-5" />,
    href: (url, text) => `sms:?&body=${enc(`${text} ${url}`)}` },
  { key: "whatsapp", label: "WhatsApp", colour: "#25d366", icon: <Glyph bg="#25d366">W</Glyph>,
    href: (url, text) => `https://wa.me/?text=${enc(`${text} ${url}`)}` },
  { key: "facebook", label: "Facebook", colour: "#1877f2", icon: <Glyph bg="#1877f2">f</Glyph>,
    href: (url) => `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}` },
  { key: "x", label: "X (Twitter)", colour: "#000000", icon: <Glyph bg="#000000">X</Glyph>,
    href: (url, text) => `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}` },
  { key: "linkedin", label: "LinkedIn", colour: "#0a66c2", icon: <Glyph bg="#0a66c2">in</Glyph>,
    href: (url) => `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}` },
  { key: "telegram", label: "Telegram", colour: "#229ed9", icon: <Send className="w-5 h-5" />,
    href: (url, text) => `https://t.me/share/url?url=${enc(url)}&text=${enc(text)}` },
];

export function ShareMenu({ url, text, subject }: { url: string; text: string; subject: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const canNativeShare = typeof navigator !== "undefined" && "share" in navigator;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(`${text} ${url}`); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  };
  const nativeShare = async () => {
    try { await navigator.share({ title: subject, text, url }); setOpen(false); } catch { /* cancelled */ }
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-brand text-white text-sm hover:bg-brand-dark">
        <Share2 className="w-4 h-4" /> Share
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-2 z-30 w-60 rounded-xl border border-stone-200 bg-white shadow-lg p-1.5">
          {TARGETS.map((t) => (
            <a key={t.key} role="menuitem" href={t.href(url, text, subject)}
              target={t.href(url, text, subject).startsWith("http") ? "_blank" : undefined} rel="noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-stone-100">
              <span style={{ color: t.colour }} className="w-5 flex justify-center">{t.icon}</span>{t.label}
            </a>
          ))}
          <div className="my-1 border-t border-stone-100" />
          {canNativeShare && (
            <button role="menuitem" onClick={() => void nativeShare()} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-stone-100 text-left">
              <MoreHorizontal className="w-5 h-5 text-stone-500" /> More options…
            </button>
          )}
          <button role="menuitem" onClick={() => void copy()} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-stone-100 text-left">
            {copied ? <><Check className="w-5 h-5 text-emerald-600" /> Copied</> : <><Copy className="w-5 h-5 text-stone-500" /> Copy message and link</>}
          </button>
        </div>
      )}
    </div>
  );
}
