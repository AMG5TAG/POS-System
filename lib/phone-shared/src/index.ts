/* ─── Phone numbers ───────────────────────────────────────────────────────────
 *
 * One rule, shared by the browser and the API server: a phone number is stored
 * in E.164 — "+61412345678" — no matter how the person at the till typed it.
 *
 * A counter staff member types "0412 345 678", because that is what the customer
 * reads out. Every machine that later has to *use* that number — an SMS gateway,
 * a `tel:` link on a phone, a vCard QR, an exported contact — wants the country
 * code. Asking the operator to type "+61" every time is how you get a database
 * where a third of the numbers can't be texted.
 *
 * So the country code is appended on save, from the merchant's configured
 * default country (Settings › Regional › Phone Numbers, stored on
 * `merchants.defaultPhoneCountry`, falling back to the business country).
 *
 * The single most important property here is that this never corrupts a value.
 * `phone` columns in the wild hold "ask for Dave", "02 9333 4444 ext 12" and
 * "N/A", and a merchant may type an overseas number. Anything this module can't
 * confidently read as a bare national or international number is returned
 * **exactly as given** — see the guard clauses at the top of `normalisePhone`.
 * A number left as typed is a small annoyance; a mangled one is a customer the
 * shop can no longer reach.
 *
 * This is deliberately not libphonenumber. That library is ~250KB into the
 * browser bundle to validate subscriber-number ranges we don't need: we are not
 * rejecting numbers, only writing the country code onto them. The table below is
 * the small part of it that matters — dial code, trunk prefix, and how long a
 * national number is allowed to be.
 */

export interface PhoneCountry {
  /** ISO 3166-1 alpha-2, matching `merchants.country`. */
  code: string;
  name: string;
  /** Country calling code, digits only, no "+". */
  dial: string;
  /**
   * National trunk prefix — the digit(s) dropped when a number goes
   * international. "0" across most of the world; "" where there is none (the
   * NANP, Singapore, Hong Kong, Denmark, Norway, Spain…), and importantly for
   * Italy, whose landline numbers *keep* their leading 0.
   */
  trunk: string;
  /** Min/max digits of a national significant number (after the trunk prefix). */
  nsn: [number, number];
  /**
   * International access prefix dialled from inside the country ("00" almost
   * everywhere, "0011" in Australia, "011" in the NANP). "00" is always accepted
   * as well — no country allocates a national number starting "00".
   */
  intl?: string;
}

/**
 * Countries offered as a default. Kept in step with `COUNTRY_CODE_TO_NAME` in
 * the frontend's `localisation.ts`, so the phone default can be set for any
 * country the business address already supports.
 *
 * The `nsn` ranges are wide on purpose. They exist to answer one question —
 * "does this number already carry its country code?" — not to validate. A range
 * that is too tight rejects a legitimate number (an Australian 13/1300 line, a
 * short German landline) and leaves it un-normalised.
 */
