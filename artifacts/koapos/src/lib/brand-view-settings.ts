import { useEffect, useState } from "react";

/*
 * Client-side view options for the Brands screen. These control how brand data
 * is displayed rather than what is stored, so they live in localStorage (the
 * server-side InventorySettings shape is fixed) and are toggled from
 * Management › Products and Inventory › Inventory.
 */

const COST_VALUE_KEY = "koapos-brands-show-cost-value";
const CHANGE_EVENT   = "koapos-brand-view-settings-changed";

export function getShowBrandCostValue(): boolean {
  try { return localStorage.getItem(COST_VALUE_KEY) === "true"; } catch { return false; }
}

export function setShowBrandCostValue(value: boolean): void {
  try { localStorage.setItem(COST_VALUE_KEY, value ? "true" : "false"); } catch { /* ignore */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Reactive accessor — stays in sync across tabs/pages within the session. */
export function useShowBrandCostValue(): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState<boolean>(getShowBrandCostValue);

  useEffect(() => {
    const sync = () => setValue(getShowBrandCostValue());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const set = (v: boolean) => { setShowBrandCostValue(v); setValue(v); };
  return [value, set];
}
