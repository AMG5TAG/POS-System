/**
 * Microsoft brand icons (Microsoft logo + OneDrive).
 *
 * Microsoft had its brand marks removed from the simple-icons CDN, so the
 * `microsoft`/`onedrive` slugs 404 there. These inline SVGs are used instead so
 * the Sync menu and Backup destinations render reliably without a network call.
 */

interface IconProps {
  className?: string;
}

/** Microsoft's four-square logo (full brand colours). */
export function MicrosoftIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill="#F25022" d="M1 1h10.2v10.2H1z" />
      <path fill="#7FBA00" d="M12.8 1H23v10.2H12.8z" />
      <path fill="#00A4EF" d="M1 12.8h10.2V23H1z" />
      <path fill="#FFB900" d="M12.8 12.8H23V23H12.8z" />
    </svg>
  );
}

/** OneDrive cloud mark in OneDrive blue. */
export function OneDriveIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        fill="#0078D4"
        d="M13.5 6.2a5.1 5.1 0 0 0-4.6 2.86 4.3 4.3 0 0 0-.34-.01 4.2 4.2 0 0 0-4.15 3.66A3.6 3.6 0 0 0 4.1 19.8h13.55a3.85 3.85 0 0 0 .77-7.62A5.1 5.1 0 0 0 13.5 6.2z"
      />
    </svg>
  );
}
