/* ── Day staff session ─────────────────────────────────────────────────────
 *
 * Tracks which staff member is signed in "for the day" on THIS device.
 * The session is created from the universal top-bar PIN login, persisted to
 * localStorage (so it survives refreshes and navigation), and ended either
 * by an explicit sign-out or automatically when the till is closed.
 *
 * This is deliberately separate from the POS page's one-sale staff switch:
 * that override lives in POS component state and always reverts back to the
 * day staff stored here once the sale completes.
 */

import { createContext, useCallback, useContext, useState } from "react";
import type { Staff } from "@workspace/api-client-react";
import { getOrCreateDeviceId, ACTIVE_REGISTER_ID_KEY } from "@/lib/pos-local-settings";

export const DAY_STAFF_KEY = "koapos_day_staff";

export interface DayStaffSession {
  staffId: number;
  staffName: string;
  role: string;
  /** Register DB id (as string) this staff member defaults to, from staff.defaultRegisterType. */
  defaultRegisterType: string | null;
  loggedInAt: string;
  /** Device that performed the day login — sessions never follow a staff member across machines. */
  deviceId: string;
}

/* ── localStorage persistence ────────────────────────────────────────────── */

export function loadDayStaff(): DayStaffSession | null {
  try {
    const raw = localStorage.getItem(DAY_STAFF_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as DayStaffSession;
    /* A session written by another browser profile can never match this
       device's ID — treat it as absent rather than impersonating. */
    if (session.deviceId && session.deviceId !== getOrCreateDeviceId()) return null;
    return session;
  } catch { return null; }
}

function saveDayStaff(session: DayStaffSession): void {
  try { localStorage.setItem(DAY_STAFF_KEY, JSON.stringify(session)); } catch { /* ignore */ }
}

function clearDayStaff(): void {
  try { localStorage.removeItem(DAY_STAFF_KEY); } catch { /* ignore */ }
}

/* ── Context ─────────────────────────────────────────────────────────────── */

interface StaffSessionContextValue {
  /** The staff member signed in for the day on this device, or null. */
  dayStaff: DayStaffSession | null;
  /** Sign a staff member in for the day (called from the top-bar PIN dialog). */
  signInForDay: (staff: Staff) => void;
  /** End the day session (explicit sign-out or Close Till). */
  signOutForDay: () => void;
}

const StaffSessionContext = createContext<StaffSessionContextValue>({
  dayStaff: null,
  signInForDay: () => {},
  signOutForDay: () => {},
});

export function StaffSessionProvider({ children }: { children: React.ReactNode }) {
  /* Hydrated synchronously from localStorage so a refresh keeps the day login
     without ever flashing the forced PIN dialog. */
  const [dayStaff, setDayStaff] = useState<DayStaffSession | null>(() => loadDayStaff());

  const signInForDay = useCallback((staff: Staff) => {
    const session: DayStaffSession = {
      staffId: staff.id,
      staffName: staff.name,
      role: staff.role,
      defaultRegisterType: staff.defaultRegisterType ?? null,
      loggedInAt: new Date().toISOString(),
      deviceId: getOrCreateDeviceId(),
    };
    saveDayStaff(session);
    setDayStaff(session);

    /* Log the login to the server (audit trail) — non-critical, fire & forget. */
    let registerId = "default";
    try { registerId = localStorage.getItem(ACTIVE_REGISTER_ID_KEY) || "default"; } catch { /* ignore */ }
    fetch("/api/pos-staff-sessions", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registerId, staffId: staff.id, staffName: staff.name }),
    }).catch(() => {});
  }, []);

  const signOutForDay = useCallback(() => {
    clearDayStaff();
    setDayStaff(null);
  }, []);

  return (
    <StaffSessionContext.Provider value={{ dayStaff, signInForDay, signOutForDay }}>
      {children}
    </StaffSessionContext.Provider>
  );
}

export function useStaffSession(): StaffSessionContextValue {
  return useContext(StaffSessionContext);
}
