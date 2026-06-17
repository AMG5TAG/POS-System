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

export function shouldAutoCapitalize(type?: string, hints?: AutoCapitalizeHints): boolean {
  if (type && EXCLUDED_TYPES.has(type)) return false;
  if (looksLikeEmailField(type, hints)) return false;
  return true;
}

/** Uppercases the first character of the string, leaving the rest untouched. */
export function capitalizeFirst(value: string): string {
  if (!value) return value;
  const first = value.charAt(0);
  const upper = first.toUpperCase();
  return upper === first ? value : upper + value.slice(1);
}

/**
 * Mutates the value of a text input/textarea in-place so its first character is
 * capitalised, preserving the caret position. Safe to call from an onChange
 * handler before forwarding the event to a consumer.
 */
export function applyCapitalizeFirst(
  el: HTMLInputElement | HTMLTextAreaElement,
): void {
  const next = capitalizeFirst(el.value);
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
