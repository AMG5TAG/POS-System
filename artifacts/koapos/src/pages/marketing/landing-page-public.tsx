import { useEffect, useState } from "react";
import { useParams } from "wouter";
import type { LandingPage } from "@/pages/app/marketing-landing-pages";

const LS_KEY = "koapos_landing_pages";

function loadPage(slug: string): LandingPage | null {
  try {
    const pages: LandingPage[] = JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
    return pages.find((p) => p.slug === slug) ?? null;
  } catch { return null; }
}

export default function LandingPagePublicView() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";
  const [page, setPage] = useState<LandingPage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const found = loadPage(slug);
    setPage(found);
    setLoading(false);
  }, [slug]);

  /* Load Google Font if needed */
  useEffect(() => {
    if (!page?.font) return;
    const GOOGLE_FONTS = [
      "Barlow","Bebas Neue","Cabin","Comfortaa","Dancing Script","DM Sans","DM Serif Display",
      "Exo 2","Fira Sans","Inter","Josefin Sans","Karla","Lato","Merriweather","Montserrat",
      "Mulish","Noto Sans","Nunito","Open Sans","Oswald","Outfit","Pacifico","Playfair Display",
      "Poppins","PT Sans","Quicksand","Raleway","Roboto","Roboto Mono","Rubik","Source Sans 3",
      "Titillium Web","Ubuntu","Work Sans",
    ];
    if (GOOGLE_FONTS.includes(page.font)) {
      const existing = document.getElementById("lp-font");
      if (!existing) {
        const link = document.createElement("link");
        link.id = "lp-font";
        link.rel = "stylesheet";
        link.href = `https://fonts.googleapis.com/css2?family=${page.font.replace(/ /g, "+")}:wght@400;600;700&display=swap`;
        document.head.appendChild(link);
      }
    }
  }, [page?.font]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!page) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-center px-4">
        <p className="text-5xl mb-4">🔍</p>
        <h1 className="text-xl font-bold text-gray-900">Page not found</h1>
        <p className="text-sm text-gray-500 mt-1">The landing page <code className="font-mono bg-gray-100 px-1 rounded">/p/{slug}</code> doesn't exist.</p>
      </div>
    );
  }

  const bgStyle: React.CSSProperties =
    page.bgType === "gradient"
      ? { background: `linear-gradient(${page.bgDir}, ${page.bgFrom}, ${page.bgTo})` }
      : page.bgType === "image" && page.bgImage
      ? { backgroundImage: `url(${page.bgImage})`, backgroundSize: "cover", backgroundPosition: "center" }
      : { background: page.bgColor };

  const btnRadius =
    page.btnStyle === "pill" ? "9999px"
    : page.btnStyle === "rounded" ? "12px"
    : "4px";

  const btnStyle: React.CSSProperties =
    page.btnVariant === "filled"
      ? { background: page.btnBg, color: page.btnText, border: "none" }
      : page.btnVariant === "outline"
      ? { background: "transparent", color: page.btnBg, border: `2px solid ${page.btnBorder || page.btnBg}` }
      : { background: "rgba(255,255,255,0.1)", color: page.btnText, border: "none", backdropFilter: "blur(4px)" };

  const enabledLinks = page.links.filter((l) => l.enabled);

  return (
    <div
      className="min-h-screen"
      style={{ ...bgStyle, fontFamily: page.font ? `"${page.font}", sans-serif` : "system-ui, sans-serif" }}
    >
      <div className="min-h-screen flex flex-col items-center justify-start py-14 px-5 max-w-sm mx-auto">
        {/* Profile */}
        {page.profileImage ? (
          <img
            src={page.profileImage}
            alt={page.title}
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
          style={{ color: page.textColor }}
        >
          {page.title}
        </h1>
        {page.subtitle && (
          <p className="text-base mt-1.5 text-center" style={{ color: page.textColor, opacity: 0.85 }}>
            {page.subtitle}
          </p>
        )}
        {page.bio && (
          <p className="text-sm mt-3 text-center leading-relaxed max-w-xs" style={{ color: page.textColor, opacity: 0.75 }}>
            {page.bio}
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
            <p className="text-center text-sm py-4" style={{ color: page.textColor, opacity: 0.4 }}>
              Coming soon…
            </p>
          )}
        </div>

        {/* KoaPOS footer */}
        <div className="mt-12 text-center">
          <p className="text-[11px]" style={{ color: page.textColor, opacity: 0.4 }}>
            Powered by KoaPOS
          </p>
        </div>
      </div>
    </div>
  );
}
