import { useState } from "react";
import { Link, useLocation } from "wouter";
import { api, ApiError } from "@/lib/api";
import { useAuth, type Account } from "@/lib/auth";
import { AuthCard, Field, Notice, Submit } from "@/components/Form";

export default function Login() {
  const { setCustomer } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const next = new URLSearchParams(window.location.search).get("next") || "/account";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setNeedsSetup(false);
    try {
      const r = await api<{ customer: Account }>("/shop/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      setCustomer(r.customer);
      navigate(next.startsWith("/") ? next : "/account");
    } catch (err) {
      setError((err as Error).message);
      setNeedsSetup(err instanceof ApiError && err.body.needsSetup === true);
    } finally { setBusy(false); }
  };

  return (
    <AuthCard title="Sign in" footer={<>New here? <Link href="/account/register" className="text-brand font-medium underline">Create an account</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        {error && <Notice>{error}</Notice>}
        {needsSetup && (
          <Notice tone="ok">You're already a customer — use <Link href={`/account/forgot?email=${encodeURIComponent(email)}`} className="underline font-medium">set up my password</Link> and we'll email you a link.</Notice>
        )}
        <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <Submit busy={busy}>Sign in</Submit>
        <Link href="/account/forgot" className="block text-center text-sm text-stone-600 hover:underline">Forgot password or first time signing in?</Link>
      </form>
    </AuthCard>
  );
}
