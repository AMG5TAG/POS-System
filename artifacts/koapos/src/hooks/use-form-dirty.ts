import { useRef, useState } from "react";

/**
 * Tracks whether a form has been dirtied relative to a clean baseline.
 *
 * Replaces the manual `const [formTouched, setFormTouched] = useState(false)`
 * + per-field `setFormTouched(true)` wiring. isDirty is computed automatically
 * by JSON-snapshot comparison, so individual onChange handlers no longer need
 * to set a touched flag.
 *
 * Usage
 * ─────
 *   const { isDirty, markClean, markDirty } = useFormDirty(form);
 *
 *   Pass `isDirty` to `useUnsavedChangesGuard(isDirty, ...)`.
 *
 *   markClean(newValue)
 *     Call when opening / resetting the form. Pass the new form value
 *     explicitly because the React state update hasn't flushed yet.
 *       const f = defaultForm();
 *       setForm(f);
 *       markClean(f);
 *
 *   markClean()
 *     Call with no argument after a successful save or on dialog dismiss.
 *     The current `form` value (from the last render) is used as the new
 *     clean baseline.
 *
 *   markDirty()
 *     Force isDirty=true from an external signal — e.g. an `onTouched` prop
 *     forwarded from a child component that owns its own form state.
 */
export function useFormDirty<T>(current: T) {
  const currentSerialized = JSON.stringify(current);
  const baselineRef = useRef<string>(currentSerialized);
  const [forceDirty, setForceDirty] = useState(false);

  const isDirty = forceDirty || currentSerialized !== baselineRef.current;

  function markClean(baseline?: T) {
    baselineRef.current =
      baseline !== undefined ? JSON.stringify(baseline) : currentSerialized;
    if (forceDirty) setForceDirty(false);
  }

  function markDirty() {
    setForceDirty(true);
  }

  return { isDirty, markClean, markDirty };
}
