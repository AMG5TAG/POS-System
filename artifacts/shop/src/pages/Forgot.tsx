import { useState } from "react";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { AuthCard, Field, Notice, Submit } from "@/components/Form";

export default function Forgot() {
  const [email, setEmail] = useState(new URLSearchParams(window.location.search).get("email") ?? "");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await api("/shop/auth/forgot", { method: "POST", body: JSON.stringify({ email }) }); setSent(true); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  return (
    <AuthCard title="Set or reset your password" footer={<Link href="/account/login" className="underline">Back to sign in</Link>}>
      {sent ? (
        <Notice tone="ok">If {email} belongs to a customer account, we've emailed a link to set your password. It expires in an hour.</Notice>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <Notice>{error}</Notice>}
          <p className="text-sm text-stone-600">Enter the email you use with us. We'll send a link to set a new password — this also works if you shop with us in store and haven't signed in online before.</p>
          <Field label="Email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Submit busy={busy}>Email me a link</Submit>
        </form>
      )}
    </AuthCard>
  );
}
