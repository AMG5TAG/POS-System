import {
  Wallet, Coins, Banknote, CreditCard, Landmark, Gift, Ticket,
  Receipt, Smartphone, CircleDollarSign, HandCoins, QrCode, Bitcoin, Building2,
} from "lucide-react";

/** Icon choices offered when creating a custom payment method. Stored by key
 *  (the map key) on the method so the same glyph renders in Management and at
 *  the POS checkout. Keep this the single source of truth for both screens. */
export const CUSTOM_PAYMENT_ICONS: Record<string, React.ElementType> = {
  wallet:      Wallet,
  coins:       Coins,
  banknote:    Banknote,
  card:        CreditCard,
  bank:        Landmark,
  gift:        Gift,
  ticket:      Ticket,
  receipt:     Receipt,
  phone:       Smartphone,
  dollar:      CircleDollarSign,
  handcoins:   HandCoins,
  qr:          QrCode,
  crypto:      Bitcoin,
  business:    Building2,
};

export const CUSTOM_PAYMENT_ICON_KEYS = Object.keys(CUSTOM_PAYMENT_ICONS);

/** Default icon key applied to a brand-new custom payment method. */
export const DEFAULT_CUSTOM_PAYMENT_ICON = "wallet";

/** Resolve a stored icon key to a component, falling back to the wallet glyph. */
export function resolveCustomPaymentIcon(key: string | undefined): React.ElementType {
  return CUSTOM_PAYMENT_ICONS[key ?? ""] ?? Wallet;
}
