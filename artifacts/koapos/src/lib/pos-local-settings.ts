/* ── localStorage key constants ──────────────────────────────────────────── */

export const FORCE_STAFF_LOGIN_KEY = "koapos_force_staff_login";
export const PAYMENT_METHODS_KEY = "koapos_enabled_payment_methods";
export const STAFF_LOGIN_MSG_KEY = "koapos_staff_login_msg";
export const INTEGRATION_PAYMENT_METHODS_KEY = "koapos_enabled_integration_payments";
export const POS_GRID_SETTINGS_KEY = "koapos_pos_grid_settings";
export const ACTIVE_REGISTER_KEY = "koapos_active_register";

/* ── Types ───────────────────────────────────────────────────────────────── */

export interface StaffLoginMessage {
  text: string;
  requireAck: boolean;
  enabled: boolean;
}

export type PaymentMethodId =
  | "cash" | "eftpos" | "card" | "direct_deposit"
  | "voucher" | "store_credit" | "laybuy" | "loyalty" | "split" | "gift_card";

export interface PosGridSettings {
  columns: 2 | 3 | 4 | 5;
  tileSize: "compact" | "normal" | "large";
  showPrices: boolean;
  showStockBadges: boolean;
  cartPosition: "right" | "left";
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

/* ── POS grid settings ───────────────────────────────────────────────────── */

export function loadPosGridSettings(): PosGridSettings {
  try {
    const raw = localStorage.getItem(POS_GRID_SETTINGS_KEY);
    return raw ? { ...POS_GRID_DEFAULTS, ...JSON.parse(raw) } : POS_GRID_DEFAULTS;
  } catch { return POS_GRID_DEFAULTS; }
}
