import { useEffect, useRef, useState } from "react";
import { Link, Redirect, useLocation, useParams } from "wouter";
import { Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth, type Account } from "@/lib/auth";
import { AuthCard, Notice } from "@/components/Form";

/* /c/<token> — the account link texted with a repair update, printed on a
   completed job's QR and carried by the wallet pass. It used to open the
   customer portal; now it leads to this account. The link only says whose
   account it is — it is also printed on a sticker that stays on the device —
   so it never signs anyone in (POST /shop/auth/token): a customer with a
   password signs in with it, one without is sent a set-up link to the contact
   on file. Someone already signed in as that customer goes straight through. */
export default function AccountLink() {
  const { token } = useParams<{ token: string }>();
  const { setCustomer } = useAuth();
  const [, navigate] = useLocation();
  const [state, setState] = useState<
    | { kind: "working" }
    | { kind: "password"; hint: string | null }
    | { kind: "setup"; hint: string | null; canSend: boolean }
    | { kind: "invalid"; message: string }
  >({ kind: "working" });
  const [sending, setSending] = useState<"idle" | "busy" | "sent">("idle");
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    api<{ customer: Account }>("/shop/auth/token", { method: "POST", body: JSON.stringify({ token }) })
      .then((r) => { setCustomer(r.customer); navigate("/account", { replace: true }); })
      .catch((err) => {
        const hint = err instanceof ApiError && typeof err.body.contactHint === "string" ? err.body.contactHint : null;
        if (err instanceof ApiError && err.body.reason === "password_required") {
          setState({ kind: "password", hint });
        } else if (err instanceof ApiError && err.body.reason === "setup_required") {
          setState({ kind: "setup", hint, canSend: err.body.canSendLink === true });
        } else {
          setState({ kind: "invalid", message: (err as Error).message });
        }
      });
  }, [token, setCustomer, navigate]);

  if (state.kind === "working") {
    return <div className="py-32 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>;
  }
  if (state.kind === "password") {
    return (
      <AuthCard title="Sign in to your account">
        <Notice tone="ok">
          Your account is protected by a password. Sign in with your email{state.hint ? ` (${state.hint})` : ""} and password to see your repairs, quotes and appointments.
        </Notice>
        <Link href="/account/login?next=/account" className="flex items-center justify-center w-full h-11 rounded-full bg-brand text-white font-medium hover:bg-brand-dark">Sign in</Link>
        <Link href="/account/forgot" className="block text-center text-sm text-stone-600 hover:underline">Forgot your password?</Link>
      </AuthCard>
    );
  }
  if (state.kind === "setup") {
    const send = async () => {
      setSending("busy");
      try {
        await api("/shop/auth/token/setup", { method: "POST", body: JSON.stringify({ token }) });
        setSending("sent");
      } catch {
        setSending("idle");
      }
    };
    return (
      <AuthCard title="Set up your account">
        {sending === "sent" ? (
          <Notice tone="ok">
            We've sent a set-up link{state.hint ? ` to ${state.hint}` : ""}. Open it to choose your password — then you can see your repairs, quotes and appointments any time.
          </Notice>
        ) : state.canSend ? (
          <>
            <Notice tone="ok">
              To keep your details safe, your account needs a password. We'll send a set-up link{state.hint ? ` to ${state.hint}` : " to the contact details we have for you"}.
            </Notice>
            <button onClick={() => void send()} disabled={sending === "busy"} className="flex items-center justify-center w-full h-11 rounded-full bg-brand text-white font-medium hover:bg-brand-dark disabled:opacity-50">
              {sending === "busy" ? "Sending…" : "Send me a set-up link"}
            </button>
          </>
        ) : (
          <Notice>
            To keep your details safe, your account needs a password, but we don't have an email or mobile number for you yet. Please contact us and we'll get it set up.
          </Notice>
        )}
        <Link href="/account/login?next=/account" className="block text-center text-sm text-stone-600 hover:underline">Already have a password? Sign in</Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="This link has expired">
      <Notice>{state.message}</Notice>
      <Link href="/account/login?next=/account" className="flex items-center justify-center w-full h-11 rounded-full bg-brand text-white font-medium hover:bg-brand-dark">Sign in</Link>
    </AuthCard>
  );
}

/* /c/<token>/set-password?token=… — set-up links emailed by the old portal.
   The one-time token is the same kind the shop's own page takes. */
export function AccountLinkSetPassword() {
  return <Redirect to={`/account/set-password${window.location.search}`} replace />;
}
