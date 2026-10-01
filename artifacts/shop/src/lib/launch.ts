/* The shop is not open yet. While this is true every page sits behind the
   "Coming soon" screen (components/ComingSoon.tsx) unless a shopper is signed
   in — which is how staff preview it: sign in with a shop account. Set to
   false (and publish) to launch. */
export const COMING_SOON = true;

/* Reachable while the shop is closed, or nobody could sign in to preview it.
   Sign-up is deliberately not here: it would let anyone past the screen. */
export const OPEN_WHILE_CLOSED = ["/account/login", "/account/forgot", "/account/set-password"];
