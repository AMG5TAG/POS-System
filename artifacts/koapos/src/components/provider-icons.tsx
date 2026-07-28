/**
 * Inline provider brand marks.
 *
 * Microsoft had its brand marks removed from the simple-icons CDN, so the
 * `microsoft`/`onedrive` slugs 404 there. These inline SVGs are used instead so
 * the Sync menu, Integrations cards and Backup destinations render reliably
 * without a network call.
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

/** Apple logo glyph (monochrome — inherits currentColor). */
export function AppleLogoIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.42 2.18-1.12 2.96-.84.94-2.2 1.66-3.32 1.57-.14-1.1.43-2.27 1.1-3 .76-.82 2.1-1.44 3.34-1.53zM20.5 17.2c-.6 1.37-.89 1.98-1.66 3.19-1.07 1.68-2.58 3.77-4.45 3.78-1.66.02-2.08-1.08-4.33-1.07-2.25.01-2.72 1.09-4.38 1.07-1.87-.01-3.3-1.9-4.37-3.58C-1.1 17.1-1.4 11.3 1.05 8.18c1.06-1.37 2.6-2.24 4.27-2.24 1.7 0 2.77 1.1 4.18 1.1 1.36 0 2.19-1.1 4.16-1.1 1.48 0 3.05.8 4.17 2.2-3.66 2-3.07 7.2.67 9.06z" />
    </svg>
  );
}

/** Google Wallet mark — stacked cards in Google's four brand colours. */
export function GoogleWalletLogo({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="6.5" y="3" width="9" height="3" rx="1.5" fill="#FBBC04" />
      <rect x="4.5" y="6" width="13" height="3.5" rx="1.75" fill="#34A853" />
      <rect x="2.5" y="9.5" width="17" height="11" rx="2.5" fill="#4285F4" />
      <circle cx="15.5" cy="15" r="2.4" fill="#EA4335" />
    </svg>
  );
}
