import { useState } from "react";
import { Link, useLocation } from "wouter";
import { api } from "@/lib/api";
import { useAuth, type Account } from "@/lib/auth";
import { AuthCard, Field, Notice, Submit } from "@/components/Form";
import { forgetReferral, rememberedReferral } from "@/lib/referral";

export default function Register() {
  const { setCustomer } = useAuth();
  const [, navigate] = useLocation();
  const [f, setF] = useState({ firstName: "", lastName: "", email: "", phone: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  // A friend's code from their referral link, credited to them on sign-up.
  const [referral] = useState(rememberedReferral);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api<{ status: string; customer?: Account }>("/shop/auth/register", { method: "POST", body: JSON.stringify({ ...f, referralCode: referral ?? undefined }) });
      if (r.status === "created" && r.customer) { forgetReferral(); setCustomer(r.customer); navigate("/account"); }
      else setCheckEmail(true);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  if (checkEmail) {
    return (
      <AuthCard title="Check your email">
        <p className="text-stone-600">You're already one of our customers, so we've sent a link to <strong>{f.email}</strong> to set your password and finish setting up your online account.</p>
        <Link href="/account/login" className="block text-center text-sm text-brand underline">Back to sign in</Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Create an account" footer={<>Already have an account? <Link href="/account/login" className="text-brand font-medium underline">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        {error && <Notice>{error}</Notice>}
        {referral && <Notice tone="ok">You were referred by a friend (code {referral}) — they'll get the credit when you sign up.</Notice>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" required autoComplete="given-name" value={f.firstName} onChange={set("firstName")} />
          <Field label="Last name" autoComplete="family-name" value={f.lastName} onChange={set("lastName")} />
        </div>
        <Field label="Email" type="email" required autoComplete="email" value={f.email} onChange={set("email")} />
        <Field label="Mobile" type="tel" autoComplete="tel" value={f.phone} onChange={set("phone")} />
        <Field label="Password" type="password" required minLength={8} autoComplete="new-password" value={f.password} onChange={set("password")} />
        <p className="text-xs text-stone-500">At least 8 characters. Already a customer in store? Use the same email and we'll link your account.</p>
        <Submit busy={busy}>Create account</Submit>
      </form>
    </AuthCard>
  );
}
