import { useEffect } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { customFetch, type LandingPage } from "@workspace/api-client-react";
import { LINK_SIZE_CLASSES, LINK_ICON_SIZE_CLASSES, splitLandingLinks, linkIconGlyph, type LandingPageLink } from "@/lib/landing-page-links";
import { publicOrigin } from "@/lib/public-url";

// The public endpoint augments the landing-page row with the owning merchant's
// referral code and the show/hide flag (both absent from the generated type).
type PublicLandingPage = LandingPage & {
  showPoweredBy?: string;
  partnerReferralCode?: string | null;
};

export default function LandingPagePublicView() {
  // Two public URL shapes resolve to the same page:
  //   /b/:businessUsername/l/:customName   (preferred; `/a/` is a legacy alias)
  //   /p/:slug   (legacy)
  const params = useParams<{ slug?: string; businessUsername?: string; customName?: string }>();
  const slug = params.slug ?? "";
  const byHandle = !!(params.businessUsername && params.customName);
  const displayPath = byHandle ? `/b/${params.businessUsername}/l/${params.customName}` : `/p/${slug}`;

  const { data: row, isLoading, isError } = useQuery<PublicLandingPage>({
    queryKey: byHandle
      ? ["landing-public", "b", params.businessUsername, params.customName]
      : ["landing-public", "p", slug],
    queryFn: () =>
      customFetch<PublicLandingPage>(
        byHandle
          ? `/api/landing-pages/public/b/${encodeURIComponent(params.businessUsername!)}/l/${encodeURIComponent(params.customName!)}`
          : `/api/landing-pages/public/${encodeURIComponent(slug)}`,
        { method: "GET" },
      ),
    enabled: byHandle || !!slug,
  });

  const links: LandingPageLink[] = (() => {
    if (!row?.links) return [];
    try { return typeof row.links === "string" ? JSON.parse(row.links) : []; }
    catch { return []; }
  })();

  /* Load Google Font if needed */
  useEffect(() => {
    if (!row?.font) return;
    const GOOGLE_FONTS = [
      "Barlow","Bebas Neue","Cabin","Comfortaa","Dancing Script","DM Sans","DM Serif Display",
      "Exo 2","Fira Sans","Inter","Josefin Sans","Karla","Lato","Merriweather","Montserrat",
      "Mulish","Noto Sans","Nunito","Open Sans","Oswald","Outfit","Pacifico","Playfair Display",
      "Poppins","PT Sans","Quicksand","Raleway","Roboto","Roboto Mono","Rubik","Source Sans 3",
      "Titillium Web","Ubuntu","Work Sans",
    ];
    if (GOOGLE_FONTS.includes(row.font)) {
      const existing = document.getElementById("lp-font");
      if (!existing) {
        const link = document.createElement("link");
        link.id = "lp-font";
        link.rel = "stylesheet";
        link.href = `https://fonts.googleapis.com/css2?family=${row.font.replace(/ /g, "+")}:wght@400;600;700&display=swap`;
        document.head.appendChild(link);
      }
    }
  }, [row?.font]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !row) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-center px-4">
        <p className="text-5xl mb-4">🔍</p>
        <h1 className="text-xl font-bold text-gray-900">Page not found</h1>
        <p className="text-sm text-gray-500 mt-1">The landing page <code className="font-mono bg-gray-100 px-1 rounded">{displayPath}</code> doesn't exist.</p>
      </div>
    );
  }

  const bgStyle: React.CSSProperties =
    row.bgType === "gradient"
      ? { background: `linear-gradient(${row.bgDir}, ${row.bgFrom}, ${row.bgTo})` }
      : row.bgType === "image" && row.bgImage
      ? { backgroundImage: `url(${row.bgImage})`, backgroundSize: "cover", backgroundPosition: "center" }
      : { background: row.bgColor };

  const btnRadius =
    row.btnStyle === "pill" ? "9999px"
    : row.btnStyle === "rounded" ? "12px"
    : "4px";

  const btnStyle: React.CSSProperties =
    row.btnVariant === "filled"
      ? { background: row.btnBg, color: row.btnText, border: "none" }
      : row.btnVariant === "outline"
      ? { background: "transparent", color: row.btnBg, border: `2px solid ${row.btnBorder || row.btnBg}` }
      : { background: "rgba(255,255,255,0.1)", color: row.btnText, border: "none", backdropFilter: "blur(4px)" };

  const { body: bodyLinks, bottom: bottomLinks } = splitLandingLinks(links);

  return (
    <div
      className="min-h-screen"
      style={{ ...bgStyle, fontFamily: row.font ? `"${row.font}", sans-serif` : "system-ui, sans-serif" }}
    >
      <div className="min-h-screen flex flex-col items-center justify-start py-14 px-5 max-w-sm mx-auto">
        {/* Profile */}
        {row.profileImage ? (
          <img
            src={row.profileImage}
            alt={row.title}
            className="w-24 h-24 rounded-full object-cover mb-5 shadow-lg"
            style={{ outline: "3px solid rgba(255,255,255,0.3)", outlineOffset: "2px" }}
          />
        ) : (
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center text-4xl mb-5 shadow-lg"
            style={{ background: "rgba(255,255,255,0.2)" }}
          >
            🏪
          </div>
        )}

        <h1
          className="text-2xl font-bold text-center leading-snug"
          style={{ color: row.textColor }}
        >
          {row.title}
        </h1>
        {row.subtitle && (
          <p className="text-base mt-1.5 text-center" style={{ color: row.textColor, opacity: 0.85 }}>
            {row.subtitle}
          </p>
        )}
        {row.bio && (
          <p className="text-sm mt-3 text-center leading-relaxed max-w-xs" style={{ color: row.textColor, opacity: 0.75 }}>
            {row.bio}
          </p>
        )}

        {/* Links */}
        <div className="w-full mt-8 space-y-3">
          {bodyLinks.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className={`flex items-center justify-center gap-2 w-full font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] shadow-sm ${LINK_SIZE_CLASSES[link.size ?? "medium"]}`}
              style={{ ...btnStyle, borderRadius: btnRadius }}
            >
              {link.emoji?.trim() && <span className="text-base">{link.emoji}</span>}
              {!link.iconOnly && link.label}
            </a>
          ))}
          {bodyLinks.length === 0 && bottomLinks.length === 0 && (
            <p className="text-center text-sm py-4" style={{ color: row.textColor, opacity: 0.4 }}>
              Coming soon…
            </p>
          )}
        </div>

        {/* Bottom social-icon row */}
        {bottomLinks.length > 0 && (
          <div className="w-full mt-auto pt-10 flex flex-wrap items-center justify-center gap-3">
            {bottomLinks.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noreferrer"
                title={link.label}
                aria-label={link.label}
                className={`flex items-center justify-center leading-none font-semibold rounded-full shadow-sm transition-all hover:scale-105 active:scale-95 ${LINK_ICON_SIZE_CLASSES[link.size ?? "medium"]}`}
                style={{ ...btnStyle, borderRadius: "9999px" }}
              >
                {linkIconGlyph(link)}
              </a>
            ))}
          </div>
        )}

        {/* KoaPOS referral footer (opt-out via the page's "Powered by" setting) */}
        {row.showPoweredBy !== "false" && (
          <div className={`text-center ${bottomLinks.length > 0 ? "mt-6" : "mt-12"}`}>
            <a
              href={row.partnerReferralCode
                ? `${publicOrigin()}/register?ref=${encodeURIComponent(row.partnerReferralCode)}`
                : `${publicOrigin()}/register`}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] hover:underline"
              style={{ color: row.textColor, opacity: 0.4 }}
            >
              Powered by KoaPOS
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
