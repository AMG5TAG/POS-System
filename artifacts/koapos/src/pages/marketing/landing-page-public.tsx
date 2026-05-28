import { useEffect } from "react";
import { useParams } from "wouter";
import { useGetLandingPagePublic } from "@workspace/api-client-react";
import type { LandingPageLink } from "@/pages/app/marketing-landing-pages";

export default function LandingPagePublicView() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";

  const { data: row, isLoading, isError } = useGetLandingPagePublic(slug);

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
        <p className="text-sm text-gray-500 mt-1">The landing page <code className="font-mono bg-gray-100 px-1 rounded">/p/{slug}</code> doesn't exist.</p>
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

  const enabledLinks = links.filter((l) => l.enabled);

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
          {enabledLinks.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3.5 px-5 font-semibold text-sm transition-all hover:scale-[1.02] active:scale-[0.98] shadow-sm"
              style={{ ...btnStyle, borderRadius: btnRadius }}
            >
              {link.emoji && <span className="text-base">{link.emoji}</span>}
              {link.label}
            </a>
          ))}
          {enabledLinks.length === 0 && (
            <p className="text-center text-sm py-4" style={{ color: row.textColor, opacity: 0.4 }}>
              Coming soon…
            </p>
          )}
        </div>

        {/* KoaPOS footer */}
        <div className="mt-12 text-center">
          <p className="text-[11px]" style={{ color: row.textColor, opacity: 0.4 }}>
            Powered by KoaPOS
          </p>
        </div>
      </div>
    </div>
  );
}