export const PHONE_COUNTRIES: readonly PhoneCountry[] = [
  { code: "AU", name: "Australia",            dial: "61",  trunk: "0", nsn: [6, 10], intl: "0011" },
  { code: "NZ", name: "New Zealand",          dial: "64",  trunk: "0", nsn: [7, 10] },
  { code: "US", name: "United States",        dial: "1",   trunk: "",  nsn: [10, 10], intl: "011" },
  { code: "CA", name: "Canada",               dial: "1",   trunk: "",  nsn: [10, 10], intl: "011" },
  { code: "GB", name: "United Kingdom",       dial: "44",  trunk: "0", nsn: [9, 10] },
  { code: "IE", name: "Ireland",              dial: "353", trunk: "0", nsn: [7, 9] },
  { code: "SG", name: "Singapore",            dial: "65",  trunk: "",  nsn: [8, 8] },
  { code: "IN", name: "India",                dial: "91",  trunk: "0", nsn: [10, 10] },
  { code: "ZA", name: "South Africa",         dial: "27",  trunk: "0", nsn: [9, 9] },
  { code: "FR", name: "France",               dial: "33",  trunk: "0", nsn: [9, 9] },
  { code: "DE", name: "Germany",              dial: "49",  trunk: "0", nsn: [6, 11] },
  { code: "IT", name: "Italy",                dial: "39",  trunk: "",  nsn: [6, 11] },
  { code: "ES", name: "Spain",                dial: "34",  trunk: "",  nsn: [9, 9] },
  { code: "NL", name: "Netherlands",          dial: "31",  trunk: "0", nsn: [9, 9] },
  { code: "PT", name: "Portugal",             dial: "351", trunk: "",  nsn: [9, 9] },
  { code: "JP", name: "Japan",                dial: "81",  trunk: "0", nsn: [9, 10] },
  { code: "KR", name: "South Korea",          dial: "82",  trunk: "0", nsn: [8, 10] },
  { code: "CN", name: "China",                dial: "86",  trunk: "0", nsn: [9, 11] },
  { code: "TW", name: "Taiwan",               dial: "886", trunk: "0", nsn: [8, 9] },
  { code: "HK", name: "Hong Kong",            dial: "852", trunk: "",  nsn: [8, 8] },
  { code: "MY", name: "Malaysia",             dial: "60",  trunk: "0", nsn: [8, 10] },
  { code: "ID", name: "Indonesia",            dial: "62",  trunk: "0", nsn: [8, 12] },
  { code: "TH", name: "Thailand",             dial: "66",  trunk: "0", nsn: [8, 9] },
  { code: "VN", name: "Vietnam",              dial: "84",  trunk: "0", nsn: [9, 10] },
  { code: "PH", name: "Philippines",          dial: "63",  trunk: "0", nsn: [9, 10] },
  { code: "AE", name: "United Arab Emirates", dial: "971", trunk: "0", nsn: [8, 9] },
  { code: "SA", name: "Saudi Arabia",         dial: "966", trunk: "0", nsn: [8, 9] },
  { code: "QA", name: "Qatar",                dial: "974", trunk: "",  nsn: [8, 8] },
  { code: "BR", name: "Brazil",               dial: "55",  trunk: "0", nsn: [10, 11] },
  { code: "MX", name: "Mexico",               dial: "52",  trunk: "",  nsn: [10, 10] },
  { code: "AR", name: "Argentina",            dial: "54",  trunk: "0", nsn: [10, 11] },
  { code: "CL", name: "Chile",                dial: "56",  trunk: "",  nsn: [9, 9] },
  { code: "SE", name: "Sweden",               dial: "46",  trunk: "0", nsn: [7, 9] },
  { code: "NO", name: "Norway",               dial: "47",  trunk: "",  nsn: [8, 8] },
  { code: "DK", name: "Denmark",              dial: "45",  trunk: "",  nsn: [8, 8] },
  { code: "FI", name: "Finland",              dial: "358", trunk: "0", nsn: [6, 10] },
  { code: "CH", name: "Switzerland",          dial: "41",  trunk: "0", nsn: [9, 9] },
  { code: "AT", name: "Austria",              dial: "43",  trunk: "0", nsn: [7, 13] },
  { code: "BE", name: "Belgium",              dial: "32",  trunk: "0", nsn: [8, 9] },
  { code: "PL", name: "Poland",               dial: "48",  trunk: "",  nsn: [9, 9] },
  { code: "TR", name: "Turkey",               dial: "90",  trunk: "0", nsn: [10, 10] },
  { code: "NG", name: "Nigeria",              dial: "234", trunk: "0", nsn: [7, 10] },
  { code: "KE", name: "Kenya",                dial: "254", trunk: "0", nsn: [9, 9] },
  { code: "EG", name: "Egypt",                dial: "20",  trunk: "0", nsn: [9, 10] },
  { code: "GH", name: "Ghana",                dial: "233", trunk: "0", nsn: [9, 9] },
  { code: "PK", name: "Pakistan",             dial: "92",  trunk: "0", nsn: [9, 10] },
  { code: "BD", name: "Bangladesh",           dial: "880", trunk: "0", nsn: [8, 10] },
  { code: "LK", name: "Sri Lanka",            dial: "94",  trunk: "0", nsn: [9, 9] },
  { code: "NP", name: "Nepal",                dial: "977", trunk: "",  nsn: [8, 10] },
];

const BY_CODE: Map<string, PhoneCountry> = new Map(
  PHONE_COUNTRIES.map((c) => [c.code, c]),
);

/**
 * The country every merchant's numbers use until they choose otherwise.
 *
 * Australia, unconditionally — not the merchant's business country. KoaPOS sells
 * to Australian retail, so +61 is right for all but a handful of accounts, and a
 * default that quietly varied per merchant would be a default nobody could
 * predict from the setting screen. A shop that needs another country picks one
 * in Settings › Regional › Phone Numbers, and that choice is then the only thing
 * that matters.
 */
export const FALLBACK_PHONE_COUNTRY = "AU";

/** Digits below this can't be a phone number — matches `phone-match.ts`. */
const MIN_DIGITS = 6;

/** E.164 allows at most 15 digits including the country code. */
const MAX_DIGITS = 15;

/** Look up a country by ISO code, case-insensitively. */
export function phoneCountry(code: string | null | undefined): PhoneCountry | undefined {
  if (!code) return undefined;
  return BY_CODE.get(code.trim().toUpperCase());
}

/**
 * The country a merchant's phone numbers use: their setting if they have made
 * one, otherwise Australia.
 *
 * The argument is the raw stored value, which is "" for every merchant who has
 * never opened the setting — so "" and an unrecognised code both mean the same
 * thing here, which is that nobody has chosen and the default applies.
 */
