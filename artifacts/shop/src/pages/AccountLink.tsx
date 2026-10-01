import { useEffect, useRef, useState } from "react";
import { Link, Redirect, useLocation, useParams } from "wouter";
import { Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth, type Account } from "@/lib/auth";
import { AuthCard, Notice } from "@/components/Form";

/* /c/<token> — the account link texted with a repair update, printed on a
   completed job's QR and carried by the wallet pass. It used to open the
   customer portal; now it signs the customer into this account and opens it.
   Whether the link alone is enough is the server's call (POST /shop/auth/token,
   lib/portalAuth.ts): a customer who has set a password, at a business that
   requires one, is asked to sign in instead. */
export default function AccountLink() {
  const { token } = useParams<{ token: string }>();
  const { setCustomer } = useAuth();
  const [, navigate] = useLocation();
  const [state, setState] = useState<{ kind: "working" } | { kind: "password"; hint: string | null } | { kind: "invalid"; message: string }>({ kind: "working" });
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    api<{ customer: Account }>("/shop/auth/token", { method: "POST", body: JSON.stringify({ token }) })
      .then((r) => { setCustomer(r.customer); navigate("/account", { replace: true }); })
      .catch((err) => {
        if (err instanceof ApiError && err.body.reason === "password_required") {
          setState({ kind: "password", hint: typeof err.body.contactHint === "string" ? err.body.contactHint : null });
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
