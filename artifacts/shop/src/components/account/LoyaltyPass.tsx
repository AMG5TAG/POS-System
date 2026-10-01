import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Copy, Download, QrCode, Wallet } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Notice } from "@/components/Form";

/* The customer's card, as the portal's Loyalty tab had it: a QR of their
   account link (show it at the counter, or scan it on another phone to open
   the account) and the same link as an Apple / Google Wallet pass. The link
   signs whoever holds it in — it is the customer's own, shown only to them. */
export function LoyaltyPass({ portalToken, totalSpent, visitCount }: { portalToken: string | null; totalSpent: number; visitCount: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [busy, setBusy] = useState<"apple" | "google" | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const link = portalToken ? `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/c/${portalToken}` : null;

  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setMsg({ tone: "ok", text: "Link copied." }); }
    catch { setMsg({ tone: "error", text: "Couldn't copy — press and hold the QR code to save it instead." }); }
  };
  const download = () => {
    const url = canvas.current?.toDataURL("image/png");
    if (!url) return;
    const a = document.createElement("a");
    a.href = url; a.download = "my-koastal-card.png"; a.click();
  };
  const apple = async () => {
    setBusy("apple"); setMsg(null);
    try {
      const r = await fetch("/api/shop/account/wallet/apple", { credentials: "include" });
      if (!r.ok) throw new Error(r.status === 503 ? "Apple Wallet passes aren't available yet." : "Couldn't create your pass.");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await r.blob()); a.download = "loyalty-card.pkpass"; a.click();
    } catch (e) { setMsg({ tone: "error", text: (e as Error).message }); } finally { setBusy(null); }
  };
  const google = async () => {
    setBusy("google"); setMsg(null);
    try {
      const { saveUrl } = await api<{ saveUrl: string }>("/shop/account/wallet/google");
      window.open(saveUrl, "_blank", "noopener");
    } catch (e) {
      setMsg({ tone: "error", text: e instanceof ApiError && e.status === 503 ? "Google Wallet passes aren't available yet." : "Couldn't create your pass." });
    } finally { setBusy(null); }
  };

  const aud = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
  return (
    <section className="rounded-2xl bg-white border border-stone-200 p-6">
      <h2 className="text-lg font-semibold flex items-center gap-2"><QrCode className="w-5 h-5 text-brand" /> Your card</h2>
      <div className="mt-4 grid sm:grid-cols-[auto_1fr] gap-5 items-start">
        {link && (
          <div className="justify-self-center rounded-xl border border-stone-200 p-3 bg-white">
            <QRCodeCanvas ref={canvas} value={link} size={160} marginSize={1} />
          </div>
        )}
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-stone-50 px-3 py-2"><dt className="text-stone-500">Total spent</dt><dd className="font-semibold text-base">{aud(totalSpent)}</dd></div>
            <div className="rounded-xl bg-stone-50 px-3 py-2"><dt className="text-stone-500">Visits</dt><dd className="font-semibold text-base">{visitCount}</dd></div>
          </dl>
          <p className="text-sm text-stone-600">Show this code in store, or add your card to your phone's wallet. It opens this account, so keep it to yourself.</p>
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          {/* The two wallet pills share a row of their own so they always sit side by side. */}
          <div className="grid grid-cols-2 gap-2 max-w-sm">
            <button onClick={() => void apple()} disabled={!!busy} className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-full bg-black text-white text-sm font-medium whitespace-nowrap disabled:opacity-50">
              <Wallet className="w-4 h-4 shrink-0" /> {busy === "apple" ? "Preparing…" : "Apple Wallet"}
            </button>
            <button onClick={() => void google()} disabled={!!busy} className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-full border border-stone-300 text-sm font-medium whitespace-nowrap hover:bg-stone-50 disabled:opacity-50">
              <Wallet className="w-4 h-4 shrink-0" /> {busy === "google" ? "Opening…" : "Google Wallet"}
            </button>
          </div>
          {link && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void copy()} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-stone-300 text-sm hover:bg-stone-50"><Copy className="w-4 h-4" /> Copy link</button>
              <button onClick={download} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-stone-300 text-sm hover:bg-stone-50"><Download className="w-4 h-4" /> Save QR</button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
