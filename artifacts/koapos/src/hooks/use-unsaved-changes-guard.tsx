import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface UnsavedChangesGuardOptions {
  title?: string;
  description?: string;
  cancelLabel?: string;
  actionLabel?: string;
}

/**
 * Intercepts navigation away from the current page when there are unsaved
 * changes. Covers:
 *  - Browser refresh / tab close (beforeunload)
 *  - All in-app SPA navigation: Wouter <Link>, navigate(), sidebar buttons
 *    (history.pushState patch)
 *  - Browser Back / Forward buttons (popstate)
 *
 * Returns a `ConfirmDialog` component that must be rendered inside the page.
 */
export function useUnsavedChangesGuard(isDirty: boolean, options?: UnsavedChangesGuardOptions) {
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [, navigate] = useLocation();

  const {
    title = "Unsaved changes",
    description = "You have unsaved changes. If you leave now, your changes will be lost.",
    cancelLabel = "Stay on page",
    actionLabel = "Leave anyway",
  } = options ?? {};

  // Keep refs to avoid stale closures inside patched functions / event handlers
  const isDirtyRef = useRef(isDirty);
  const bypassRef = useRef(false); // Set while performing the confirmed navigation

  // When back/forward fires: store the history step we must replay on confirm.
  // +1 = user went back (we went +1 to restore; confirm goes -1)
  // -1 = user went forward (we went -1 to restore; confirm goes +1)
  const pendingHistoryDeltaRef = useRef<number | null>(null);

  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);

  // ── 1. beforeunload — covers tab close, refresh, hard URL change ──────────
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // ── 2. history.pushState patch — covers all SPA navigation ────────────────
  // Wouter's navigate() and <Link> both call history.pushState internally.
  // Sidebar buttons also call the Wouter navigate() passed from useLocation.
  useEffect(() => {
    if (!isDirty) return;

    const original = history.pushState.bind(history);

    function patched(
      state: unknown,
      title: string,
      url?: string | URL | null,
    ) {
      if (isDirtyRef.current && !bypassRef.current && url != null) {
        const destination = String(url);
        const destPath = new URL(destination, window.location.origin).pathname;
        const currPath = window.location.pathname;
        if (destPath !== currPath) {
          pendingHistoryDeltaRef.current = null; // This is a push, not back/fwd
          setPendingHref(destination);
          return; // Block the push
        }
      }
      return original(state, title, url);
    }

    history.pushState = patched;

    return () => {
      // Only restore if we still own the patch — another mount may have stacked
      // a different patch on top, in which case we must not disturb it.
      if ((history.pushState as unknown) === patched) {
        history.pushState = original;
      }
    };
  }, [isDirty]);

  // ── 3. popstate — covers browser Back / Forward buttons ───────────────────
  useEffect(() => {
    if (!isDirty) return;

    let ignoreNext = false;

    const handler = () => {
      if (ignoreNext) { ignoreNext = false; return; }
      if (!isDirtyRef.current || bypassRef.current) return;

      // URL has already changed to destination at this point.
      const destination = window.location.href;

      // Determine direction: we compare history.state to detect forward vs back.
      // As a pragmatic heuristic: assume back (-1 relative to where we are now)
      // and go +1 to restore; confirm will go -1 to follow through.
      // (Forward presses are rare and produce at worst an extra history entry.)
      const restoreStep = 1;
      ignoreNext = true;
      history.go(restoreStep);

      pendingHistoryDeltaRef.current = -restoreStep; // Confirm step = opposite
      setPendingHref(destination);
    };

    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [isDirty]);

  // ── Confirm / cancel handlers ─────────────────────────────────────────────
  const confirm = useCallback(() => {
    if (!pendingHref) return;
    const dest = pendingHref;
    const historyDelta = pendingHistoryDeltaRef.current;
    setPendingHref(null);
    pendingHistoryDeltaRef.current = null;

    bypassRef.current = true;
    if (historyDelta !== null) {
      // Back/Forward case: replay the original history movement so we don't
      // add a spurious new entry to the stack.
      history.go(historyDelta);
    } else {
      // SPA push case: navigate to the destination.
      const parsed = new URL(dest, window.location.origin);
      navigate(parsed.pathname + parsed.search + parsed.hash);
    }
    setTimeout(() => { bypassRef.current = false; }, 50);
  }, [pendingHref, navigate]);

  const cancel = useCallback(() => {
    setPendingHref(null);
    pendingHistoryDeltaRef.current = null;
  }, []);

  function ConfirmDialog() {
    return (
      <AlertDialog open={pendingHref !== null} onOpenChange={(open) => { if (!open) cancel(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>
              {description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancel}>{cancelLabel}</AlertDialogCancel>
            <AlertDialogAction onClick={confirm}>{actionLabel}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return { ConfirmDialog };
}
