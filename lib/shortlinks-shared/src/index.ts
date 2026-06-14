/**
 * Single source of truth for shortlink ending (slug) rules, shared by the
 * koapos client (artifacts/koapos) and the api-server (artifacts/api-server).
 */

// All shortlinks live on the new branded domain.
export const SHORT_DOMAIN = "koast.al";

// Prominent / valuable endings reserved for official and future use —
// users cannot claim these as custom endings.
export const RESERVED_ENDINGS: ReadonlySet<string> = new Set([
  "app", "api", "admin", "login", "logout", "signin", "signup", "register",
  "home", "help", "support", "about", "contact", "pricing", "terms", "privacy",
  "shop", "store", "sale", "deals", "menu", "order", "pay", "checkout", "cart",
  "go", "s", "qr", "link", "links", "url", "dashboard", "account", "settings",
  "billing", "new", "info", "faq", "blog", "news", "status", "download",
  "koapos", "koastal", "koast", "koa",
]);

// Words not permitted anywhere within a custom ending.
export const FORBIDDEN_WORDS: readonly string[] = [
  "fuck", "shit", "bitch", "cunt", "asshole", "bastard", "dick", "piss",
  "nigger", "nigga", "faggot", "slut", "whore", "rape", "nazi", "porn", "sex",
];

/** True when the (already-lowercased) value contains a forbidden word, ignoring - and _. */
export function containsForbidden(value: string): boolean {
  const flat = value.replace(/[-_]/g, "");
  return FORBIDDEN_WORDS.some((w) => flat.includes(w));
}

/** Normalise an ending into its canonical stored form. */
export function normalizeEnding(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Returns an error message for an invalid custom ending, or null when valid.
 *
 * By default an empty ending is valid — it means "auto-generate" on the client.
 * Pass { requireValue: true } (server-side) to require a concrete ending.
 */
export function validateEnding(raw: unknown, opts: { requireValue?: boolean } = {}): string | null {
  if (typeof raw !== "string") return "Ending must be text.";
  const ending = normalizeEnding(raw);
  if (!ending) return opts.requireValue ? "An ending is required." : null;
  if (ending.length < 2) return "Custom ending must be at least 2 characters.";
  if (ending.length > 40) return "Custom ending must be 40 characters or fewer.";
  if (!/^[a-z0-9](?:[a-z0-9-_]*[a-z0-9])?$/.test(ending)) {
    return "Use letters, numbers, hyphens or underscores (can't start or end with - or _).";
  }
  if (RESERVED_ENDINGS.has(ending)) return `"${ending}" is reserved and can't be used. Try something else.`;
  if (containsForbidden(ending)) return "That ending contains a word that isn't allowed.";
  return null;
}
