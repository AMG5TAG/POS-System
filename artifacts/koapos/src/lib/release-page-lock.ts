/**
 * Free a page left frozen behind a dialog that has already closed.
 *
 * Radix dialogs block the rest of the page while open (`pointer-events: none`
 * on <body>, plus a scroll lock keyed on `data-scroll-locked`) and undo it as
 * they finish closing. `window.print()` stops the page's JavaScript until the
 * print dialog is dismissed, so a print fired while a dialog is still closing
 * could strand that lock — nothing on the page clicked afterwards and staff
 * couldn't leave it ("prints tickets, then the system locks up").
 *
 * Only acts when no dialog is actually open, so it can never unblock a page
 * behind a live modal.
 */
export function releaseStuckPageLock(): void {
  if (typeof document === "undefined") return;
  const openDialog = document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]');
  if (openDialog) return;
  if (document.body.style.pointerEvents === "none") document.body.style.pointerEvents = "";
  if (document.body.hasAttribute("data-scroll-locked")) document.body.removeAttribute("data-scroll-locked");
}

/** After a print: once straight away, and again when the window regains focus. */
export function releasePageLockAfterPrint(): void {
  releaseStuckPageLock();
  if (typeof window === "undefined") return;
  const onFocus = () => { window.removeEventListener("focus", onFocus); setTimeout(releaseStuckPageLock, 50); };
  window.addEventListener("focus", onFocus);
  setTimeout(releaseStuckPageLock, 1500);
}
