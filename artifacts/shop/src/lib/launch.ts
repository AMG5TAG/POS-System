/* The shop is not open yet. While this is true the catalogue sits behind the
   "Coming soon" screen (components/ComingSoon.tsx). Set to false (and publish)
   to launch. */
export const COMING_SOON = true;

/* Open to everyone while the shop is closed: signing in, an account link from
   a text or QR (/c/<token>), a friend's referral link (/r/<code>), and mail-in repairs, which are a service the
   business runs now, not part of the unlaunched shop. Sign-up is deliberately
   not here: it would let anyone make an account to get past the screen. */
const OPEN_TO_ALL = ["/account/login", "/account/forgot", "/account/set-password", "/mail-in", "/c", "/r"];

/* A visitor who arrived on a friend's referral link (/r/<code>) may sign up:
   the link is an invitation, and its reward needs an account to land on. */

/* Open to any signed-in customer: their own account (the former customer
   portal — repairs, quotes, appointments, rewards). The rest of the shop
   stays curtained for them. */
const OPEN_TO_CUSTOMERS = ["/account", "/rewards", "/wishlist"];

const under = (path: string, roots: string[]) => roots.some((r) => path === r || path.startsWith(`${r}/`));

/* Whether the curtain covers this page. `preview` is the server's word that
   this shopper is the owner or staff (GET /shop/auth/me), who see everything.
   A curtain, not access control: the catalogue API is public either way. */
export function curtainCovers(path: string, signedIn: boolean, preview: boolean, referred = false): boolean {
  if (!COMING_SOON || preview) return false;
  if (under(path, OPEN_TO_ALL)) return false;
  if (referred && path === "/account/register") return false;
  return !(signedIn && under(path, OPEN_TO_CUSTOMERS));
}
