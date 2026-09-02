/* ── localStorage key constants ──────────────────────────────────────────── */

export const FORCE_STAFF_LOGIN_KEY = "koapos_force_staff_login";
export const PAYMENT_METHODS_KEY = "koapos_enabled_payment_methods";
export const STAFF_LOGIN_MSG_KEY = "koapos_staff_login_msg";
export const INTEGRATION_PAYMENT_METHODS_KEY = "koapos_enabled_integration_payments";
export const POS_GRID_SETTINGS_KEY = "koapos_pos_grid_settings";
export const ACTIVE_REGISTER_KEY = "koapos_active_register";
/** Which register (registerId text, e.g. "default"/"MAIN") THIS device operates — per-terminal, never global. */
export const ACTIVE_REGISTER_ID_KEY = "koapos_active_register_id";
export const DEVICE_ID_KEY = "koapos_device_id";

/* ── Types ───────────────────────────────────────────────────────────────── */

export interface StaffLoginMessage {
  text: string;
  requireAck: boolean;
  enabled: boolean;
}

export type PaymentMethodId =
  | "cash" | "eftpos" | "card" | "direct_deposit"
  | "voucher" | "store_credit" | "laybuy" | "loyalty" | "split" | "gift_card";

/** A merchant-defined payment method configured in Management → POS Registers.
 *  Appears in the POS checkout alongside the built-in tenders and is recorded
 *  as a generic "other" transaction tender with an audit note carrying the label. */
export interface CustomPaymentMethod {
  /** Stable identifier (e.g. "cust_ab12cd"); used to build the checkout tender id `__custom__<id>`. */
  id: string;
  label: string;
  description: string;
  /** Key into the custom-payment icon set; falls back to a generic wallet icon when unknown. */
  icon: string;
  enabled: boolean;
}

export interface PosGridSettings {
  columns: 2 | 3 | 4 | 5;
  tileSize: "compact" | "normal" | "large";
  showPrices: boolean;
  showStockBadges: boolean;
  cartPosition: "right" | "left";
}

/** Per-staff POS layout preferences stored as JSON in staff.posPrefs.
 *  Every field is optional — missing fields fall back to the account-level
 *  POS settings. Applied on whatever terminal the staff member signs in
 *  for the day. */
export interface StaffPosPrefs {
  gridColumns?: 2 | 3 | 4 | 5;
  tileSize?: "compact" | "normal" | "large";
  showPrices?: boolean;
  showStockBadges?: boolean;
  cartPosition?: "right" | "left";
}

/** Parse staff.posPrefs JSON, dropping anything malformed or out of range. */
export function parseStaffPosPrefs(raw: string | null | undefined): StaffPosPrefs {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const prefs: StaffPosPrefs = {};
    if (typeof parsed.gridColumns === "number" && [2, 3, 4, 5].includes(parsed.gridColumns)) {
      prefs.gridColumns = parsed.gridColumns as 2 | 3 | 4 | 5;
    }
    if (typeof parsed.tileSize === "string" && ["compact", "normal", "large"].includes(parsed.tileSize)) {
      prefs.tileSize = parsed.tileSize as "compact" | "normal" | "large";
    }
    if (typeof parsed.showPrices === "boolean") prefs.showPrices = parsed.showPrices;
    if (typeof parsed.showStockBadges === "boolean") prefs.showStockBadges = parsed.showStockBadges;
    if (parsed.cartPosition === "right" || parsed.cartPosition === "left") {
      prefs.cartPosition = parsed.cartPosition;
    }
    return prefs;
  } catch { return {}; }
}

/** Shape of an active register (till) session persisted to localStorage.
 *  Written on open, updated after every sale/refund, removed on close.
 *  This allows the terminal to survive page navigation and browser restarts
 *  without forcing the operator to re-open the till. */
export interface RegisterSession {
  openedAt: string;
  openedBy: string | null;
  openingFloat: number;
  openingNotes: string;
  sales: Record<string, number>;
  txCount: number;
  refunds?: Record<string, number>;
  refundCount?: number;
  /** Unique ID of the device (browser) that opened this session. */
  deviceId?: string;
  /** Server-side pos_register_sessions.id — set after successful server sync. */
  serverSessionId?: number;
}

/* ── Constants ───────────────────────────────────────────────────────────── */

export const POS_GRID_DEFAULTS: PosGridSettings = {
  columns: 3,
  tileSize: "normal",
  showPrices: true,
  showStockBadges: false,
  cartPosition: "right",
};

export const INTEGRATION_PAYMENT_LABELS: Record<string, string> = {
  stripe_own:      "Stripe",
  commbank_eftpos: "CommBank EFTPOS",
  tyro_eftpos:     "Tyro",
  square_terminal: "Square Terminal",
  paypal:          "PayPal",
  afterpay:        "Afterpay",
  zip:             "Zip",
  klarna:          "Klarna",
  apple_wallet:    "Apple Wallet",
  google_pay:      "Google Pay",
  wechat_alipay:   "WeChat / Alipay",
};

/**
 * Integration payment methods that use the asynchronous "scan-to-pay" flow
 * (parked sale → customer approves → webhook/poll captures), rather than being
 * recorded instantly as a generic "other" tender. These are real first-class
 * payment-method enum values handled by the POS pending dialog.
 */
