import type { InputHTMLAttributes, ReactNode } from "react";

export function Field({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <input {...props} className="w-full h-11 rounded-xl border border-stone-300 bg-white px-3 outline-none focus:border-brand focus:ring-2 focus:ring-amber-100" />
    </label>
  );
}

export function AuthCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <div className="rounded-2xl bg-white border border-stone-200 p-7 shadow-sm space-y-5">
        <h1 className="text-2xl font-bold">{title}</h1>
        {children}
      </div>
      {footer && <div className="text-center text-sm text-stone-600 mt-5">{footer}</div>}
    </div>
  );
}

export function Submit({ busy, children }: { busy?: boolean; children: ReactNode }) {
  return (
    <button type="submit" disabled={busy} className="w-full h-11 rounded-full bg-ink text-white font-medium hover:bg-stone-800 disabled:opacity-50">
      {busy ? "Please wait…" : children}
    </button>
  );
}

export function Notice({ tone = "error", children }: { tone?: "error" | "ok"; children: ReactNode }) {
  return <p className={`text-sm rounded-xl px-3 py-2 ${tone === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{children}</p>;
}
