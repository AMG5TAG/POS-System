import { useEffect } from "react";
import { useParams } from "wouter";
import { Loader2 } from "lucide-react";
import { customerAccountUrl, shopOrigin } from "@/lib/public-url";

/**
 * The customer portal moved into the online shop's account area
 * (koastal.com.au/shop/account). This page only forwards the portal's old
 * links — /c/<token> and /b/<user>/c/<token>, plus their /set-password forms —
 * which are still on texts, completed-job QR stickers and wallet passes.
 *
 * The shop's /c/<token> signs the customer in under the same rules the portal
 * used (lib/portalAuth.ts on the API). A set-up link's one-time ?token= is the
 * same kind the shop's own set-password page takes, so it is passed through.
 */
export default function PortalRedirect({ setPassword = false }: { setPassword?: boolean }) {
  const { token } = useParams<{ token: string }>();

  useEffect(() => {
    const target = setPassword
      ? `${shopOrigin()}/account/set-password${window.location.search}`
      : customerAccountUrl(token) ?? `${shopOrigin()}/account`;
    window.location.replace(target);
  }, [token, setPassword]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" aria-label="Opening your account" />
    </div>
  );
}

export function PortalSetPasswordRedirect() {
  return <PortalRedirect setPassword />;
}