export const ASYNC_PAYMENT_PROVIDERS: ReadonlySet<string> = new Set(["zip", "afterpay", "klarna"]);

export const PAYMENT_INTEGRATION_CATEGORIES = [
  "Payments & EFTPOS",
  "Buy Now, Pay Later",
  "Digital Wallets",
] as const;

/* ── Register session persistence ────────────────────────────────────────── */

/** Read back the active till session from localStorage, or null if the till is closed. */
export function loadRegisterSession(): RegisterSession | null {
  try {
    const raw = localStorage.getItem(ACTIVE_REGISTER_KEY);
    return raw ? (JSON.parse(raw) as RegisterSession) : null;
  } catch { return null; }
}

/** Persist the current till session (called on open and after every sale/refund). */
export function saveRegisterSession(session: RegisterSession): void {
  try { localStorage.setItem(ACTIVE_REGISTER_KEY, JSON.stringify(session)); } catch { /* ignore */ }
}

/** Destroy the persisted till session (called only when the operator explicitly closes the till). */
export function clearRegisterSession(): void {
  try { localStorage.removeItem(ACTIVE_REGISTER_KEY); } catch { /* ignore */ }
}

/**
 * Return the persistent device ID for this browser, creating and storing
 * a new one if it has never been set.  The ID never changes for a given
 * browser profile so it reliably identifies "this computer/tablet/phone".
 */
export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = typeof crypto?.randomUUID === "function"
      ? crypto.randomUUID()
      : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return "unknown";
  }
}

/* ── Staff login message ─────────────────────────────────────────────────── */

function getMsgStorageKey(): string {
  try {
    const raw = localStorage.getItem("koapos_auth_user");
    const user = raw ? JSON.parse(raw) : null;
    if (user?.id) return `${STAFF_LOGIN_MSG_KEY}_${user.id}`;
  } catch { /* ignore */ }
  return STAFF_LOGIN_MSG_KEY;
}

export function getStaffLoginMessage(): StaffLoginMessage | null {
  try {
    const raw = localStorage.getItem(getMsgStorageKey());
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveStaffLoginMessage(msg: StaffLoginMessage | null) {
  if (msg) localStorage.setItem(getMsgStorageKey(), JSON.stringify(msg));
  else localStorage.removeItem(getMsgStorageKey());
}

export function hasStaffAcknowledged(
  merchantId: number | string,
  staffId: number | string,
  msg: StaffLoginMessage,
): boolean {
  try {
    const key = `koapos_staff_ack_${merchantId}_${staffId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const ack = JSON.parse(raw) as { hash: string; at: string };
    const hash = btoa(msg.text).slice(0, 16);
    return ack.hash === hash && msg.requireAck;
  } catch { return false; }
}

export function setStaffAcknowledged(
  merchantId: number | string,
  staffId: number | string,
  msg: StaffLoginMessage,
) {
  try {
    const key = `koapos_staff_ack_${merchantId}_${staffId}`;
    const hash = btoa(msg.text).slice(0, 16);
    localStorage.setItem(key, JSON.stringify({ hash, at: new Date().toISOString() }));
  } catch { /* ignore */ }
}

/* ── Payment methods ─────────────────────────────────────────────────────── */

export function getEnabledPaymentMethods(): PaymentMethodId[] {
  try {
    const stored = localStorage.getItem(PAYMENT_METHODS_KEY);
    if (stored) return JSON.parse(stored) as PaymentMethodId[];
  } catch { /* ignore */ }
  return ["cash", "eftpos", "card", "direct_deposit", "voucher", "store_credit", "laybuy", "loyalty", "split"];
}

export function getEnabledIntegrationPayments(): string[] {
  try {
    const stored = localStorage.getItem(INTEGRATION_PAYMENT_METHODS_KEY);
    if (stored) return JSON.parse(stored) as string[];
  } catch { /* ignore */ }
  return [];
}

/* ── Custom payment methods ──────────────────────────────────────────────── */

/** Parse pos_settings.customPaymentMethods JSON, dropping malformed entries.
 *  Defensive: tolerates missing/legacy fields so a bad row never breaks checkout. */
export function parseCustomPaymentMethods(raw: string | null | undefined): CustomPaymentMethod[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): CustomPaymentMethod[] => {
      if (!entry || typeof entry !== "object") return [];
      const e = entry as Record<string, unknown>;
      const id = typeof e.id === "string" ? e.id : "";
      const label = typeof e.label === "string" ? e.label.trim() : "";
      if (!id || !label) return [];
      return [{
        id,
        label,
        description: typeof e.description === "string" ? e.description : "",
        icon: typeof e.icon === "string" ? e.icon : "wallet",
        enabled: e.enabled !== false,
      }];
    });
  } catch { return []; }
}

/* ── POS grid settings ───────────────────────────────────────────────────── */

export function loadPosGridSettings(): PosGridSettings {
  try {
    const raw = localStorage.getItem(POS_GRID_SETTINGS_KEY);
    return raw ? { ...POS_GRID_DEFAULTS, ...JSON.parse(raw) } : POS_GRID_DEFAULTS;
  } catch { return POS_GRID_DEFAULTS; }
}
