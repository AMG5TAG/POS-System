import { useState } from "react";
import { Link, useLocation } from "wouter";
import { api } from "@/lib/api";
import { useAuth, type Account } from "@/lib/auth";
import { AuthCard, Field, Notice, Submit } from "@/components/Form";

export default function SetPassword() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const { setCustomer } = useAuth();
  const [, navigate] = useLocation();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setBusy(true); setError(null);
    try {
      const r = await api<{ customer: Account }>("/shop/auth/set-password", { method: "POST", body: JSON.stringify({ token, password }) });
      setCustomer(r.customer);
      navigate("/account");
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  if (!token) {
    return <AuthCard title="Link missing"><p className="text-stone-600">This link is incomplete. <Link href="/account/forgot" className="underline">Request a new one</Link>.</p></AuthCard>;
  }
  return (
    <AuthCard title="Choose your password">
      <form onSubmit={submit} className="space-y-4">
        {error && <Notice>{error} {error.includes("new one") && <Link href="/account/forgot" className="underline font-medium">Request a new link</Link>}</Notice>}
        <Field label="New password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Field label="Confirm password" type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <Submit busy={busy}>Save and sign in</Submit>
      </form>
    </AuthCard>
  );
}
