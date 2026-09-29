/* The shop talks to the POS's own API, on the same origin (/api). */
export class ApiError extends Error {
  constructor(message: string, public status: number, public body: Record<string, unknown>) { super(message); }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, {
    credentials: "include",
    ...init,
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new ApiError(String(body.error ?? `Request failed (${r.status})`), r.status, body);
  return body as T;
}
