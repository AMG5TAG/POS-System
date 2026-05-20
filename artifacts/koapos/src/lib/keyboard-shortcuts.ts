export interface KeyboardShortcut {
  id: string;
  label: string;
  description: string;
  keys: string;
  scope: "Global";
  navigate?: string;
}

export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  { id: "search",       label: "Open Search",     description: "Open the universal search bar",            keys: "⌘K / Ctrl+K", scope: "Global" },
  { id: "dashboard",    label: "Dashboard",        description: "Go to the main dashboard",                 keys: "F1",          scope: "Global", navigate: "/dashboard" },
  { id: "pos",          label: "POS · Sell",        description: "Open the POS sell screen",                keys: "F2",          scope: "Global", navigate: "/pos" },
  { id: "products",     label: "Products",          description: "Go to product inventory",                 keys: "F3",          scope: "Global", navigate: "/products" },
  { id: "customers",    label: "Customers",         description: "Go to customers",                         keys: "F4",          scope: "Global", navigate: "/customers" },
  { id: "staff",        label: "Staff",             description: "Go to staff management",                  keys: "F6",          scope: "Global", navigate: "/staff" },
  { id: "transactions", label: "Transactions",      description: "Go to transaction history",               keys: "F7",          scope: "Global", navigate: "/transactions" },
  { id: "modules",      label: "Modules",           description: "Go to the modules marketplace",           keys: "F8",          scope: "Global", navigate: "/modules" },
  { id: "reports",      label: "Reports",           description: "Go to the reports page",                  keys: "F9",          scope: "Global", navigate: "/management/sales-overview" },
  { id: "new-sale",     label: "New Sale",          description: "Navigate to POS for a new sale",          keys: "Alt+N",       scope: "Global", navigate: "/pos" },
  { id: "services",     label: "Services",          description: "Go to service jobs",                      keys: "Alt+S",       scope: "Global", navigate: "/service-jobs" },
  { id: "inventory",    label: "Inventory Overview","description": "Go to inventory overview",              keys: "Alt+I",       scope: "Global", navigate: "/products/overview" },
];

export const SHORTCUTS_STORAGE_KEY = "koapos_shortcuts_enabled";

export function getEnabledShortcuts(): string[] {
  try {
    const stored = localStorage.getItem(SHORTCUTS_STORAGE_KEY);
    if (stored) return JSON.parse(stored) as string[];
  } catch { /* ignore */ }
  return KEYBOARD_SHORTCUTS.map((s) => s.id);
}