export function resolvePhoneCountry(
  defaultPhoneCountry: string | null | undefined,
): PhoneCountry {
  return phoneCountry(defaultPhoneCountry) ?? phoneCountry(FALLBACK_PHONE_COUNTRY)!;
}

function inRange(length: number, [min, max]: [number, number]): boolean {
  return length >= min && length <= max;
}

/**
 * Rewrite a typed phone number into E.164, using `country` for anything the
 * number doesn't say for itself.
 *
 *   normalisePhone("0412 345 678", AU)   → "+61412345678"
 *   normalisePhone("(02) 9333 4444", AU) → "+61293334444"
 *   normalisePhone("1300 123 456", AU)   → "+611300123456"   (no trunk prefix)
 *   normalisePhone("+64 21 555 1234", AU)→ "+64215551234"    (already overseas)
 *   normalisePhone("0064 21 555 1234")   → "+64215551234"    (00 = dial out)
 *   normalisePhone("61412345678", AU)    → "+61412345678"    (not +6161…)
 *
 * Returns the input **unchanged** whenever it isn't confidently a phone number.
 */
export function normalisePhone(
  raw: string | null | undefined,
  country: PhoneCountry | string | null | undefined,
): string {
  const value = String(raw ?? "").trim();
  if (!value) return value;

  const c = typeof country === "string" || country == null ? phoneCountry(country) : country;
  // No idea what country to assume — better to keep what was typed.
  if (!c) return value;

  // Words mean this isn't a bare number: "ext 12", "after 5pm", "ask for Dave".
  // A number with an extension is left whole rather than half-converted.
  if (/[A-Za-z]/.test(value)) return value;

  // "+61 (0) 412 345 678" — the parenthesised trunk digit is written precisely
  // to say "drop me when dialling internationally", so drop it.
  const cleaned = value.startsWith("+") ? value.replace(/\(\s*0\s*\)/, "") : value;

  const digits = cleaned.replace(/\D/g, "");
  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return value;

  // Already international. Nothing to infer — just strip the formatting.
  if (cleaned.startsWith("+")) return `+${digits}`;

  // Dialled out of the country: 0011 61…, 011 1…, 00 64…
  for (const prefix of [c.intl, "00"]) {
    if (prefix && digits.startsWith(prefix) && digits.length - prefix.length >= MIN_DIGITS) {
      return `+${digits.slice(prefix.length)}`;
    }
  }

  // A national number with its trunk prefix: 0412… → +61412…
  // Not length-checked: in a trunk-prefix country a leading 0 is a trunk prefix
  // whatever follows it, and refusing an unusually short one would leave a
  // number that can't be dialled from a mobile.
  if (c.trunk && digits.startsWith(c.trunk)) {
    return `+${c.dial}${digits.slice(c.trunk.length)}`;
  }

  // The country code typed without a "+": 61412345678. Only read that way when
  // what follows is a plausible national number, so a local number that happens
  // to start with those digits isn't mistaken for one.
  if (
    digits.startsWith(c.dial) &&
    inRange(digits.length - c.dial.length, c.nsn)
  ) {
    return `+${digits}`;
  }

  // A plain national number with no trunk prefix: 412345678, 1300123456.
  if (inRange(digits.length, c.nsn)) return `+${c.dial}${digits}`;

  // Right digit count for nothing we know. Leave it alone.
  return value;
}

/**
 * `normalisePhone` for a nullable column: preserves null/undefined rather than
 * turning an absent number into "".
 */
export function normalisePhoneOrNull<T extends string | null | undefined>(
  raw: T,
  country: PhoneCountry | string | null | undefined,
): T extends string ? string : T {
  if (raw === null || raw === undefined) return raw as never;
  return normalisePhone(raw, country) as never;
}

/** "+61" — for display next to a country in a picker. */
export function dialCode(country: PhoneCountry | string | null | undefined): string {
  const c = typeof country === "string" || country == null ? phoneCountry(country) : country;
  return c ? `+${c.dial}` : "";
}

/**
 * An example of what this country's numbers turn into, for the settings screen:
 * `{ typed: "0412 345 678", stored: "+61412345678" }`. Built by running a real
 * national number through `normalisePhone`, so the preview can never claim
 * something the normaliser wouldn't actually do.
 */
export function phoneExample(country: PhoneCountry | string | null | undefined): {
  typed: string;
  stored: string;
} {
  const c = typeof country === "string" || country == null ? phoneCountry(country) : country;
  if (!c) return { typed: "", stored: "" };
  const [min] = c.nsn;
  // A nine-digit sample where the range allows, so the example looks like a real
  // number rather than a run of padding.
  const body = "412345678901234".slice(0, Math.min(Math.max(min, 9), c.nsn[1]));
  const typed = `${c.trunk}${body}`;
  return { typed, stored: normalisePhone(typed, c) };
}
