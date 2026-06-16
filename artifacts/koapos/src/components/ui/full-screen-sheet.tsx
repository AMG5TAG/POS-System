import * as React from "react";
import { createPortal } from "react-dom";

/**
 * Renders its children as a full-window panel filling the main content region
 * (the right-hand window), leaving the side menu visible — the replacement for
 * the old centered "lightbox" dialogs when creating/viewing an entity.
 *
 * It portals into `#main-content` (which is `position: relative`), so the panel
 * covers the page beneath it but never the navigation. Pair the children with
 * `AccordionScreen` for the requested vertical-accordion layout.
 */
export function FullScreenSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  const [host, setHost] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!open) { setHost(null); return; }
    setHost(document.getElementById("main-content"));
  }, [open]);

  // Close on Escape, matching dialog behaviour.
  React.useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !host) return null;

  return createPortal(
    <div className="absolute inset-0 z-40 flex flex-col overflow-hidden bg-background animate-in fade-in-0">
      {children}
    </div>,
    host,
  );
}
