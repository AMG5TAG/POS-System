/**
 * Shared helpers for the app-wide "capitalise the first letter of every input"
 * behaviour. Typing `aaron` yields `Aaron`. Applied by default in the base
 * `Input` and `Textarea` components; opt out per-field with `noAutoCapitalize`.
 */

/** Input types where auto-capitalising the first character would corrupt data. */
const EXCLUDED_TYPES = new Set([
  "email",
  "password",
  "number",
  "tel",
  "url",
  "date",
  "time",
  "datetime-local",
  "month",
  "week",
  "color",
  "range",
  "file",
  "hidden",
  "checkbox",
  "radio",
]);

/** Extra field hints used to detect email inputs that aren't typed `email`. */
export interface AutoCapitalizeHints {
  name?: string;
  id?: string;
  autoComplete?: string;
  inputMode?: string;
  placeholder?: string;
}

/** True when the field looks like an email address regardless of its `type`. */
function looksLikeEmailField(type?: string, hints?: AutoCapitalizeHints): boolean {
  if (type === "email") return true;
  if (hints?.autoComplete === "email") return true;
  if (hints?.inputMode === "email") return true;
  const haystack = `${hints?.name ?? ""} ${hints?.id ?? ""} ${hints?.placeholder ?? ""}`.toLowerCase();
  return /e-?mail/.test(haystack);
}

/**
 * True when the field looks like it holds a URL / website / domain regardless of
 * its `type`. Many such fields are plain `type="text"` (e.g. a "https://…"
 * placeholder), and capitalising the first letter corrupts the value
 * ("https://" → "Https://"). Detected via input hints and common placeholders.
 */
function looksLikeUrlField(type?: string, hints?: AutoCapitalizeHints): boolean {
  if (type === "url") return true;
  if (hints?.inputMode === "url") return true;
  if (hints?.autoComplete === "url") return true;
  const haystack = `${hints?.name ?? ""} ${hints?.id ?? ""} ${hints?.placeholder ?? ""}`.toLowerCase();
  return (
    /\b(url|uri|website|web ?site|domain|hostname|host name|web ?address)\b/.test(haystack) ||
    /https?:\/\//.test(haystack) ||
    /www\./.test(haystack)
  );
}

export function shouldAutoCapitalize(type?: string, hints?: AutoCapitalizeHints): boolean {
  if (type && EXCLUDED_TYPES.has(type)) return false;
  if (looksLikeEmailField(type, hints)) return false;
  if (looksLikeUrlField(type, hints)) return false;
  return true;
}

/**
 * True when a value itself looks like a URL, domain or email — content that must
 * never be capitalised even if the field wasn't recognised as URL-typed. URLs and
 * domains never contain whitespace, so a value with spaces is treated as prose.
 */
export function valueLooksLikeUrl(value: string): boolean {
  const v = value.trim();
  if (!v || /\s/.test(v)) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return true;                 // scheme://…
  if (/^www\./i.test(v)) return true;                                  // www.example.com
  if (/^[^@]+@[^@]+\.[^@]+$/.test(v)) return true;                     // an email address
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+([/:?#].*)?$/i.test(v)) return true;  // bare host.tld[/path]
  return false;
}

/** Uppercases the first character of the string, leaving the rest untouched. */
export function capitalizeFirst(value: string): string {
  if (!value) return value;
  if (valueLooksLikeUrl(value)) return value;
  const first = value.charAt(0);
  const upper = first.toUpperCase();
  return upper === first ? value : upper + value.slice(1);
}

/**
 * Capitalises the first letter of *every* word, for fields holding a person's
 * name. `capitalizeFirst` only reaches the first character of the value, which
 * leaves "mary jane" as "Mary jane" — fine for prose, wrong for a name.
 *
 * Words break on whitespace, hyphens and apostrophes, so "mary-jane o'brien"
 * becomes "Mary-Jane O'Brien". Everything after the first letter is left exactly
 * as typed rather than lowercased, which is what lets "McDonald", "MacLeod" and
 * "DeVries" survive being retyped — the alternative silently corrupts them.
 *
 * Opt a field in with the standard `autoCapitalize="words"` attribute, which
 * also tells a phone or tablet keyboard to do the same thing natively.
 */
export function capitalizeName(value: string): string {
  if (!value) return value;
  if (valueLooksLikeUrl(value)) return value;
  return value.replace(/(^|[\s\-'\u2019])(\S)/gu, (match, sep: string, ch: string) => {
    const upper = ch.toUpperCase();
    // A handful of characters grow when uppercased ("ß" → "SS"), which would
    // shift the caret out from under the typist mid-word. Leave those be.
    if (upper.length !== ch.length) return match;
    return sep + upper;
  });
}

/**
 * The import variant of `capitalizeName`, for names arriving from a spreadsheet
 * rather than a keyboard.
 *
 * It adds one rule: a word that is *entirely* uppercase is title-cased, so the
 * "JANE SMITH" that legacy systems love to export lands as "Jane Smith". Typing
 * deliberately doesn't do this — a person holding shift means it — but a CSV
 * dump carries no such intent.
 *
 * A mixed-case word is still left alone, which is what keeps "McDonald" and
 * "MacLeod" intact through an import: only shouting is corrected, never a
 * capital someone chose.
 */
export function capitalizeImportedName(value: string): string {
  if (!value) return value;
  if (valueLooksLikeUrl(value)) return value;
  return value.replace(/[^\s\-'\u2019]+/gu, (word) => {
    const isShouting = word === word.toUpperCase() && word !== word.toLowerCase();
    const first = word.charAt(0).toUpperCase();
    if (first.length !== word.charAt(0).length) return word;
    return first + (isShouting ? word.slice(1).toLowerCase() : word.slice(1));
  });
}

/**
 * Mutates the value of a text input/textarea in-place so it is capitalised,
 * preserving the caret position. Safe to call from an onChange handler before
 * forwarding the event to a consumer.
 *
 * Both transforms preserve the value's length, so the caret never needs moving
 * — it is restored as-is rather than guessed at.
 */
function applyTransform(
  el: HTMLInputElement | HTMLTextAreaElement,
  transform: (value: string) => string,
): void {
  const next = transform(el.value);
  if (next === el.value) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  el.value = next;
  // Only inputs that support text selection expose setSelectionRange reliably.
  try {
    if (start !== null && end !== null) el.setSelectionRange(start, end);
  } catch {
    /* some input types throw on setSelectionRange — ignore */
  }
}

export function applyCapitalizeFirst(
  el: HTMLInputElement | HTMLTextAreaElement,
): void {
  applyTransform(el, capitalizeFirst);
}

/** As `applyCapitalizeFirst`, but capitalising every word. */
export function applyCapitalizeName(
  el: HTMLInputElement | HTMLTextAreaElement,
): void {
  applyTransform(el, capitalizeName);
}
