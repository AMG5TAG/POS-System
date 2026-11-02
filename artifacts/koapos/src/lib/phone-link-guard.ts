import { toast } from "sonner";
import { formatPhoneForDisplay } from "./phone-format";

/*
 * Chrome on a desktop hands a tel:/sms: link to the operating system, and on
 * Windows that hand-off (Phone Link, Teams, a softphone, or the "pick an app"
 * prompt) can hang or crash the browser. Opening the link in place instead of
 * in a new tab was not enough, so on anything that is not a phone or tablet the
 * link is never followed: the number is copied to the clipboard instead.
 *
 * This is one capture-phase listener on the document rather than a change at
 * each link, because phone links are rendered in dozens of places (including
 * raw HTML) and a per-link habit is one the next page won't have.
 */

const PHONE_SCHEME_RE = /^(tel|sms|callto):/i;

/** Phones and tablets dial a tel: link themselves; everything else is guarded. */
export function canDialFromBrowser(nav: Pick<Navigator, "userAgent" | "maxTouchPoints"> = navigator): boolean {
  const ua = nav.userAgent || "";
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS reports itself as a Mac; a Mac has no touch points.
  return /Macintosh/i.test(ua) && (nav.maxTouchPoints ?? 0) > 1;
}

/** The number a tel:/sms: href points at, without its scheme or ?body=. */
export function numberFromPhoneHref(href: string): string {
  const rest = href.replace(PHONE_SCHEME_RE, "").split(/[?;]/)[0];
  try {
    return decodeURIComponent(rest).replace(/^\/\//, "").trim();
  } catch {
    return rest.trim();
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the legacy path */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

let installed = false;

export function installPhoneLinkGuard(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;
  if (canDialFromBrowser()) return;

  const onClick = (e: MouseEvent) => {
    const target = e.target as Element | null;
    const link = target?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!link) return;
    const href = link.getAttribute("href") || "";
    if (!PHONE_SCHEME_RE.test(href)) return;

    e.preventDefault();
    e.stopPropagation();
    const number = numberFromPhoneHref(href);
    if (!number) return;
    const shown = formatPhoneForDisplay(number) || number;
    void copyText(number).then((ok) => {
      if (ok) toast.success(`Copied ${shown}`, { description: "Calls can't be placed from this computer." });
      else toast.info(shown, { description: "Calls can't be placed from this computer." });
    });
  };

  // Capture phase, so it runs before any React handler and before the
  // browser's default action. Middle-click (auxclick) would open a tab too.
  document.addEventListener("click", onClick, true);
  document.addEventListener("auxclick", onClick, true);
}
