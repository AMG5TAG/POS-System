export const FORCE_STAFF_LOGIN_KEY = "koapos_force_staff_login";
export const PAYMENT_METHODS_KEY = "koapos_enabled_payment_methods";
export const STAFF_LOGIN_MSG_KEY = "koapos_staff_login_msg";
export const INTEGRATION_PAYMENT_METHODS_KEY = "koapos_enabled_integration_payments";
export const POS_GRID_SETTINGS_KEY = "koapos_pos_grid_settings";
export const ACTIVE_REGISTER_KEY = "koapos_active_register";

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

export const POS_GRID_DEFAULTS: PosGridSettings = {
  columns: 3,
  tileSize: "normal",
  showPrices: true,
  showStockBadges: false,
  cartPosition: "right",
};

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

export function loadPosGridSettings(): PosGridSettings {
  try {
    const raw = localStorage.getItem(POS_GRID_SETTINGS_KEY);
    return raw ? { ...POS_GRID_DEFAULTS, ...JSON.parse(raw) } : POS_GRID_DEFAULTS;
  } catch { return POS_GRID_DEFAULTS; }
}

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
