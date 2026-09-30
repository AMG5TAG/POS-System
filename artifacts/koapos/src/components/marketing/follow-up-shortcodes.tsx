import { useRef, type RefObject } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Shortcode palette shared by the Follow Up send dialog and the template editor.
 * The list mirrors FOLLOW_UP_SHORTCODES on the API — it is fetched at runtime so
 * the two can never drift.
 */

export interface FollowUpShortcode {
  code: string;
  label: string;
  example: string;
}

/** Fallback used until the API responds (and if the request fails). */
export const FALLBACK_SHORTCODES: FollowUpShortcode[] = [
  { code: "first_name",     label: "Customer first name",           example: "Sarah" },
  { code: "last_name",      label: "Customer last name",            example: "Johnson" },
  { code: "customer_name",  label: "Customer full name",            example: "Sarah Johnson" },
  { code: "business_name",  label: "Your business name",            example: "KoaPOS Demo" },
  { code: "business_phone", label: "Your business phone",           example: "02 5555 1234" },
  { code: "business_email", label: "Your business email",           example: "hello@example.com" },
  { code: "reference",      label: "Job number / booking ref",      example: "SJ-1042" },
  { code: "job_number",     label: "Service job number",            example: "SJ-1042" },
  { code: "service_title",  label: "Service / appointment name",    example: "Screen replacement" },
  { code: "device",         label: "Device or item serviced",       example: "iPhone 13" },
  { code: "staff_name",     label: "Staff member who completed it", example: "Alex Taylor" },
  { code: "completed_date", label: "Date it was completed",         example: "12/07/2026" },
  { code: "days_since",     label: "Days since completion",         example: "30" },
  { code: "review_link",    label: "Your review link (Settings)",   example: "https://g.page/r/…" },
];

/**
 * Insert `{{code}}` at the caret of a text field, keeping the caret after the
 * inserted token so a merchant can keep typing.
 */
export function insertShortcode(
  ref: RefObject<HTMLTextAreaElement | HTMLInputElement | null>,
  value: string,
  code: string,
  onChange: (next: string) => void,
): void {
  const el = ref.current;
  const token = `{{${code}}}`;
  if (!el) { onChange(value + token); return; }
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? value.length;
  const next = value.slice(0, start) + token + value.slice(end);
  onChange(next);
  // Restore focus/caret after React has re-rendered with the new value.
  requestAnimationFrame(() => {
    el.focus();
    const caret = start + token.length;
    el.setSelectionRange(caret, caret);
  });
}

export function ShortcodePalette({
  shortcodes,
  onInsert,
  className,
}: {
  shortcodes: FollowUpShortcode[];
  onInsert: (code: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {shortcodes.map((s) => (
        <button
          key={s.code}
          type="button"
          onClick={() => onInsert(s.code)}
          title={`${s.label} — e.g. ${s.example}`}
          className="transition-transform hover:-translate-y-px"
        >
          <Badge variant="secondary" className="font-mono text-[10px] cursor-pointer hover:bg-primary hover:text-primary-foreground">
            {`{{${s.code}}}`}
          </Badge>
        </button>
      ))}
    </div>
  );
}

/** Convenience wrapper: palette bound to a textarea ref + its state setter. */
export function useShortcodeInserter(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  onChange: (next: string) => void,
) {
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  return (code: string) => insertShortcode(ref, latest.current.value, code, latest.current.onChange);
}
